---
name: threejs-webgpu-tsl
description: Decide whether and how to move a three.js project from WebGLRenderer to WebGPURenderer with TSL node materials, and report honestly what breaks on the way. Use for "should I migrate to WebGPURenderer", "three/webgpu" and "three/tsl" imports and importmap entries, "TSL node materials", "WebGPU experimental in three.js", renderer.setAnimationLoop vs await renderer.init(), deliberately testing the "forceWebGL fallback", rewriting ShaderMaterial/RawShaderMaterial/onBeforeCompile shaders because they are unsupported, "RenderPipeline vs EffectComposer" post-processing, pass(scene, camera) plus tsl/display effect nodes, scenePass.setMRT and multiple render targets, or outputColorTransform for sRGB-input effects like FXAA/Lut3D. Does not cover raw WGSL authoring, compute-shader use cases, the WebGL post-processing stack, browser/device support matrices, or GPU vendor performance tooling.
---

# three.js WebGPURenderer + TSL

Grounded in the three.js manual and API docs @ r185 (npm `three@0.185.1`) — `webgpurenderer`,
`webgpu-postprocessing`, and the `WebGPURenderer` API reference page — plus the post-processing
manual page's `EffectComposer`-unsupported note. Every claim in the references carries a source
tag; see `references/sources.md`.

## Scope

**Covers:** the decision of whether to move a project to `WebGPURenderer`, the `three/webgpu` /
`three/tsl` import and importmap shape, constructing `WebGPURenderer` and the two ways its
async initialization is handled (`setAnimationLoop` vs `await renderer.init()`), deliberately
exercising the `{forceWebGL: true}` fallback, TSL as the mandatory shader-authoring path and what
is unsupported on it (`ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, `EffectComposer`),
rebuilding a post-processing chain as a `RenderPipeline` `outputNode` from `pass()` plus
`three/addons/tsl/display` effect nodes, `scenePass.setMRT(mrt({...}))` for multiple render
targets, `outputColorTransform = false` for sRGB-input effects, and downgrading MRT texture type
to control memory.

**Does not cover:** raw WGSL authoring, compute-shader use cases beyond what the two source pages
state, the WebGL post-processing stack (`threejs-postprocessing-render-targets`), a browser/device
support matrix (no such matrix exists anywhere in the manual, including on this page), or GPU
vendor performance tooling.

**Be honest about thinness.** Of this skill's three capability clusters, only "node
post-processing" (phase 3) has full source coverage. "Renderer migration" (phase 1) and "TSL
shader authoring" (phase 2) are marked **partial** in the source portfolio: the manual gives the
migration mechanics and the unsupported list, but there is no dedicated TSL manual page and no
worked example of authoring a custom shading node graph in the two fetched pages. Phase 2 says so
explicitly rather than inventing TSL function names to fill the gap.

## The one thing to internalise first

The two official surfaces disagree in tone, and that disagreement is itself load-bearing. The
manual says `WebGPURenderer` "is still in an experimental state," warns of missing features, and
warns some apps may be **slower** than on `WebGLRenderer`. The API reference page
(`https://threejs.org/docs/pages/WebGPURenderer.html`) omits the word "experimental" entirely and calls it "the new
alternative of `WebGLRenderer`." This skill follows the manual's framing — the conservative one —
because it is the surface that carries the actual risk language, and because `docs/pages/*` is
mid-migration at r185 and less battle-tested as a source (see `references/gotchas.md` section B).
State the risk explicitly to whoever is paying for the migration: this is a bet, not yet a
settled practice, and `WebGLRenderer` remains maintained with no plans for major new features
diverted to it.

## Workflow

Work the phases in order for a full migration decision; jump straight to one when the task is narrow.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-renderer-migration.md` | "should we move to WebGPURenderer", imports, `renderer.init()` timing, testing `forceWebGL`, framing the risk to a client or lead |
| 2 | `references/phase-02-tsl-shader-authoring.md` | any custom shader that currently uses `ShaderMaterial`/`RawShaderMaterial`/`onBeforeCompile` and must move to TSL |
| 3 | `references/phase-03-node-post-processing.md` | replacing `EffectComposer` with `RenderPipeline`, `pass()`, effect nodes, MRT, `outputColorTransform` |

Read `references/gotchas.md` whenever behaviour contradicts expectation — it lists the
manual-vs-docs tone discrepancy, traps that aren't discrepancies, and three honest unknowns (more
than any sibling skill in this plugin, because this is the thinnest-sourced one).

## Definition of done

A finished migration assessment or implementation satisfies all of these:

1. The decision to move (or not) is stated explicitly, citing the manual's "experimental" framing
   and the possibly-slower-than-WebGL warning — not silently assumed to be a safe default.
2. Imports come from `three/webgpu` and `three/tsl`, with matching importmap entries pointing at
   `three.webgpu.js` and `three.tsl.js`.
3. `renderer.setAnimationLoop(render)` is used unless frames are driven manually or the renderer is
   touched during init — in which case `await renderer.init()` runs first.
4. The `{forceWebGL: true}` fallback was actually exercised, not assumed to work because it is
   automatic.
5. Every custom shader on this path is TSL, not `ShaderMaterial`, `RawShaderMaterial`, or
   `onBeforeCompile` — all three are unsupported here.
6. Post-processing runs through a `RenderPipeline`'s `outputNode` (`pass()` + `three/addons/tsl/display`
   effect nodes), not `EffectComposer`, which is unsupported under `WebGPURenderer`.
7. Any effect needing multiple render targets uses `scenePass.setMRT(mrt({...}))`, with the
   MRT texture `type` downgraded to `UnsignedByteType` if the default RGBA16 half-float
   attachments are a memory concern.
8. Effects that require sRGB input (FXAA, Lut3D) set `outputColorTransform = false`.
9. Nothing here relies on a behaviour the sources don't state — the three open unknowns (tone
   disagreement, no TSL manual page, no browser/device support matrix) are named in
   `references/gotchas.md` section D rather than silently assumed away.
