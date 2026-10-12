---
name: threejs-interaction-picking
description: Let a user orbit, hover, and click 3D objects in three.js reliably. Covers OrbitControls setup and its update()/dispose() lifecycle; CPU raycasting via pointer-to-NDC conversion and Raycaster.setFromCamera/intersectObjects; GPU picking (an id-encoded pickingScene, camera.setViewOffset, a 1x1 WebGLRenderTarget, readRenderTargetPixels) for when raycasting is quietly wrong on displaced, skinned, or alpha-cut meshes; matching alphaTest between pick and display materials; and touch parity via touchstart/touchmove/touchend. Use for "OrbitControls not working", "raycasting not detecting the right object", "click/hover a 3D object", "pick alpha-cut or skinned mesh", "GPU picking", "camera.setViewOffset", "touch controls for a three.js scene", or Sprite billboard markers as pickable targets.
---

# three.js interaction and picking

Grounded in the three.js manual and docs @ r185 (npm `three@0.185.1`). Every claim in the
references carries a source; see `references/sources.md`.

## Scope

**Covers:** `OrbitControls` construction against `renderer.domElement` (target, min/maxDistance,
min/maxPolarAngle, enablePan, enableZoom, autoRotate) and its `update()`/`dispose()` lifecycle;
converting a pointer event to normalized device coordinates and running `Raycaster` against the
scene (CPU raycasting); GPU picking via a parallel id-encoded picking scene and a 1x1 render
target, for the cases CPU raycasting gets wrong; matching `alphaTest` between pick and display
materials; touch parity for pointer-driven picking; `Sprite`/`SpriteMaterial` billboards used as
pickable markers.

**Does not cover:** DOM-anchored HTML labels projected onto 3D positions — that is
`threejs-on-web-pages`. `TransformControls`, `DragControls`, and the rest of the addon controls
family — not walked in the source material, only `OrbitControls` is grounded here. Node
interaction inside a `react-force-graph`/`3d-force-graph` scene — that belongs to
`react-force-graph:force-graph-interaction`, which owns its own click/hover/drag wiring on top of
three.js. Physics-based selection or collision queries — there is no physics in three.js core.
Camera choreography and scroll-driven camera paths.

## The one thing to internalize first

CPU raycasting does not see what the GPU renders — it tests rays against the **geometric
silhouette** of a mesh. A vertex shader displacing geometry, a skinned mesh bent by bones, or a
texture with `alphaTest`-cut holes all look different on screen than the raycaster believes they
are. The raycaster will not error or warn; it will confidently return a hit (or a miss) that is
wrong for exactly the object the user is looking at. The real skill in this domain is recognizing
that pattern fast and reaching for GPU picking (`references/phase-03-gpu-picking.md`) instead of
re-debugging NDC math that was already correct.

## Workflow

Work the phases in order for a new interactive scene; jump straight to one when the task is narrow.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-camera-control.md` | first `OrbitControls`, camera limits, damping/autoRotate not moving, teardown/dispose |
| 2 | `references/phase-02-cpu-raycasting.md` | click/hover a 3D object, wrong object picked, coordinates wrong on resize, nearest-hit logic |
| 3 | `references/phase-03-gpu-picking.md` | raycasting is silently wrong on displaced/skinned/alpha-cut geometry, too many objects to raycast every frame, pixel-accurate picking |
| 4 | `references/phase-04-touch-parity.md` | touch controls for a three.js scene, browser stealing the gesture, mobile click/hover parity |

Read `references/gotchas.md` whenever behavior contradicts what you expect — it lists the silent
failure modes, an honest look at version drift, and the traps that produce no error message.

## Definition of done

An interactive scene satisfies all of these:

1. `OrbitControls` has explicit `target`, `minDistance`/`maxDistance`, and
   `minPolarAngle`/`maxPolarAngle` — the user cannot orbit through the floor or zoom into the
   near-clip plane and break the shot.
2. `controls.update()` runs every frame the render loop is active whenever `enableDamping` or
   `autoRotate` is on, and `controls.dispose()` runs on teardown.
3. Pointer coordinates are derived from `canvas.getBoundingClientRect()` and the NDC formula, never
   from raw `clientX`/`clientY` against the window.
4. Every raycast target list is deliberately scoped (not "all of `scene.children`" by default on a
   nontrivial scene) — picking filters by importance, not by completeness.
5. If any pickable mesh uses vertex displacement, skinning, or `alphaTest` cutouts, picking against
   it goes through the GPU picking path, and the picking material's `alphaTest` matches the display
   material's.
6. Mouse-driven picking has a touch-event mirror (`touchstart`/`touchmove`/`touchend`) registered
   with `{passive: false}` and `preventDefault()` on start, so the browser does not hijack the
   gesture as a scroll or a synthesized mouse click.
7. Nothing in the implementation relies on a behavior the sources do not state. The two real
   unknowns (addon controls beyond `OrbitControls`, and an object-count threshold for switching to
   GPU picking) are listed in `references/gotchas.md` section D; if the work depends on one, verify
   it empirically and say so rather than assuming.
