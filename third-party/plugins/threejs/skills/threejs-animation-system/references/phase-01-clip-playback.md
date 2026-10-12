# Phase 1 — Clip playback

**Triggers:** first-time clip playback, `AnimationMixer`, `AnimationClip.findByName`,
`clipAction().play()`, `clock.getDelta()`, "animation not advancing", "nothing happens when I call
play()", loading a glTF that has baked animation.

## The model: Clip, Track, Mixer, Action

Baked animation in three.js is built from four cooperating pieces:

- **AnimationClip** — a named, reusable bundle of keyframe tracks (e.g. `"dance"`, `"walk"`). A
  loaded glTF that carries animation exposes an array of these on `gltf.animations`.
- **KeyframeTrack** — a single animated property inside a clip (one bone's rotation over time, for
  example). You rarely touch tracks directly when playing a baked clip; the clip owns them.
- **AnimationMixer** — the thing that actually plays clips against a specific object hierarchy. One
  mixer is created per animated root.
- **AnimationAction** — the mixer's handle on one clip playing against its root. `play()`, `stop()`,
  `crossFadeTo()`, `weight`, and `timeScale` all live on the action, not the clip or the mixer.

## Where `gltf.animations` comes from

`GLTFLoader.loadAsync(url)` resolves to a `gltf` object whose shape includes `scene`, `scenes`,
`cameras`, `asset`, `parser`, `userData` — and `animations`. The animations array travels alongside
the scene graph the clips were authored against; `gltf.scene` is normally the root you hand to the
mixer.

## Minimum viable clip playback

```js
// gltf = await new GLTFLoader().loadAsync(url)
const root = gltf.scene;

const mixer = new THREE.AnimationMixer(root);
const clip = THREE.AnimationClip.findByName(gltf.animations, 'dance');
const action = mixer.clipAction(clip);
action.play();

const clock = new THREE.Clock();

function render() {
  const dt = clock.getDelta();
  mixer.update(dt);       // <-- nothing advances without this call
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
```

Walking through it:

1. `new THREE.AnimationMixer(root)` — `root` must be the object the clip's tracks were authored
   against. For a glTF, that is almost always `gltf.scene`, because the exporter's keyframe target
   paths are relative to that hierarchy. Constructing the mixer against some other node (a single
   child mesh, say) means the tracks' target paths won't resolve.
2. `THREE.AnimationClip.findByName(gltf.animations, 'dance')` — looks up a clip by its authored
   name inside the array the loader gave you. This is how you turn a loose array of clips into the
   one you actually want to play.
3. `mixer.clipAction(clip)` returns (and caches) an `AnimationAction` for that clip against that
   mixer's root. Calling `clipAction` again with the same clip and root returns the same action
   instance rather than creating a duplicate.
4. `action.play()` **schedules** the action — it flips the action into a playing state, but it does
   not itself advance any time. Nothing on screen changes yet.
5. `mixer.update(dt)` is what actually steps every currently-playing action forward by `dt` seconds
   and writes the resulting pose into the scene graph. It must run every frame, unconditionally,
   before the frame is rendered.

## The delta comes from `Clock`

`clock.getDelta()` returns the elapsed seconds since the previous call. That value — a real frame
delta, not a fixed constant — is what `mixer.update()` expects. This is the same `Clock` pattern
used generally for frame-rate-independent motion elsewhere in three.js: `clock.getDelta()` once per
frame, and everything time-based (mixer included) is driven off that same number.

## The killer default: a skipped `mixer.update()` call freezes everything

If any code path renders a frame without first calling `mixer.update(dt)` for that frame — an early
return, a conditional render, a paused-but-still-rendering branch that forgot to still call
`update` — the animation simply does not advance for that frame. There is no error, no warning, and
no self-driving clock underneath: the mixer only moves forward when told to, and only by the exact
amount of delta it's given. If the model looks "stuck" or "frozen" rather than absent, the first
thing to check is whether `mixer.update()` is actually being called on every frame that reaches the
renderer.

## Simpler alternative: skip the animation system entirely

For simple motion — a spinning logo, a bobbing marker, a door swinging open on a fixed axis — the
animation system is more machinery than the job needs. The plainer approach is to mutate the
object's own transform directly in the render loop, against the same kind of delta:

```js
const clock = new THREE.Clock();

function render() {
  const dt = clock.getDelta();
  mesh.rotation.y += dt * Math.PI; // half a turn per second
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
```

There is no clip, no mixer, and no action here — just `position`/`rotation`/`scale` writes each
frame. Reach for `AnimationMixer` when the motion is baked keyframe data (typically from an
authored asset) or when it needs to be blended/paused/rescaled through the action API in Phase 2;
reach for direct transform mutation when the motion is a simple, code-defined rule.
