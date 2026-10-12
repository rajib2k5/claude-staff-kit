---
name: threejs-animation-system
description: Play, blend, and control clip-based animation on a loaded three.js model (AnimationMixer, AnimationClip, AnimationAction), and animate merged/generated geometry that can no longer move as separate objects (morph targets). Use for "play a glTF animation", "AnimationMixer", "animation not advancing", "mixer.update", "crossfade between clips", "action.fadeIn/timeScale/weight", "pause three.js animation", "uncacheClip/uncacheRoot/uncacheAction", "morph targets", "morphTargetInfluences", "BufferGeometry.morphAttributes", or animating instanced/merged geometry that lost per-object movement.
---

# three.js animation system

Grounded in the three.js manual and docs @ r185 (`three@0.185.1`) — the `animation-system` and
`optimize-lots-of-objects-animated` manual pages, the `AnimationMixer` docs page, the
`BufferGeometry` docs page, and the `load-gltf` manual page. Every claim in the references carries
back to one of these; see `references/sources.md`.

## Scope

**Covers:** the Clip/Track/Mixer/Action model; finding and playing a baked clip; the mandatory
per-frame `mixer.update(delta)`; blending and control (`crossFadeTo`, `fadeIn`, `weight`,
`timeScale`, global pause via `mixer.timeScale = 0`); mixer lifecycle (`uncacheClip`/`uncacheRoot`/
`uncacheAction` and the stop-first requirement); morph-target animation on merged or generated
geometry (`morphAttributes.position`/`.color`, `mesh.morphTargetInfluences`, the
after-first-render rebuild rule); transform-driven animation in the render loop as the simpler
alternative to clips.

**Does not cover:** authoring animation in Blender/Maya; IK, ragdolls, procedural animation, or
navmesh motion (third-party, see `libraries-and-plugins`); GSAP/Tween-driven camera or DOM
choreography (not documented on threejs.org); skeleton retargeting between rigs; physics-driven
motion (no physics in three.js core).

## The one thing to internalise first

**Nothing advances without an explicit `mixer.update(delta)` every frame.** `clipAction(clip).play()`
only *schedules* an action — it does not start a self-driving clock. A render loop that skips a
frame's `mixer.update()` call simply leaves every mixer-driven animation frozen at its last pose,
with no error and no warning. Every other mixer symptom ("clip won't play", "animation frozen",
"crossfade snaps instead of blends") traces back to either this, or to a clip/root mismatch.
**Read `references/phase-01-clip-playback.md` before debugging any animation that "does nothing."**

## Workflow

Work the phases in order for a new animation setup; jump straight to one when the task is narrow.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-clip-playback.md` | first-time clip playback, `AnimationMixer`, `AnimationClip.findByName`, `clipAction().play()`, `clock.getDelta()`, animation not advancing |
| 2 | `references/phase-02-blending-and-control.md` | switching between clips, `crossFadeTo`, `fadeIn`/`fadeOut`, `weight`, `timeScale`, pausing everything with `mixer.timeScale = 0` |
| 3 | `references/phase-03-mixer-lifecycle.md` | tearing down or swapping models/clips, `uncacheClip`/`uncacheRoot`/`uncacheAction`, avoiding leaks or stalls |
| 4 | `references/phase-04-morph-target-animation.md` | geometry that was merged or generated and can no longer move as separate objects, `morphAttributes`, `morphTargetInfluences` |

Read `references/gotchas.md` whenever behaviour contradicts expectations — it lists the honest
unknowns this domain carries (skinning/rig internals, animation events, scroll/audio sync) rather
than guessing past them.

## Definition of done

A finished animation integration satisfies all of these:

1. `AnimationMixer` is constructed against the root object the clips were actually authored
   against (typically `gltf.scene`) — not an arbitrary child.
2. Every render-loop frame calls `mixer.update(clock.getDelta())` unconditionally, before anything
   reads the resulting pose.
3. Transitions between clips use `crossFadeTo`/`fadeIn`/`weight`/`timeScale` rather than manual
   `play()`/`stop()` swaps, unless an instant cut is actually the desired effect.
4. A global pause sets `mixer.timeScale = 0` rather than stopping every action individually.
5. Any `uncacheClip`/`uncacheRoot`/`uncacheAction` call is preceded by stopping the relevant
   actions, per the docs' explicit requirement.
6. If geometry has been merged or procedurally generated, per-object movement is replaced with
   `morphAttributes` + `mesh.morphTargetInfluences`, and any change to `morphAttributes` after the
   first render is done via dispose-and-rebuild, never in place.
7. Simple, single-transform motion (e.g. a spinning logo) mutates `position`/`rotation`/`scale`
   directly in the render loop against the same delta, instead of reaching for the clip system at
   all.
8. Nothing in the integration relies on a behaviour the sources do not state. The two real
   unknowns (skinning/rig internals, animation-event or scroll/audio sync) are listed in
   `references/gotchas.md` section D; if the work depends on one, say so rather than assuming.
