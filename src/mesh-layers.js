import { averageVertices, dualDiamond, dualNSided, extrudeFaces, extrusionTransform, insetFaces, subdivideSmooth, triangulateFaces } from './mesh-operations.js';

export function createSeededRandom(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Random seed must be an unsigned 32-bit integer.');
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function createMeshLayers(base, { enabled = true, seed = 1, insetScale = 0.5, minDepth = 1, maxDepth = 3, segments = 3,
  initialDiamondDualEnabled = true, triangulateEnabled = true, faceCenterDualEnabled = true, averageVerticesEnabled = true, insetEnabled = true, extrusionEnabled = true,
  subdivisionEnabled = true, subdivisionIterations = 1, diamondDualEnabled = true, excludeInitialBorderTriangles = true } = {}) {
  if (!enabled) return { mesh: base, faceIds: [], stages: [], depths: [] };
  if (!Number.isFinite(insetScale) || insetScale <= 0 || insetScale >= 1) throw new Error('Inset scale must be between 0 and 1.');
  if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth) || minDepth <= 0 || maxDepth < minDepth) throw new Error('Extrusion depths must be positive with minimum no greater than maximum.');
  const stages = [], record = (name, result) => {
    if (result.mesh.faces.length > 50000) throw new Error('The layered mesh exceeds the 50,000-face editing limit. Reduce grid subdivisions or subdivision passes.');
    stages.push({ name, vertices: result.mesh.vertices.length, faces: result.mesh.faces.length, selected: result.faceIds.length });
    return result;
  };
  const initial = initialDiamondDualEnabled ? record('Initial diamond dual · keep boundary', dualDiamond(base)).mesh : base;
  const borderTriangles = new Set(initialDiamondDualEnabled && excludeInitialBorderTriangles
    ? initial.faces.flatMap((face, id) => face.length === 3 ? [id] : []) : []);
  const triangles = triangulateEnabled ? record('Random triangulate', triangulateFaces(initial, undefined, { random: createSeededRandom(seed) })) : { mesh: initial };
  const triangleBorder = triangulateEnabled ? new Set(triangles.faceSources.flatMap((sources, id) => sources.some(source => borderTriangles.has(source)) ? [id] : [])) : borderTriangles;
  const dual = faceCenterDualEnabled ? record('Face-center dual', dualNSided(triangles.mesh)) : triangles;
  // A dual face mixes its incident source faces. Skip the whole cell if any
  // source belongs to an original border triangle, preserving a connected rim.
  const protectedFaces = faceCenterDualEnabled ? new Set(dual.faceSources.flatMap((sources, id) => sources.some(source => triangleBorder.has(source)) ? [id] : [])) : triangleBorder;
  const targets = dual.mesh.faces.flatMap((_, id) => protectedFaces.has(id) ? [] : [id]);
  const averaged = averageVerticesEnabled ? record('Average vertices · fixed boundary', averageVertices(dual.mesh, targets)) : { mesh: dual.mesh, faceIds: targets };
  const inset = insetEnabled ? record('Inset caps', insetFaces(averaged.mesh, averaged.faceIds, insetScale)) : averaged;
  // Separate streams keep depth sampling independent of triangulation's draws.
  const randomDepth = createSeededRandom((seed ^ 0x9e3779b9) >>> 0), samples = [];
  const raised = extrusionEnabled ? record('Random segmented extrusion', extrudeFaces(inset.mesh, inset.faceIds, (id) => {
    const depth = minDepth + (maxDepth - minDepth) * randomDepth();
    samples.push(depth);
    return extrusionTransform({ depth });
  }, { segments })) : inset;
  if (raised.mesh.faces.length > 50000) throw new Error('The layered mesh exceeds the 50,000-face editing limit. Reduce grid subdivisions.');
  const smoothed = subdivisionEnabled ? record('Subdivide & smooth · fixed boundary', subdivideSmooth(raised.mesh, raised.faceIds, { iterations: subdivisionIterations })) : raised;
  const final = diamondDualEnabled ? record('Diamond dual', dualDiamond(smoothed.mesh)) : smoothed;
  if (final.mesh.faces.length > 50000) throw new Error('The layered mesh exceeds the 50,000-face editing limit. Reduce grid subdivisions or subdivision passes.');
  const depths = new Map(extrusionEnabled ? raised.faceIds.map((faceId, index) => [faceId, samples[index]]) : []);
  return { mesh: final.mesh, faceIds: final.faceIds, stages,
    depths: final.faceIds.flatMap(faceId => {
      const source = final.sourceFaces?.[faceId] ?? faceId;
      return depths.has(source) ? [{ faceId, depth: depths.get(source) }] : [];
    }) };
}
