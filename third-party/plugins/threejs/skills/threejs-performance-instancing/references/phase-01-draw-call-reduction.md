# Phase 1 — Draw-call reduction

**Triggers:** thousands of individual meshes, low fps with a simple scene, "too many draw calls",
`mergeGeometries`, preserving per-object color after merging, animating something that used to be
thousands of separate meshes, `BufferGeometry.groups`.

## Measure first

Before touching geometry, know the two numbers that actually explain the slowdown: draw-call count
and scene-graph node count. The manual's own case study is concrete: roughly 19,000 individual box
meshes render at about 19–20 fps. Merging them into a single mesh gets to about 60 fps and removes
roughly 80,000 nodes from scene-graph traversal in the process. The fps win and the node-count win
are two separate effects of the same change — traversal cost falls even before the GPU sees fewer
draw calls.

## Merge static geometry into one draw call

The target shape: many geometries that will never move independently again become one
`BufferGeometry` and one `Mesh`.

1. For each source piece, bake its current transform into its vertices *before* merging:
   `geometry.applyMatrix4(mesh.matrixWorld)`. If you merge first and transform after, every piece
   ends up at the same place — the whole point of doing this per piece is that each one carries its
   own position/rotation/scale into the merged result.
2. Merge everything with the addon utility:

   ```js
   import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

   const mergedGeometry = mergeGeometries(geometries, false);
   const mergedMesh = new THREE.Mesh(mergedGeometry, material);
   scene.add(mergedMesh);
   ```

3. The result is one `Mesh`, one draw call (per material), and none of the original per-object
   `Object3D` nodes remain in the graph.

### What merging costs you

Merging forfeits per-object movement. Once geometries are combined into one `BufferGeometry`, you
cannot move, rotate, or remove one of the original pieces independently — there is no longer an
`Object3D` per piece to transform. Decide this trade deliberately: if any of the source objects
need independent movement later, either keep them separate, promote them to `InstancedMesh`
(phase 2), or use the morph-target workaround below for a bounded set of pre-baked states.

Vertex sharing at the merge boundary is also constrained: a vertex is only shareable across
triangles if *every* attribute matches. Differing UVs or normals at what looks like the same
position forces the merge to duplicate that vertex rather than share it.

## Preserve per-object identity: vertex color

Merging throws away the one thing that made each source mesh visually distinct — its own material
instance — because the merged mesh has one material. Recover a distinguishing per-object color by
carrying it as vertex data instead of material data:

1. Before merging, give each source geometry a `color` `BufferAttribute` where every vertex of that
   piece is set to that piece's intended color.
2. After merging, set `material.vertexColors = true` on the shared material so it multiplies the
   material's base color by the interpolated per-vertex color.

This is the documented way to keep "each box is a different color" working after 19,000 boxes
become one mesh: the identity moves from "which material is this mesh using" to "what color is
baked into this vertex."

## Animate what can no longer move separately: morph targets

If the merged geometry still needs to change shape or move — a bounded set of known states, not
arbitrary per-object transforms — use morph targets instead of reversing the merge:

1. Set `geometry.morphAttributes.position` (and `.color`, if color also changes per state) to an
   array of per-state attributes, authored against the merged, transformed vertex data.
2. Drive the blend at runtime with `mesh.morphTargetInfluences`, tweening the influence values the
   same way you would tween any other numeric property.

The hard constraint here is timing, not syntax: **`BufferGeometry.morphAttributes` cannot be
changed after the geometry has first been rendered.** If you need a different set of morph targets
later, you must `dispose()` the geometry and rebuild it — there is no incremental way to add a
morph target to a geometry that has already drawn a frame.

## `BufferGeometry.groups` — a different kind of draw-call lever

`BufferGeometry.groups` let one geometry draw with more than one material, but each group is itself
one draw call — groups do not reduce draw calls the way merging does; they let you trade "many
meshes" for "many groups on one geometry" when you specifically need per-region materials on a
single buffer. Two constraints make groups easy to misuse:

- Every index in the geometry must belong to **exactly one** group — no index may be shared between
  groups, and no index may be left out of every group.
- Each group is its own draw call regardless, so grouping buys you a single `BufferGeometry` and a
  single `Object3D`, not fewer draws. Use it for material variety, not for the 19,000-mesh problem
  above — that problem is solved by merging into one material with vertex colors, not by groups.

## When merging is the wrong tool

If the objects need to move independently at runtime — not just switch between a small, bounded set
of pre-authored morph states — merging (with or without morph targets) is the wrong lever. Move to
phase 2 (`references/phase-02-instancing.md`) and use `InstancedMesh` instead.
