# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Merged mesh looks like every piece landed in the same spot | `applyMatrix4` skipped, or applied after the merge instead of before | apply each piece's `matrixWorld` to its own geometry *before* calling `mergeGeometries` (phase 1) |
| Merged mesh loses per-object color, everything is one flat color | `material.vertexColors` left `false`, or no `color` attribute was set before merging | set a `color` `BufferAttribute` per source geometry before merging, then `material.vertexColors = true` (phase 1) |
| Changing morph target data does nothing, or throws | `geometry.morphAttributes` edited after the geometry already rendered a frame | `dispose()` the geometry and rebuild it with the new morph data — there is no incremental update path (phase 1) |
| `setMatrixAt`/`setColorAt` calls appear to do nothing on screen | forgot `instanceMatrix.needsUpdate = true` / `instanceColor.needsUpdate = true` after the batch | set the relevant `needsUpdate` flag once per batch, not per call (phase 2) |
| Instances vanish when the camera moves, or raycasting misses instances that are clearly on screen | stale bounding sphere after a bulk transform update | call `instancedMesh.computeBoundingSphere()` after bulk `setMatrixAt` (phase 2) |
| Adding "just a few more" instances throws or silently no-ops | `count` passed to the `InstancedMesh` constructor was already the hard maximum | construct a new `InstancedMesh` sized to the real ceiling; `count` cannot grow after construction (phase 2) |
| Geometry renders garbled/corrupted at scale | `Uint16Array` used as the index for 65,000+ vertices | switch to `Uint32Array` once vertex count reaches 65,000 (phase 3) |
| Per-frame vertex mutation doesn't show up, or shows up a frame late | `attribute.needsUpdate = true` missing after mutating the typed array, or `setUsage(DynamicDrawUsage)` never set | set both: `setUsage(THREE.DynamicDrawUsage)` once, `needsUpdate = true` every frame after mutating (phase 3) |
| Hard edges look smeared/shaded wrong after `computeVertexNormals()` | a vertex shared across triangles that should shade differently got one averaged normal | duplicate the vertex (with its own normal) at hard edges instead of sharing it (phase 3) |
| Enabling `enableDamping` on OrbitControls causes the render loop to spin continuously | `render` bound directly to the controls' `change` event, and damping's own `controls.update()` re-emits `change` | route through the `renderRequested` guard instead of binding `render` directly (phase 4) |
| OffscreenCanvas worker path throws on unsupported browsers | `transferControlToOffscreen` called without a feature check | feature-detect `canvas.transferControlToOffscreen` and fall back to a main-thread renderer (phase 5) |
| OrbitControls throws or silently does nothing inside a worker | the worker has no real DOM element to call `addEventListener`/`getBoundingClientRect` on | stand in an ElementProxy stubbing that surface, fed by events forwarded from the main thread (phase 5) |

## B. Verified README-vs-types-vs-source discrepancies

None found, stated honestly rather than invented. The react-force-graph skill this template is
modeled on found its five discrepancies by diffing three independent artifacts of the same
project — a hand-written README, generated `.d.ts` type files, and the implementation source — at
one pinned version. The material available for this skill is a single doc-mining pass over the
three.js manual and API docs (no `.d.ts` files, no implementation source were part of the research
scope), so there is no second or third artifact to diff the manual's prose against. This is a gap
in the grounding material, not a claim that three.js r185's docs and implementation agree
everywhere — it is simply unverified in either direction. Treat any future update to this skill
that adds source-code or type-level grounding as an opportunity to actually run this diff.

## C. Traps that are not discrepancies, just easy to miss

- **Draw-call count and node count are two different wins from the same fix.** The 19,000-mesh
  benchmark's fps gain and its ~80,000-node traversal reduction both come from merging, but they
  are separate costs — a scene could theoretically have few draw calls and still traverse a huge,
  slow scene graph if nodes were reduced by some other means without merging geometry, or vice
  versa. Measure both, not just fps.
- **Merging and instancing are not alternatives to each other; they answer different questions.**
  Merge what is permanently static; instance what still needs independent movement. A scene that
  needs both usually has both — don't force one technique to cover the other's job.
- **`count` on `InstancedMesh` is a construction-time ceiling, not a live property to bump.**
  Treating it like a resizable array is the most common misuse; there is no growth path short of
  building a new `InstancedMesh`.
- **Facades trade geometric fidelity for a flat image, deliberately.** They are correct for objects
  distant enough that the viewer can't tell the difference, and wrong for anything the camera might
  approach — a sprite doesn't reveal new detail on approach the way real geometry would.
- **Texture VRAM cost tracks pixel dimensions, not file size on disk.** A well-compressed JPEG can
  still cost tens of megabytes of GPU memory once decoded to its actual width × height — shrinking
  the file's compression doesn't touch this cost; shrinking the dimensions does. (Confidence
  medium in the source material — see `sources.md`.)
- **A worker doesn't reduce GPU work.** Moving the renderer off the main thread fixes main-thread
  contention/jank; it does not change how many draw calls or how much shader work the GPU performs
  per frame. Diagnose which one you actually have before reaching for phase 5.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **OffscreenCanvas reposition, not just resize.** The documented worker sample forwards size
   changes so the offscreen canvas stays correctly sized, but it does not handle the canvas
   *moving* — e.g. on a page where the canvas's position shifts due to scrolling or layout change
   around it. On such a page, both size and position need to be re-sent on every layout change that
   moves the canvas, and the manual flags this gap explicitly without offering a solution. Treat
   any worker-based canvas on a scrolling or dynamically-laid-out page as needing this handled
   separately, and verify it empirically rather than assuming the resize path covers it.
2. **No documented target budgets.** No source in this skill's grounding material states target
   thresholds — draw calls, triangle counts, texture megabytes — for any device class (e.g. "under
   X draw calls on mid-range mobile"). Any specific number used when applying this skill to a real
   project is this skill's own judgment call, informed by the general shape of the 19k-mesh
   benchmark but not backed by a stated budget for the target hardware. Say so explicitly when
   proposing a number, rather than presenting it as if the manual specified it.
