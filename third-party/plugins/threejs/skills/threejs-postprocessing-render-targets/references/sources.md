# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D).

Pinned at three.js revision **r185** (npm `three@0.185.1`), read via WebFetch against the live
manual and API docs on 2026-08-06, per the saved doc-mining research this skill was built from.

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[MAN-post-processing]` | [threejs.org/manual/en/post-processing.html](https://threejs.org/manual/en/post-processing.html) | official-docs | fetched | high | `EffectComposer`, `RenderPass`/`OutputPass` ordering, `ShaderPass`, `composer.setSize`, the `tDiffuse` contract, `composer.render(deltaTime)` |
| `[MAN-rendertargets]` | [threejs.org/manual/en/rendertargets.html](https://threejs.org/manual/en/rendertargets.html) | official-docs | fetched | high | `WebGLRenderTarget` construction, `setRenderTarget(rt)`/`setRenderTarget(null)` ordering, resize handling for a render target and its camera |
| `[DOCS-EffectComposer]` | [threejs.org/docs/examples/en/postprocessing/EffectComposer.html](https://threejs.org/docs/examples/en/postprocessing/EffectComposer.html) | official-docs | fetched | high | constructor, `addPass`, `setSize`/`setPixelRatio`, `dispose` |
| `[MAN-webgpu-postprocessing]` | [threejs.org/manual/en/webgpu-postprocessing.html](https://threejs.org/manual/en/webgpu-postprocessing.html) | official-docs | fetched | high | the boundary: what replaces this whole stack (`RenderPipeline`, `pass()`, `mrt()`) under `WebGPURenderer`, and that `EffectComposer` is unsupported there |
| `[MAN-color-management]` | [threejs.org/manual/en/color-management.html](https://threejs.org/manual/en/color-management.html) | official-docs | fetched | medium | why `OutputPass` placement determines whether the scene comes out right; the washed-out/dark diagnosis table applied to post-processing |
| `[B10-rendertargets]` | scout research file, capability cluster 10 ("Post-processing and render-to-texture") | derived-research | fetched | high | the full render-target + composer + custom-pass procedural sequence, cross-referenced against `[MAN-post-processing]` and `[MAN-rendertargets]` directly |
| `[B7-billboards]` | scout research file, capability cluster 7 ("Custom geometry, instancing and draw-call reduction"), the facade/billboard bullet | derived-research | fetched | high | render-target-as-facade-texture use case, referenced from `billboards.html` |
| `[B6-picking]` | scout research file, capability cluster 6 ("Make the 3D interactive"), the GPU-picking bullet | derived-research | fetched | high | the 1×1 render-target GPU-picking pattern, cited only to show the render-target contract generalizes — content itself belongs to `threejs-interaction-picking` |
| `[B5-animation]` | scout research file, capability cluster 5, the `Clock.getDelta()`/`mixer.update(dt)` bullet | derived-research | fetched | high | the general delta-time discipline cross-referenced for `composer.render(deltaTime)` |

## Deliberate exclusions

- **The WebGPU post-processing path** (`RenderPipeline`, `pass()`, `mrt()`, `renderOutput()`) is
  read from `[MAN-webgpu-postprocessing]` only far enough to state the boundary in this skill's
  scope section. The actual authoring guidance for that stack belongs to `threejs-webgpu-tsl`, a
  sibling skill.
- **GPU picking's render-target usage** (`picking.html`'s 1×1-target technique) belongs to
  `threejs-interaction-picking`. It is mentioned in phase 1 only to show that the render-to-texture
  contract this skill teaches generalizes beyond visual textures, not to teach picking itself.
- **The third-party `postprocessing` npm package**, named once in `manual/en/libraries-and-plugins.html`
  with no usage guidance, was treated as scope boundary evidence, not a source of procedural content.
- **Individual bundled effect passes** (bloom, DoF, SSAO, film grain, etc. beyond the composer
  contract itself) are explicitly named in the brief's open questions as undocumented by the manual,
  which points readers at the addon repo source instead. This skill teaches the composer/pass
  *contract* — not the parameters of any specific bundled pass — for that reason.
- **`manual/en/how-to-use-post-processing.html`** appears in `manual/list.json`'s table of contents
  but was not walked by the scout research. It is carried into `gotchas.md` section D as an open
  question rather than silently dropped.

## Provenance note

This skill substitutes a manually saved doc-mining research file
(`/home/claude/scout/threejs-research.md`) for the `llm-kb` tool's automated output, because that
tool is unavailable in this environment. Every phase file's claims were checked against that research
file's capability cluster 10 (and its cross-referenced manual pages, plus clusters 1, 6, 7, 9, and 14
for the color-management, picking, billboard, and WebGPU-boundary cross-references) before being
written up here; nothing beyond the brief and that research file was introduced. If threejs.org
content changes in a later revision, re-fetch the URLs in the table above before trusting this
skill's specifics.
