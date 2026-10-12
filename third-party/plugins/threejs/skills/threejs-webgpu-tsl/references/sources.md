# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D).

Pinned at three.js revision **r185** (npm `three@0.185.1`), read via WebFetch against the live
manual and API docs on 2026-08-06, per the saved doc-mining research this skill was built from.

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[MAN-webgpurenderer]` | [threejs.org/manual/en/webgpurenderer.html](https://threejs.org/manual/en/webgpurenderer.html) | official-docs | fetched | high | the "still in an experimental state" framing, missing-features and possibly-worse-performance warning, `three/webgpu` import, TSL requirement, `forceWebGL`, `EffectComposer` unsupported, `WebGLRenderer` maintained with no major new features planned |
| `[MAN-webgpu-postprocessing]` | [threejs.org/manual/en/webgpu-postprocessing.html](https://threejs.org/manual/en/webgpu-postprocessing.html) | official-docs | fetched | high | `RenderPipeline`, `pass()`, `mrt()`, `renderOutput()`, the `tsl/display` effect nodes (`fxaa`, `traa`, `rgbShift`, `dotScreen`), `outputColorTransform`, MRT default type and downgrade |
| `[DOCS-WebGPURenderer]` | [threejs.org/docs/pages/WebGPURenderer.html](https://threejs.org/docs/pages/WebGPURenderer.html) | official-docs | fetched | medium | constructor options including `forceWebGL`, `multiview`, `reversedDepthBuffer` — notably without the word "experimental" (the basis of the tone discrepancy in `gotchas.md` section B) |
| `[MAN-post-processing]` | [threejs.org/manual/en/post-processing.html](https://threejs.org/manual/en/post-processing.html) | official-docs | fetched | high | cross-referenced only for its statement that `EffectComposer` is not supported under `WebGPURenderer` (capability cluster 10 in the research file) |

## Deliberate exclusions

- **Raw WGSL authoring** was named explicitly out of scope in the brief. Nothing here documents
  writing WGSL by hand.
- **Compute-shader use cases** beyond what `[MAN-webgpurenderer]` and `[MAN-webgpu-postprocessing]`
  state are out of scope — neither page walks compute shaders in any depth.
- **The WebGL post-processing stack** (`EffectComposer`, `RenderPass`, `ShaderPass`, `OutputPass`)
  belongs to the sibling skill `threejs-postprocessing-render-targets`. It appears here only as the
  thing being replaced, never as a pattern to follow on this path.
- **A browser/device support matrix** does not exist in any manual page, including this one — not
  an exclusion by choice, an absence in the source material itself (see `gotchas.md` section D).
- **A dedicated TSL manual page** does not exist. `manual/list.json` (the recovered table of
  contents) has no TSL-specific entry; the TSL vocabulary grounded here is limited to what
  `[MAN-webgpu-postprocessing]` uses for post-processing nodes.

## Provenance note

This skill substitutes a manually saved doc-mining research file
(`/home/claude/scout/threejs-research.md`, capability cluster 14, cross-referenced against cluster
10's `EffectComposer` note) for the `llm-kb` tool's automated output, because that tool is
unavailable in this environment. Every phase file's claims were checked against that research
file's section 14 before being written up here; nothing beyond the brief and that research file
was introduced. This is the thinnest-sourced skill in the `threejs` plugin — three open unknowns
are named in `gotchas.md` section D rather than papered over. If threejs.org content changes in a
later revision, or if a TSL-specific manual page is published, re-fetch the URLs above (and add
the new one) before trusting this skill's specifics.
