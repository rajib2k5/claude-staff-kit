# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D).

Pinned at three.js **r185** (npm `three@0.185.1`), read from the rendered manual pages and the
current (migrating) docs site rather than from cached memory of the library.

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[MAN-multiple-scenes]` | [threejs.org/manual/en/multiple-scenes.html](https://threejs.org/manual/en/multiple-scenes.html) | official-docs | fetched | high | the ~8-context browser cap and no cross-context resource sharing; the single-canvas + `data-diagram` registration pattern; the per-frame `setScissorTest(false)`/`clear`/`setScissorTest(true)` order; offscreen culling by rect bounds; the bottom-up scissor-Y vs top-down rect-Y conversion; identical `setScissor`/`setViewport` rectangles; per-element `camera.aspect` + `updateProjectionMatrix` every frame; the `position:fixed` scroll-skew problem and the `position:absolute` + `translateY(scrollY)` fix; the `drawImage`/`globalCompositeOperation:'copy'` alternative for normal document flow |
| `[MAN-align-html]` | [threejs.org/manual/en/align-html-elements-to-3d.html](https://threejs.org/manual/en/align-html-elements-to-3d.html) | official-docs | fetched | high | `getWorldPosition` → `Vector3.project` → NDC-to-CSS pixel transform; hiding labels via `Math.abs(z) > 1`; the origin-only visibility caveat and the named-but-unworked `Frustum.setFromProjectionMatrix` alternative; occlusion via a raycast identity check; `zIndex` sorting by projected depth; the stacking-context prerequisite for `z-index` to behave |
| `[MAN-rendering-on-demand]` | [threejs.org/manual/en/rendering-on-demand.html](https://threejs.org/manual/en/rendering-on-demand.html) | official-docs | fetched | high | the `renderRequested` flag pattern; wiring `controls`' `change` event and `window`'s `resize` event through `requestRenderIfNotRequested`; the `enableDamping` + direct `change`→`render` binding infinite-loop trap and why routing through the flag fixes it; re-requesting from inside `render()` while an animation is still settling |
| `[MAN-tips]` | [threejs.org/manual/en/tips.html](https://threejs.org/manual/en/tips.html) | official-docs | fetched | high | the hero-canvas-behind-content recipe (`position:fixed; z-index:-1; pointer-events:none`); the transparent-canvas construction (`alpha:true, premultipliedAlpha:false`); the iframe-isolation recommendation for complex pages |
| `[MAN-responsive]` | [threejs.org/manual/en/responsive.html](https://threejs.org/manual/en/responsive.html) | official-docs | fetched | high | the per-element `camera.aspect` dependency this pattern relies on, and the DPR-handling stance (`resizeRendererToDisplaySize`, no bare `setPixelRatio(window.devicePixelRatio)`) that this skill inherits rather than re-derives |
| `[API-webglrenderer]` | [threejs.org/docs/api/en/renderers/WebGLRenderer.html](https://threejs.org/docs/api/en/renderers/WebGLRenderer.html) | official-docs | fetched | high | `setScissor`/`setScissorTest`/`setViewport` method signatures backing the manual's scissor/viewport recipe |
| `[MAN-libraries-and-plugins]` | [threejs.org/manual/en/libraries-and-plugins.html](https://threejs.org/manual/en/libraries-and-plugins.html) | official-docs | fetched | high | the scope boundary — which website-shaped concerns (scroll-animation libraries, declarative scene frameworks) are third-party rather than three.js core, used to justify what this skill deliberately excludes |

## Deliberate exclusions

- **react-three-fiber, Threlte, tresjs and other declarative single-canvas wrappers** are out of
  scope here. They are scouted and skilled separately (the react-three-fiber plugin); confirmed by
  checking that R3F's own docs have no dedicated multi-viewport/scroll-scene page analogous to
  `multiple-scenes.html` — the scissor/viewport technique in this skill stays owned here even for a
  React app.
- **GSAP, ScrollTrigger, Lenis, Locomotive Scroll** are not mentioned anywhere in the three.js
  manual, nor were they found in react-three-fiber's docs during that plugin's own research. This is
  recorded as a real gap in both surfaces (see `gotchas.md` section D), not silently absorbed into
  this skill's claims.
- **The 3D content itself** — materials, lighting, glTF/OBJ loading, clip-based animation — is
  covered by sibling skills in this same plugin (`threejs-materials-lighting-shadows`,
  `threejs-gltf-asset-pipeline`, `threejs-animation-system`) and is not re-derived here.
- **OffscreenCanvas / worker-thread rendering** (`manual/en/offscreencanvas.html`) is a different
  performance technique — moving rendering off the main thread — and belongs to
  `threejs-performance-instancing`, not to this skill's on-page-layout concerns.

## Provenance note

This skill's grounding was assembled from an already-completed scout research pass
(`threejs-research.md`, section 8, "Put 3D inline with DOM content on a scrolling page") rather than
by re-fetching the manual pages directly in this session. Every procedural claim above matches that
research file's cited steps and gotchas for section 8, cross-referenced against section 1
(`responsive`/DPR) and section 6 (`align-html-elements-to-3d`, shared with the picking/interaction
skill) where the brief calls for it. No fact below the phase-file level was introduced beyond what
that research file and the validated skill brief state.
