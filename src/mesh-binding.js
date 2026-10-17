import { Matrix4, Quaternion, Vector3 } from 'three';

// Weights follow actual extrusion rings and topology stencils, not proximity
// to another piece. Bone zero holds the base plane and unextruded border.
export function createExtrusionBinding(mesh, extrusions = []) {
  const weights = mesh.vertices.map(() => [[0, 1]]), chains = [];
  let boneCount = 1;
  for (const { sourceFace, rings } of extrusions) {
    const centers = rings.map(ring => ring.reduce((sum, id) => sum.add(new Vector3(...mesh.vertices[id])), new Vector3()).divideScalar(ring.length));
    const lengths = centers.slice(1).map((center, i) => center.distanceTo(centers[i]));
    if (lengths.some(length => length < 1e-7)) continue;
    const axis = centers.at(-1).clone().sub(centers[0]).normalize();
    const radius = Math.max(...rings[0].map(id => new Vector3(...mesh.vertices[id]).sub(centers[0]).cross(axis).length()));
    // Capture the extruded face's own frame and footprint before smoothing or
    // dual operations replace its vertices. Y follows the extrusion; X follows
    // the face's first edge, so rectangular faces keep their exact dimensions.
    const x = new Vector3(...mesh.vertices[rings[0][1]]).sub(new Vector3(...mesh.vertices[rings[0][0]]));
    x.addScaledVector(axis, -x.dot(axis)).normalize();
    const z = x.clone().cross(axis).normalize();
    const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, axis, z));
    const crossSections = rings.map((ring, layer) => {
      const points = ring.map(id => new Vector3(...mesh.vertices[id]).sub(centers[layer]));
      const xs = points.map(point => point.dot(x)), zs = points.map(point => point.dot(z));
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    });
    const rootBone = boneCount++, segmentBones = lengths.map(() => boneCount++);
    const chain = { id: chains.length, sourceFace, centers: centers.map(v => v.toArray()), axis: axis.toArray(), lengths,
      radius: Math.max(1e-5, radius), rotation: rotation.toArray(), crossSections, rootBone, segmentBones };
    rings.slice(1).forEach((ids, segment) => ids.forEach(id => { weights[id] = [[segmentBones[segment], 1]]; }));
    chains.push(chain);
  }
  if (boneCount > 65535) throw new Error('This rig exceeds the skinning bone limit. Reduce mesh subdivisions.');
  return { chains, weights, boneCount };
}

export function refineBinding(binding, stages = []) {
  let weights = binding.weights;
  for (const sources of stages) weights = sources.map(ids => {
    const combined = new Map();
    for (const id of ids) for (const [bone, weight] of weights[id]) combined.set(bone, (combined.get(bone) ?? 0) + weight / ids.length);
    const top = [...combined].filter(([, weight]) => weight > 1e-8).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const total = top.reduce((sum, [, weight]) => sum + weight, 0);
    return top.map(([bone, weight]) => [bone, weight / total]);
  });
  return { ...binding, weights };
}
