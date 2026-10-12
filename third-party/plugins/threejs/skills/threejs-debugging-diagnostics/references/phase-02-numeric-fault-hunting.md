# Phase 2 — Numeric fault hunting

**Triggers:** black-screen triage (phase 1) didn't find the cause; suspicion of a `NaN`/`Infinity` in
position or matrix data; a curve or path feeding vertex positions; "z is undefined"; wrong-looking
rotation or scale after a value was copy-pasted; an error that seems to appear and then vanish; want
an on-screen debug readout without opening DevTools every time.

## Hunt NaN and Infinity in positions and matrices

A single `NaN` in a position, a matrix, or a bounding sphere/box is enough to make an object
disappear entirely with no console error — WebGL simply fails to draw geometry with invalid
transform data, silently. Inspect the actual numbers in the debugger: `mesh.position`,
`mesh.matrix`/`mesh.matrixWorld` (`.elements` is a flat array of 16 numbers), and
`geometry.boundingSphere`/`boundingBox` if they've been computed. [MAN-debugging-js]

The manual's own documented example of how this happens: a **2D `SplineCurve`** (which only produces
`x`/`y`) fed into code that expects a **3D `Vector3`** per point. The curve never sets `z`, so `z`
comes through as `undefined`, and `undefined` propagates through subsequent math into `NaN`. The bug
doesn't look like a "curve" bug at the point where the mesh vanishes — it looks like the geometry
itself is broken. [MAN-debugging-js]

```js
// 2D SplineCurve only gives you {x, y} points
const curve = new THREE.SplineCurve(points2D);
const pts = curve.getPoints(50);

// BUG: pt.z is undefined here, not 0 — this Vector3 is now poisoned
const positions = pts.map(pt => new THREE.Vector3(pt.x, pt.y, pt.z));
```

```js
// FIX: supply z explicitly instead of trusting a property the source never set
const positions = pts.map(pt => new THREE.Vector3(pt.x, pt.y, 0));
```

The general lesson generalises beyond this one API: whenever 2D data (a curve, a path, mouse/NDC
coordinates, a texture UV) is promoted into a 3D structure, check that every axis was actually
assigned rather than assumed to default to `0`.

## Check units: degrees vs radians, and the metre convention

Two unit rules cause wrong-looking (not necessarily invisible) results, and are worth checking as
part of the same numeric pass: [MAN-debugging-js]

- **`PerspectiveCamera.fov` is the one value in degrees.** Every other angle in three.js — mesh
  rotation, light angles, `Object3D.rotation`, spherical coordinates — is in **radians**. A "45
  degrees" value copy-pasted into a rotation property without converting
  (`THREE.MathUtils.degToRad(45)`) will produce a wildly wrong-looking rotation, not an error.
- **1 unit = 1 metre** is the convention the ecosystem assumes, and it matters concretely for two
  systems: PBR material response (`MeshPhysicalMaterial`/`MeshStandardMaterial` lighting math is
  tuned assuming real-world scale) and WebXR (a camera at the wrong scale relative to a 1.6 m eye
  height looks broken even though nothing is technically wrong with any single number).

## Move requestAnimationFrame to the END of the render function

This is a structural fix that changes how every future error in the render loop behaves, not a
one-off numeric check — but it belongs in the same "silent failure" bucket, because its symptom is
identical: **the scene stops updating and nothing is printed to explain why.**

```js
// WRONG — schedules the next frame before anything in this frame can throw
function render() {
  requestAnimationFrame(render);
  // if anything below throws, the loop has *already* been rescheduled;
  // depending on the error, the loop can keep silently re-entering a broken state
  renderer.render(scene, camera);
}
```

```js
// RIGHT — the frame is scheduled last, so a thrown error above prevents the reschedule
function render() {
  // ...update logic, mesh mutation, mixer.update(), etc...
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
```

With `requestAnimationFrame(render)` at the top, a thrown error partway through a frame doesn't stop
anything from a user's perspective except that the scene freezes — the browser's console will show
the error, but a developer who isn't already watching the console for that exact moment can easily
mistake a frozen scene for "the render loop is still running, it's just stuck," when in fact it
already stopped and the *previous* call already scheduled one more frame that also errors. Putting the
call **at the end of the render function** makes the failure mode direct: an error thrown mid-frame
means no next frame gets scheduled at all, and the loop visibly halts rather than continuing to
schedule over a broken state. [MAN-debugging-js]

## On-screen debug logger gated behind ?debug=true

Reproducing a bug that only shows up on a specific device (mobile, an older GPU) is much easier with
an on-screen readout than a remote debugging session. The manual's pattern is a logger that writes
into a positioned `<div>`, gated behind a query parameter so it never ships to normal users: [MAN-debugging-js]

```js
class ClearingLogger {
  constructor(elem) {
    this.elem = elem;
  }
  log(...args) {
    this.elem.textContent = args.join(' ');
  }
}

class DummyLogger {
  log() {}
}

const params = new URLSearchParams(window.location.search);
const haveLogger = params.has('debug');
const logger = haveLogger
  ? new ClearingLogger(document.querySelector('#debug'))
  : new DummyLogger();

function render() {
  logger.log('camera pos:', camera.position.toArray().map(v => v.toFixed(2)));
  // ...
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
```

Visiting the page with `?debug=true` turns the readout on; visiting normally uses the no-op
`DummyLogger` so there is zero cost and zero visual noise in the default case. The "Clearing" in the
name matters: writing into the same `<div>`'s `textContent` each frame overwrites rather than
appends, so the page doesn't grow an unbounded log — you always see the latest frame's values only.

## If the object exists but looks wrong (not invisible)

If numeric fault hunting turns up nothing and the object is visibly present but rendering
incorrectly — wrong colours, wrong lighting response, a custom shader producing garbage — move to
`references/phase-03-shader-bisection.md`.
