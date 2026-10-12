# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D). Pinned at **r185** (npm `three@0.185.1`), read via the saved doc-mining research file
`threejs-research.md` (fetch method: WebFetch, run date 2026-08-06), primarily sections 7 and 9.

| Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|
| [`manual/en/optimize-lots-of-objects.html`](https://threejs.org/manual/en/optimize-lots-of-objects.html) | official-docs | fetched | high | `BufferGeometryUtils.mergeGeometries`, the ~19,000-mesh / ~19fps→~60fps measurement, ~80,000 fewer scene-graph nodes, vertex-color identity preservation |
| [`manual/en/optimize-lots-of-objects-animated.html`](https://threejs.org/manual/en/optimize-lots-of-objects-animated.html) | official-docs | fetched | high | `geometry.morphAttributes.position`/`.color` on merged geometry, `mesh.morphTargetInfluences`, the "cannot change morphAttributes after first render" constraint |
| [`docs/api/en/objects/InstancedMesh.html`](https://threejs.org/docs/api/en/objects/InstancedMesh.html) | official-docs | fetched | high | `setMatrixAt`/`setColorAt`, `instanceMatrix.needsUpdate`/`instanceColor.needsUpdate`, constructor `count` as a hard maximum, `computeBoundingSphere` after bulk updates |
| [`docs/api/en/core/BufferGeometry.html`](https://threejs.org/docs/api/en/core/BufferGeometry.html) | official-docs | fetched | high | `BufferGeometry.groups` one-draw-call-per-group / no-sharing-no-gaps rule, `morphAttributes` caveats, `dispose()` |
| [`manual/en/custom-buffergeometry.html`](https://threejs.org/manual/en/custom-buffergeometry.html) | official-docs | fetched | high | `BufferAttribute` construction, `setIndex` with `Uint16Array` under 65k vertices vs `Uint32Array` above, `computeVertexNormals()` and normal seams, `DynamicDrawUsage` for per-frame mutation |
| [`manual/en/rendering-on-demand.html`](https://threejs.org/manual/en/rendering-on-demand.html) | official-docs | fetched | high | the `renderRequested` guard pattern, wiring `controls`/`resize`/GUI `onChange` through it, the `enableDamping` + direct-`change`-binding infinite-loop trap |
| [`manual/en/offscreencanvas.html`](https://threejs.org/manual/en/offscreencanvas.html) | official-docs | fetched | high | `canvas.transferControlToOffscreen()`, the ElementProxy/ProxyManager pattern, proxying `clientWidth`/`clientHeight`/`getBoundingClientRect`/input events, the OrbitControls DOM stubs, resize-only (not reposition) handling |
| [`manual/en/billboards.html`](https://threejs.org/manual/en/billboards.html) | official-docs | fetched | high | `Sprite`/`SpriteMaterial`, facade generation by rendering an object once to a render target and reusing the texture on a sprite |
| [`manual/en/textures.html`](https://threejs.org/manual/en/textures.html) | official-docs | fetched | medium | the VRAM formula (`width * height * 4 * 1.33` bytes, independent of file compression) cited as the usual cause of mobile texture-memory crashes — confidence marked medium in the source brief, carried through unchanged here |

## Deliberate exclusions

- **react-force-graph's own performance props** (`warmupTicks`, `autoPauseRedraw`,
  `nodeResolution`, and similar) are that plugin's documented surface, not this skill's. This skill
  covers three.js core/addon-level levers only.
- **GPU vendor profiling tools** (Nsight, RenderDoc, platform-specific frame debuggers) are out of
  scope — this skill covers what three.js itself exposes as levers, not how to profile a GPU
  directly.
- **WebGPU-specific tuning** (TSL, `WebGPURenderer`, `RenderPipeline`) is the separate
  `threejs-webgpu-tsl` skill's scope. The research file's own section 14 (WebGPU/TSL) was read for
  context but is not drawn on here.
- **The scroll-page render loop itself** (`manual/en/multiple-scenes.html`, the scissor/viewport
  pattern for several diagrams on one page) is `threejs-on-web-pages`'s scope. This skill's phase 4
  covers rendering-on-demand and fixed-cost cuts for a single scene, not the multi-scene scroll
  pattern.
- **Physics and simulation cost** is explicitly stated as not part of three.js core in the research
  file's scope-boundary section, and is excluded here for the same reason.

## Provenance note

The open questions carried into `gotchas.md` section D (offscreen canvas reposition, absence of
target performance budgets) are stated in the research file itself as gaps the manual does not
close, not discrepancies found by independent verification. No version-drift diffing (of the kind
done for react-force-graph's README-vs-types) was performed here — see `gotchas.md` section B for
why.
