---
name: threejs-debugging-diagnostics
description: Work out systematically why a three.js scene shows nothing — instead of changing values at random until something appears. Trigger on "three.js black screen / nothing renders", "canvas is blank", "object invisible", "scene renders nothing", "shader looks wrong", "GLSL bisect", "NaN in position", "matrix has NaN", "z is undefined", "how to debug a three.js scene", "gl_FragColor debugging", "vNormal as colour", "fract(vUv)", "CameraHelper not showing", "DirectionalLightHelper", "AxesHelper invisible", "requestAnimationFrame hides errors", "?debug=true logger", or "why is my three.js scene black". Not for writing regression tests once the bug is fixed, GPU vendor profilers/frame capture, general browser DevTools instruction, or performance/fps diagnosis.
---

# three.js debugging and diagnostics

Grounded in the three.js manual @ r185 (npm `three@0.185.1`) — `debugging-javascript.html`,
`debugging-glsl.html`, and cross-referenced (medium confidence) against `cameras.html`,
`scenegraph.html`, and `transparency.html`. Every claim in the references carries a source tag; see
`references/sources.md`.

## Scope

**Covers:** the fixed-order triage for a blank canvas (console hygiene, the `MeshBasicMaterial`
red-swap isolation test, temporarily widening the camera frustum plus `OrbitControls`); hunting
`NaN`/`Infinity` in positions and matrices, including the documented 2D-`SplineCurve`-into-`Vector3`
case that leaves `z` undefined; the unit rules (degrees only for `PerspectiveCamera.fov`, radians
everywhere else, 1 unit = 1 metre); moving `requestAnimationFrame` to the end of the render function
so a thrown error halts the loop instead of hiding it; an on-screen `?debug=true` logger; the GLSL
solid-colour bisect that separates vertex-stage from fragment-stage shader failures; visualising
values scaled into 0–1 (`vNormal*0.5+0.5`, `fract(vUv)`) and the Shader Editor extension; and
in-scene instrumentation with `CameraHelper`/`DirectionalLightHelper`/`SpotLightHelper`/
`AxesHelper`/`GridHelper`, `depthTest = false`, and `renderOrder`.

**Does not cover:** writing the regression test once a bug is fixed and reproduced — hand that off to
`deterministic-headless-validation`, which owns turning a fixed repro into a deterministic,
framework-free check. Also out of scope: GPU vendor profilers and frame-capture tools; general
browser DevTools instruction (this skill assumes you can already open the console); and
performance/fps diagnosis as opposed to correctness — see `threejs-performance-instancing` for "it
runs but it's slow."

## The one thing to internalise first

**Triage in a fixed order, don't theorise first.** A blank canvas has exactly a handful of usual
suspects — a console error, a geometry/material/lighting split, a framing problem, a `NaN` in the
data, a wrong unit, or a swallowed exception — and the manual's own debugging pages walk them in a
specific, cheap-to-expensive order. Read the console and swap in `MeshBasicMaterial({color: 'red'})`
*before* you touch the camera or start hunting for `NaN`s; widen the camera and hunt for `NaN`s
*before* you start theorising about shaders. Skipping steps to jump straight to a guess is exactly
the "change values at random" behaviour this skill exists to replace. The same discipline applies to
shaders one level down: a vertex-stage bug renders as *nothing*, so the solid-colour bisect
(`gl_FragColor = vec4(1,0,0,1)`) must happen before any fragment-shader theorising, or you'll debug
the wrong stage.

## Workflow

Work the phases in order on a fresh "nothing renders" report; jump straight to one when the symptom
is already narrowed.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-black-screen-triage.md` | first report of a blank/black canvas, console hygiene, `MeshBasicMaterial` red-swap, widening `near`/`far` + `OrbitControls` to rule out framing |
| 2 | `references/phase-02-numeric-fault-hunting.md` | triage didn't find it, hunting `NaN`/`Infinity` in positions/matrices, `SplineCurve`→`Vector3` leaving `z` undefined, degrees-vs-radians mistakes, a thrown error that silently kills the loop, wiring an on-screen `?debug=true` logger |
| 3 | `references/phase-03-shader-bisection.md` | the object exists but the shader output looks wrong, `ShaderMaterial`/`RawShaderMaterial` debugging, solid-colour bisect, visualising normals/UVs as colour, the Shader Editor extension |
| 4 | `references/phase-04-in-scene-instrumentation.md` | making invisible state visible — camera frusta, light directions/cones, local axes/grids — while debugging any of the above |

Read `references/gotchas.md` whenever behaviour contradicts what you expect — it lists silent
failures, the honest result of checking for version-drift discrepancies, traps that aren't
discrepancies, and the open questions the manual doesn't answer.

## Definition of done

A finished debugging pass satisfies all of these:

1. The console was read first, and it shows 0–2 messages on a healthy page — anything else was
   investigated before touching code. "Disable Cache (while DevTools is open)" was enabled so a
   stale bundle isn't the actual cause.
2. If the object was invisible, `MeshBasicMaterial({color: 'red'})` was swapped in to confirm
   whether the fault is geometry/transform (still invisible) or lighting/material (now visible)
   before spending time on either theory.
3. Framing was ruled out by temporarily setting `near = 0.001`, `far = 1000000`, and attaching
   `OrbitControls`, rather than assumed.
4. Positions and matrices were inspected in the debugger for `NaN`/`Infinity` — including checking
   any curve or path math (the documented failure is a 2D `SplineCurve` fed into a `Vector3`,
   leaving `z` undefined) — before concluding the geometry itself is wrong.
5. Units were checked explicitly: degrees only on `PerspectiveCamera.fov`, radians everywhere else,
   and 1 unit = 1 metre (this matters for PBR response and any XR path).
6. `requestAnimationFrame`/the render call sits at the **end** of the render function, so a thrown
   error stops the loop visibly instead of silently scheduling over it.
7. For a shader bug, the solid-colour bisect (`gl_FragColor = vec4(1,0,0,1)`) ran and separated
   vertex-stage from fragment-stage failure *before* any fragment-side theorising, and suspect
   values were visualised scaled into 0–1 (`vNormal*0.5+0.5`, `fract(vUv)`) rather than guessed at.
8. Any helper added to see invisible state (`CameraHelper`, `DirectionalLightHelper`,
   `SpotLightHelper`, `AxesHelper`, `GridHelper`) has `material.depthTest = false` and a deliberate
   `renderOrder`, or it can itself be invisible and mislead the triage.
9. Once the cause is confirmed and fixed, the reproduction was handed off to
   `deterministic-headless-validation` to lock it in as a regression check — this skill does not
   write that test itself.
10. Nothing here relies on a behaviour the manual doesn't state. The two open gaps — no sourced
    "is WebGL even available" check, and no sourced guidance on reading `renderer.info` as a
    diagnostic — are named in `references/gotchas.md` section D rather than silently assumed away.
