# Phase 2 — Resize and the render loop

**Triggers:** canvas stuck at 300x150, resize breaks the scene, aspect ratio looks wrong, blurry
canvas, canvas looks fine on desktop but overheats/blurs on a phone, `setPixelRatio`,
`devicePixelRatio`, `requestAnimationFrame` vs `setAnimationLoop`, tab-switching, WebXR won't render.

## resizeRendererToDisplaySize

The manual's `responsive` page gives the canonical resize function: compare the canvas's actual
drawing-buffer size (`canvas.width` / `canvas.height`) against its CSS display size
(`canvas.clientWidth` / `canvas.clientHeight`), and only call `setSize` when they disagree.
[MAN-responsive]

```js
function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}
```

**The third argument to `setSize` must be `false`.** By default `setSize` also sets the canvas's
CSS `style.width`/`style.height`, which overwrites the layout-driven sizing from your CSS contract
(phase 1) and fights with it every frame. Passing `false` tells three.js "resize the drawing buffer
only, leave the CSS size alone." [MAN-responsive]

## Update the camera only when a resize actually happened

```js
function render(time) {
  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
}
```

Gating on the boolean return value avoids calling `updateProjectionMatrix()` every single frame when
nothing changed — cheap, but there's no reason to pay it unconditionally. [MAN-responsive]

## Do NOT call setPixelRatio(window.devicePixelRatio)

This is the manual's most explicit anti-pattern warning, and it directly contradicts the most common
tutorial code found elsewhere on the web. `renderer.setPixelRatio(window.devicePixelRatio)` hands
control of the true drawing-buffer size to three.js internals, and that buffer size is exactly what
post-processing passes, screenshots (`preserveDrawingBuffer`), GPU picking, and shader
`gl_FragCoord` math all depend on. Losing control of it breaks or complicates all four. [MAN-responsive]

Instead, multiply the CSS size by `devicePixelRatio` yourself inside the resize function:

```js
function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const pixelRatio = window.devicePixelRatio;
  let width = Math.floor(canvas.clientWidth * pixelRatio);
  let height = Math.floor(canvas.clientHeight * pixelRatio);
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}
```

## Cap the pixel count for fractional OS scaling

Fractional OS display scaling (e.g. 150%) can push `clientWidth * devicePixelRatio` past a size the
GPU can safely allocate, or simply past what the device can render at an acceptable framerate. The
manual's mitigation is a maximum pixel-count cap combined with a square-root render scale: [MAN-responsive]

```js
function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const pixelRatio = window.devicePixelRatio;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const maxPixelCount = 3840 * 2160; // cap, e.g. ~4K
  const renderScale = Math.min(
    1,
    Math.sqrt(maxPixelCount / (width * pixelRatio * height * pixelRatio))
  );
  const targetWidth = Math.floor(width * pixelRatio * renderScale);
  const targetHeight = Math.floor(height * pixelRatio * renderScale);
  const needResize = canvas.width !== targetWidth || canvas.height !== targetHeight;
  if (needResize) {
    renderer.setSize(targetWidth, targetHeight, false);
  }
  return needResize;
}
```

The `sqrt` is deliberate: pixel *count* scales with the square of the linear scale, so a `sqrt` on
the ratio of desired-to-max pixel counts gives the correct linear scale factor to apply to width and
height.

## setAnimationLoop vs requestAnimationFrame

Drive frames with `renderer.setAnimationLoop(render)` rather than a hand-rolled
`requestAnimationFrame` loop. Two documented reasons: [MAN-creating-scene] [MAN-webxr]

- It auto-pauses when the tab is switched away (and resumes on return), which a raw
  `requestAnimationFrame` loop already effectively does — but `setAnimationLoop` is also the hook
  three.js uses to drive rendering when a WebXR session is active.
- It is **mandatory for WebXR**: replacing `requestAnimationFrame` with `setAnimationLoop` is
  listed as a required step in `webxr-basics`, because XR frame timing/pacing must come from the XR
  device's own loop, not the browser's `requestAnimationFrame`.

```js
renderer.setAnimationLoop(render);
```

### Unknown: exact tab-switch semantics for a raw rAF loop vs setAnimationLoop

The research grounding this skill states `setAnimationLoop` "auto-pauses on tab switch" as a
property worth relying on, but does not spell out how this differs in practice from the browser's
own native throttling of `requestAnimationFrame` in background tabs. Treat "use `setAnimationLoop`"
as the documented, forward-compatible (WebXR-ready) choice rather than assuming you understand every
edge case of what a plain `requestAnimationFrame` loop would have done differently.
