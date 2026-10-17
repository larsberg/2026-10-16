import { createMeshLayers } from './mesh-layers.js';
import { createMeshRig } from './mesh-rig.js';
import { createMeshSurface } from './mesh-surface.js';
import { createFaceMetal } from './face-metal.js';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from 'three';
import { createDodecahedronMesh, polygonEdges } from './polygon-mesh.js';
import { dualDiamond, dualNSided, extrudeFaces, triangulateFace, triangulateFaces, validatePolygonMesh } from './mesh-operations.js';

export function createMeshView(scene, sharedSurfaceMaterial) {
  const surfaceMaterial = sharedSurfaceMaterial ?? createFaceMetal(); surfaceMaterial.side = DoubleSide;
  let surface;
  const material = new LineBasicMaterial({ color: '#ffffff' });
  const object = new LineSegments(new BufferGeometry(), material);
  object.name = 'Polygon mesh wireframe'; scene.add(object);
  const selectionMaterial = new LineBasicMaterial({ color: '#ffbc55', depthTest: false, toneMapped: false });
  const selection = new LineSegments(new BufferGeometry(), selectionMaterial);
  selection.renderOrder = 10; object.add(selection);
  // The skeleton/picking proxy feeds the visible polygon surface and wireframe.
  const pickingMaterial = new MeshBasicMaterial({ side: DoubleSide, visible: false });
  let picking = new Mesh(new BufferGeometry(), pickingMaterial), rig, bindingData, configured, posed, selectedEdges = [], notePalette = [];
  object.frustumCulled = false;
  let topology, edges = [], triangleFaces = [], generation = 0, selected = new Set(), layers = { stages: [], depths: [] };
  const history = [];
  const geometryForEdges = (mesh, values) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(values.flatMap(edge => edge.flatMap(id => mesh.vertices[id])), 3));
    if (values.length) geometry.computeBoundingSphere();
    return geometry;
  };
  function refreshSelection() {
    selectedEdges = polygonEdges([...selected].map(id => topology.faces[id]));
    selection.geometry.dispose();
    selection.geometry = geometryForEdges(topology, selectedEdges);
    selection.visible = selected.size > 0 && (configured?.visibility.surface !== false || configured?.visibility.wireframe !== false);
    if (posed) updateBuffers();
  }
  function updateBuffers() {
    if (!posed) return;
    surface?.update(posed);
    for (const [target, values] of [[object.geometry, edges], [selection.geometry, selectedEdges]]) {
      const attribute = target.getAttribute('position');
      let index = 0;
      for (const edge of values) for (const id of edge) { attribute.setXYZ(index++, posed[id * 3], posed[id * 3 + 1], posed[id * 3 + 2]); }
      attribute.needsUpdate = true;
    }
  }
  function buildRig() {
    rig?.dispose(); rig = undefined; posed = undefined;
    const geometry = picking.geometry;
    picking = new Mesh(geometry, pickingMaterial);
    posed = new Float32Array(topology.vertices.flat()); updateBuffers(); posed = undefined;
    if (configured?.rig?.enabled && (bindingData?.chains.length || bindingData?.core)) {
      rig = createMeshRig(bindingData, geometry, pickingMaterial, configured.rig, notePalette); object.add(rig.group); picking = rig.skin;
      posed = rig.getPositions(); updateBuffers();
    }
  }
  function install(next, faceIds = [], binding = null) {
    validatePolygonMesh(next);
    const nextEdges = polygonEdges(next.faces), indices = [], owners = [];
    next.faces.forEach((face, id) => {
      for (const triangle of triangulateFace(next, face)) { indices.push(...triangle); owners.push(id); }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(next.vertices.flat(), 3));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    const wireframe = geometryForEdges(next, nextEdges);
    surface?.dispose(); surface = undefined;
    rig?.dispose(); rig = undefined; posed = undefined;
    picking.geometry.dispose(); picking = new Mesh(geometry, pickingMaterial);
    object.geometry.dispose(); object.geometry = wireframe;
    topology = next; edges = nextEdges; triangleFaces = owners;
    surface = createMeshSurface(next, surfaceMaterial); object.add(surface.mesh);
    surface.mesh.visible = configured?.visibility.surface !== false;
    selected = new Set(faceIds); refreshSelection();
    bindingData = binding; buildRig();
  }
  function operate(operation, ids) {
    const result = operation();
    if (result.mesh.faces.length > 50000) throw new Error('This operation exceeds the 50,000-face editing limit.');
    const previous = { mesh: structuredClone(topology), faceIds: [...selected], binding: bindingData };
    install(result.mesh, ids === undefined ? [] : result.faceIds);
    history.push(previous); if (history.length > 20) history.shift();
    return topology;
  }
  return {
    object,
    getCenter(target) { object.updateWorldMatrix(true, false); return object.localToWorld(rig?.getCenter(target) ?? target.set(0, 0, 0)); },
    get surface() { return surface; },
    get topology() { return topology; },
    get edges() { return edges; },
    get generation() { return generation; },
    get layers() { return layers; },
    get rig() { return rig; },
    get binding() { return bindingData; },
    get selectedFaces() { return [...selected]; },
    get canUndo() { return history.length > 0; },
    setNotePalette(value) { notePalette = value; rig?.setNotePalette(value); },
    regenerate(camera, settings) {
      const base = createDodecahedronMesh(settings.mesh.radius);
      const next = createMeshLayers(base, settings.pipeline ?? { enabled: false });
      configured = settings;
      object.quaternion.identity();
      object.position.set(0, -(next.binding.core?.groundLevel ?? 0), 0);
      install(next.mesh, next.faceIds, next.binding); layers = { stages: next.stages, depths: next.depths };
      history.length = 0; generation++;
    },
    refresh() { install(topology, [...selected], bindingData); },
    update(dt, running = true) {
      if (!rig) return;
      object.updateWorldMatrix(true, false);
      if (running) rig.step(dt, object.getWorldQuaternion(object.quaternion.clone()));
      posed = rig.getPositions(posed); updateBuffers();
    },
    selectFaces(ids) {
      if ([...ids].some(id => !Number.isInteger(id) || id < 0 || id >= topology.faces.length)) throw new Error('Invalid face selection.');
      selected = new Set(ids); refreshSelection();
    },
    pickFace(raycaster) {
      if (!object.visible || (configured?.visibility.wireframe === false && configured?.visibility.surface === false) || !topology) return null;
      object.updateWorldMatrix(true, true); picking.matrixWorld.copy(object.matrixWorld);
      const hits = []; picking.raycast(raycaster, hits); hits.sort((a, b) => a.distance - b.distance);
      return hits.length ? triangleFaces[hits[0].faceIndex] : null;
    },
    triangulate(ids, options) { return operate(() => triangulateFaces(topology, ids, options), ids); },
    dualDiamond() { return operate(() => dualDiamond(topology)); },
    dualNSided() { return operate(() => dualNSided(topology)); },
    extrude(ids, transform, options) { return operate(() => extrudeFaces(topology, ids, transform, options), ids); },
    undo() {
      const previous = history.at(-1); if (!previous) return false;
      install(previous.mesh, previous.faceIds, previous.binding); history.pop(); return true;
    },
    configure(settings) {
      const rebuild = settings.rig?.enabled !== configured?.rig?.enabled || settings.rig?.jointOverlap !== configured?.rig?.jointOverlap;
      configured = settings;
      material.color.set(settings.appearance.wireframeColor);
      material.visible = settings.visibility.wireframe;
      object.visible = settings.visibility.surface || settings.visibility.wireframe || !!(settings.rig?.enabled && (settings.rig.showBones || settings.rig.showJoints || settings.rig.showColliders));
      selection.visible = selected.size > 0 && (settings.visibility.surface || settings.visibility.wireframe);
      if (surface) { surface.mesh.visible = settings.visibility.surface; surface.configure(); }
      if (rebuild && topology) buildRig();
      rig?.configure(settings.rig);
    },
    dispose() {
      rig?.dispose();
      surface?.dispose(); if (!sharedSurfaceMaterial) surfaceMaterial.dispose();
      object.removeFromParent(); object.geometry.dispose(); material.dispose();
      selection.geometry.dispose(); selectionMaterial.dispose(); picking.geometry.dispose(); pickingMaterial.dispose();
    },
  };
}
