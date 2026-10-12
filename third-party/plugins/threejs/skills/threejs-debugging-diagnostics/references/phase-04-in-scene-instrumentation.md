# Phase 4 — In-scene instrumentation

**Triggers:** need to see where a camera is actually pointed/framed, where a light is aimed, where an
object's local axes sit, or why an added helper isn't showing up; flickering or z-fighting geometry;
a transparency-related visual glitch that looks like a rendering bug.

## Helpers make invisible state visible

Several three.js helper objects exist specifically to draw normally-invisible state directly into the
scene, so you can see it instead of inferring it from numbers: `CameraHelper` (draws a camera's
frustum), `DirectionalLightHelper`/`SpotLightHelper` (draw a light's position and aim direction),
`AxesHelper` (draws local X/Y/Z axes), and `GridHelper` (draws a ground-plane grid for scale/
orientation reference). Add whichever is relevant to whatever you're debugging in phases 1–3: a
`CameraHelper` while debugging framing (phase 1), an `AxesHelper` on a node while debugging a
transform/parenting issue, a light helper while confirming a light is actually pointed at the object
the red-swap test (phase 1) implicated. [MAN-debugging-js] [MAN-scenegraph]

## Helpers need depthTest = false and a renderOrder to actually be visible

A helper is drawn with ordinary depth-tested geometry by default, exactly like anything else in the
scene. That means a helper positioned at or near real geometry can lose the depth test against that
geometry and simply not draw — with no console error to point at the cause, because nothing failed;
the helper drew, and then the real geometry drew over it, or vice versa depending on draw order.
[MAN-scenegraph]

```js
const helper = new THREE.AxesHelper(5);
helper.material.depthTest = false; // don't let real geometry hide the helper
helper.renderOrder = 999;          // draw the helper after (on top of) everything else
scene.add(helper);
```

Apply the same pattern to `CameraHelper`, `DirectionalLightHelper`, `SpotLightHelper`, and
`GridHelper` — all are ordinary `Object3D`s with a `material` (or, for multi-material helpers, a
`children` list of parts each with their own material) that responds to `depthTest` and
`renderOrder` the same way. If a helper you added doesn't appear, check this before assuming the
helper itself is broken or positioned wrong.

## Frustum and z-fighting as a cause of invisible or flickering geometry

Two camera-frustum issues can look like a rendering bug but are actually a framing/precision issue:

- Geometry entirely outside `near`/`far` or outside the horizontal/vertical field of view is
  invisible with no error — this is exactly what phase 1's frustum-widening step rules out.
- Two surfaces very close together in depth can **z-fight** — flicker between which one wins the
  depth test from frame to frame — when the depth buffer doesn't have enough precision to reliably
  order them at that `near`/`far` range. A `CameraHelper` visualising the frustum, combined with
  tightening `near`/`far` to the smallest range the scene actually needs, is the first fix; the
  manual's documented escape hatch beyond that is `logarithmicDepthBuffer` on the renderer. [MAN-cameras]

(medium confidence — `cameras.html` documents frustum/z-fighting/`logarithmicDepthBuffer` generally;
it does not frame these specifically as "debugging" techniques the way `debugging-javascript.html`
and `debugging-glsl.html` do. Treat this section as informed cross-reference, not the same
confidence level as phases 1–3.)

## Sort-order symptoms that look like a bug but aren't

Transparent objects are sorted and drawn in an order three.js determines, and getting that order
"wrong" relative to what you expected produces visual symptoms — one transparent surface appearing to
incorrectly occlude or blend with another — that look exactly like a rendering bug when they are
actually the documented behaviour of the transparency sort order. Before concluding a transparency
result is a bug, check whether it's actually a sort-order artifact of the technique in use (including
the double-mesh `BackSide`/`FrontSide` pattern for correctly rendering an object's inside and outside
together). [MAN-transparency]

(medium confidence — cross-referenced from `transparency.html`, which documents the sort-order problem
in the context of achieving correct transparency rather than as a debugging-specific technique.)

## Wrapping up

Once instrumentation has confirmed the actual cause — a misframed camera, a misaimed light, an
unexpected local transform, a z-fighting or sort-order artifact — apply the fix from whichever of
phases 1–3 diagnosed it, remove any temporary debugging code (widened `near`/`far`, forced solid
colours, the `?debug=true` logger's visible state if it's noisy), and hand the confirmed reproduction
to `deterministic-headless-validation` so the fix has a regression check going forward.
