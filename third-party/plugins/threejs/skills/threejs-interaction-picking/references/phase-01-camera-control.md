# Phase 1 — Camera control with OrbitControls

**Triggers:** first `OrbitControls`, camera orbit/pan/zoom, `target`, `minDistance`/`maxDistance`,
`minPolarAngle`/`maxPolarAngle`, `enableDamping`, `autoRotate` not moving, "controls feel dead",
teardown/`dispose()`, camera can be spun through the floor or zoomed inside the model.

## Minimum viable setup

```js
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();
```

`OrbitControls` is constructed against the **camera** and the **renderer's canvas element**
(`renderer.domElement`) — the canvas is where it listens for pointer/wheel/touch input. [DOC-ORBIT]

## Give it limits so the user cannot break the shot

Set these explicitly rather than trusting the defaults, per the documented props table: [DOC-ORBIT]

```js
controls.target.set(0, 1, 0);       // what the camera orbits around
controls.minDistance = 2;           // cannot zoom inside the subject
controls.maxDistance = 40;          // cannot zoom out to nothing
controls.minPolarAngle = 0.1;       // radians; keeps the camera from flipping over the top
controls.maxPolarAngle = Math.PI / 2 - 0.05; // keeps it from diving under the floor
controls.enablePan = true;
controls.enableZoom = true;
controls.autoRotate = false;
```

Without `min`/`maxPolarAngle`, a user can orbit the camera under the ground plane or straight
overhead through the model. Without `min`/`maxDistance`, zoom can push the camera past the near
clip plane (clipping through the subject) or out to a point where the subject is imperceptible.
These are exactly the props the OrbitControls reference table documents for constraining orbit,
pan, and zoom. [DOC-ORBIT]

## The update() requirement

`controls.update()` must be called once per frame, inside the render loop, **whenever
`enableDamping` or `autoRotate` is enabled** — both behaviors are computed inside `update()`, not
as a side effect of construction or of setting the property. [DOC-ORBIT]

```js
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function render() {
  controls.update();     // required — damping/autoRotate only advance here
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
```

If damping is on and `update()` is missing from the loop, the symptom is a scene that looks
"frozen" or that only moves the instant an input event fires and then stops — damping state simply
never advances between events. The same is true of `autoRotate`: turning it on with no `update()`
call in the loop produces a camera that never rotates.

## Dispose on teardown

Call `controls.dispose()` when the component/scene is torn down (route change, unmount, canvas
swap). [DOC-ORBIT] This is the `OrbitControls`-specific instance of the general three.js rule that
nothing is garbage-collected automatically — event listeners it registered on
`renderer.domElement` are not removed on their own.

```js
function teardown() {
  controls.dispose();
}
```

## What this phase does not cover

`TransformControls`, `DragControls`, `PointerLockControls`, `FlyControls`, and the rest of the
addon controls family are not walked in the source material backing this skill — only
`OrbitControls` is grounded. If a task needs gizmo-based object manipulation, say explicitly that
it is out of scope here rather than improvising `OrbitControls`-shaped answers for a different
class. See `references/gotchas.md` section D.
