import { averageVertices, dualDiamond, dualNSided, extrudeFaces, extrusionTransform, insetFaces, subdivideSmooth, triangulateFace, triangulateFaces, validatePolygonMesh } from './mesh-operations.js';
import { createExtrusionBinding, refineBinding } from './mesh-binding.js';

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

export function createMeshLayers(base, { enabled = true, seed = 1, insetScale = 0.5, minDepth = 1, maxDepth = 3, segmentLength = 1, maxChains = 32,
  initialDiamondDualEnabled = true, triangulateEnabled = true, faceCenterDualEnabled = true, averageVerticesEnabled = true, insetEnabled = true, extrusionEnabled = true,
  subdivisionEnabled = true, subdivisionIterations = 1, diamondDualEnabled = true, hexelateTriangulateEnabled = true, hexelateEnabled = true, finalAverageVerticesEnabled = true, excludeInitialBorderTriangles = true } = {}) {
  function bindCore(binding, coreMesh, finalMesh) {
    if (base.kind === 'dodecahedron') {
      // The inset surface encloses the central hull; roots stay fixed to it.
      binding.core = { points: coreMesh.vertices.map(point => point.map(value => value * .9)),
        groundLevel: Math.min(...finalMesh.vertices.map(point => point[1])) - 1.25 };
    }
    return binding;
  }
  if (!enabled) return { mesh: base, faceIds: [], stages: [], depths: [], binding: bindCore(createExtrusionBinding(base), base, base) };
  if (!Number.isFinite(insetScale) || insetScale <= 0 || insetScale >= 1) throw new Error('Inset scale must be between 0 and 1.');
  if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth) || minDepth <= 0 || maxDepth < minDepth) throw new Error('Extrusion depths must be positive with minimum no greater than maximum.');
  if (!Number.isFinite(segmentLength) || segmentLength < 0.01 || segmentLength > 1) throw new Error('Extrusion length per segment must be between 0.01 and 1.');
  if (!Number.isInteger(maxChains) || maxChains < 1 || maxChains > 32) throw new Error('Maximum chains must be an integer from 1 to 32.');
  const stages = [], record = (name, result) => {
    if (result.mesh.faces.length > 50000) throw new Error('The layered mesh exceeds the 50,000-face editing limit. Reduce grid subdivisions or subdivision passes.');
    if (name === 'Diamond dual' || name === 'Hexelate · face-center dual') {
      try { validatePolygonMesh(result.mesh); for (const face of result.mesh.faces) triangulateFace(result.mesh, face); }
      catch { throw new Error(`${name === 'Diamond dual' ? name : 'Hexelate'} produced a folded polygon. Enable Inset faces or Subdivide & smooth.`); }
    }
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
  let targets = dual.mesh.faces.flatMap((_, id) => protectedFaces.has(id) ? [] : [id]);
  if (extrusionEnabled && targets.length > maxChains) {
    // Farthest-point selection spreads the limited pieces across the view.
    // Unchosen faces remain part of the connected, unextruded base mesh.
    const candidates = targets.map(id => ({ id, center: dual.mesh.faces[id].reduce((sum, vertex) => sum.map((v, axis) => v + dual.mesh.vertices[vertex][axis] / dual.mesh.faces[id].length), [0, 0, 0]), distance: Infinity }));
    const chosen = [], random = createSeededRandom((seed ^ 0x739a21) >>> 0);
    let next = candidates[Math.floor(random() * candidates.length)];
    while (chosen.length < maxChains) {
      chosen.push(next.id); next.distance = -1;
      for (const candidate of candidates) if (candidate.distance >= 0) candidate.distance = Math.min(candidate.distance, candidate.center.reduce((sum, v, axis) => sum + (v - next.center[axis]) ** 2, 0));
      next = candidates.reduce((a, b) => a.distance > b.distance ? a : b);
    }
    targets = chosen.sort((a, b) => a - b);
  }
  const averaged = averageVerticesEnabled ? record('Average vertices · fixed boundary', averageVertices(dual.mesh, targets)) : { mesh: dual.mesh, faceIds: targets };
  const inset = insetEnabled ? record('Inset caps', insetFaces(averaged.mesh, averaged.faceIds, insetScale)) : averaged;
  // Separate streams keep depth sampling independent of triangulation's draws.
  const randomDepth = createSeededRandom((seed ^ 0x9e3779b9) >>> 0), samples = [], sampledSegments = new Map();
  const raised = extrusionEnabled ? record('Random segmented extrusion', extrudeFaces(inset.mesh, inset.faceIds, (id) => {
    const amount = minDepth + (maxDepth - minDepth) * randomDepth(), segments = Math.max(1, Math.floor(amount));
    const depth = segments * segmentLength;
    samples.push(depth); sampledSegments.set(id, segments);
    return extrusionTransform({ depth });
  }, { segments: id => sampledSegments.get(id) })) : inset;
  if (raised.mesh.faces.length > 50000) throw new Error('The layered mesh exceeds the 50,000-face editing limit. Reduce grid subdivisions.');
  const smoothed = subdivisionEnabled ? record('Subdivide & smooth · fixed boundary', subdivideSmooth(raised.mesh, raised.faceIds, { iterations: subdivisionIterations })) : raised;
  const diamond = diamondDualEnabled ? record('Diamond dual', dualDiamond(smoothed.mesh)) : smoothed;
  const prepared = hexelateTriangulateEnabled ? record('Triangulate before Hexelate', triangulateFaces(diamond.mesh, undefined,
    { random: createSeededRandom((seed ^ 0xa511e9b3) >>> 0) })) : diamond;
  const hexelated = hexelateEnabled ? record('Hexelate · face-center dual', dualNSided(prepared.mesh)) : prepared;
  const final = finalAverageVerticesEnabled ? record('Final average vertices · fixed boundary',
    { ...hexelated, ...averageVertices(hexelated.mesh, hexelated.faceIds) }) : hexelated;
  if (hexelateTriangulateEnabled && hexelateEnabled) {
    try { validatePolygonMesh(final.mesh); for (const face of final.mesh.faces) triangulateFace(final.mesh, face); }
    catch { throw new Error('Hexelate produced a folded polygon. Enable Inset faces or Subdivide & smooth, or disable Triangulate before Hexelate.'); }
  }
  let binding = createExtrusionBinding(raised.mesh, extrusionEnabled ? raised.extrusions : []);
  if (subdivisionEnabled) binding = refineBinding(binding, smoothed.vertexStages);
  if (diamondDualEnabled) binding = refineBinding(binding, [diamond.vertexSources]);
  if (hexelateEnabled) binding = refineBinding(binding, [final.vertexSources]);
  if (final.mesh.faces.length > 50000) throw new Error('The layered mesh exceeds the 50,000-face editing limit. Reduce grid subdivisions or subdivision passes.');
  const depths = new Map(extrusionEnabled ? raised.faceIds.map((faceId, index) => [faceId, samples[index]]) : []);
  return { mesh: final.mesh, faceIds: final.faceIds, stages, binding: bindCore(binding, averaged.mesh, final.mesh),
    depths: final.faceIds.flatMap(faceId => {
      const source = final.sourceFaces?.[faceId] ?? faceId;
      return depths.has(source) ? [{ faceId, depth: depths.get(source) }] : [];
    }) };
}
