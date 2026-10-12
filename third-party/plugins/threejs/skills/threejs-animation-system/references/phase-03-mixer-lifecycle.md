# Phase 3 — Mixer lifecycle

**Triggers:** tearing down or swapping an animated model, freeing clips or actions, reusing a
mixer across a different root, "leak" or "stale animation" after swapping assets,
`uncacheClip`/`uncacheRoot`/`uncacheAction`.

## Why this matters

`AnimationMixer` caches the `AnimationAction`s it creates, keyed by clip and root, so repeated calls
to `mixer.clipAction(clip)` for the same clip/root pair return the same cached action rather than
building a new one every time. That caching is exactly what makes swapping models, clips, or
rebuilding animation state safe to get wrong: stale cached actions or clips left behind after a
model is removed are a documented source of leaked or stalled animation state.

## The stop-first requirement

The docs are explicit that the three `uncache*` methods require the relevant actions to be stopped
**before** you uncache them:

- `mixer.uncacheClip(clip)` — removes all cached actions associated with a given clip.
- `mixer.uncacheRoot(root)` — removes all cached actions associated with a given root object.
- `mixer.uncacheAction(clip, root)` — removes one specific cached action for a clip/root pair.

```js
// correct order: stop, then uncache
action.stop();
mixer.uncacheAction(clip, root);

// or, tearing down everything this mixer knows about a root:
mixer.stopAllAction();
mixer.uncacheRoot(root);
```

Calling any `uncache*` method against an action that is still playing skips the stop step the docs
require — treat "stop the action(s) first" as a hard precondition on every uncache call, not an
optional cleanup nicety.

## When to reach for each one

- Use `uncacheAction` when only one specific clip/root pairing needs to be forgotten (e.g. a
  one-off animation that will never play again on this root).
- Use `uncacheClip` when a clip itself is being discarded and every action built from it, across
  whatever roots it was played against, should go with it.
- Use `uncacheRoot` when a whole animated object is being removed from the scene (a model unload on
  route change, a despawned character) — this clears every action the mixer built for that root in
  one call, which is the common case when tearing down a loaded glTF's mixer.

## Swapping clips or roots without leaking

A mixer is constructed once against a specific root (Phase 1). If a scene needs to swap in a
different animated model on the same mixer, or discard a model's animation state entirely, stop the
relevant actions first, uncache them, and only then either reuse the mixer against the new root or
let the mixer itself be discarded along with the model. Skipping the stop-then-uncache order is the
documented way this stalls or leaks: cached actions keep referencing clips/roots that the rest of
the scene has already moved on from.
