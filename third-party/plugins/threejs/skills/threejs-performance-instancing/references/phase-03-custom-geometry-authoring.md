# Phase 3 — Custom geometry authoring

**Triggers:** no primitive fits, hand-building a `BufferGeometry`, `BufferAttribute`, `setIndex`,
`computeVertexNormals`, normal seams, per-frame vertex mutation, `DynamicDrawUsage`.

## Building the geometry

A `BufferGeometry` is built from parallel typed arrays, one `BufferAttribute` per vertex property:

```js
const positions = new Float32Array([...]); // 3 numbers per vertex
const normals   = new Float32Array([...]);
const uvs       = new Float32Array([...]); // 2 numbers per vertex
const colors    = new Float32Array([...]);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
geometry.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
```

## Indexing: pick the index type by vertex count, not habit

`geometry.setIndex(...)` deduplicates vertices referenced by multiple triangles. The index's typed
array must be sized to the vertex count it needs to address:

- **Under 65,000 vertices:** `new THREE.Uint16Array(indices)` — smaller, and sufficient range.
- **At or above 65,000 vertices:** `new THREE.Uint32Array(indices)` — `Uint16Array` cannot address
  that many distinct vertices; using it above the 65k line silently wraps/corrupts indices rather
  than erroring loudly, so check the vertex count before picking the type, not after debugging
  garbled geometry.

```js
geometry.setIndex(new THREE.Uint16Array(indices)); // vertex count < 65,000
// or
geometry.setIndex(new THREE.Uint32Array(indices)); // vertex count >= 65,000
```

## Normals: computed normals are a trade-off, not a default win

`geometry.computeVertexNormals()` derives per-vertex normals from the triangles sharing that
vertex. It is convenient, but it only produces correct shading where a shared vertex should
actually look smooth across all its triangles. At a hard edge — a cube corner, a UV seam, anywhere
the surface should look faceted rather than smooth — a vertex shared by triangles on both sides of
the edge gets one averaged normal, which reads as a shading seam or a smeared edge instead of a
crisp one.

The alternative is authoring normals explicitly per vertex, which requires *not* sharing that
vertex across the triangles that should shade differently (duplicate the vertex position with a
different normal instead). Reach for `computeVertexNormals()` when a smooth, organic surface is
the goal; author normals by hand — accepting the vertex duplication that requires — when hard edges
matter.

This same "shared vertex, differing attribute" rule governs UVs too: a vertex is only shareable
across triangles if every attribute matches. A UV seam forces the same kind of duplication as a
hard-edge normal does.

## Per-frame mutation: DynamicDrawUsage

If an attribute's values change every frame (a wave, a particle system, a per-vertex deformation),
tell the GPU that up front instead of leaving it at the static-draw default:

```js
const positionAttr = geometry.attributes.position;
positionAttr.setUsage(THREE.DynamicDrawUsage);

// each frame:
for (let i = 0; i < vertexCount; i++) {
  positionAttr.array[i * 3 + 1] = computeNewY(i, time);
}
positionAttr.needsUpdate = true;
if (boundsChanged) geometry.computeBoundingSphere();
```

Three steps, all required together: `setUsage(THREE.DynamicDrawUsage)` once, mutate the typed array
in place every frame, and set `attribute.needsUpdate = true` every frame after mutating — the
upload does not happen without that flag. If the mutation moved geometry outside its previous
bounds, also call `geometry.computeBoundingSphere()` (the same bounding-sphere concern that applies
to `InstancedMesh` in phase 2 applies to any geometry whose vertices move at runtime: stale bounds
break culling and raycasting).

## Relationship to phases 1 and 2

Custom geometry authoring is the fallback when no primitive, no merge, and no `InstancedMesh`
fits the shape you need — for example a single mesh whose vertices deform procedurally, where
there is no "per-object" identity to preserve or instance in the first place. It composes with
phase 1: geometries you build here can still be merged if many static copies of the custom shape
are needed, following the same `applyMatrix4` + `mergeGeometries` path.
