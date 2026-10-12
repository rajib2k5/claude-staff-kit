---
name: threejs-postprocessing-render-targets
description: Add bloom, film grain, custom fullscreen shaders, or render a scene into a texture (mirrors, screens, monitors, building facades) in three.js — without silently breaking colour management. Use for "add bloom / post-processing to three.js", EffectComposer, RenderPass, ShaderPass, OutputPass ordering, "render scene to texture", WebGLRenderTarget, setRenderTarget, "colours wrong after post-processing" (too light or too dark), custom fullscreen shader pass, the mandatory tDiffuse uniform, "mirror or screen-in-scene effect", composer.render(deltaTime), composer.setSize / setPixelRatio on resize, or a post-processing chain that silently breaks. Does not cover the WebGPU post-processing path (RenderPipeline/pass()/mrt() — see threejs-webgpu-tsl), GPU picking's render-target use (threejs-interaction-picking), authoring GLSL itself beyond the pass contract, or the third-party `postprocessing` npm package.
---

# three.js post-processing and render targets

Grounded in the three.js manual and docs at **r185** (npm `three@0.185.1`), read from
`https://threejs.org/manual/en/post-processing.html`, `https://threejs.org/manual/en/rendertargets.html`,
`https://threejs.org/docs/examples/en/postprocessing/EffectComposer.html`,
`https://threejs.org/manual/en/webgpu-postprocessing.html`, and `https://threejs.org/manual/en/color-management.html`.
Every claim in the reference files traces to one of those pages; see `references/sources.md`. This
distillation was compiled from a saved doc-mining research file (`threejs-research.md`, section 10
primarily, cross-referenced against sections 1 and 14) rather than a live fetch — nothing here goes
beyond what the brief and that research file recorded.

## Scope

**Covers:** `WebGLRenderTarget` construction and disabling `depthBuffer`/`stencilBuffer` when the
target doesn't need them; building a separate `rtScene`/`rtCamera` whose aspect matches the render
target, not the canvas; the `setRenderTarget(rt) → render → setRenderTarget(null)` ordering and
consuming `rt.texture` as a `map`; resizing render targets and their cameras alongside the canvas;
assembling an `EffectComposer` with `RenderPass` first, effect passes in the middle, and `OutputPass`
last; `composer.render(deltaTime)` driven by a real per-frame delta rather than elapsed time;
`composer.setSize(canvas.width, canvas.height)` plus `setPixelRatio` on every resize; authoring a
custom pass — the mandatory `tDiffuse` uniform, a passthrough vertex shader, a fragment shader
sampling `texture2D(tDiffuse, vUv)`, wrapped in `ShaderPass`; how `OutputPass` interacts with sRGB
conversion and tone mapping, and what double conversion looks like.

**Does not cover:** the WebGPU post-processing path — `EffectComposer` is explicitly unsupported
under `WebGPURenderer`; `RenderPipeline`/`pass()`/`mrt()` belong to `threejs-webgpu-tsl`. Authoring
the GLSL itself beyond the pass contract (that's shader-writing craft, not this skill's boundary).
GPU picking's use of a 1×1 render target — `threejs-interaction-picking`. The third-party
`postprocessing` npm package — named in the manual's library list but not documented by it, and out
of scope here.

## The one thing to internalize first

Two rules carry almost the entire failure surface of this skill, and both fail **silently** — no
console error, no thrown exception. First: every custom pass's `uniforms` object must contain
`tDiffuse: {value: null}` — ShaderPass fills it in per-frame with the previous pass's output, and a
pass missing that uniform just breaks the chain without saying why. Second: `OutputPass` goes
**last**, after every effect pass — it performs the sRGB conversion and tone mapping that makes the
scene look right. Omit it and the render comes out wrong; apply it twice (or leave a second implicit
conversion somewhere in the chain) and the result comes out too light. A globally *dark* result
points the other way — at `renderer.outputColorSpace` — not at `OutputPass` placement. Keep that
distinction in mind before touching either.

## Workflow

Work the phases in order for a new post-processing setup; jump straight to one for a narrow,
already-diagnosed problem.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-render-to-texture.md` | rendering one scene into a texture another scene consumes — mirrors, screens, monitors, facades; `WebGLRenderTarget`, `setRenderTarget` |
| 2 | `references/phase-02-effect-chains.md` | adding bloom/grain/effects, `EffectComposer`, pass ordering, `composer.render(deltaTime)`, colours look wrong after adding an effect |
| 3 | `references/phase-03-custom-passes.md` | writing your own fullscreen shader pass, `tDiffuse`, `ShaderPass`, the chain silently produces nothing |
| 4 | `references/phase-04-resize-correctness.md` | canvas resize or HiDPI leaves the composer or a render target's buffer out of sync — blur, stretching, mismatched sizes |

Read `references/gotchas.md` whenever behaviour contradicts expectation — it lists the silent
failures, the (honest lack of) version-drift discrepancies, traps that aren't discrepancies, and the
two open unknowns the manual itself flags rather than resolves.

## Definition of done

A finished post-processing or render-to-texture setup satisfies all of these:

1. Any `WebGLRenderTarget` built purely for a colour texture (a mirror surface, a screen-in-scene)
   has `depthBuffer`/`stencilBuffer` explicitly turned off when it doesn't need them.
2. The scene rendered into that target uses its own `rtScene` and `rtCamera`, and `rtCamera.aspect`
   matches the render target's dimensions, not the canvas's.
3. The render-to-texture call sequence is `renderer.setRenderTarget(rt)` → `renderer.render(rtScene,
   rtCamera)` → `renderer.setRenderTarget(null)`, performed **before** the main scene renders in the
   same frame, and the target is consumed downstream as `material.map = rt.texture`.
4. On canvas resize, the render target itself is resized (`rt.setSize(...)`) and `rtCamera`'s aspect
   and projection matrix are updated — a render target is not exempt from resize wiring.
5. Any effect chain is built as `new EffectComposer(renderer)` with `addPass(new RenderPass(scene,
   camera))` first, effect passes in the middle, and `new OutputPass()` strictly last.
6. `renderer.render(...)` has been replaced with `composer.render(deltaTime)`, where `deltaTime` is a
   real per-frame delta in seconds (a kept `then`/`now` pair or `Clock.getDelta()`), not elapsed time
   since start.
7. Every resize handler that touches the renderer also calls `composer.setSize(canvas.width,
   canvas.height)`, and calls `setPixelRatio` again on HiDPI displays — a resize that updates the
   renderer but not the composer leaves the two buffers in disagreement.
8. Any custom pass defines `uniforms` containing `tDiffuse: {value: null}`, a passthrough vertex
   shader, and a fragment shader that samples `texture2D(tDiffuse, vUv)` — and is wrapped in
   `ShaderPass` and inserted before `OutputPass`, not after.
9. A wrong-colour result has been triaged with the manual's own rule, not guessed at: too light →
   suspect double conversion (missing `OutputPass`, or one applied twice); too dark → suspect
   `outputColorSpace`.
10. Nothing here relies on a behaviour the sources don't state. The manual's own admission that most
    bundled effect passes are undocumented beyond the composer contract, and the un-walked
    `how-to-use-post-processing.html` page, are named as open questions in `references/gotchas.md`
    section D rather than papered over.
