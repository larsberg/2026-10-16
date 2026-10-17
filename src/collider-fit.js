import { Vector3 } from 'three';

// A one-unit capsule (radius .25, shaft .5) is scaled to the extrusion's
// original face bounds and segment length. Rounded ends scale with the shaft,
// preserving the face footprint even on short segments.
export function fitColliders(binding) {
  return binding.chains.map(chain => chain.lengths.map((length, segment) => {
    const a = chain.crossSections[segment], b = chain.crossSections[segment + 1];
    const minX = Math.min(a.minX, b.minX), maxX = Math.max(a.maxX, b.maxX);
    const minZ = Math.min(a.minZ, b.minZ), maxZ = Math.max(a.maxZ, b.maxZ);
    return {
      halfExtents: { x: (maxX - minX) / 2, y: length / 2, z: (maxZ - minZ) / 2 },
      capsuleScale: new Vector3((maxX - minX) * 2, length, (maxZ - minZ) * 2),
      offset: new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
    };
  }));
}
