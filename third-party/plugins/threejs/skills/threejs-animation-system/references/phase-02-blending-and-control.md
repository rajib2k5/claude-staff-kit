# Phase 2 — Blending and control

**Triggers:** switching between clips, `crossFadeTo`, `fadeIn`/`fadeOut`, `action.weight`,
`action.timeScale`, "animation snaps instead of blending", pausing or slowing down an animation,
`mixer.timeScale`.

## Everything lives on the action

Once a clip is playing via `mixer.clipAction(clip).play()` (Phase 1), all further control —
blending into another clip, speeding it up or down, fading it in or out, weighting it against other
simultaneously-playing actions — happens through methods and properties on the **action**, not the
clip and not the mixer (with one exception: the global pause, below).

## Crossfading between two clips

```js
const walkAction = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'walk'));
const runAction  = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'run'));

walkAction.play();

// later, transition smoothly from walking to running over 0.5s:
walkAction.crossFadeTo(runAction, 0.5);
```

`action.crossFadeTo(otherAction, duration)` blends the currently-playing action out and the target
action in over `duration` seconds, rather than cutting instantly from one pose to another. Because
it operates on actions, both actions must already exist (via `mixer.clipAction()`) before you can
cross-fade between them.

## Fading a single action in or out

`action.fadeIn(duration)` and the corresponding fade-out ramp an action's influence up or down over
time instead of snapping it to full weight or to zero. This is the same primitive `crossFadeTo`
composes internally — a fade-out on the outgoing action paired with a fade-in on the incoming one.

## `weight` and `timeScale`

Two other per-action controls that matter alongside fading:

- **`action.weight`** — how strongly this action's pose contributes to the final result, useful
  when multiple actions are blended together rather than strictly alternated (e.g. blending a
  "lean" pose partially over a base "walk" pose).
- **`action.timeScale`** — the playback speed multiplier for that action alone: `2` plays twice as
  fast, `0.5` half as fast, negative values play in reverse. This is a per-action control, distinct
  from the mixer-wide pause described next.

## Pausing everything: `mixer.timeScale = 0`

To pause **all** currently-playing actions at once, set the mixer's own `timeScale` to `0`, rather
than iterating over every action and stopping or scaling each one individually:

```js
// pause every action this mixer drives
mixer.timeScale = 0;

// resume at normal speed
mixer.timeScale = 1;
```

This is the documented global-pause mechanism. It leaves each action's own state (its position in
its clip, its own `weight`, its own `timeScale`) untouched — resuming by restoring `mixer.timeScale`
to `1` (or whatever it was) picks every action back up exactly where it was frozen. Per-action
`timeScale` values still combine multiplicatively with the mixer's own — a `0` mixer `timeScale`
zeroes every action's effective speed regardless of what the action's own `timeScale` is set to.

## Still driven by `mixer.update()`

Every control in this phase only takes effect through the same per-frame `mixer.update(dt)` call
described in Phase 1. Setting `weight`, calling `crossFadeTo`, or fading an action in do not
themselves move anything forward — they change what the *next* `mixer.update()` call will compute.
A pause via `mixer.timeScale = 0` still expects `mixer.update()` to keep being called every frame
(it will simply advance every action by zero); stopping the call to `mixer.update()` altogether is
a different, cruder way to freeze everything and forfeits the ability to resume with the correct
elapsed-time bookkeeping.
