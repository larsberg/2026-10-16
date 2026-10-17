import { defaultMaterials, validateMaterials } from './setup.js';
import { defaultLighting, validateLighting } from './lighting-settings.js';
import { validateInfo } from './info-settings.js';
import { browserStorage, requestStaticSetup } from './static-setup.js';
import { DEFAULT_FOLLOW_SMOOTHING, MIN_CAMERA_DISTANCE } from './camera.js';
import { defaultInstruments, validateInstruments, mergeInstruments } from './instrument-settings.js';

export const meshFields = {
  mesh: [
    ['shortSideSubdivisions', 'Short side subdivisions', 4, 1, 64, 1],
  ],
  pipeline: [
    ['enabled', 'Apply operation layers', true],
    ['initialDiamondDualEnabled', '1 · Initial diamond dual (keep boundary)', true],
    ['seed', 'Random seed', 1, 0, 1000000, 1],
    ['triangulateEnabled', '2 · Random triangulate', true],
    ['faceCenterDualEnabled', '3 · Face-center dual', true],
    ['averageVerticesEnabled', '4 · Average vertices (fixed boundary)', true],
    ['insetEnabled', '5 · Inset faces', true],
    ['insetScale', 'Inset scale', 0.5, 0.01, 0.99, 0.01],
    ['extrusionEnabled', '6 · Random extrusion', true],
    ['excludeInitialBorderTriangles', 'Exclude initial border triangles from inset / extrusion', true],
    ['minDepth', 'Minimum depth', 1, 0.01, 10, 0.01],
    ['maxDepth', 'Maximum depth', 3, 0.01, 10, 0.01],
    ['segments', 'Extrusion segments', 3, 1, 10, 1],
    ['subdivisionEnabled', '7 · Subdivide & smooth (fixed boundary)', true],
    ['subdivisionIterations', 'Subdivision passes', 1, 1, 3, 1],
    ['diamondDualEnabled', '8 · Diamond dual after smoothing', true],
  ],
  editing: [
    ['selectedOnly', 'Only selected faces', true],
  ],
  extrusion: [
    ['offsetX', 'Move X', 0, -10, 10, 0.01],
    ['offsetY', 'Move Y', 0, -10, 10, 0.01],
    ['depth', 'Move Z / depth', 0.5, -10, 10, 0.01],
    ['rotateX', 'Rotate X °', 0, -180, 180, 1],
    ['rotateY', 'Rotate Y °', 0, -180, 180, 1],
    ['rotateZ', 'Rotate Z °', 0, -180, 180, 1],
    ['scaleX', 'Scale X', 1, 0.01, 4, 0.01],
    ['scaleY', 'Scale Y', 1, 0.01, 4, 0.01],
  ],
  audio: [
    ['enabled', 'Enable audio', false],
    ['bpm', 'Tempo (BPM)', 100, 40, 200, 1],
    ['volume', 'Master volume', 0.55, 0, 1, 0.01],
    ['drums', 'Drums', 0.8, 0, 1, 0.01],
    ['bass', 'Bass', 0.6, 0, 1, 0.01],
    ['keys', 'Chords', 0.7, 0, 1, 0.01],
    ['melody', 'Melody', 0.65, 0, 1, 0.01],
  ],
  appearance: [
    ['wireframeColor', 'Wireframe color', '#ffffff'],
  ],
  floor: [
    ['roughness', 'Tile roughness', 0.52, 0.02, 1, 0.01],
    ['depth', 'Tile depth', 0, 0, 0.12, 0.001],
    ['tileSize', 'Tile size', 2, 0.5, 5, 0.1],
    ['color', 'Tile color', '#3c6c85'],
  ],
  fog: [
    ['enabled', 'Enable fog', true],
    ['color', 'Background / fog', '#000000'],
    ['near', 'Start distance', 10, 0, 399.9, 0.1],
    ['far', 'End distance', 30, 0.1, 400, 0.1],
  ],
  infoLayout: [
    ['size', 'Size (tiles)', 3, 1, 40, 1],
    ['column', 'Tile column (X)', -1, -1000, 1000, 1],
    ['row', 'Tile row (Z)', -1, -1000, 1000, 1],
  ],
  camera: [
    ['follow', 'Follow the mesh', true],
    ['optimizedTextures', 'Use smaller textures', false],
    ['followSmoothing', 'Follow smoothing (s)', DEFAULT_FOLLOW_SMOOTHING, 0, 2, 0.05],
    ['yaw', 'Yaw °', 0, -180, 180, 0.01],
    ['elevation', 'Elevation °', 0, -89.9, 89.9, 0.01],
    ['distance', 'Distance', 7, MIN_CAMERA_DISTANCE, 400, 0.01],
    // Keep the expanded bounds compatible with earlier world-space saves.
    ['offsetX', 'Offset X', 0, -1000000, 1000000, 0.01],
    ['offsetY', 'Offset Y', 0, -1000000, 1000000, 0.01],
    ['offsetZ', 'Offset Z', 0, -1000000, 1000000, 0.01],
    ['fov', 'Field of view °', 42, 20, 80, 0.1],
  ],
  visibility: [
    ['wireframe', 'Mesh wireframe', true],
    ['ground', 'Ground plane', false],
    ['fps', 'Show frame-rate meter', false],
    ['text', 'Text prop', false],
  ],
};

export function defaultMeshSetup() {
  const lighting = defaultLighting();
  lighting.environment.backgroundColor = '#000000';
  Object.assign(lighting.directional, { enabled: true, color: '#ffd5bc', intensity: 2.6, height: 7, offsetZ: 4, softness: 3, shadowBias: -0.0003 });
  Object.assign(lighting.hemisphere, { skyColor: '#8bc7ff', groundColor: '#51303b', intensity: 0.7 });
  // Wireframe has no opaque surface to shade. Keep the shared studio controls available.
  lighting.occlusion.enabled = false;
  const text = (content, align = 'left', heading = false) => ({ type: 'doc', content: [{ type: heading ? 'heading' : 'paragraph', attrs: { textAlign: align, ...(heading ? { level: 1 } : {}) }, content: [{ type: 'text', text: content }] }] });
  const result = { version: 1, sketch: '2026-10-16', materials: defaultMaterials(), lighting,
    info: { upperLeft: text('2026-10-16', 'left', true), upperRight: text('Mesh generation / n-sided faces.', 'right'),
      lowerLeft: text('Viewport grid / wireframe.'), lowerRight: text('Lars Berg / 2026-10-16', 'right') },
    ...Object.fromEntries(Object.entries(meshFields).map(([group, fields]) => [group, Object.fromEntries(fields.map(([key, , value]) => [key, value]))])) };
  result.audio.instruments = defaultInstruments();
  return result;
}

export function validateMeshSetup(value) {
  if (value?.version !== 1 || value?.sketch !== '2026-10-16') throw new Error('Expected a 2026-10-16 setup (version 1).');
  const result = defaultMeshSetup();
  // Existing version-1 saves acquire only the new operation-control defaults.
  value = { ...value, pipeline: value.pipeline === undefined ? result.pipeline : value.pipeline, editing: value.editing === undefined ? result.editing : value.editing, extrusion: value.extrusion === undefined ? result.extrusion : value.extrusion };
  if (value.pipeline && typeof value.pipeline === 'object') value.pipeline = {
    ...value.pipeline,
    subdivisionEnabled: value.pipeline.subdivisionEnabled === undefined ? result.pipeline.subdivisionEnabled : value.pipeline.subdivisionEnabled,
    subdivisionIterations: value.pipeline.subdivisionIterations === undefined ? result.pipeline.subdivisionIterations : value.pipeline.subdivisionIterations,
    diamondDualEnabled: value.pipeline.diamondDualEnabled === undefined ? result.pipeline.diamondDualEnabled : value.pipeline.diamondDualEnabled,
    initialDiamondDualEnabled: value.pipeline.initialDiamondDualEnabled === undefined ? result.pipeline.initialDiamondDualEnabled : value.pipeline.initialDiamondDualEnabled,
    triangulateEnabled: value.pipeline.triangulateEnabled === undefined ? result.pipeline.triangulateEnabled : value.pipeline.triangulateEnabled,
    faceCenterDualEnabled: value.pipeline.faceCenterDualEnabled === undefined ? result.pipeline.faceCenterDualEnabled : value.pipeline.faceCenterDualEnabled,
    averageVerticesEnabled: value.pipeline.averageVerticesEnabled === undefined ? result.pipeline.averageVerticesEnabled : value.pipeline.averageVerticesEnabled,
    insetEnabled: value.pipeline.insetEnabled === undefined ? result.pipeline.insetEnabled : value.pipeline.insetEnabled,
    extrusionEnabled: value.pipeline.extrusionEnabled === undefined ? result.pipeline.extrusionEnabled : value.pipeline.extrusionEnabled,
    excludeInitialBorderTriangles: value.pipeline.excludeInitialBorderTriangles === undefined ? result.pipeline.excludeInitialBorderTriangles : value.pipeline.excludeInitialBorderTriangles,
  };
  for (const [group, fields] of Object.entries(meshFields)) for (const [key, label, initial, min, max, step] of fields) {
    const field = value[group]?.[key];
    const valid = typeof initial === 'boolean' ? typeof field === 'boolean'
      : typeof initial === 'string' ? typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field)
      : Number.isFinite(field) && field >= min && field <= max && (step !== 1 || Number.isInteger(field));
    if (!valid) throw new Error(`Invalid ${label}.`);
    result[group][key] = typeof field === 'string' ? field.toLowerCase() : field;
  }
  if (result.pipeline.maxDepth < result.pipeline.minDepth) throw new Error('Maximum depth must be at least the minimum depth.');
  if (result.fog.far <= result.fog.near) throw new Error('Fog end distance must be greater than its start distance.');
  result.materials = validateMaterials(value.materials);
  result.lighting = validateLighting(value.lighting);
  result.info = validateInfo(value.info);
  result.audio.instruments = validateInstruments(value.audio?.instruments);
  return result;
}

export function mergeMeshSetup(current, patch) {
  if (patch?.version !== undefined || patch?.sketch !== undefined) return validateMeshSetup(patch);
  const next = structuredClone(current);
  for (const group of [...Object.keys(meshFields), 'info']) Object.assign(next[group], patch?.[group]);
  if (patch?.audio?.instruments !== undefined) next.audio.instruments = mergeInstruments(current.audio.instruments, patch.audio.instruments);
  for (const group of ['materials', 'lighting']) for (const [key, value] of Object.entries(patch?.[group] ?? {})) Object.assign(next[group][key], value);
  return validateMeshSetup(next);
}

export async function requestMeshSetup(method = 'GET', value, signal) {
  if (import.meta.env.PROD) return requestStaticSetup({ method, value, signal,
    validate: validateMeshSetup, storage: browserStorage(),
    url: new URL(`${import.meta.env.BASE_URL}setup.json`, location.href).href });
  const response = await fetch(`${import.meta.env.BASE_URL}api/setup`, {
    method, signal, cache: 'no-store', ...(method === 'PUT' ? {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validateMeshSetup(value)),
    } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Settings request failed (${response.status}).`);
  }
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('Settings API unavailable. Restart the local dev server.');
  return validateMeshSetup(await response.json());
}
