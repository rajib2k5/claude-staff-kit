# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Damping/`autoRotate` never advances; camera looks frozen between input events | `controls.update()` is missing from the render loop — both behaviors are computed inside `update()`, not as a side effect of a property set | call `controls.update()` every frame while `enableDamping`/`autoRotate` is on (phase 1) |
| Picking drifts wrong the farther the canvas is from the viewport origin (scrolled page, offset layout) | pointer math used `event.clientX`/`clientY` directly instead of subtracting `canvas.getBoundingClientRect().left/top` first | compute canvas-relative position before the NDC conversion (phase 2) |
| Picking is off by a scale factor away from dead-center, worse on HiDPI | NDC division used `clientWidth`/`clientHeight` instead of the actual drawing-buffer `canvas.width`/`canvas.height` | divide by `canvas.width`/`canvas.height` (phase 2) |
| Raycaster returns a hit/miss that looks wrong only on one specific mesh — displaced surface, skinned character, alpha-cut texture | CPU raycasting tests the geometric silhouette; it has no knowledge of vertex-shader displacement, skinning, or texture alpha | switch that mesh's picking to GPU picking (phase 3) |
| GPU picking always decodes to the same id, or to 0, or to a slightly wrong id | picking material's `blending` isn't `NoBlending`, or its `emissive` id color got reinterpreted by color-space conversion | set `blending: THREE.NoBlending` and encode with `emissive.setHex(id, THREE.NoColorSpace)` (phase 3) |
| GPU picking's 1x1 sample lands on the wrong pixel entirely | `renderer.setPixelRatio(window.devicePixelRatio)` was used, so the true drawing-buffer size (which `setViewOffset`'s `px`/`py`/`fullWidth`/`fullHeight` are measured in) no longer matches what the code assumes | compute the buffer size yourself (`clientWidth * devicePixelRatio`, capped) instead of delegating to `setPixelRatio` [MAN-RESP] |
| GPU picking is solid where the display mesh has a texture hole (foliage, cutout signage) | the picking material's `alphaTest` doesn't match the display material's | copy the display material's `alphaTest` (and alpha source) onto the picking material (phase 3) |
| Touch drag on the canvas scrolls or zooms the page instead of driving the scene | touch listener wasn't registered `{passive: false}`, or `preventDefault()` was never called on `touchstart` | register with `{passive: false}` and call `preventDefault()` on start (phase 4) |
| A single tap fires the pick handler twice | the canvas has both a touch handler and a mouse handler and neither calls `preventDefault()`, so the browser synthesizes a compatibility mouse event after the touch | `preventDefault()` on `touchstart` (phase 4) |

## B. Verified discrepancies

None found for the picking/controls surface this skill covers. Unlike a project with multiple
parallel representations of the same API (README vs. `.d.ts` vs. source, as in the
`react-force-graph` skill), the material behind this skill is a single official manual page for
picking (`picking.html`) plus a single docs page for `OrbitControls` — there was nothing to diff
API-behavior claims against. The only structural finding was a **documentation URL migration**,
not a behavior discrepancy: the legacy `docs/api/en/controls/OrbitControls.html` and
`docs/examples/en/controls/OrbitControls.html` paths both 404 at r185, and the current
authoritative form is `docs/pages/OrbitControls.html`. Stating this honestly rather than inventing
a row: there is no known version-drift in the *behavior* of `OrbitControls`, raycasting, or GPU
picking between recent three.js releases in the source material read for this skill.

## C. Traps that are not discrepancies, just easy to miss

- **`intersects[0]` existing is not guaranteed.** `intersectObjects` returns an empty array, not
  `undefined`, when nothing is hit. Check `intersects.length` (or `intersects[0]` truthiness)
  before reading `.object` off it.
- **Raycasting-everything is a documented perf trap, not a style preference.** The manual calls out
  per-frame raycasting against everything as slow. Treat "which objects are in the raycast list"
  as a deliberate design decision, not a default of `scene.children`.
- **Sprites pick like meshes, but their alpha limitation is the same as any alpha-cut mesh's.** A
  `Sprite` used as a marker raycasts fine for its silhouette, but if its visible shape depends on
  `alphaTest`, the CPU-raycasting-ignores-alpha limitation applies to it exactly as it does to a
  regular mesh (phase 2).
- **The `setPixelRatio` warning is general, but it specifically names GPU picking as one of the
  things it breaks.** It is easy to read that warning as being about post-processing/screenshots
  only and miss that it is explicitly called out as also breaking GPU picking's buffer-size math.
- **`camera.clearViewOffset()` is part of the sequence, not optional cleanup.** Skipping it leaves
  the camera's projection matrix permanently narrowed to the last picked pixel, which shows up as
  the *main* render looking wrong after the first pick, not as a picking bug.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **Addon controls beyond `OrbitControls`.** `TransformControls`, `DragControls`, and the rest of
   the addon controls family were not walked in the source research behind this skill. Only
   `OrbitControls` is grounded; do not extend its documented behavior (props, `update()`/`dispose()`
   requirements) to other controls classes without checking their own docs.
2. **No object-count threshold for "raycasting is now too slow."** The manual states that
   per-frame raycasting against everything is slow, and that GPU picking is the fix when raycasting
   is "too slow or wrong," but no source gives a number — an object count, a triangle count, a
   frame-budget figure — at which the tradeoff flips in favor of GPU picking's added complexity.
   Measure in the target scene rather than assuming a threshold.
3. **Interaction between `OrbitControls`' built-in touch gestures and a custom touch-driven picking
   handler on the same canvas.** The fetched `OrbitControls` material grounds the props table and
   the `update()`/`dispose()` requirement, not its internal `touches.ONE`/`touches.TWO` gesture
   mapping. Whether a one-finger tap-to-pick handler needs extra coordination to avoid being
   consumed as the start of an orbit drag is not documented in the source material and should be
   verified empirically if the scene uses both.
