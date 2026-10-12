# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Model loaded, clip found, `play()` called, nothing moves | a frame is rendering without `mixer.update(dt)` being called first | call `mixer.update(clock.getDelta())` unconditionally, every frame, before render (phase 1) |
| Animation "freezes" mid-playback rather than never starting | same root cause as above — some code path (an early return, a paused branch) still renders but skips `mixer.update()` for that frame | audit every render call site for a matching `mixer.update()` call |
| `mixer.clipAction(clip)` seems to reuse an old action instead of a fresh one | this is by design — actions are cached per clip/root pair, not created anew each call | rely on the cache; call `uncacheAction`/`uncacheClip`/`uncacheRoot` deliberately if a fresh one is actually needed (phase 3) |
| `uncacheClip`/`uncacheRoot`/`uncacheAction` appears to do nothing or leaves stale state | the relevant action(s) were not stopped before uncaching, which the docs require | `action.stop()` (or `mixer.stopAllAction()`) before any `uncache*` call (phase 3) |
| Mutating `geometry.morphAttributes.position` after the mesh has rendered has no visible effect, or renders incorrectly | `BufferGeometry.morphAttributes` cannot change after first render | dispose the geometry and rebuild it with the new morph attribute set (phase 4) |
| A merged mesh's individual "pieces" can no longer be animated by moving anything | merging into one `BufferGeometry` removes the separate `Object3D` each piece used to have | switch to morph targets + `morphTargetInfluences`, or don't merge that piece if it must move independently (phase 4) |

## B. Verified discrepancies

None found. The scout doc-mining pass fetched `animation-system` (manual), `AnimationMixer` (docs,
via the current `docs/pages/` form — the legacy `docs/api/en/animation/AnimationMixer.html` path
404s twice, a URL-form issue rather than a content discrepancy), `optimize-lots-of-objects-animated`
(manual), and `BufferGeometry` (docs) directly, and no manual-vs-docs or docs-vs-behavior
contradiction turned up across them for this skill's scope. Stated honestly rather than invented:
this is a genuinely clean, self-consistent corner of three.js at r185, unlike the five real
README-vs-types discrepancies the react-force-graph skill found in its domain.

## C. Traps that are not discrepancies, just easy to miss

- **`play()` schedules, it does not advance.** `action.play()` flips an action into "playing" state;
  the actual per-frame advancement is entirely `mixer.update(dt)`'s job. Treat these as two
  separate steps even though they're usually written next to each other.
- **The mixer's root must match what the clip's tracks were authored against.** For a glTF, that's
  `gltf.scene`, not an arbitrary child mesh — constructing `AnimationMixer` against the wrong node
  means track target paths won't resolve against it.
- **`mixer.timeScale = 0` is the pause primitive, not `action.stop()` on everything.** Stopping every
  action loses each action's position in its clip; zeroing the mixer's `timeScale` freezes all of
  them in place and resumes exactly where they were.
- **Per-action `timeScale` and the mixer's `timeScale` combine.** Setting an action's own
  `timeScale` to `2` while the mixer's is `0` still yields no motion — the mixer-level scale gates
  everything underneath it.
- **A cross-fade needs both actions to already exist.** `crossFadeTo` blends between two
  already-created actions; there's no clip-name shortcut that skips calling `mixer.clipAction()` on
  the target first.
- **Morph target *state count* is fixed at build time.** Adding a new morph target state later is a
  dispose-and-rebuild, not a push onto the existing `morphAttributes.position` array (phase 4) —
  this is the same category of "looks like a mutation, is actually forbidden" trap as the
  `BufferGeometry.groups` sharing rule documented elsewhere in the broader three.js research.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **Skinning, `Bone`, and `SkinnedMesh` specifics.** The animation-system manual page documents the
   mixer (Clip/Track/Mixer/Action) but not the rig those clips typically move — how bones,
   `SkinnedMesh`, and skin weights relate to the tracks a mixer plays was not walked as its own
   topic during scouting. If the work depends on rig internals rather than just playing back
   already-baked clips, treat this as an open gap and go read the dedicated skinning docs before
   relying on any assumption here.
2. **Responding to animation events, or syncing animation to scroll or audio.** No source consulted
   for this skill covers hooking into animation completion/loop events, or driving mixer playback
   from scroll position or an audio clock. If a task needs "fire a callback when this clip finishes"
   or "sync this animation to the song," that is outside what this skill can ground — verify against
   current docs rather than inferring an API shape from the patterns here.
