# 2026-10-16

A viewport-sized polygon mesh, drawn as a wireframe. This starts the mesh generation and n-sided face editing sketch.

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:1234/`. `npm run check` runs silent Node tests and a production build.

The drawer, tabs, fields, Save/Reload API, studio settings, info editor, player bridge, and Three.js perspective camera with OrbitControls come from `2026-10-13`. The starting camera faces the grid. Ground and info remain available, initially hidden. There is no soft-body simulation or Box3D dependency.

**Mesh → Short side subdivisions** defaults to **4**, persisted as `mesh.shortSideSubdivisions` in the same CMS/settings system (`public/setup.json`). The shorter view dimension has exactly this many cells; the longer dimension rounds to the nearest whole number of cells so they are close to square. Shared vertices and ordered polygon face loops preserve n-sided topology. The base faces are quads. Each unique polygon boundary is drawn once.

The base grid passes through these **Operation layers**, in order:

1. Apply an **initial Diamond dual** to the viewport grid. Keep the border triangles and original corners so the complete rectangular outline remains intact.
2. Triangulate every quad, choosing its diagonal independently at random. Existing border triangles stay triangles.
3. Apply the **face-center dual**: connect neighboring face centers around each original vertex.
4. **Average vertices** once: replace each interior vertex with the arithmetic mean of its unique edge-connected neighbors. All averages use the original positions simultaneously. Boundary vertices retain their exact XYZ positions; topology and face eligibility stay unchanged. This pass is enabled by default and runs before inset.
5. Select eligible faces and extrude with zero depth and a **0.5** scale about each face's center, forming an inset cap and surrounding faces. **Exclude initial border triangles from inset / extrusion** starts enabled: original border triangles remain in the mesh, and their descendants are skipped. A face-center dual cell is skipped if any incident source face came from an original border triangle. Triangles created from interior quads remain eligible. Concave cells use a center inside their visibility kernel so their insets stay inside the face.
6. Extrude those caps independently along their normals by a random **1–3 scene units**, with **3 equal segments**.
7. **Subdivide & smooth** the entire surface with one [Catmull–Clark](https://opensubdiv.org/docs/subdivision_surfaces.html) pass by default. Each n-sided face becomes n quads. Interior vertices and edges smooth; existing boundary vertices stay fixed and boundary edges split at their exact midpoints. Concave faces use an interior subdivision center; a smooth update that would fold a quad is reduced toward linear subdivision. The refined descendants of the caps remain selected.
8. Apply the **Diamond dual** to the smoothed surface: one diamond quad across every shared edge, with triangles along the open boundary to retain the outline. This replaces all faces and clears the previous cap selection.

The existing drawer/settings system stores these controls in `pipeline`. All eight passes have independent, numbered on/off toggles, enabled by default. Enabled passes run in their original order; disabled passes pass the current mesh through. **Average vertices (fixed boundary)** persists as `pipeline.averageVerticesEnabled`. Turning off Inset lets extrusion target the current faces directly. Turning off Extrusion leaves a flat mesh. Every combination retains the original boundary; averaging and smoothing keep boundary vertices fixed. Toggles persist through Save/Reload and are reapplied on resize. The random seed reproduces the diagonal choices and face depths; **New variation** changes it. **Subdivision passes** controls smoothing iterations (1–3, within the existing 50,000-face limit). Disable **Apply operation layers** to inspect the base grid. `mesh.layers` exposes enabled stage counts and, when extrusion is enabled and the final diamond dual is disabled, original extrusion depths inherited by each selected cap descendant.

The border-exclusion setting follows face ancestry through triangulation and the face-center dual, rather than excluding every triangle by its side count. It applies to both inset and depth extrusion, including when either pass is disabled. It has no effect when the initial diamond pass is disabled. Subsequent subdivision/smoothing and the final diamond dual still operate on the whole mesh; the outer boundary remains fixed, while the interior rim may blend toward neighboring raised faces during smoothing. Disable the exclusion to restore extrusion of every face.

The grid spans the perspective view at the mesh origin, accounting for aspect ratio, field of view, camera distance, and portrait zoom. Container resizing regenerates the base grid and all operation layers, disposing the previous buffers. The regenerated base plane faces the camera; orbit/zoom leaves it in place until the next regeneration. Subdivision, field-of-view, and layer edits, Reload, and Restart also regenerate it. Manual mesh edits reset. Selection follows the final layer: empty after the diamond dual, or cap descendants when it is disabled.

Strudel and the existing audio/instrument controls remain installed for later. There is no composition, and no audio context is created for the empty score, even if Enable audio is checked. `window.__meshSketch.setComposition(pattern)` is available when a score is ready.

`window.__meshSketch.mesh.topology` exposes `{ vertices, faces, columns, rows, width, height }` for subsequent editing. Vertices are local XYZ arrays; faces are ordered vertex indices of any length. Call `mesh.refresh()` after changing topology to redraw boundaries. The API also exposes camera, controls, renderer, playback, and settings.

Save/Reload writes `public/setup.json` in development and URL-scoped device storage in production. Only test rendering in a visible, user-controlled, muted browser. Never start background or headless audio playback.

The **Mesh** tab now includes four editing operations:

- **Triangulate faces** splits each target polygon into triangles, including concave n-gons, preserving its winding and existing vertices. The face is projected into its local plane and triangulated with [Three.js ShapeUtils](https://threejs.org/docs/pages/ShapeUtils.html).
- **Dual mesh → Diamond** places a quad across each shared edge, joining its endpoints and the centers of the two neighboring faces. Open boundary edges produce triangles so the original outline remains intact. This is the edge-based [join construction](https://www.georgehart.com/virtual-polyhedra/conway_notation.html).
- **Dual mesh → Face-center dual** joins face centers in connectivity order around every original vertex. On an open mesh, shared boundary-edge midpoints and original corners close the boundary cells without shrinking the outline. Duals act on the whole mesh and require consistent face winding and manifold vertex fans.
- **Extrude faces** replaces each target face with its transformed n-sided cap and one side quad per edge. Faces extrude independently, including adjacent selected faces. They can therefore have coincident side walls when their transforms line up. The transform applies scale, XYZ rotation, then translation in a local frame whose origin is the arithmetic mean of the face's vertices: X follows its first edge, Y lies in its plane, and Z is its normal. Negative depth extrudes inward. Positive X/Y scales avoid collapsed caps; invalid or degenerate results are rejected without replacing the current mesh.

Click a face to select it; Shift-click toggles more faces. Selected polygon edges are amber; the mesh remains a wireframe. **Only selected faces** restricts Triangulate and Extrude to that selection. Otherwise those operations affect all faces. **Select all**, **Clear selection**, and **Undo** are in the same Mesh tab. Undo retains up to 20 edits; edits are limited to 50,000 faces per operation. Orbit gestures continue to use the existing camera controls.

Manual editing controls persist through the existing settings system as `editing` and `extrusion`. Older saves acquire defaults for these groups and new `pipeline` controls. **Only selected faces** starts enabled; select faces after the diamond dual before further editing. Resizing, changing the base grid or operation layers, Reload, or Restart rebuilds the procedural mesh and clears manual edits and undo history. Save retains controls and the seed, not manually edited topology.

`window.__meshSketch.mesh` exposes `selectFaces(ids)`, `selectedFaces`, `triangulate(ids?, { random }?)`, `dualDiamond()`, `dualNSided()`, `extrude(ids?, transform?, { segments }?)`, and `undo()`. Omitting face IDs means all faces; an empty list means none. Extrusion accepts an invertible affine Three.js `Matrix4` in each face's local frame, or a callback `(faceId, frame) => matrix` for per-face transforms. `extrusionTransform(options)` in `src/mesh-operations.js` creates the same transform used by the controls. Pure operations in that module return `{ mesh, faceIds }`, where `faceIds` identifies resulting triangles or extrusion caps. The operations preserve their input mesh.

The pure operation `subdivideSmooth(mesh, selectedIds?, { iterations }?)` refines the whole mesh and propagates the supplied selection to child faces. Its `sourceFaces` array maps each resulting face back to its input face. Subdividing the whole surface keeps adjacent faces connected even when only caps are selected.
