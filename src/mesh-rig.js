import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import Box3D from 'box3d-wasm/standard';
import { fitColliders } from './collider-fit.js';
import { createChainNotes, defaultChainNoteSettings } from './chain-notes.js';
import { Bone, BufferGeometry, CapsuleGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments,
  Matrix4, Mesh, MeshBasicMaterial, Points, PointsMaterial, Quaternion, Raycaster, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';

let engine, initialization;
// Below this size keep the visual collapse, but suspend the body rather than
// give the solver a degenerate hull or near-zero mass/inertia.
const minimumPhysicsScale = .05;
export function initMeshRigPhysics() {
  return initialization ??= Box3D().then(module => { engine = module; });
}

export const defaultRigSettings = Object.freeze({ ...defaultChainNoteSettings, enabled: true, simulate: true, gravity: 0, coneAngle: 60, twistAngle: 90,
  linearDamping: 1, angularDamping: 1, hoverEnabled: true, hoverAcceleration: 14, jointOverlap: 1, density: 1, showBones: true, showJoints: false, showColliders: false });

export function createMeshRig(binding, geometry, material, initial = {}, notePalette = []) {
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
  // Musical scaling changes dimensions, not the weight a limb can support.
  // Keeping mass avoids extreme mass ratios between tiny links and the core.
  const linkDensity = value => density() / (binding.core ? value ** 3 : 1);
  const world = new engine.World({ gravity: { x: 0, y: 0, z: 0 }, maximumLinearSpeed: 400 * physicsScale,
    ...(binding.core ? { contactHertz: 120, contactDampingRatio: 1, contactSpeed: 40 * physicsScale } : {}),
    enableSleep: false, enableContinuous: true });
  const group = new Group(); group.name = 'Extrusion bone chains';
  const skin = new SkinnedMesh(geometry, material); skin.name = 'Bound polygon mesh'; skin.frustumCulled = false; group.add(skin);
  const indices = [], weights = [];
  binding.weights.forEach(influences => {
    for (let i = 0; i < 4; i++) { indices.push(influences[i]?.[0] ?? 0); weights.push(influences[i]?.[1] ?? 0); }
  });
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const bones = Array.from({ length: binding.boneCount }, (_, i) => { const bone = new Bone(); bone.name = i ? `Bone ${i}` : binding.core ? 'Dodecahedron body' : 'Fixed base mesh'; bone.matrixAutoUpdate = false; return bone; });
  skin.add(bones[0]);
  const handles = [], chains = [], links = [], joints = [], debugMeshes = [];
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const halfExtents = binding.core ? { x: 100, y: 50, z: 100 }
    : { x: Math.max(100, (bounds.max.x - bounds.min.x) * 10), y: Math.max(100, (bounds.max.y - bounds.min.y) * 10), z: .5 };
  const physicsHalfExtents = Object.fromEntries(Object.entries(halfExtents).map(([key, value]) => [key, value * physicsScale]));
  const groundLevel = binding.core?.groundLevel ?? 0;
  const groundPosition = binding.core ? { x: 0, y: (groundLevel - halfExtents.y) * physicsScale, z: 0 } : { x: 0, y: 0, z: -physicsHalfExtents.z };
  const baseBody = world.createBody({ type: 'static', position: groundPosition }); handles.push(baseBody);
  const baseShape = baseBody.createBox({ halfExtents: physicsHalfExtents, friction: .6, restitution: binding.core ? .65 : 0,
    filter: { categoryBits: 2, maskBits: 5 } }); handles.push(baseShape);
  const basePlane = { body: baseBody, shape: baseShape, halfExtents: physicsHalfExtents, sceneHalfExtents: halfExtents, level: groundLevel };
  let core, coreShape;
  const coreMatrix = new Matrix4();
  if (binding.core) {
    core = world.createBody({ type: 'dynamic', position: { x: 0, y: 0, z: 0 },
      linearDamping: settings.linearDamping * .15, angularDamping: settings.angularDamping * .15 }); handles.push(core);
    coreShape = core.createHull({ points: binding.core.points.map(point => toPhysics(new Vector3(...point))), maxVertices: 32,
      density: density(), friction: .6, restitution: .65, filter: { categoryBits: 4, maskBits: 3 } }); handles.push(coreShape);
  }
  function updateCoreMatrix() {
    if (core) coreMatrix.compose(new Vector3().copy(core.getPosition()).divideScalar(physicsScale),
      new Quaternion().copy(core.getRotation()).normalize(), new Vector3(1, 1, 1));
    return coreMatrix;
  }
  const rootPosition = chain => new Vector3(...chain.definition.centers[0]).applyMatrix4(updateCoreMatrix());
  const axis = new Vector3(0, 1, 0), scale = new Vector3(1, 1, 1), inverse = new Matrix4();
  const jointRotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis);
  const colliderMaterial = new MeshBasicMaterial({ color: '#62f1af', wireframe: true, transparent: true, opacity: 0.55, depthTest: false, toneMapped: false });
  const coreGeometry = core ? new ConvexGeometry(binding.core.points.map(point => new Vector3(...point))) : null;
  const coreDebug = core ? new Mesh(coreGeometry, colliderMaterial) : null;
  const coreLink = core ? { body: core, debug: coreDebug, physicsEnabled: true, currentScale: 1, chain: null } : null;
  if (coreDebug) { coreDebug.renderOrder = 20; group.add(coreDebug); }
  const capsuleGeometry = new CapsuleGeometry(0.25, 0.5, 2, 12);
  const unitPoints = new Map(), capsulePositions = capsuleGeometry.getAttribute('position');
  for (let i = 0; i < capsulePositions.count; i++) {
    const point = new Vector3().fromBufferAttribute(capsulePositions, i);
    unitPoints.set(point.toArray().map(value => value.toFixed(7)).join(','), point);
  }
  const colliders = fitColliders(binding, settings);
  for (const definition of binding.chains) {
    const base = new Vector3(...definition.centers[0]), rotation = new Quaternion(...definition.rotation);
    const root = core ?? world.createBody({ type: 'static', position: toPhysics(base), rotation }); if (!core) handles.push(root);
    const rootBone = bones[definition.rootBone]; rootBone.name = `Piece ${definition.id + 1} fixed root`; bones[0].add(rootBone);
    rootBone.matrix.compose(base, rotation, scale);
    const chain = { definition, root, links: [], joints: [], rootBone, rootWorldMatrix: new Matrix4() };
    let parentBody = root, parentBone = rootBone, previousLength = 0, previousOffset = new Vector3();
    definition.lengths.forEach((length, segment) => {
      const a = new Vector3(...definition.centers[segment]), b = new Vector3(...definition.centers[segment + 1]);
      const { halfExtents, capsuleScale, offset: colliderOffset, radius, lowerInset, upperInset } = colliders[definition.id][segment];
      const body = world.createBody({ type: 'dynamic', position: toPhysics(a.clone().add(b).multiplyScalar(0.5).add(colliderOffset.clone().applyQuaternion(rotation))), rotation,
        linearDamping: settings.linearDamping, angularDamping: settings.angularDamping }); handles.push(body);
      const contactsBase = true;
      const shapeOptions = { density: density(), friction: 0.6, restitution: core ? .4 : 0,
        filter: { categoryBits: 1, maskBits: core ? 7 : 3, groupIndex: -(definition.id + 1) } };
      // Nonuniformly scaled caps have elliptical ends. A convex hull of the
      // same template gives physics the shape actually shown and hover-tested.
      const points = [...unitPoints.values()].map(point => toPhysics(point.clone().multiply(capsuleScale)));
      const shape = body.createHull({ ...shapeOptions, points, maxVertices: 64 }); handles.push(shape);
      const shapeHandle = handles.length - 1;
      const localFrameA = core && segment === 0
        ? { position: toPhysics(base), rotation: rotation.clone().multiply(jointRotation) }
        : { position: toPhysics(new Vector3(0, segment ? previousLength / 2 : 0, 0).sub(previousOffset)), rotation: jointRotation };
      const localFrameB = { position: toPhysics(new Vector3(0, -length / 2, 0).sub(colliderOffset)), rotation: jointRotation };
      const joint = world.createSphericalJoint(parentBody, body, { localFrameA, localFrameB,
        enableConeLimit: true, coneAngle: settings.coneAngle * Math.PI / 180,
        enableTwistLimit: true, lowerTwistAngle: -settings.twistAngle * Math.PI / 180, upperTwistAngle: settings.twistAngle * Math.PI / 180,
        collideConnected: false }); handles.push(joint);
      const bone = bones[definition.segmentBones[segment]]; bone.name = `Piece ${definition.id + 1} segment ${segment + 1}`; parentBone.add(bone);
      const debug = new Mesh(capsuleGeometry, colliderMaterial); debug.scale.copy(capsuleScale); debug.renderOrder = 20; group.add(debug); debugMeshes.push(debug);
      const link = { body, shape, shapeHandle, shapeOptions, currentScale: 1, shapeScale: 1, physicsEnabled: true, bone, debug, length, halfExtents, capsuleScale, colliderOffset, radius, lowerInset, upperInset, contactsBase, parentBone, worldMatrix: new Matrix4(), chain, segment, index: links.length };
      const constraint = { native: joint, handle: handles.length - 1, bodyA: parentBody, bodyB: body, localFrameA, localFrameB };
      links.push(link); chain.links.push(link); chain.joints.push(constraint); joints.push(constraint);
      parentBody = body; parentBone = bone; previousLength = length; previousOffset = colliderOffset;
    });
    chains.push(chain);
  }
  const chainNotes = createChainNotes(chains, settings, notePalette);
  const pendingNotePushes = new Map();
  function triggerNotes(events) {
    const hits = chainNotes.trigger(events);
    if (!settings.simulate || !settings.notePushEnabled || settings.notePushStrength <= 0) return;
    for (const { chain, gain, midi } of hits) {
      chain.noteHitCount = (chain.noteHitCount ?? 0) + 1;
      pendingNotePushes.set(chain, { gain, angle: chain.definition.id * 2.399963 + chain.noteHitCount * 1.7 + midi * .13,
        remaining: new Set(chain.links), seconds: settings.noteAttack + .15 });
    }
  }
  function pushNotes(dt, worldRotation) {
    const up = new Vector3(0, 1, 0).applyQuaternion(worldRotation.clone().invert());
    for (const [chain, hit] of pendingNotePushes) {
      // Lift against world gravity and vary the sideways direction each hit.
      // All links share a direction, with a stronger push toward the free tip.
      const direction = new Vector3(Math.cos(hit.angle), .25, Math.sin(hit.angle))
        .applyQuaternion(new Quaternion(...chain.definition.rotation)).applyQuaternion(core ? new Quaternion().copy(core.getRotation()) : new Quaternion()).addScaledVector(up, 1.2).normalize();
      for (const link of hit.remaining) {
        if (!link.physicsEnabled) continue;
        const tipWeight = .4 + .6 * (link.segment + 1) / chain.links.length;
        // Strength is in segment lengths/second. Mass normalization keeps the
        // same response across collider sizes, densities and scene scales.
        const impulse = direction.clone().multiplyScalar(link.body.getMass() * settings.notePushStrength * hit.gain * tipWeight);
        link.body.applyLinearImpulseToCenter(impulse, true);
        hit.remaining.delete(link);
      }
      hit.seconds -= dt;
      // A collapsed link gets its impulse when the attack makes it physical.
      if (!hit.remaining.size || hit.seconds <= 0) pendingNotePushes.delete(chain);
    }
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
  let drag = null;
  function beginDrag(link, worldPoint) {
    if (disposed || !settings.simulate || (!links.includes(link) && link !== coreLink) || !link.physicsEnabled) return false;
    group.updateWorldMatrix(true, false);
    const point = group.worldToLocal(worldPoint.clone());
    const local = point.clone().sub(new Vector3().copy(link.body.getPosition()).divideScalar(physicsScale))
      .applyQuaternion(new Quaternion().copy(link.body.getRotation()).invert()).divideScalar(link.currentScale);
    drag = { link, local, target: point, origin: point.clone(), coreOrigin: core ? new Vector3().copy(core.getPosition()).divideScalar(physicsScale) : null }; hovered = null; return true;
  }
  function pullDrag(dt) {
    if (!drag) return;
    const { link, local, target } = drag, body = link.body;
    // Carry the free body with the grab, even while note envelopes change the
    // other chains. The local spring still bends the held piece at its joints.
    if (core) {
      const desired = toPhysics(drag.coreOrigin.clone().add(target).sub(drag.origin));
      const totalMass = core.getMass() + links.reduce((sum, item) => sum + (item.physicsEnabled ? item.body.getMass() : 0), 0);
      const acceleration = desired.sub(new Vector3().copy(core.getPosition())).multiplyScalar(100)
        .addScaledVector(new Vector3().copy(core.getLinearVelocity()), -20)
        .divideScalar(1 + 20 * dt + 100 * dt * dt).clampLength(0, 180 * physicsScale);
      core.applyLinearImpulseToCenter(acceleration.multiplyScalar(totalMass * dt), true);
    }
    if (!link.physicsEnabled) return;
    const center = new Vector3().copy(body.getPosition());
    const arm = toPhysics(local.clone().multiplyScalar(link.currentScale)).applyQuaternion(new Quaternion().copy(body.getRotation()));
    const point = center.clone().add(arm);
    const velocity = new Vector3().copy(body.getAngularVelocity()).cross(arm).add(new Vector3().copy(body.getLinearVelocity()));
    const acceleration = toPhysics(target).sub(point).multiplyScalar(900).addScaledVector(velocity, -60)
      .divideScalar(1 + 60 * dt + 900 * dt * dt).clampLength(0, 240 * physicsScale);
    body.applyForce(acceleration.multiplyScalar(body.getMass()), point, true);
  }
  function pickCollider(raycaster) {
    group.updateWorldMatrix(true, true);
    // Raycasting is independent of the collider debug visibility toggle.
    const candidates = coreLink ? [...links, coreLink] : links;
    const hit = raycaster.intersectObjects(candidates.filter(link => link.physicsEnabled).map(link => link.debug), false)[0];
    return hit ? { link: candidates.find(link => link.debug === hit.object), point: hit.point, distance: hit.distance } : null;
  }
  function repel(dt) {
    hovered = !drag && hoverActive && settings.hoverEnabled ? pickCollider(hoverCaster) : null;
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
    bones[0].matrix.copy(updateCoreMatrix()); bones[0].matrixWorldNeedsUpdate = true;
    if (coreDebug) { coreMatrix.decompose(coreDebug.position, coreDebug.quaternion, coreDebug.scale); coreDebug.visible = settings.showColliders; }
    const lines = boneGeometry.getAttribute('position'), points = jointGeometry.getAttribute('position');
    let pointIndex = 0;
    for (const chain of chains) {
      let previousEnd = rootPosition(chain);
      points.setXYZ(pointIndex++, previousEnd.x, previousEnd.y, previousEnd.z);
      chain.rootWorldMatrix.multiplyMatrices(coreMatrix, chain.rootBone.matrix);
      for (const link of chain.links) {
        position.copy(link.body.getPosition()).divideScalar(physicsScale); rotation.copy(link.body.getRotation()).normalize();
        offset.copy(axis).applyQuaternion(rotation);
        const start = link.physicsEnabled
          ? position.clone().sub(link.colliderOffset.clone().multiplyScalar(link.currentScale).applyQuaternion(rotation)).addScaledVector(offset, -link.length * link.currentScale / 2)
          : previousEnd.clone();
        if (!link.physicsEnabled) {
          position.copy(start).add(link.colliderOffset.clone().multiplyScalar(link.currentScale).applyQuaternion(rotation)).addScaledVector(offset, link.length * link.currentScale / 2);
          link.body.setTransform(toPhysics(position), rotation);
        }
        const end = start.clone().addScaledVector(offset, link.length * link.currentScale);
        link.worldMatrix.compose(start, rotation, scale.setScalar(link.currentScale));
        const previous = chain.links[link.segment - 1], parent = previous?.worldMatrix ?? chain.rootWorldMatrix;
        // A fully collapsed parent has no inverse. Its descendants are already
        // at the same root, so use a zero local scale without inverting it.
        if (previous?.currentScale === 0) link.bone.matrix.makeScale(0, 0, 0);
        else link.bone.matrix.multiplyMatrices(inverse.copy(parent).invert(), link.worldMatrix);
        link.bone.matrixWorldNeedsUpdate = true;
        const i = link.index * 2; lines.setXYZ(i, start.x, start.y, start.z); lines.setXYZ(i + 1, end.x, end.y, end.z);
        points.setXYZ(pointIndex++, end.x, end.y, end.z);
        link.debug.position.copy(position); link.debug.quaternion.copy(rotation); link.debug.scale.copy(link.capsuleScale).multiplyScalar(link.currentScale);
        link.debug.visible = settings.showColliders && link.physicsEnabled;
        previousEnd = end;
      }
    }
    lines.needsUpdate = points.needsUpdate = true;
    group.updateWorldMatrix(true, true); skin.updateMatrixWorld(true); skeleton?.update();
    skin.boundingSphere = null; skin.boundingBox = null;
  }
  function resizeNoteChains() {
    for (const chain of chains) {
      if (drag?.link.chain === chain) continue; // Keep the held collider stable until release.
      const scales = chain.links.map((_, i) => Math.round(chain.noteScale ** (i + 1) * 1000) / 1000);
      if (chain.links.every((link, i) => link.currentScale === scales[i])) continue;
      // Resize native collision hulls and joint anchors together with the
      // skeleton. Keeping their frames aligned avoids a visual-only pulse.
      for (const joint of chain.joints) { joint.native.destroy(); joint.native.delete(); }
      let start = rootPosition(chain);
      for (const [i, link] of chain.links.entries()) {
        const nextScale = scales[i], rotation = new Quaternion().copy(link.body.getRotation()).normalize();
        const physicsEnabled = nextScale >= minimumPhysicsScale;
        if (physicsEnabled !== link.physicsEnabled) {
          link.body.setEnabled(physicsEnabled);
          const parent = chain.links[i - 1]?.body ?? chain.root;
          link.body.setLinearVelocity(core && physicsEnabled ? parent.getLinearVelocity() : new Vector3());
          link.body.setAngularVelocity(core && physicsEnabled ? parent.getAngularVelocity() : new Vector3());
          link.physicsEnabled = physicsEnabled;
        }
        if (physicsEnabled && nextScale !== link.shapeScale) {
          link.shape.destroy(); link.shape.delete();
          const points = [...unitPoints.values()].map(point => toPhysics(point.clone().multiply(link.capsuleScale).multiplyScalar(nextScale)));
          link.shape = link.body.createHull({ ...link.shapeOptions, density: linkDensity(nextScale), points, maxVertices: 64 });
          handles[link.shapeHandle] = link.shape; link.body.applyMassFromShapes();
          link.shapeScale = nextScale;
        }
        link.currentScale = nextScale;
        const center = new Vector3(0, link.length / 2, 0).add(link.colliderOffset).multiplyScalar(nextScale).applyQuaternion(rotation).add(start);
        if (!core || !settings.simulate || !physicsEnabled) {
          link.body.setTransform(toPhysics(center), rotation);
        }
        // During simulation the new joint anchors drive growth. Moving every
        // center out from the root would teleport grounded links through it.
        start = new Vector3().copy(link.body.getPosition()).divideScalar(physicsScale)
          .add(new Vector3(0, link.length / 2, 0).sub(link.colliderOffset).multiplyScalar(nextScale).applyQuaternion(rotation));
      }
      for (const [i, joint] of chain.joints.entries()) {
        const link = chain.links[i], previous = chain.links[i - 1];
        joint.localFrameA.position = previous ? toPhysics(new Vector3(0, previous.length / 2, 0).sub(previous.colliderOffset).multiplyScalar(previous.currentScale)) : core ? toPhysics(new Vector3(...chain.definition.centers[0])) : new Vector3();
        joint.localFrameB.position = toPhysics(new Vector3(0, -link.length / 2, 0).sub(link.colliderOffset).multiplyScalar(link.currentScale));
        joint.native = world.createSphericalJoint(joint.bodyA, joint.bodyB, { localFrameA: joint.localFrameA, localFrameB: joint.localFrameB,
          enableConeLimit: true, coneAngle: settings.coneAngle * Math.PI / 180,
          enableTwistLimit: true, lowerTwistAngle: -settings.twistAngle * Math.PI / 180, upperTwistAngle: settings.twistAngle * Math.PI / 180,
          collideConnected: false });
        handles[joint.handle] = joint.native;
      }
    }
  }
  sync(); skeleton = new Skeleton(bones); skin.bind(skeleton); skin.normalizeSkinWeights();
  function configure(value) {
    Object.assign(settings, value);
    if (!settings.simulate) drag = null;
    if (!settings.simulate || !settings.notePushEnabled || settings.notePushStrength <= 0) pendingNotePushes.clear();
    chainNotes.configure(value); resizeNoteChains();
    if (value?.damping !== undefined) {
      settings.linearDamping = value.linearDamping ?? value.damping;
      settings.angularDamping = value.angularDamping ?? value.damping;
    }
    boneLines.visible = settings.showBones; jointPoints.visible = settings.showJoints;
    debugMeshes.forEach(mesh => { mesh.visible = settings.showColliders; });
    if (core) {
      // A heavy shared body needs less drag than the small articulated links.
      core.setLinearDamping(settings.linearDamping * .15); core.setAngularDamping(settings.angularDamping * .15);
      coreShape.setDensity(density()); core.applyMassFromShapes();
    }
    for (const link of links) {
      link.body.setLinearDamping(settings.linearDamping); link.body.setAngularDamping(settings.angularDamping);
      link.shape.setDensity(linkDensity(link.shapeScale)); link.body.applyMassFromShapes();
    }
    for (const { native } of joints) { native.setConeLimit(settings.coneAngle * Math.PI / 180); native.setTwistLimits(-settings.twistAngle * Math.PI / 180, settings.twistAngle * Math.PI / 180); }
    sync();
  }
  configure(settings);
  return {
    group, skin, skeleton, chains, links, joints, world, basePlane, core, coreLink, physicsScale, chainNotes,
    getCenter(target = new Vector3()) { return core ? target.copy(core.getPosition()).divideScalar(physicsScale) : target.set(0, 0, 0); },
    get seconds() { return seconds; },
    get stats() { return { chains: chains.length, bones: bones.length, joints: joints.length, colliders: links.length, coreColliders: core ? 1 : 0, baseColliders: 1,
      noteGroups: chains.reduce((counts, chain) => { const layer=chain.noteAssignment?.layer; if(layer)counts[layer]=(counts[layer]??0)+1; return counts; }, {}) }; },
    configure,
    beginDrag,
    moveDrag(worldPoint) { if (drag && !disposed) { group.updateWorldMatrix(true, false); drag.target.copy(group.worldToLocal(worldPoint.clone())); } },
    endDrag() { drag = null; },
    get dragging() { return !!drag; },
    triggerNotes,
    setNotePalette(palette) { pendingNotePushes.clear(); chainNotes.setPalette(palette); resizeNoteChains(); sync(); },
    pickCollider,
    get hoveredCollider() { return hovered?.link ?? null; },
    setHoverRay(ray) { hoverActive = !!ray; if (ray) hoverCaster.ray.copy(ray); else hovered = null; },
    step(dt, worldRotation = new Quaternion()) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      if (!settings.simulate) { chainNotes.update(Math.min(dt, .05)); resizeNoteChains(); sync(); return; }
      world.setGravity(new Vector3(0, -settings.gravity * physicsScale, 0).applyQuaternion(worldRotation.clone().invert()));
      accumulator += Math.min(dt, 0.05);
      let stepped = false;
      // Update rapidly growing hulls between short contact solves, rather
      // than expanding them through the floor once per rendered frame.
      const timeStep = core ? 1 / 240 : 1 / 60;
      while (accumulator >= timeStep - 1e-10) {
        chainNotes.update(timeStep); resizeNoteChains();
        pushNotes(timeStep, worldRotation); pullDrag(timeStep); repel(timeStep); world.step(timeStep, 8);
        seconds += timeStep; accumulator = Math.max(0, accumulator - timeStep);
        sync(); stepped = true;
      }
      if (!stepped) sync();
    },
    sync,
    nudge(strength = 1) {
      for (const chain of chains) {
        const link = chain.links.at(-1), impulse = new Vector3(0.5, 0, 0.3).multiplyScalar(strength * link.body.getMass() * physicsScale);
        if (link.physicsEnabled) link.body.applyLinearImpulseToCenter(impulse, true);
      }
    },
    getPositions(target = new Float32Array(geometry.getAttribute('position').count * 3)) {
      group.updateWorldMatrix(true, true); skin.updateMatrixWorld(true); skeleton.update();
      const attribute = geometry.getAttribute('position');
      for (let i = 0; i < attribute.count; i++) { position.fromBufferAttribute(attribute, i); skin.applyBoneTransform(i, position); position.toArray(target, i * 3); }
      return target;
    },
    dispose() {
      if (disposed) return; disposed = true; drag = null;
      group.removeFromParent(); world.destroy();
      for (const handle of handles.reverse()) handle.delete(); world.delete();
      skeleton.dispose(); boneGeometry.dispose(); jointGeometry.dispose(); boneLines.material.dispose(); jointPoints.material.dispose();
      capsuleGeometry.dispose(); coreGeometry?.dispose(); colliderMaterial.dispose();
    },
  };
}
