# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Canvas renders at 300x150 regardless of container size | No CSS applied to the canvas element (or wrong selector); the un-styled default canvas size is 300x150 | apply the `html,body{margin:0;height:100%}` + `#c{width:100%;height:100%;display:block}` contract (phase 1) |
| Canvas resizes but the scene looks stretched/squashed | `camera.aspect` was never updated to match the new size, or `updateProjectionMatrix()` was never called after changing it | update both together, gated on `resizeRendererToDisplaySize`'s return value (phase 2) |
| Canvas resizes but three.js keeps overwriting your CSS size | `setSize`'s third argument was omitted (defaults to updating `style.width`/`style.height`) | always pass `false` explicitly (phase 2) |
| Blurry canvas on HiDPI/retina displays | Relying on the raw un-scaled `clientWidth`/`clientHeight` for the drawing buffer, or (paradoxically) using the naive `setPixelRatio(devicePixelRatio)` pattern that loses control of the buffer for other reasons | multiply CSS size by `devicePixelRatio` manually inside `resizeRendererToDisplaySize`, with the pixel-count cap (phase 2) |
| Colours globally too dark | `renderer.outputColorSpace` not set to `THREE.SRGBColorSpace` | set it once at renderer construction (phase 3) |
| Colours globally washed out / too light | Double sRGB conversion somewhere in the pipeline | check for a texture or colour already treated as sRGB being converted a second time (phase 3) |
| A child object is in the wrong place or wrong size, no error | Scale on a structural ancestor (e.g. a "sun" node scaled 5x) is multiplying through a child's local position and scale | insert an unscaled `Object3D` pivot between the visually-scaled leaf and anything parented for movement (phase 4) |
| A helper (`AxesHelper`/`GridHelper`) doesn't appear to render | It lost the depth test against overlapping geometry at the same position | set `helper.material.depthTest = false` and a deliberate `renderOrder` (phase 4) |
| Object is correctly positioned but never visible | It falls outside the camera's near/far frustum, or the frustum was never resized on `aspect` change | check near/far against actual scene scale; confirm resize wiring runs (phase 2 and 5) |
| Distant surfaces flicker against each other | z-fighting from insufficient depth-buffer precision at that near/far range | tighten `near`/`far` first; use `logarithmicDepthBuffer` only if that isn't enough (phase 5) |
| Rotation looks wildly wrong after copy-pasting a "45 degrees" value | Every angle except `PerspectiveCamera.fov` is in radians, not degrees | convert explicitly with `THREE.MathUtils.degToRad` (phase 5) |
| Nothing loads at all, textures/models silently fail | Page opened via `file://` instead of a local HTTP server | serve locally (phase 1) |
| `three/addons/` import throws or behaves inconsistently with core | The importmap's `"three"` and `"three/addons/"` entries point at different versions or CDNs | pin both to the same version and CDN (phase 1) |

## B. Verified README-vs-types-vs-source discrepancies

No version-drift discrepancy of this kind was found for this skill's surface. Unlike a bindings
library with a README, generated `.d.ts` files, and a separate implementation that can drift apart,
the three.js manual pages consulted here (`creating-a-scene`, `fundamentals`, `responsive`,
`scenegraph`, `cameras`, `color-management`, `installation`, `setup`, `tips`) and the
`WebGLRenderer` API reference agreed with each other everywhere they overlapped in the source
research. This section is left honestly empty rather than populated with invented rows — if a real
discrepancy surfaces in a later revision (the research was pinned at r185 / `three@0.185.1`), record
it here with the two conflicting sources and which one to trust.

## C. Traps that are not discrepancies, just easy to miss

- **The most-copied tutorial pattern is the anti-pattern.** `renderer.setPixelRatio(window.devicePixelRatio)`
  is extremely common in blog posts and older tutorials, and it is exactly what the manual tells you
  not to do. Don't pattern-match against "what most examples online do" for this one call.
- **`setSize`'s third argument silently defaults to `true`-like behaviour.** Omitting it doesn't
  error — it just quietly re-applies CSS sizing every call, undoing your layout-driven sizing one
  frame at a time in a way that's easy to misdiagnose as a layout bug rather than a renderer-call bug.
- **A freshly constructed `PerspectiveCamera`'s `aspect` argument is just a placeholder.** It only
  matters for the very first frame before resize wiring runs; don't spend time getting it "right" at
  construction time.
- **Scale composes multiplicatively, not additively, down the hierarchy.** It's easy to reason about
  position offsets correctly and then get surprised when a parent's scale also multiplies a child's
  scale and position — both are affected, not just one.
- **`fov` is the one degrees value in an otherwise all-radians API.** This asymmetry is a documented
  fact, not an inconsistency to "fix" — code that treats it like every other angle will be wrong.
- **Helpers can be present and correctly positioned yet invisible.** `depthTest` defaults to `true`
  on helper materials same as anything else, so a helper co-located with real geometry can lose the
  depth test and simply not draw, with no console error to point at the cause.
- **Loosening `near`/`far` to `[0.001, 1000000]` is a debugging technique, not a production
  setting.** It rules out framing bugs at the cost of depth precision everywhere; carrying it into
  production reintroduces the z-fighting it was used to diagnose around.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **Browser/device support matrix.** `installation.html` gives no browser-support matrix and no
   revision number on the page itself. "Will this run on the client's device fleet?" cannot be
   answered from the manual alone — this is a documented gap (the page's absence is the evidence),
   not an inference.
2. **The `manual/` index page is an SPA shell, not a content page.** Fetching `manual/` directly
   returns only the site's nav/header chrome; the actual table of contents lives at
   `manual/list.json`. Worth knowing for anyone re-walking this documentation surface rather than
   trusting the human-facing index URL. This is a documented finding from the doc-mining pass, not
   an inference.
3. **Exact tab-switch throttling difference between `setAnimationLoop` and a raw
   `requestAnimationFrame` loop.** The research states `setAnimationLoop` "auto-pauses on tab
   switch," but no source spells out precisely how this differs from the browser's native
   `requestAnimationFrame` background-tab throttling. This is a reasonable inference that
   `setAnimationLoop` is the safer, WebXR-forward choice — not a fully documented behavioural
   contrast.
