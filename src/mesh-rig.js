import Box3D from 'box3d-wasm/standard';
import { fitColliders } from './collider-fit.js';
import { Bone, BufferGeometry, CapsuleGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments,
  Matrix4, Mesh, MeshBasicMaterial, Points, PointsMaterial, Quaternion, Raycaster, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';

let engine, initialization;
export function initMeshRigPhysics() {
  return initialization ??= Box3D().then(module => { engine = module; });
}

export const defaultRigSettings = Object.freeze({ enabled: true, simulate: true, gravity: 0, coneAngle: 60, twistAngle: 90,
  linearDamping: 1, angularDamping: 1, hoverEnabled: true, hoverAcceleration: 14, density: 1, showBones: true, showJoints: false, showColliders: false });

export function createMeshRig(binding, geometry, material, initial = {}) {
  if (!engine) throw new Error('Initialize mesh rig physics before creating a rig.');
  const settings = { ...defaultRigSettings, ...initial,
    linearDamping: initial.linearDamping ?? initial.damping ?? defaultRigSettings.linearDamping,
    angularDamping: initial.angularDamping ?? initial.damping ?? defaultRigSettings.angularDamping };
  // Every procedural segment is one physics unit long. Convert all lengths,
  // accelerations and impulses consistently; skinning stays in scene units.
  const segmentLength = binding.chains[0]?.lengths[0] ?? 1;
  const physicsScale = 1 / segmentLength;
  const toPhysics = value => value.clone().multiplyScalar(physicsScale);
  const density = () => settings.density / physicsScale ** 3;
  const world = new engine.World({ gravity: { x: 0, y: 0, z: 0 }, maximumLinearSpeed: 400 * physicsScale,
    enableSleep: false, enableContinuous: true });
  const group = new Group(); group.name = 'Extrusion bone chains';
  const skin = new SkinnedMesh(geometry, material); skin.name = 'Bound polygon mesh'; skin.frustumCulled = false; group.add(skin);
  const indices = [], weights = [];
  binding.weights.forEach(influences => {
    for (let i = 0; i < 4; i++) { indices.push(influences[i]?.[0] ?? 0); weights.push(influences[i]?.[1] ?? 0); }
  });
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const bones = Array.from({ length: binding.boneCount }, (_, i) => { const bone = new Bone(); bone.name = i ? `Bone ${i}` : 'Fixed base mesh'; bone.matrixAutoUpdate = false; return bone; });
  skin.add(bones[0]);
  const handles = [], chains = [], links = [], joints = [], debugMeshes = [];
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox, halfExtents = { x: Math.max(100, (bounds.max.x - bounds.min.x) * 10), y: Math.max(100, (bounds.max.y - bounds.min.y) * 10), z: 0.5 };
  const physicsHalfExtents = Object.fromEntries(Object.entries(halfExtents).map(([key, value]) => [key, value * physicsScale]));
  const baseBody = world.createBody({ type: 'static', position: { x: 0, y: 0, z: -physicsHalfExtents.z } }); handles.push(baseBody);
  const baseShape = baseBody.createBox({ halfExtents: physicsHalfExtents, friction: 0.6, restitution: 0,
    filter: { categoryBits: 2, maskBits: 1 } }); handles.push(baseShape);
  const basePlane = { body: baseBody, shape: baseShape, halfExtents: physicsHalfExtents, sceneHalfExtents: halfExtents, level: 0 };
  const axis = new Vector3(0, 1, 0), scale = new Vector3(1, 1, 1), inverse = new Matrix4();
  const jointRotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis);
  const colliderMaterial = new MeshBasicMaterial({ color: '#62f1af', wireframe: true, transparent: true, opacity: 0.55, depthTest: false, toneMapped: false });
  const capsuleGeometry = new CapsuleGeometry(0.25, 0.5, 2, 12);
  const unitPoints = new Map(), capsulePositions = capsuleGeometry.getAttribute('position');
  for (let i = 0; i < capsulePositions.count; i++) {
    const point = new Vector3().fromBufferAttribute(capsulePositions, i);
    unitPoints.set(point.toArray().map(value => value.toFixed(7)).join(','), point);
  }
  const colliders = fitColliders(binding);
  for (const definition of binding.chains) {
    const base = new Vector3(...definition.centers[0]), rotation = new Quaternion(...definition.rotation);
    const root = world.createBody({ type: 'static', position: toPhysics(base), rotation }); handles.push(root);
    const rootBone = bones[definition.rootBone]; rootBone.name = `Piece ${definition.id + 1} fixed root`; bones[0].add(rootBone);
    rootBone.matrix.compose(base, rotation, scale);
    const chain = { definition, root, links: [], joints: [], rootBone };
    let parentBody = root, parentBone = rootBone, previousLength = 0, previousOffset = new Vector3();
    definition.lengths.forEach((length, segment) => {
      const a = new Vector3(...definition.centers[segment]), b = new Vector3(...definition.centers[segment + 1]);
      const { halfExtents, capsuleScale, offset: colliderOffset } = colliders[definition.id][segment];
      const body = world.createBody({ type: 'dynamic', position: toPhysics(a.clone().add(b).multiplyScalar(0.5).add(colliderOffset.clone().applyQuaternion(rotation))), rotation,
        linearDamping: settings.linearDamping, angularDamping: settings.angularDamping }); handles.push(body);
      const contactsBase = true;
      const shapeOptions = { density: density(), friction: 0.6, restitution: 0,
        filter: { categoryBits: 1, maskBits: 3, groupIndex: -(definition.id + 1) } };
      // Nonuniformly scaled caps have elliptical ends. A convex hull of the
      // same template gives physics the shape actually shown and hover-tested.
      const points = [...unitPoints.values()].map(point => toPhysics(point.clone().multiply(capsuleScale)));
      const shape = body.createHull({ ...shapeOptions, points, maxVertices: 64 }); handles.push(shape);
      const localFrameA = { position: toPhysics(new Vector3(0, segment ? previousLength / 2 : 0, 0).sub(previousOffset)), rotation: jointRotation };
      const localFrameB = { position: toPhysics(new Vector3(0, -length / 2, 0).sub(colliderOffset)), rotation: jointRotation };
      const joint = world.createSphericalJoint(parentBody, body, { localFrameA, localFrameB,
        enableConeLimit: true, coneAngle: settings.coneAngle * Math.PI / 180,
        enableTwistLimit: true, lowerTwistAngle: -settings.twistAngle * Math.PI / 180, upperTwistAngle: settings.twistAngle * Math.PI / 180,
        collideConnected: false }); handles.push(joint);
      const bone = bones[definition.segmentBones[segment]]; bone.name = `Piece ${definition.id + 1} segment ${segment + 1}`; parentBone.add(bone);
      const debug = new Mesh(capsuleGeometry, colliderMaterial); debug.scale.copy(capsuleScale); debug.renderOrder = 20; group.add(debug); debugMeshes.push(debug);
      const link = { body, shape, bone, debug, length, halfExtents, capsuleScale, colliderOffset, contactsBase, parentBone, worldMatrix: new Matrix4(), chain, segment, index: links.length };
      const constraint = { native: joint, bodyA: parentBody, bodyB: body, localFrameA, localFrameB };
      links.push(link); chain.links.push(link); chain.joints.push(constraint); joints.push(constraint);
      parentBody = body; parentBone = bone; previousLength = length; previousOffset = colliderOffset;
    });
    chains.push(chain);
  }
  const boneGeometry = new BufferGeometry(), jointGeometry = new BufferGeometry();
  boneGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(links.length * 6), 3));
  jointGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array((links.length + chains.length) * 3), 3));
  const boneLines = new LineSegments(boneGeometry, new LineBasicMaterial({ color: '#47cfff', depthTest: false, toneMapped: false }));
  const jointPoints = new Points(jointGeometry, new PointsMaterial({ color: '#ffbd64', size: 5, sizeAttenuation: false, depthTest: false, toneMapped: false }));
  boneLines.frustumCulled = jointPoints.frustumCulled = false; boneLines.renderOrder = jointPoints.renderOrder = 21; group.add(boneLines, jointPoints);
  let skeleton, disposed = false, accumulator = 0, seconds = 0;
  const position = new Vector3(), rotation = new Quaternion(), offset = new Vector3();
  const hoverCaster = new Raycaster(); let hoverActive = false, hovered = null;
  function pickCollider(raycaster) {
    group.updateWorldMatrix(true, true);
    // Raycasting is independent of the collider debug visibility toggle.
    const hit = raycaster.intersectObjects(debugMeshes, false)[0];
    return hit ? { link: links[debugMeshes.indexOf(hit.object)], point: hit.point, distance: hit.distance } : null;
  }
  function repel(dt) {
    hovered = hoverActive && settings.hoverEnabled ? pickCollider(hoverCaster) : null;
    if (!hovered || settings.hoverAcceleration <= 0) return;
    const { body } = hovered.link, center = new Vector3().copy(body.getPosition()).divideScalar(physicsScale);
    const localRay = hoverCaster.ray.clone().applyMatrix4(new Matrix4().copy(group.matrixWorld).invert());
    // Push sideways away from the cursor ray at this body's depth, rather
    // than into the screen from the front intersection of the capsule.
    const direction = center.clone().sub(localRay.closestPointToPoint(center, new Vector3()));
    if (direction.lengthSq() < 1e-12) {
      direction.set(1, 0, 0).addScaledVector(localRay.direction, -localRay.direction.x);
      if (direction.lengthSq() < 1e-12) direction.set(0, 1, 0);
    }
    const impulse = direction.normalize().multiplyScalar(body.getMass() * settings.hoverAcceleration * dt * physicsScale);
    body.applyLinearImpulseToCenter(impulse, true);
  }
  function sync() {
    const lines = boneGeometry.getAttribute('position'), points = jointGeometry.getAttribute('position');
    let pointIndex = 0;
    for (const chain of chains) {
      points.setXYZ(pointIndex++, ...chain.definition.centers[0]);
      for (const link of chain.links) {
        position.copy(link.body.getPosition()).divideScalar(physicsScale); rotation.copy(link.body.getRotation()).normalize();
        offset.copy(axis).applyQuaternion(rotation);
        const start = position.clone().sub(link.colliderOffset.clone().applyQuaternion(rotation)).addScaledVector(offset, -link.length / 2);
        const end = start.clone().addScaledVector(offset, link.length);
        link.worldMatrix.compose(start, rotation, scale);
        const parent = link.segment ? chain.links[link.segment - 1].worldMatrix : chain.rootBone.matrix;
        link.bone.matrix.multiplyMatrices(inverse.copy(parent).invert(), link.worldMatrix); link.bone.matrixWorldNeedsUpdate = true;
        const i = link.index * 2; lines.setXYZ(i, start.x, start.y, start.z); lines.setXYZ(i + 1, end.x, end.y, end.z);
        points.setXYZ(pointIndex++, end.x, end.y, end.z);
        link.debug.position.copy(position); link.debug.quaternion.copy(rotation);
      }
    }
    lines.needsUpdate = points.needsUpdate = true;
    group.updateWorldMatrix(true, true); skin.updateMatrixWorld(true); skeleton?.update();
    skin.boundingSphere = null; skin.boundingBox = null;
  }
  sync(); skeleton = new Skeleton(bones); skin.bind(skeleton); skin.normalizeSkinWeights();
  function configure(value) {
    Object.assign(settings, value);
    if (value?.damping !== undefined) {
      settings.linearDamping = value.linearDamping ?? value.damping;
      settings.angularDamping = value.angularDamping ?? value.damping;
    }
    boneLines.visible = settings.showBones; jointPoints.visible = settings.showJoints;
    debugMeshes.forEach(mesh => { mesh.visible = settings.showColliders; });
    for (const link of links) {
      link.body.setLinearDamping(settings.linearDamping); link.body.setAngularDamping(settings.angularDamping);
      link.shape.setDensity(density()); link.body.applyMassFromShapes();
    }
    for (const { native } of joints) { native.setConeLimit(settings.coneAngle * Math.PI / 180); native.setTwistLimits(-settings.twistAngle * Math.PI / 180, settings.twistAngle * Math.PI / 180); }
  }
  configure(settings);
  return {
    group, skin, skeleton, chains, links, joints, world, basePlane, physicsScale,
    get seconds() { return seconds; },
    get stats() { return { chains: chains.length, bones: bones.length, joints: joints.length, colliders: links.length, baseColliders: 1 }; },
    configure,
    pickCollider,
    get hoveredCollider() { return hovered?.link ?? null; },
    setHoverRay(ray) { hoverActive = !!ray; if (ray) hoverCaster.ray.copy(ray); else hovered = null; },
    step(dt, worldRotation = new Quaternion()) {
      if (disposed || !settings.simulate || !Number.isFinite(dt) || dt <= 0) return;
      world.setGravity(new Vector3(0, -settings.gravity * physicsScale, 0).applyQuaternion(worldRotation.clone().invert()));
      accumulator += Math.min(dt, 0.05);
      while (accumulator >= 1 / 60) {
        repel(1 / 60); world.step(1 / 60, 8);
        seconds += 1 / 60; accumulator -= 1 / 60;
        sync();
      }
    },
    sync,
    nudge(strength = 1) {
      for (const chain of chains) {
        const link = chain.links.at(-1), impulse = new Vector3(0.5, 0, 0.3).multiplyScalar(strength * link.body.getMass() * physicsScale);
        link.body.applyLinearImpulseToCenter(impulse, true);
      }
    },
    getPositions(target = new Float32Array(geometry.getAttribute('position').count * 3)) {
      group.updateWorldMatrix(true, true); skin.updateMatrixWorld(true); skeleton.update();
      const attribute = geometry.getAttribute('position');
      for (let i = 0; i < attribute.count; i++) { position.fromBufferAttribute(attribute, i); skin.applyBoneTransform(i, position); position.toArray(target, i * 3); }
      return target;
    },
    dispose() {
      if (disposed) return; disposed = true;
      group.removeFromParent(); world.destroy();
      for (const handle of handles.reverse()) handle.delete(); world.delete();
      skeleton.dispose(); boneGeometry.dispose(); jointGeometry.dispose(); boneLines.material.dispose(); jointPoints.material.dispose();
      capsuleGeometry.dispose(); colliderMaterial.dispose();
    },
  };
}
