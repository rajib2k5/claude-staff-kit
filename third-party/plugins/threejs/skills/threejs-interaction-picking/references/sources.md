# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D).

Pinned at three.js revision **r185** (npm `three@0.185.1`), read from the live threejs.org manual
and docs site via WebFetch on 2026-08-06 (see the full doc-mining report at
`/home/claude/scout/threejs-research.md` for the complete fetch log across all three.js capability
areas, not only picking/controls).

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[MAN-PICK]` | [threejs.org manual — Picking](https://threejs.org/manual/en/picking.html) | official-docs | fetched | high | pointer→canvas-relative→NDC conversion math; `Raycaster.setFromCamera`/`intersectObjects`/nearest-hit; touch mirroring with `{passive:false}`+`preventDefault`; the CPU-raycasting limitation (displacement/skinning/alpha ignored); the full GPU-picking sequence (id-encoded picking scene, `NoBlending`, `setViewOffset`, 1x1 render target, `readRenderTargetPixels`, `r<<16\|g<<8\|b` decode, matching `alphaTest`); "raycasting everything is slow, filter by importance" |
| `[DOC-ORBIT]` | [threejs.org docs — OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) | official-docs | fetched | high | the constructor signature against `renderer.domElement`; the props table (`target`, `minDistance`/`maxDistance`, `minPolarAngle`/`maxPolarAngle`, `enablePan`, `enableZoom`, `autoRotate`, `enableDamping`); the documented `update()` requirement when damping/autoRotate is on; `dispose()` |
| `[MAN-BILL]` | [threejs.org manual — Billboards](https://threejs.org/manual/en/billboards.html) | official-docs | fetched | high | `Sprite`/`SpriteMaterial` always-face-camera behavior; facade generation via render target |
| `[MAN-ALIGN]` | [threejs.org manual — Align HTML elements to 3D](https://threejs.org/manual/en/align-html-elements-to-3d.html) | official-docs | fetched | medium (per brief) | the occlusion raycast identity check pattern — noted here for completeness; the DOM-label use of this page is out of scope for this skill (see `threejs-on-web-pages`) |
| `[MAN-RT]` | [threejs.org manual — Render Targets](https://threejs.org/manual/en/rendertargets.html) | official-docs | fetched | high | general `WebGLRenderTarget` mechanics (allocate, `setRenderTarget`, render, read back, `setRenderTarget(null)`) that GPU picking's 1x1 target relies on |
| `[MAN-OFFSCREEN]` | [threejs.org manual — Rendering to an OffscreenCanvas](https://threejs.org/manual/en/offscreencanvas.html) | official-docs | fetched | high | "touch events need `preventDefault()` on the main thread or synthetic mouse events fire" — cited in touch-parity phase for the ghost-mouse-event trap |
| `[MAN-RESP]` | [threejs.org manual — Responsive Design](https://threejs.org/manual/en/responsive.html) | official-docs | fetched | high | the `setPixelRatio(devicePixelRatio)` warning and its explicit statement that losing control of the true buffer size breaks GPU picking, cited in phase 3 |
| `[NPM]` | `registry.npmjs.org/three/latest` | official-docs | fetched | high | version pin, `three@0.185.1` |

## Deliberate exclusions

- **DOM-anchored HTML label projection** (`Vector3.project`, NDC→CSS placement, z-index sorting)
  from `align-html-elements-to-3d.html` is the concern of a separate skill,
  `threejs-on-web-pages`. Only the occlusion-check concept is cross-referenced here, not the full
  label-placement recipe.
- **`TransformControls`, `DragControls`, `PointerLockControls`, `FlyControls`** and the rest of the
  addon controls family were not walked in the source research. Only `OrbitControls` is grounded.
- **`react-force-graph`/`3d-force-graph` node interaction** is a different binding with its own
  click/hover/drag wiring on top of three.js; that surface belongs to
  `react-force-graph:force-graph-interaction`, not this skill.
- **Physics-based selection or collision queries** are out of scope — three.js core ships no
  physics; `manual/en/physics.html` names third-party engines (Rapier/Jolt/PhysX/cannon-es/Ammo)
  with zero picking-specific guidance, so nothing from that page is used here.

## Provenance note

The doc-mining report notes a live site-structure finding relevant to this skill: the legacy
`docs/api/en/controls/OrbitControls.html` and `docs/examples/en/controls/OrbitControls.html` paths
both 404 at r185; the current authoritative form is the flat `docs/pages/OrbitControls.html`. This
is a documentation-URL migration, not an API behavior discrepancy — see `gotchas.md` section B for
why no API-level version-drift discrepancy is reported for this skill.
