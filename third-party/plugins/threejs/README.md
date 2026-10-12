# threejs plugin

Ten grounded skills covering **three.js** end to end — from an empty HTML page to a
production-budgeted, debuggable, DPI-correct WebGL (and, cautiously, WebGPU) scene.

Built by `skillsmith:skill-forge` from a complete `skill-scout` portfolio of
**threejs.org** (manual + docs, r185 / npm `three@0.185.1`), doc-mined 2026-08-06 by walking
`manual/en/<slug>.html` and `docs/pages/<Class>.html` rather than summarizing the landing page.
Every claim in every reference file traces to a tagged source; each skill ships its own
`references/sources.md`. Where the sources are silent, the skills say so explicitly instead of
filling the gap from priors — each skill's `references/gotchas.md` carries a labelled "honest
unknowns" section rather than a confident-sounding guess.

This is the whole scouted surface. Nothing in the portfolio's `build_order` was left unbuilt.

## The skills

Read 1 first for any new project; the rest are entered directly by problem.

| # | Skill | What it makes you good at |
|---|---|---|
| 1 | **threejs-scene-setup** | Standing up a renderer, canvas and scene graph that survives resize, mobile DPI and tab-switching — and not falling into the `setPixelRatio(devicePixelRatio)` trap almost every copied tutorial ships |
| 2 | **threejs-on-web-pages** | Putting 3D inline with real page content on ONE shared WebGL context — scroll-synced diagram viewports, a hero canvas behind text, DOM-anchored labels — instead of burning through the browser's ~8-context cap |
| 3 | **threejs-gltf-asset-pipeline** | Getting an artist's `.glb`/`.obj` into the scene at the right scale, orientation, lighting and colour, and disposing it cleanly on route change |
| 4 | **threejs-materials-lighting-shadows** | Picking the cheapest material tier that still looks right, budgeting texture VRAM against a real formula, and lighting/shadowing at a cost a mid-range phone can hold |
| 5 | **threejs-performance-instancing** | Collapsing draw calls, instancing movable copies, authoring custom geometry, and deciding when *not* to render a frame at all |
| 6 | **threejs-interaction-picking** | OrbitControls, CPU raycasting, and the GPU-picking fallback for the cases (displaced, skinned, alpha-cut geometry) where raycasting is quietly wrong |
| 7 | **threejs-animation-system** | Clip playback and blending through `AnimationMixer`, and morph-target animation for geometry that's been merged away from independent movement |
| 8 | **threejs-postprocessing-render-targets** | Bloom/grain/custom shader passes via `EffectComposer`, and render-to-texture for mirrors, screens and facades, without breaking colour management |
| 9 | **threejs-debugging-diagnostics** | Triaging a black screen, hunting NaNs, and bisecting a broken shader in a fixed number of steps instead of by guesswork |
| 10 | **threejs-webgpu-tsl** | Evaluating the WebGPURenderer/TSL migration honestly — including the two official sources disagreeing on how experimental it still is |

Each skill is independently installable. They cross-reference each other and the sibling
**react-three-fiber** plugin by name, but none depends on another being present.

## The react-three-fiber relationship

This portfolio has a sibling: **react-three-fiber**, scouted the same day against
`r3f.docs.pmnd.rs`. That scout's own boundary research is the load-bearing finding for both
portfolios: R3F **wraps rather than replaces** 8 of these 10 clusters — same three.js concepts,
JSX syntax (`args`, `attach`, `extend()` are, per R3F's own docs, "no new concepts, just new
syntax"). `threejs-scene-setup`, `threejs-on-web-pages` and `threejs-gltf-asset-pipeline` name
the corresponding R3F skill explicitly in their **Does not cover** sections. Only Canvas-mounting
boilerplate is genuinely replaced for React apps; post-processing and debugging are covered by
neither surface. Reach for react-three-fiber's skills when the app is React and for these ten
either way — the underlying competence is the same.

## Verification is a separate skill

`threejs-debugging-diagnostics` deliberately does **not** cover writing regression tests for a
bug once it's fixed — that belongs to **`deterministic-headless-validation`**, which this
portfolio recommends extending (see below) with a concrete three.js stub surface: what to fake
for `WebGLRenderer`/`HTMLCanvasElement`/`requestAnimationFrame`, what a scene-graph snapshot
assertion looks like, and a deterministic-clock pattern for `mixer.update(delta)`.

## Not made into skills, deliberately

| Candidate | Why not |
|---|---|
| General three.js WebXR / VR setup | **Extend, don't duplicate.** `react-force-graph:force-graph-immersive-xr` already owns VR/AR; this portfolio recommends adding `renderer.xr.enabled`, `VRButton`, `setAnimationLoop`-is-mandatory-for-XR, metre-scale modelling, and the HTTPS-on-LAN dev loop to that skill rather than shipping a thinner standalone one — two of the three source pages for a standalone WebXR candidate (`webxr-look-to-select`, `webxr-point-to-select`) were never walked. |
| A concrete three.js test-harness profile | **Extend, don't duplicate.** `deterministic-headless-validation` already claims canvas/WebGL/three.js coverage generically; this portfolio recommends the concrete stub surface described above rather than a new skill competing with it. |
| The custom-`Object3D`-disposal contract inside `nodeThreeObject` | **Extend, don't duplicate.** `react-force-graph:force-graph-threejs-scene` hands ownership of the render loop and lighting to the caller but doesn't say the caller also owns disposal — recommended as an addition there, grounded in `cleanup.html`. |
| `threejs-physics` | **Wrong surface.** three.js ships no physics; the manual's own physics page is a pointer to Rapier/Jolt/PhysX/cannon-es/Ammo.js. A real skill here would be grounded in another project's docs, not this one. |
| `threejs-primitives-catalog` | **Reference lookup, not competence.** Memorising `BoxGeometry`/`SphereGeometry`/`TextGeometry` constructor arguments is a parameter catalog, not a job — folded into `threejs-scene-setup` as a pointer. |
| `threejs-editor` | **Source problem, not a coverage judgment.** The online editor at threejs.org/editor is a GUI tool; no documentation for it was walked in this run, so there is nothing to ground a skill in. |

## Real gaps — worth surfacing, nothing built

Neither this surface nor react-three-fiber's docs cover these; they're named so a future scout
run knows what to go find documentation for, not because the job doesn't exist:

- **Scroll choreography** — GSAP, ScrollTrigger, Lenis, Locomotive Scroll are never mentioned in
  either surface's docs, even though three.js's own multi-scene scissor/viewport mechanics
  (`threejs-on-web-pages`) are well documented.
- **Custom GLSL/ShaderMaterial authoring** — `debugging-glsl.html` teaches how to *diagnose* a
  shader; no walked page teaches how to *write* one against three.js's uniform/attribute contract.
- **Bundler/SSR/framework integration for non-React setups** — `installation.html` names Vite
  once and stops; no vanilla/Svelte/Vue guidance exists (React is covered by the sibling plugin).
- **Loading UX and progressive enhancement** — no preloader design, LOD streaming, no-WebGL
  fallback, or `prefers-reduced-motion` guidance in either surface.
- **Accessibility for canvas content** — nothing beyond a `tabindex` mention in `tips.html`.
- **Asset authoring/optimization toolchain** — `gltf-transform` and `gltfpack` are never named;
  only the runtime decoder wiring (`setDRACOLoader`/`setKTX2Loader`/`setMeshoptDecoder`) is
  documented.
- **Browser/device support matrix** — `installation.html` gives none, and neither does the
  WebGPU page, so "will this run on the client's fleet?" cannot be answered from the docs.

## Shared source base

| Source | Grounds |
|---|---|
| `threejs.org/manual/en/*` (manual, r185) | the procedural spine of every skill — setup, scene graph, materials, lights, shadows, loading, performance, post-processing, debugging |
| `threejs.org/docs/pages/*` and legacy `docs/api/en/*` (API reference, mid-migration at r185) | constructor signatures and options for `WebGLRenderer`, `WebGPURenderer`, `GLTFLoader`, `OrbitControls`, `AnimationMixer`, `InstancedMesh`, `BufferGeometry`, `MeshPhysicalMaterial` |
| `threejs.org/docs/examples/en/postprocessing/EffectComposer.html` | `EffectComposer` constructor, passes, resize, dispose |
| `manual/list.json` | recovered the manual's real table of contents — `manual/` itself returns only the SPA shell |
| `registry.npmjs.org/three/latest` | the pinned version, `0.185.1` |
| the sibling react-three-fiber plugin's own boundary research | the R3F-wraps-not-replaces finding cross-referenced into three of these ten skills |

## Version pinning matters here

Pinned at **three.js r185 (npm `three@0.185.1`)**. Two things surfaced while building this that
are worth carrying forward on any upgrade, rather than the README-vs-types drift the sibling
`react-force-graph` plugin found in its own version:

- **The docs site is mid-migration.** The manual (`manual/en/<slug>.html`) is stable and was
  never hash-broken; the API reference is transitioning from `docs/api/en/<category>/<Class>.html`
  to a flat `docs/pages/<ClassName>.html`, and several legacy paths (`OrbitControls`,
  `GLTFLoader`, `AnimationMixer` under the old `docs/api/en/...` and `docs/examples/en/...` forms)
  already 404. `threejs-webgpu-tsl` and `threejs-gltf-asset-pipeline` cite the new `docs/pages/*`
  form for exactly this reason — re-check both forms on upgrade.
- **The two official surfaces disagree on how experimental WebGPURenderer still is.** The manual
  calls it "still in an experimental state" and warns of slower performance than WebGL; the API
  reference page omits that word entirely. `threejs-webgpu-tsl` follows the manual's framing as
  the conservative one and states the discrepancy explicitly rather than picking a side silently
  — re-check this on every three.js upgrade, since it's the kind of gap that closes without an
  announcement.

These are observations about this version. Re-check them on upgrade, the same way the sibling
plugin's `gotchas.md` files ask you to re-check theirs.
