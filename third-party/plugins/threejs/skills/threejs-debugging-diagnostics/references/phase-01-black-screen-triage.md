# Phase 1 — Black-screen triage

**Triggers:** blank/black canvas, "nothing renders", object doesn't appear, scene looks empty,
first report of a broken three.js page, before any other debugging has happened.

## Step 1 — Read the console first

A healthy three.js page produces **0–2 messages** in the console. If you see anything beyond that —
a WebGL context warning, a 404 for a texture/model, a thrown exception — that is very likely the
actual cause, and every other step below is downstream of it. Check the console before touching any
code. [MAN-debugging-js]

Also turn on **"Disable Cache (while DevTools is open)"** in the Network panel before doing anything
else. Without it, you can spend an entire debugging session "fixing" a bug that a stale cached bundle
is actively hiding the fix for — every edit you make appears to do nothing because the browser is
still serving the old file. [MAN-debugging-js]

## Step 2 — The MeshBasicMaterial red-swap isolation test

If the console is clean and something is still missing, the next cheapest test is to swap whatever
material the object has for the simplest possible material:

```js
mesh.material = new THREE.MeshBasicMaterial({ color: 'red' });
```

`MeshBasicMaterial` does not respond to lights at all — it renders its flat color regardless of any
lighting setup. That makes it a clean split test: [MAN-debugging-js]

- **The red object appears** → the object's geometry, position, and camera framing are all fine. The
  bug is in **lighting or the original material** (wrong light type, light never added to the scene,
  `castShadow`/`receiveShadow` misconfigured, a material property that silently disables rendering).
  Go debug that, not the geometry.
- **Still nothing appears** → geometry, transforms, or camera/framing is the problem. Do not spend
  any more time on lights or materials yet — move to step 3.

This single swap is worth doing before any other theory, because it converts "I don't know which of
five systems is broken" into "I know which two systems are *not* broken."

## Step 3 — Rule out framing: widen the frustum and add OrbitControls

If the red-swap test still shows nothing, the object may simply be outside the camera's view — too
close, too far, behind the camera, or scaled wrong relative to `near`/`far`. Rule this out directly
rather than guessing at position values:

```js
camera.near = 0.001;
camera.far = 1000000;
camera.updateProjectionMatrix();

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();
```

Widening `near`/`far` this aggressively means almost nothing can fall outside the frustum purely on
distance. Adding `OrbitControls` lets you move the camera around interactively and actually look for
the object, instead of restarting the page after every guessed camera position. [MAN-debugging-js]

If the object appears once you can freely orbit and the frustum is wide open, the bug is a framing/
transform problem — wrong camera position, wrong object position/scale, or a parent transform putting
it somewhere unexpected (see the scale-inheritance trap in `threejs-scene-setup`'s scene-graph phase
if a parent's scale is the suspect).

**This near/far widening is a debugging technique, not a production setting.** Put the original
`near`/`far` values back once framing is ruled out or confirmed — an extreme range reintroduces
z-fighting (see phase 4 and `references/gotchas.md`) that the tight values were presumably chosen to
avoid. [MAN-cameras]

## If all three still show nothing

If the console is clean, the red-swap test shows nothing, and widening the frustum with free camera
movement still shows nothing, the fault is very likely numeric (a `NaN`/`Infinity` somewhere in the
transform chain) or a silently swallowed exception in the render loop rather than anything about
lighting or framing. Move to `references/phase-02-numeric-fault-hunting.md`.
