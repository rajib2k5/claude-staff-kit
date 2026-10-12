# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Object never appears, no console error | A `NaN`/`Infinity` in a position or matrix — WebGL fails to draw invalid transform data silently | inspect `mesh.position`/`matrix`/`matrixWorld` and geometry bounds in the debugger (phase 2) |
| Object vanishes after feeding curve/path data into a `Vector3` | A 2D source (e.g. `SplineCurve`) never sets `z`; it comes through as `undefined` and poisons downstream math into `NaN` | assign every axis explicitly instead of trusting a property the source never set (phase 2) |
| Scene freezes with no visible error to a casual observer | `requestAnimationFrame` at the top of the render function keeps scheduling frames even after a mid-frame throw, or (worse) stops scheduling with the actual error scrolled past in the console | move the call to the end of the render function so a thrown error visibly halts the loop (phase 2) |
| A helper (`AxesHelper`/`GridHelper`/`CameraHelper`/light helpers) doesn't appear to render | It lost the depth test against overlapping real geometry at the same position | set `helper.material.depthTest = false` and a deliberate `renderOrder` (phase 4) |
| A rotation looks wildly wrong after copy-pasting a "45 degrees" value | Every angle except `PerspectiveCamera.fov` is in radians, not degrees | convert explicitly with `THREE.MathUtils.degToRad`, and confirm `fov` is the one exception (phase 2) |
| Custom shader shows nothing at all | The failure is in the vertex stage (degenerate positions), which looks identical to a fragment-stage failure or several phase-1/2 causes | run the `gl_FragColor = vec4(1,0,0,1)` solid-colour bisect before any fragment-side theorising (phase 3) |
| Rotation/scale looks right in isolation but wrong in a PBR or XR scene | The scene isn't actually built at "1 unit = 1 metre," which PBR lighting response and XR eye-height assumptions both depend on | check absolute scale against the metre convention, not just relative proportions (phase 2) |
| Transparent surfaces occlude/blend in an unexpected order | Documented sort-order behaviour of transparency, not a bug | check whether the result matches the known sort-order/`BackSide`/`FrontSide` behaviour before assuming it's a defect (phase 4) |
| Debugging session "fixes" nothing no matter what you edit | Stale cached bundle being served while DevTools is open | enable "Disable Cache (while DevTools is open)" before starting (phase 1) |

## B. Verified README-vs-types-vs-source discrepancies

No genuine version-drift discrepancy of this kind was found for this skill's surface, and none is
invented here to fill the section. Unlike a bindings library with a README, generated `.d.ts` files,
and a separate implementation that can drift apart, this skill's two primary sources
(`debugging-javascript.html`, `debugging-glsl.html`) are both prose manual pages with inline code
examples — there is no separate types file or generated reference to diff them against, and the
research pass found no contradiction between the two pages or against the cross-referenced pages
(`cameras.html`, `scenegraph.html`, `transparency.html`) anywhere they overlapped (e.g. both the
scenegraph and debugging pages describe the `depthTest`/`renderOrder` helper pattern identically).
If a real discrepancy surfaces in a later revision (this was pinned at r185 / `three@0.185.1`),
record it here with the two conflicting sources and which one to trust.

## C. Traps that are not discrepancies, just easy to miss

- **A blank canvas and a shader bug can look identical.** "Nothing renders" is the shared symptom of
  a console error, a lighting/material problem, a framing problem, a `NaN`, and a vertex-shader bug.
  The fixed triage order (phase 1 → phase 2 → phase 3) exists precisely because the symptom alone
  doesn't tell you which of these five you have.
- **The camera-widening step is a debugging technique, not a production setting.** `near = 0.001`,
  `far = 1000000` rules out framing bugs at the cost of depth precision everywhere; carrying it into
  production reintroduces the z-fighting it was used to diagnose around. Put the real values back
  once framing is ruled out or confirmed.
- **The red-swap test tells you *where* the bug is, not *what* it is.** Swapping in
  `MeshBasicMaterial({color:'red'})` and seeing the object appear tells you "lighting or material,"
  not which specific light or property — it narrows the search space, it doesn't finish the
  diagnosis.
- **`fov` is the one degrees value in an otherwise all-radians API.** This asymmetry is a documented
  fact, not an inconsistency to "fix" — code (or a copy-pasted value) that treats it like every other
  angle will be wrong.
- **Vertex-stage shader bugs must be ruled out before fragment-stage theorising**, specifically
  because they present as "nothing renders" — the same symptom as several phase-1/2 causes one layer
  up the stack. Doing the solid-colour bisect out of order (theorising about fragment logic first)
  risks spending time on the wrong stage entirely.
- **Helpers follow the same depth-test rule as the objects they're meant to help you see.** It's easy
  to assume a helper is special-cased to always render on top; it isn't, unless you explicitly set
  `depthTest = false` and a `renderOrder`.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **"Is WebGL even available here" is unsourced for this skill.** `manual/en/webgl-compatibility-check.html`
   and `manual/en/faq.html` both exist in the manual's own `list.json` table of contents but were not
   walked during the research pass this skill is built from. Whether the canvas is blank because
   WebGL isn't available at all (old browser, disabled GPU, exhausted context limit) — as opposed to
   any of the causes in phases 1–4, all of which assume a working WebGL context — is therefore a real
   branch of "why is the screen black" that this skill cannot ground a procedure for. Treat it as an
   open gap, not as "covered by phase 1's console check": a missing-WebGL failure may or may not
   surface a console message depending on the browser.
2. **Reading `renderer.info` as a diagnostic is unsourced.** `renderer.info` (draw calls, geometries,
   textures, programs) appears in the docs sidebar and is a plausible diagnostic for "is anything
   actually being submitted to the GPU this frame," but no page walked in the research states how to
   use it for debugging, or what its fields mean precisely. Don't present a `renderer.info` workflow
   as sourced fact; if you use it, treat it as your own judgment call and say so.
3. **No shadow-specific debugging technique is sourced**, despite `shadows.html` appearing in the
   research's own cross-reference list for this capability cluster (see `sources.md`'s "Deliberate
   exclusions"). If a shadow specifically (as opposed to the object entirely) is failing to appear,
   this skill's phases still apply generically (console, red-swap, framing, `NaN` hunting), but
   nothing here is a shadow-specific procedure — that would need to be sourced from `shadows.html`
   directly and is currently out of this skill's grounded surface.
