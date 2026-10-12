# Phase 4 — Resize correctness

**Triggers:** blurry canvas after a post-processing effect was added, stretched/mismatched buffers
on window resize, `composer.setSize`, `setPixelRatio`, a render target that looks wrong only after
the window changes size.

## Every resize touches three things, not one

Adding `EffectComposer` (and/or a render target) means a canvas resize now has more than the
renderer to update. The manual is explicit that missing the composer step gives mismatched buffers,
and missing the pixel-ratio step gives blur on HiDPI: [MAN-post-processing]

```js
function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // the composer does NOT track the renderer's size automatically
  composer.setSize(canvas.width, canvas.height);
  composer.setPixelRatio(window.devicePixelRatio); // re-apply on HiDPI displays

  // any render target from phase 1 needs the same treatment, using ITS OWN target dimensions
  rt.setSize(rtWidth, rtHeight);
  rtCamera.aspect = rtWidth / rtHeight;
  rtCamera.updateProjectionMatrix();
}
```

Three independent things, each with its own failure mode if skipped: [MAN-post-processing]
[MAN-rendertargets]

| Skipped step | Symptom |
|---|---|
| `composer.setSize(...)` | The composer's internal buffers stay at the old size while the canvas/renderer are the new size — mismatched buffers, typically a stretched or partially-blank result |
| `composer.setPixelRatio(...)` on HiDPI | The composer's buffers render at the wrong pixel density relative to the display — blur, not a crash |
| `rt.setSize(...)` / `rtCamera` update (phase 1) | The render-target texture used for a mirror/screen/facade keeps its old aspect or resolution — stretching specific to whatever surface displays it, independent of the main canvas looking fine |

## `composer.setSize` arguments

Use the renderer's actual drawing-buffer dimensions — `canvas.width`/`canvas.height` — not the CSS
`clientWidth`/`clientHeight`, mirroring the same drawing-buffer-vs-CSS-size distinction that governs
`renderer.setSize`'s own third argument in basic scene setup (`threejs-scene-setup`).
[DOCS-EffectComposer]

## This is the same resize discipline as everywhere else in three.js, just with more objects

Nothing about the *principle* here is unique to post-processing — `threejs-scene-setup`'s resize
phase already establishes that the renderer, the camera, and the CSS size all have to be kept in
sync on every resize. This phase's contribution is simply that `EffectComposer` and any
`WebGLRenderTarget` are additional objects with the exact same obligation, and neither one is resized
automatically as a side effect of resizing the renderer or the canvas element. Treat "how many things
need to hear about this resize" as a growing list as more post-processing machinery gets added, not a
fixed set of two.
