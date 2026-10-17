// Twelve outward-facing pentagons, twenty shared vertices, no internal diagonals.
export function createDodecahedronMesh(radius = 2) {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('Dodecahedron radius must be positive.');
  const t = (1 + Math.sqrt(5)) / 2, r = 1 / t, scale = radius / Math.sqrt(3);
  const vertices = [
    [-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1],
    [0,-r,-t],[0,-r,t],[0,r,-t],[0,r,t],[-r,-t,0],[-r,t,0],[r,-t,0],[r,t,0],
    [-t,0,-r],[t,0,-r],[-t,0,r],[t,0,r],
  ].map(point => point.map(value => value * scale));
  const faces = [[3,11,7,15,13],[7,19,17,6,15],[17,4,8,10,6],[8,0,16,2,10],
    [0,12,1,18,16],[6,10,2,13,15],[2,16,18,3,13],[18,1,9,11,3],[4,14,12,0,8],
    [11,9,5,19,7],[19,5,14,4,17],[1,12,14,5,9]];
  return { vertices, faces, kind: 'dodecahedron', radius };
}

// Editable topology: shared positions and ordered vertex loops of any length.
// Faces remain polygons; drawing their boundaries never introduces diagonals.
export function createViewportMesh(width, height, shortSideSubdivisions = 4) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0))
    throw new Error('Mesh dimensions must be positive finite numbers.');
  if (!Number.isInteger(shortSideSubdivisions) || shortSideSubdivisions < 1 || shortSideSubdivisions > 64)
    throw new Error('Short side subdivisions must be an integer from 1 to 64.');
  const shortSide = Math.min(width, height);
  const columns = Math.max(1, Math.round(width / shortSide * shortSideSubdivisions));
  const rows = Math.max(1, Math.round(height / shortSide * shortSideSubdivisions));
  const vertices = [], faces = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++)
    vertices.push([-width / 2 + width * column / columns, -height / 2 + height * row / rows, 0]);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column;
    faces.push([a, a + 1, a + columns + 2, a + columns + 1]);
  }
  return { vertices, faces, columns, rows, width, height };
}

export function polygonEdges(faces) {
  const edges = new Map();
  for (const face of faces) {
    if (face.length < 3) throw new Error('A face needs at least three vertices.');
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edges.has(key)) edges.set(key, [a, b]);
    }
  }
  return [...edges.values()];
}

export function viewportDimensions(camera, distance) {
  const height = 2 * distance * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
  return { width: height * camera.aspect, height };
}
