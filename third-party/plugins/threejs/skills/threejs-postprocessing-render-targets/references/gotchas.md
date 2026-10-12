# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Custom pass does nothing, or renders black/garbage | `uniforms.tDiffuse: {value: null}` missing or misnamed on the custom shader object | add it exactly as `tDiffuse` — `ShaderPass` overwrites it with the previous pass's output every frame (phase 3) |
| Post-processed scene looks globally too light / washed out | Double sRGB conversion — `OutputPass` missing from the chain, or applied more than once | ensure exactly one `OutputPass`, placed last (phase 2) |
| Post-processed scene looks globally too dark | `renderer.outputColorSpace` not set to `THREE.SRGBColorSpace` | set it once at renderer construction, independent of `OutputPass` placement (phase 2) |
| A custom effect looks like it's operating on the wrong data (already tone-mapped, blown out) | The custom `ShaderPass` was added **after** `OutputPass` instead of before it | move it before `OutputPass` in the `addPass` sequence (phase 3) |
| Composer output is stretched or shows stale content after a window resize | `composer.setSize(...)` was never called on resize — the composer's buffers don't track the renderer automatically | call `composer.setSize(canvas.width, canvas.height)` in the same resize handler that resizes the renderer (phase 4) |
| Post-processed output is blurry only on retina/HiDPI displays | `composer.setPixelRatio(...)` was never (re-)applied after the composer was created | call `composer.setPixelRatio(window.devicePixelRatio)` in the resize handler (phase 4) |
| A mirror/screen/facade texture looks stretched only after a resize, while the main canvas looks fine | The render target (`rt.setSize`) and its own `rtCamera` aspect were never updated on resize — this is separate from the composer/canvas resize path | resize the render target and update `rtCamera.aspect` + `updateProjectionMatrix()` explicitly (phase 1 and 4) |
| A render target driven mirror/screen looks stretched even before any resize | `rtCamera.aspect` was set from the canvas's aspect instead of the render target's own `width/height` | derive `rtCamera.aspect` from the render target's own dimensions (phase 1) |
| Time-based effect (pulse, animated grain) runs at an ever-accelerating or otherwise wrong rate | `composer.render(...)` was fed total elapsed time instead of a real per-frame delta | pass a genuine per-frame delta in seconds — a kept `then`/`now` pair or `Clock.getDelta()` (phase 2) |

## B. Verified README-vs-types-vs-source discrepancies

No genuine version-drift discrepancy of this kind was found for this skill's surface. Unlike a
bindings library with a README, generated `.d.ts` files, and a separate implementation that can
drift apart, the sources consulted here — the `post-processing` and `rendertargets` manual pages,
the `EffectComposer` API reference, and the `webgpu-postprocessing` boundary page — agreed with each
other everywhere they overlapped in the scout research. This section is left honestly empty rather
than populated with invented rows. If a real discrepancy surfaces in a later revision (the research
was pinned at r185 / `three@0.185.1`), record it here with the two conflicting sources and which one
to trust.

## C. Traps that are not discrepancies, just easy to miss

- **"Missing `tDiffuse`" and "wrong pass order" produce the same kind of silence.** Neither throws;
  both just make the effect look wrong or absent. When a custom pass isn't doing anything visible,
  check the uniform name first, then check its position relative to `OutputPass`, before assuming the
  fragment shader logic itself is wrong.
- **A render target is not exempt from resize wiring just because it isn't "the canvas."** It's easy
  to wire up `composer.setSize` on resize and forget that a `WebGLRenderTarget` from phase 1 needs
  the identical treatment, sized to whatever *its own* logical resolution should be — which is not
  necessarily the canvas size at all.
- **`deltaTime` for `composer.render()` is a per-frame delta, not a running total.** This is the same
  discipline the animation system already requires for `mixer.update(dt)` — reusing an elapsed-time
  accumulator here (a common copy-paste source) produces effects that appear to run, just at the
  wrong and constantly changing speed rather than erroring outright.
- **Two different symptoms point in two different directions for colour bugs**, and conflating them
  wastes debugging time: too light/washed-out is an `OutputPass` problem (chain-ordering, count), too
  dark is an `outputColorSpace` problem (renderer-level setting). Fixing the wrong one won't help.
- **Depth/stencil buffers default to on.** A render target created without explicitly disabling
  `depthBuffer`/`stencilBuffer` carries them even when the target is only ever used as a flat colour
  texture (a mirror, a screen) — turning them off when unused is a deliberate choice, not the
  default.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **Most bundled effect passes are undocumented.** The manual itself, in covering
   `post-processing.html`, only grounds the `EffectComposer`/`RenderPass`/`ShaderPass`/`OutputPass`
   *contract* — it explicitly points readers at the addon repository source for the parameters and
   behaviour of individual bundled effect passes (bloom, DoF, SSAO, film grain, and the rest). This
   skill teaches the contract those passes must honor; it does not and cannot document each pass's
   own options from the manual alone.
2. **`manual/en/how-to-use-post-processing.html` was never walked.** It appears in `manual/list.json`
   (the recovered table of contents) alongside the pages this skill is grounded in, but the scout
   research did not fetch or read it. If that page contains guidance beyond what `post-processing.html`
   covers, it isn't reflected here — treat this skill's post-processing coverage as bounded by the
   pages actually read, not by everything the manual publishes on the topic.
3. **The exact internal mechanism of "double conversion."** The research and the manual both state
   *that* omitting `OutputPass` or applying it twice produces a too-light result, and *that* a wrong
   `outputColorSpace` produces a too-dark one — but the color-management source for this specific
   interaction is marked medium confidence in the brief, and no source walks through the pixel-level
   math of why stacking two sRGB conversions produces lightening specifically. Treat the diagnosis
   table as the actionable, verified triage tool; treat "why" as unresolved.
4. **Combining phase 1 (render-to-texture) with phase 2 (an effect chain) on the inner scene.**
   Nothing in the sources states whether or how you'd run post-processing on the `rtScene` that fills
   a render target before that texture is consumed by the main scene — both patterns are documented
   independently, but their combination isn't. If a design needs a post-processed mirror/screen
   texture, that would need its own composer targeting the render target, unverified against any
   source here.
