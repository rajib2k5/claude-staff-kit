# Phase 1 — Render-to-texture

**Triggers:** mirror-in-scene, screen/monitor-in-scene, building facade, "render one scene into
another's texture", `WebGLRenderTarget`, `setRenderTarget`, `rt.texture`, a render target that looks
stretched or wrong-aspect after resize.

## The four-step contract

The manual's render-target pattern (`rendertargets.html`) is small and every step matters:
[MAN-rendertargets]

```js
const rt = new THREE.WebGLRenderTarget(width, height);

// a completely separate scene and camera, only used to fill this target
const rtScene = new THREE.Scene();
const rtCamera = new THREE.PerspectiveCamera(fov, width / height, near, far);
// ... populate rtScene with whatever should appear on the mirror/screen/facade

function render() {
  // 1. render the "inner" scene into the target
  renderer.setRenderTarget(rt);
  renderer.render(rtScene, rtCamera);

  // 2. hand control back to the canvas
  renderer.setRenderTarget(null);

  // 3. render the main scene, which consumes rt.texture as a map somewhere in it
  renderer.render(scene, camera);
}
```

Four things to hold onto:

1. **`new THREE.WebGLRenderTarget(w, h)`** — turn off `depthBuffer`/`stencilBuffer` in the
   constructor options when the target is purely a colour source (a mirror, a screen texture) and
   nothing downstream reads depth or stencil from it. [B10-rendertargets]
2. **`rtScene`/`rtCamera` are their own objects**, not the main scene/camera reused. `rtCamera.aspect`
   must match the render target's own `width / height` — not the canvas's aspect. A render target
   sized differently from the canvas (e.g. a small square texture for a monitor prop in a
   widescreen scene) needs its own aspect, and getting this wrong is a silent stretch, not an error.
   [MAN-rendertargets]
3. **The order is fixed**: `setRenderTarget(rt)` → `render(rtScene, rtCamera)` →
   `setRenderTarget(null)` → render the main scene. Rendering the main scene before calling
   `setRenderTarget(null)` would render it into the target instead of the canvas. [MAN-rendertargets]
4. **Consume the result as `rt.texture`** — assign it to a material's `map` (or any other texture
   slot) in the main scene, exactly like a loaded `Texture`. [MAN-rendertargets]

## Named use cases

The manual and the broader research name three concrete uses of this pattern, all following the
identical four-step contract above:

- **Mirrors and monitors** — the canonical render-target use case: render the "reflected" or
  "displayed" content into a target, then apply `rt.texture` as the `map` on the mirror/screen mesh.
  [MAN-rendertargets]
- **Building facades / distant complex objects** — render a complex object into a target once, then
  apply `rt.texture` to a cheap flat `Sprite` or plane placed where the real object would be, instead
  of rendering the full geometry every frame at a distance where the detail wouldn't be visible
  anyway. [B7-billboards]
- **GPU picking** (out of scope for this skill, `threejs-interaction-picking` owns it) uses the same
  `setRenderTarget`/`render`/`setRenderTarget(null)` shape, but at 1×1 resolution with
  `camera.setViewOffset(...)`, reading pixels back with `readRenderTargetPixels` instead of using the
  texture visually. It's mentioned here only to show the pattern generalizes — the two skills don't
  overlap on content. [B6-picking]

## Resizing a render target with the canvas

A render target does not automatically track canvas size. On every resize that also touches the
renderer/camera, also resize the render target and update its camera: [MAN-rendertargets]

```js
function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // the render target and its own camera need the same treatment,
  // using whatever dimensions are correct for THAT target — not necessarily w/h
  rt.setSize(rtWidth, rtHeight);
  rtCamera.aspect = rtWidth / rtHeight;
  rtCamera.updateProjectionMatrix();
}
```

If the render target is meant to track the canvas 1:1 (rare — most mirror/screen targets have their
own fixed or scene-relative resolution), `rtWidth`/`rtHeight` would equal the canvas size; if it's a
fixed-resolution texture (a monitor prop with a deliberately low-res screen look), it stays fixed and
only needs resizing if its own logical size changes. Either way, the render target's resize is a
separate, deliberate decision from the canvas's — it is never automatic. [MAN-rendertargets]
