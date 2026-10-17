import { defaultMaterials, validateMaterials } from './setup.js';
import { defaultLighting, validateLighting } from './lighting-settings.js';
import { validateInfo } from './info-settings.js';
import { browserStorage, requestStaticSetup } from './static-setup.js';
import { DEFAULT_FOLLOW_SMOOTHING, MIN_CAMERA_DISTANCE } from './camera.js';
import { validateInstruments, mergeInstruments } from './instrument-settings.js';
import { referenceAudioSettings } from './reference-audio-settings.js';

export const meshFields = {
  mesh: [
    ['radius', 'Dodecahedron radius', 2, 0.5, 4, 0.05],
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
    ['maxChains', 'Maximum chains', 32, 1, 32, 1],
    ['excludeInitialBorderTriangles', 'Exclude initial border triangles from inset / extrusion', true],
    ['minDepth', 'Minimum extrusion amount', 1, 0.01, 10, 0.01],
    ['maxDepth', 'Maximum extrusion amount', 3, 0.01, 10, 0.01],
    ['segmentLength', 'Extrusion length per segment', 1, 0.01, 1, 0.01],
    ['subdivisionEnabled', '7 · Subdivide & smooth (fixed boundary)', true],
    ['subdivisionIterations', 'Subdivision passes', 1, 1, 3, 1],
    ['diamondDualEnabled', '8 · Diamond dual after smoothing', true],
    ['hexelateTriangulateEnabled', '9 · Triangulate before Hexelate', true],
    ['hexelateEnabled', '10 · Hexelate (face-center dual)', true],
    ['finalAverageVerticesEnabled', '11 · Average vertices after Hexelate (fixed boundary)', true],
  ],
  editing: [
    ['selectedOnly', 'Only selected faces', true],
  ],
  rig: [
    ['enabled', 'Bind mesh to extrusion bones', true],
    ['simulate', 'Simulate bone chains', true],
    ['gravity', 'Gravity', 9.8, 0, 100, 0.1],
    ['coneAngle', 'Joint cone angle °', 60, 1, 120, 1],
    ['twistAngle', 'Joint twist limit °', 90, 0, 180, 1],
    ['jointOverlap', 'Joint overlap (× radius)', 1, 0, 1, 0.01],
    ['linearDamping', 'Linear damping', 1, 0, 20, 0.01],
    ['angularDamping', 'Angular damping', 1, 0, 20, 0.01],
    ['grabStiffness', 'Grab stiffness (Hz)', 30, 1, 60, 1],
    ['grabDamping', 'Grab damping', 0.75, 0, 2, 0.01],
    ['hoverEnabled', 'Repel colliders on hover', true],
    ['hoverAcceleration', 'Hover acceleration', 14, 0, 100, 0.1],
    ['density', 'Collider density', 1, 0.1, 10, 0.1],
    ['showBones', 'Show bones', true],
    ['showJoints', 'Show joints', false],
    ['showColliders', 'Show colliders', false],
    ['noteScaleEnabled', 'Scale chains with notes', true],
    ['noteScaleMin', 'Minimum bone scale', 0, 0, 2, 0.01],
    ['noteScaleMax', 'Maximum bone scale', 1.2, 0, 2, 0.01],
    ['noteScaleAmount', 'Note weight influence', 0.2, 0, 1, 0.01],
    ['noteWeightMin', 'Highest note weight', 0.1, 0.1, 1, 0.01],
    ['noteWeightMax', 'Lowest note weight', 1, 0.1, 1, 0.01],
    ['noteAttack', 'Note attack (seconds)', 0.035, 0.005, 0.5, 0.005],
    ['noteRelease', 'Note release (seconds)', 0.4, 0.05, 2, 0.01],
    ['notePushEnabled', 'Push chains on notes', true],
    ['notePushStrength', 'Note push strength', 4, 0, 20, 0.1],
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
    ['bpm', 'Tempo (BPM)', 82, 40, 200, 0.1],
    ['volume', 'Master volume', 0.55, 0, 1, 0.01],
    ['drums', 'Drums', 0.8, 0, 1, 0.01],
    ['bass', 'Bass', 0.6, 0, 1, 0.01],
    ['keys', 'Guitar / high instruments', 0.7, 0, 1, 0.01],
    ['melody', 'Voice / lead', 0.65, 0, 1, 0.01],
    ['dragChaosEnabled', 'Chaotic notes while dragging', true],
    ['dragChaosRate', 'Drag notes per second', 32, 8, 64, 1],
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
    ['elevation', 'Elevation °', 20, -89.9, 89.9, 0.01],
    ['distance', 'Distance', 18, MIN_CAMERA_DISTANCE, 400, 0.01],
    // Keep the expanded bounds compatible with earlier world-space saves.
    ['offsetX', 'Offset X', 0, -1000000, 1000000, 0.01],
    ['offsetY', 'Offset Y', 0, -1000000, 1000000, 0.01],
    ['offsetZ', 'Offset Z', 0, -1000000, 1000000, 0.01],
    ['fov', 'Field of view °', 42, 20, 80, 0.1],
  ],
  visibility: [
    ['surface', 'Mesh surface', true],
    ['wireframe', 'Mesh wireframe', false],
    ['ground', 'Ground plane', true],
    ['fps', 'Show frame-rate meter', false],
    ['text', 'Text prop', false],
  ],
};

export function defaultMeshSetup() {
  const lighting = defaultLighting();
  lighting.environment.backgroundColor = '#000000';
  Object.assign(lighting.directional, { enabled: false, color: '#ffd5bc', intensity: 2.6, height: 7, offsetZ: 4, softness: 3, shadowBias: -0.0003 });
  lighting.spotlight.color = '#ffd5bc';
  Object.assign(lighting.hemisphere, { skyColor: '#8bc7ff', groundColor: '#51303b', intensity: 0.7 });
  // Keep occlusion optional; surface lighting and studio reflections are active.
  lighting.occlusion.enabled = false;
  const text = (content, align = 'left', heading = false) => ({ type: 'doc', content: [{ type: heading ? 'heading' : 'paragraph', attrs: { textAlign: align, ...(heading ? { level: 1 } : {}) }, content: [{ type: 'text', text: content }] }] });
  const result = { version: 1, sketch: '2026-10-16', materials: defaultMaterials(), lighting,
    info: { upperLeft: text('2026-10-16', 'left', true), upperRight: text('Mesh generation / n-sided faces.', 'right'),
      lowerLeft: text('Dodecahedron / articulated mesh.'), lowerRight: text('Lars Berg / 2026-10-16', 'right') },
    ...Object.fromEntries(Object.entries(meshFields).map(([group, fields]) => [group, Object.fromEntries(fields.map(([key, , value]) => [key, value]))])) };
  Object.assign(result.audio, referenceAudioSettings());
  return result;
}

export function validateMeshSetup(value) {
  if (value?.version !== 1 || value?.sketch !== '2026-10-16') throw new Error('Expected a 2026-10-16 setup (version 1).');
  const result = defaultMeshSetup();
  // Migrate the previous viewport-grid setup to the closed, free-moving body.
  if (value.mesh?.radius === undefined) value = { ...value, mesh: { radius: result.mesh.radius },
    visibility: { ...value.visibility, ground: true },
    camera: { ...value.camera, elevation: 20, distance: 18, offsetX: 0, offsetY: 0, offsetZ: 0 },
    rig: { ...value.rig, gravity: value.rig?.gravity || 9.8 } };
  // Existing version-1 saves acquire only the new operation-control defaults.
  value = { ...value, rig: value.rig === undefined ? result.rig : value.rig, pipeline: value.pipeline === undefined ? result.pipeline : value.pipeline, editing: value.editing === undefined ? result.editing : value.editing, extrusion: value.extrusion === undefined ? result.extrusion : value.extrusion };
  if (value.rig && typeof value.rig === 'object') value.rig = { ...value.rig,
    grabStiffness: value.rig.grabStiffness === undefined ? result.rig.grabStiffness : value.rig.grabStiffness,
    grabDamping: value.rig.grabDamping === undefined ? result.rig.grabDamping : value.rig.grabDamping,
    noteScaleMax: value.rig.noteScaleMax === undefined
      ? 1 + (value.rig.noteScaleAmount ?? result.rig.noteScaleAmount) * (value.rig.noteWeightMax ?? result.rig.noteWeightMax)
      : value.rig.noteScaleMax,
    jointOverlap: value.rig.jointOverlap === undefined ? result.rig.jointOverlap : value.rig.jointOverlap,
    linearDamping: value.rig.linearDamping === undefined ? value.rig.damping ?? result.rig.linearDamping : value.rig.linearDamping,
    angularDamping: value.rig.angularDamping === undefined ? value.rig.damping ?? result.rig.angularDamping : value.rig.angularDamping,
    hoverEnabled: value.rig.hoverEnabled === undefined ? result.rig.hoverEnabled : value.rig.hoverEnabled,
    hoverAcceleration: value.rig.hoverAcceleration === undefined ? result.rig.hoverAcceleration : value.rig.hoverAcceleration };
  if (value.rig && typeof value.rig === 'object') for (const [key] of meshFields.rig.filter(([key]) => key.startsWith('note'))) {
    if (value.rig[key] === undefined) value.rig[key] = result.rig[key];
  }
  if (value.visibility && value.visibility.surface === undefined) value.visibility = { ...value.visibility, surface: result.visibility.surface };
  if (value.audio && typeof value.audio === 'object') value.audio = { ...value.audio,
    dragChaosEnabled: value.audio.dragChaosEnabled ?? result.audio.dragChaosEnabled,
    dragChaosRate: value.audio.dragChaosRate ?? result.audio.dragChaosRate };
  if (value.pipeline && typeof value.pipeline === 'object') value.pipeline = {
    ...value.pipeline,
    maxChains: value.pipeline.maxChains ?? result.pipeline.maxChains,
    subdivisionEnabled: value.pipeline.subdivisionEnabled === undefined ? result.pipeline.subdivisionEnabled : value.pipeline.subdivisionEnabled,
    subdivisionIterations: value.pipeline.subdivisionIterations === undefined ? result.pipeline.subdivisionIterations : value.pipeline.subdivisionIterations,
    diamondDualEnabled: value.pipeline.diamondDualEnabled === undefined ? result.pipeline.diamondDualEnabled : value.pipeline.diamondDualEnabled,
    hexelateEnabled: value.pipeline.hexelateEnabled === undefined ? result.pipeline.hexelateEnabled : value.pipeline.hexelateEnabled,
    hexelateTriangulateEnabled: value.pipeline.hexelateTriangulateEnabled === undefined ? result.pipeline.hexelateTriangulateEnabled : value.pipeline.hexelateTriangulateEnabled,
    finalAverageVerticesEnabled: value.pipeline.finalAverageVerticesEnabled === undefined ? result.pipeline.finalAverageVerticesEnabled : value.pipeline.finalAverageVerticesEnabled,
    segmentLength: value.pipeline.segmentLength === undefined ? result.pipeline.segmentLength : value.pipeline.segmentLength,
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
  if (result.rig.noteWeightMax < result.rig.noteWeightMin) throw new Error('Lowest note weight must be at least the highest note weight.');
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
