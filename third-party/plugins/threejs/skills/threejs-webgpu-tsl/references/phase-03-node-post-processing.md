# Phase 3 — Node post-processing

**Triggers:** "RenderPipeline vs EffectComposer", replacing `EffectComposer` under
`WebGPURenderer`, `pass(scene, camera)`, `scenePass.setMRT`, `outputColorTransform`, FXAA/Lut3D
looking wrong under WebGPURenderer, MRT memory usage.

**Source coverage: full.** This cluster is grounded directly in `webgpu-postprocessing.html`,
cross-referenced against the `post-processing.html` manual page's note that `EffectComposer` is
not supported under `WebGPURenderer`.

## Why EffectComposer doesn't carry over

The classic WebGL post-processing stack — `EffectComposer` + `RenderPass` + effect passes +
`OutputPass` — is explicitly unsupported under `WebGPURenderer`. If a project's post-processing
chain currently uses `EffectComposer` (see the sibling skill `threejs-postprocessing-render-targets`
for that pattern), it has to be rebuilt as a `RenderPipeline` before it will run on this path.

## The RenderPipeline shape

Build the chain as a node graph and assign it to `pipeline.outputNode`, starting from a
`pass(scene, camera)` node and composing effect nodes from `three/addons/tsl/display` on top of
it:

```js
import { pass } from 'three/tsl';
import { fxaa, rgbShift, dotScreen } from 'three/addons/tsl/display/...'; // per-effect module

const scenePass = pass(scene, camera);

const pipeline = /* RenderPipeline instance */;
pipeline.outputNode = fxaa(scenePass); // or a longer chain: dotScreen(rgbShift(scenePass))
```

The four named effect nodes in this skill's sources are `fxaa`, `traa`, `rgbShift`, and
`dotScreen`, all under `three/addons/tsl/display`. This is the concrete, sourced vocabulary for
this cluster — there is no broader catalogue of `tsl/display` effect nodes walked here.

## Multiple render targets (MRT)

When an effect needs more than one render target (for example, an output buffer plus a velocity
buffer for a motion-blur or TAA-style effect), attach them to the scene pass with `setMRT`:

```js
import { mrt, output, velocity } from 'three/tsl';

scenePass.setMRT(mrt({ output, velocity }));
```

## Controlling MRT memory

MRT attachments default to `RGBA16` half-float. On a complex setup with several attachments, that
adds up; downgrade the texture type explicitly where full float precision isn't needed:

```js
scenePass.getTextureNode('output').value.type = THREE.UnsignedByteType;
// (exact accessor depends on how the pass exposes its render-target texture;
// the sourced fact is the default type and the downgrade target, not a single fixed API call)
```

The sources state the default (`RGBA16` half-float) and the recommended downgrade
(`UnsignedByteType`) as facts; they do not show one single canonical line of code for reaching the
texture object on every pass type, so treat the accessor above as illustrative rather than a
verbatim quote.

## sRGB input effects: outputColorTransform

Tone mapping and colour-space conversion happen at the end of the `RenderPipeline` chain by
default. Effects that need to operate on sRGB-encoded input — the sources name **FXAA** and
**Lut3D** specifically — need that conversion to happen *before* they run, not after. Set:

```js
pipeline.outputColorTransform = false;
```

when using such an effect, so the colour transform doesn't happen twice (or in the wrong order)
relative to the effect that expects sRGB input.

## Checklist for a rebuilt chain

1. Confirm the chain no longer references `EffectComposer`, `RenderPass`, `ShaderPass`, or
   `OutputPass` — none of that stack applies here.
2. `pipeline.outputNode` is built from `pass(scene, camera)` plus effect nodes from
   `three/addons/tsl/display`.
3. Any effect needing extra buffers uses `scenePass.setMRT(mrt({...}))`.
4. MRT texture `type` is downgraded from the RGBA16 half-float default when memory matters.
5. `outputColorTransform = false` is set whenever an sRGB-input effect (FXAA, Lut3D) is in the
   chain.
