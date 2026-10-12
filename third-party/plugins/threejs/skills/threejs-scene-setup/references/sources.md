# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D).

Pinned at three.js revision **r185** (npm `three@0.185.1`), read via WebFetch against the live
manual and API docs on 2026-08-06, per the saved doc-mining research this skill was built from.

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[MAN-creating-scene]` | [threejs.org/manual/en/creating-a-scene.html](https://threejs.org/manual/en/creating-a-scene.html) | official-docs | fetched | high | minimal scene skeleton, `setAnimationLoop`, the mandatory third `setSize` argument |
| `[MAN-fundamentals]` | [threejs.org/manual/en/fundamentals.html](https://threejs.org/manual/en/fundamentals.html) | official-docs | fetched | high | Scene/Camera/Renderer/Mesh/Geometry/Material relationships, importmap basics, the html/body/#c CSS contract, radians-vs-degrees |
| `[MAN-responsive]` | [threejs.org/manual/en/responsive.html](https://threejs.org/manual/en/responsive.html) | official-docs | fetched | high | `resizeRendererToDisplaySize`, the anti-`setPixelRatio` stance, the `maxPixelCount`/`sqrt` render-scale cap |
| `[MAN-scenegraph]` | [threejs.org/manual/en/scenegraph.html](https://threejs.org/manual/en/scenegraph.html) | official-docs | fetched | high | `Object3D` hierarchy, `parent.add`/`remove`, the scale-inheritance trap, world-position queries, `AxesHelper`/`GridHelper` with `depthTest`/`renderOrder` |
| `[MAN-cameras]` | [threejs.org/manual/en/cameras.html](https://threejs.org/manual/en/cameras.html) | official-docs | fetched | high | frustum, near/far, z-fighting, `logarithmicDepthBuffer` |
| `[MAN-color-management]` | [threejs.org/manual/en/color-management.html](https://threejs.org/manual/en/color-management.html) | official-docs | fetched | high | `ColorManagement.enabled` default, `colorSpace` annotation, the washed-out/dark diagnosis table |
| `[MAN-install]` | [threejs.org/manual/en/installation.html](https://threejs.org/manual/en/installation.html) | official-docs | fetched | high | npm install, importmap CDN pattern, `three/addons/`, community-maintained TS types |
| `[MAN-setup]` | [threejs.org/manual/en/setup.html](https://threejs.org/manual/en/setup.html) | official-docs | fetched | high | local server requirement, `file://` failure mode |
| `[MAN-tips]` | [threejs.org/manual/en/tips.html](https://threejs.org/manual/en/tips.html) | official-docs | fetched | high | transparent canvas, `preserveDrawingBuffer`, `tabindex`, three.js-as-page-background pattern |
| `[MAN-webxr]` | [threejs.org/manual/en/webxr-basics.html](https://threejs.org/manual/en/webxr-basics.html) | official-docs | fetched | high | `setAnimationLoop` as a WebXR requirement, HTTPS requirement, 1 unit = 1 metre convention |
| `[DOCS-WebGLRenderer]` | [threejs.org/docs/api/en/renderers/WebGLRenderer.html](https://threejs.org/docs/api/en/renderers/WebGLRenderer.html) | official-docs | fetched | high | constructor params (`antialias`, `logarithmicDepthBuffer`), `outputColorSpace`, `shadowMap`, `xr`, `setScissor`/`setViewport` |
| `[B5-scenegraph]` | scout research file, capability cluster 5 ("Compose a scene graph and animate it") | derived-research | fetched | high | the scene-graph-composition half of cluster 5, cross-referenced against `[MAN-scenegraph]` directly |

## Deliberate exclusions

- **`manual/en/primitives.html`** (the primitive-geometry parameter catalog) was named explicitly
  in the brief as out of scope for this skill — reference lookup, not competence this skill needs to
  encode.
- **Materials, lights, shadows** (`manual/en/materials.html`, `lights.html`, `shadows.html`) belong
  to `threejs-materials-lighting-shadows`, a sibling skill. Only load-bearing incidental mentions
  (e.g. a placeholder `AmbientLight` in a phase-1 skeleton) appear here, and are flagged as
  placeholders.
- **Asset loading** (`load-gltf.html`, `load-obj.html`, `loading-3d-models.html`, `GLTFLoader` docs)
  belongs to `threejs-gltf-asset-pipeline`.
- **Multi-viewport/scroll-page patterns** (`multiple-scenes.html`, `align-html-elements-to-3d.html`)
  belong to `threejs-on-web-pages`.
- **The animation-clip system** (`animation-system.html`, `AnimationMixer` docs) belongs to
  `threejs-animation-system`.
- **Debugging technique pages** (`debugging-javascript.html`, `debugging-glsl.html`) belong to
  `threejs-debugging-diagnostics`; this skill only borrows the framing-checklist contrast (phase 5)
  that a wide `near`/`far` debugging range is not a production default.
- **react-three-fiber and its docs** were not treated as sources here. The sibling react-three-fiber
  plugin's `r3f-canvas-and-app-integration` and `r3f-scene-graph-authoring` skills are the authority
  for mounting and JSX-expression mechanics; this skill covers the underlying three.js concepts those
  skills wrap.

## Provenance note

This skill substitutes a manually saved doc-mining research file
(`/home/claude/scout/threejs-research.md`) for the `llm-kb` tool's automated output, because that
tool is unavailable in this environment. Every phase file's claims were checked against that research
file's capability clusters 1 and 5 (and their cross-referenced manual pages) before being written up
here; nothing beyond the brief and that research file was introduced. If threejs.org content changes
in a later revision, re-fetch the URLs in the table above before trusting this skill's specifics.
