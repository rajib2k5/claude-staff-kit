# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D).

Pinned at three.js revision **r185** (npm `three@0.185.1`), read via WebFetch against the live
manual on 2026-08-06, per the saved doc-mining research this skill was built from
(`/home/claude/scout/threejs-research.md`, capability cluster 12, "Diagnose a scene that renders
nothing (JS + GLSL)").

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[MAN-debugging-js]` | [threejs.org/manual/en/debugging-javascript.html](https://threejs.org/manual/en/debugging-javascript.html) | official-docs | fetched | high | console-hygiene baseline ("0–2 messages"), "Disable Cache (while DevTools is open)", the `MeshBasicMaterial` red-swap isolation test, widening `near`/`far` + `OrbitControls` to rule out framing, `NaN`/`Infinity` hunting in positions/matrices, the 2D-`SplineCurve`-into-`Vector3` example leaving `z` undefined, the degrees-only-for-`fov` / radians-elsewhere / 1-unit-1-metre unit rules, moving `requestAnimationFrame` to the end of the render function, the `?debug=true` on-screen logger pattern |
| `[MAN-debugging-glsl]` | [threejs.org/manual/en/debugging-glsl.html](https://threejs.org/manual/en/debugging-glsl.html) | official-docs | fetched | high | the `gl_FragColor = vec4(1,0,0,1)` solid-colour bisect and the vertex-shows-as-nothing rule that makes it precede fragment theorising, visualising `vNormal*0.5+0.5` and `fract(vUv)` as colour, the Shader Editor browser extension |
| `[MAN-cameras]` | [threejs.org/manual/en/cameras.html](https://threejs.org/manual/en/cameras.html) | official-docs | fetched | medium | frustum, near/far, and z-fighting — documented generally for camera setup, cross-referenced here as a cause of invisible/flickering geometry rather than framed by the source itself as a debugging technique |
| `[MAN-scenegraph]` | [threejs.org/manual/en/scenegraph.html](https://threejs.org/manual/en/scenegraph.html) | official-docs | fetched | medium | `AxesHelper`/`GridHelper` (and by the same pattern `CameraHelper`/`DirectionalLightHelper`/`SpotLightHelper`) needing `material.depthTest = false` and a deliberate `renderOrder` to remain visible against overlapping geometry |
| `[MAN-transparency]` | [threejs.org/manual/en/transparency.html](https://threejs.org/manual/en/transparency.html) | official-docs | fetched | medium | the transparency sort-order problem and the `BackSide`/`FrontSide` double-mesh technique, cross-referenced here as a source of symptoms that look like a rendering bug but are the documented behaviour of the sort order |
| `[B12]` | scout research file, capability cluster 12 ("Diagnose a scene that renders nothing (JS + GLSL)") | derived-research | fetched | high | the full ordered triage steps 1–8 as distilled from `[MAN-debugging-js]`/`[MAN-debugging-glsl]` directly, and the cross-reference list (`cameras`, `scenegraph`, `shadows`) attached to that cluster |

## Deliberate exclusions

- **Writing the regression test once a bug is fixed** belongs to `deterministic-headless-validation`,
  a sibling skill in a different plugin — named explicitly in the brief as the hand-off owner. This
  skill stops at diagnosis and fix.
- **GPU vendor profilers and frame-capture tools** (e.g. browser GPU inspectors, RenderDoc-style
  capture) are out of scope per the brief; no manual page in the research covers them as a three.js
  debugging technique.
- **General browser DevTools instruction** (how to open the console, set a breakpoint, use the
  Sources panel) is assumed prior knowledge, not sourced or taught here.
- **Performance/fps diagnosis** — as opposed to correctness — is `threejs-performance-instancing`'s
  scope, a sibling skill in this plugin. Draw-call counts, frame budgets, and instancing are not
  repeated here even though `debugging-javascript.html`'s neighbourhood in the manual touches
  adjacent material.
- **`shadows.html`** is listed alongside `cameras.html`/`scenegraph.html` in the research's
  cross-reference list for capability cluster 12, but no shadow-specific debugging content from it
  made it into these phase files — the research's own step-by-step (steps 1–8) doesn't cite any
  shadow-specific technique, and inventing one beyond what's sourced would violate this skill's
  grounding rule. If a shadow-specific debugging need arises, treat it as unsourced (see
  `gotchas.md` section D) rather than assuming `shadows.html` covers it.

## Provenance note

This skill substitutes a manually saved doc-mining research file
(`/home/claude/scout/threejs-research.md`) for the `llm-kb` tool's automated output, because that
tool is unavailable in this environment. Every phase file's claims were checked against that
research file's capability cluster 12 (and its cited cross-reference pages) before being written up
here; nothing beyond the brief and that research file was introduced. If threejs.org content changes
in a later revision, re-fetch the URLs in the table above before trusting this skill's specifics.
