import { Vector3 } from 'three';

// A one-unit capsule (radius .25, shaft .5) is scaled to the extrusion's
// original face bounds and segment length. Rounded ends scale with the shaft,
// preserving the face footprint even on short segments.
export function fitColliders(binding, { jointOverlap = 1 } = {}) {
  return binding.chains.map(chain => {
    const segments = chain.lengths.map((length, segment) => {
    const a = chain.crossSections[segment], b = chain.crossSections[segment + 1];
    const minX = Math.min(a.minX, b.minX), maxX = Math.max(a.maxX, b.maxX);
    const minZ = Math.min(a.minZ, b.minZ), maxZ = Math.max(a.maxZ, b.maxZ);
    return {
      halfExtents: { x: (maxX - minX) / 2, y: length / 2, z: (maxZ - minZ) / 2 },
      capsuleScale: new Vector3((maxX - minX) * 2, length, (maxZ - minZ) * 2),
      offset: new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
      radius: Math.min((maxX - minX) / 2, (maxZ - minZ) / 2),
    };
    });
    // A shared joint sits half a radius inside each end, giving one radius
    // of overlap. The fixed base, tip and bone rest positions stay in place.
    const overlaps = segments.slice(1).map((next, i) => Math.min(segments[i].radius, next.radius) * jointOverlap);
    return segments.map((segment, i) => {
      const lowerInset = (overlaps[i - 1] ?? 0) / 2, upperInset = (overlaps[i] ?? 0) / 2;
      segment.capsuleScale.y += lowerInset + upperInset;
      segment.halfExtents.y = segment.capsuleScale.y / 2;
      segment.offset.y = (upperInset - lowerInset) / 2;
      return { ...segment, lowerInset, upperInset };
    });
  });
}
