import { createMeshLayers } from './mesh-layers.js';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from 'three';
import { createViewportMesh, polygonEdges, viewportDimensions } from './polygon-mesh.js';
import { dualDiamond, dualNSided, extrudeFaces, triangulateFace, triangulateFaces, validatePolygonMesh } from './mesh-operations.js';

export function createMeshView(scene) {
  const material = new LineBasicMaterial({ color: '#ffffff' });
  const object = new LineSegments(new BufferGeometry(), material);
  object.name = 'Polygon mesh wireframe'; scene.add(object);
  const selectionMaterial = new LineBasicMaterial({ color: '#ffbc55', depthTest: false, toneMapped: false });
  const selection = new LineSegments(new BufferGeometry(), selectionMaterial);
  selection.renderOrder = 10; object.add(selection);
  // A raycast-only triangle mesh; it never enters the rendered scene.
  const picking = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ side: DoubleSide }));
  let topology, edges = [], triangleFaces = [], generation = 0, selected = new Set(), layers = { stages: [], depths: [] };
  const history = [];
  const geometryForEdges = (mesh, values) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(values.flatMap(edge => edge.flatMap(id => mesh.vertices[id])), 3));
    if (values.length) geometry.computeBoundingSphere();
    return geometry;
  };
  function refreshSelection() {
    selection.geometry.dispose();
    selection.geometry = geometryForEdges(topology, polygonEdges([...selected].map(id => topology.faces[id])));
    selection.visible = selected.size > 0;
  }
  function install(next, faceIds = []) {
    validatePolygonMesh(next);
    const nextEdges = polygonEdges(next.faces), indices = [], owners = [];
    next.faces.forEach((face, id) => {
      for (const triangle of triangulateFace(next, face)) { indices.push(...triangle); owners.push(id); }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(next.vertices.flat(), 3));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    const wireframe = geometryForEdges(next, nextEdges);
    picking.geometry.dispose(); picking.geometry = geometry;
    object.geometry.dispose(); object.geometry = wireframe;
    topology = next; edges = nextEdges; triangleFaces = owners;
    selected = new Set(faceIds); refreshSelection();
  }
  function operate(operation, ids) {
    const result = operation();
    if (result.mesh.faces.length > 50000) throw new Error('This operation exceeds the 50,000-face editing limit.');
    const previous = { mesh: structuredClone(topology), faceIds: [...selected] };
    install(result.mesh, ids === undefined ? [] : result.faceIds);
    history.push(previous); if (history.length > 20) history.shift();
    return topology;
  }
  return {
    object,
    get topology() { return topology; },
    get edges() { return edges; },
    get generation() { return generation; },
    get layers() { return layers; },
    get selectedFaces() { return [...selected]; },
    get canUndo() { return history.length > 0; },
    regenerate(camera, settings) {
      const dimensions = viewportDimensions(camera, camera.position.length());
      const base = createViewportMesh(dimensions.width, dimensions.height, settings.mesh.shortSideSubdivisions);
      const next = createMeshLayers(base, settings.pipeline ?? { enabled: false });
      install(next.mesh, next.faceIds); layers = { stages: next.stages, depths: next.depths };
      object.quaternion.copy(camera.quaternion);
      history.length = 0; generation++;
    },
    refresh() { install(topology, [...selected]); },
    selectFaces(ids) {
      if ([...ids].some(id => !Number.isInteger(id) || id < 0 || id >= topology.faces.length)) throw new Error('Invalid face selection.');
      selected = new Set(ids); refreshSelection();
    },
    pickFace(raycaster) {
      if (!object.visible || !topology) return null;
      object.updateWorldMatrix(true, false); picking.matrixWorld.copy(object.matrixWorld);
      const hits = []; picking.raycast(raycaster, hits); hits.sort((a, b) => a.distance - b.distance);
      return hits.length ? triangleFaces[hits[0].faceIndex] : null;
    },
    triangulate(ids, options) { return operate(() => triangulateFaces(topology, ids, options), ids); },
    dualDiamond() { return operate(() => dualDiamond(topology)); },
    dualNSided() { return operate(() => dualNSided(topology)); },
    extrude(ids, transform, options) { return operate(() => extrudeFaces(topology, ids, transform, options), ids); },
    undo() {
      const previous = history.at(-1); if (!previous) return false;
      install(previous.mesh, previous.faceIds); history.pop(); return true;
    },
    configure(settings) {
      material.color.set(settings.appearance.wireframeColor);
      object.visible = settings.visibility.wireframe;
    },
    dispose() {
      object.removeFromParent(); object.geometry.dispose(); material.dispose();
      selection.geometry.dispose(); selectionMaterial.dispose(); picking.geometry.dispose(); picking.material.dispose();
    },
  };
}
