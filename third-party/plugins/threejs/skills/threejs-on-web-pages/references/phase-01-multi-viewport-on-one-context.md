# Phase 1 — Multi-viewport on one context

**Triggers:** several 3D diagrams down one article, "too many canvases", WebGL context limit,
`WebGLRenderer` per section, `data-diagram`, `querySelectorAll`, scissor test, `setScissor` vs
`setViewport`, camera aspect per element, per-element OrbitControls, lights that rotate with the
camera.

## Why this has to be one context

Browsers cap the number of live WebGL contexts a page can hold at roughly **8**, and when a page
tries to exceed that cap the browser drops the *oldest* context rather than refusing the newest —
silently breaking whatever was using it. There is also no resource sharing across contexts: two
`WebGLRenderer` instances cannot share a compiled shader, a texture, or a buffer. [MAN-multiple-scenes]

A page with, say, six inline diagrams down a long article is therefore not six canvases. It is
**one** canvas, one `WebGLRenderer`, and six logical "scenes" that each get a rectangular region of
that single canvas on every frame. This constraint is the reason every other technique in this
phase exists.

## Mount the single canvas

```css
#c {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}
```

One canvas, absolutely positioned to cover the document, sitting behind the real content
(`z-index: -1`). Everything the user perceives as "separate 3D diagrams" is this same canvas,
scissored into pieces. [MAN-multiple-scenes]

## Register placeholders instead of hard-coding scenes

Mark each spot in the HTML where a diagram should appear with a data attribute, not a nested
canvas:

```html
<p>
  Some text about boxes. Here's a box:
  <span data-diagram="box"></span>
  and some more text about spheres:
  <span data-diagram="sphere"></span>
</p>
```

Discover them once and build a lookup table:

```js
const sceneElements = [];
function addScene(elem, fn) {
  sceneElements.push({ elem, fn });
}

document.querySelectorAll('[data-diagram]').forEach((elem) => {
  const sceneName = elem.dataset.diagram;
  const sceneInitFunction = sceneInitFunctionsByName[sceneName];
  sceneInitFunction(elem);
});
```

Each init function builds its own `Scene`, `PerspectiveCamera`, geometry, and (per the last section
of this phase) its own controls and lights, then calls `addScene(elem, renderFn)` so the shared
render loop knows this `{elem, fn}` pair exists. Do this discovery **once**, not per frame —
`querySelectorAll` and `dataset` reads are DOM work you do not want inside the render loop.
[MAN-multiple-scenes]

## The per-frame render order

Every frame, before touching any individual diagram:

```js
renderer.setScissorTest(false);
renderer.clear(true, true);
renderer.setScissorTest(true);
```

Clear the *whole* canvas with scissoring off first, then turn scissoring back on before rendering
any individual region. Getting this order wrong leaves stale pixels from a previous frame's
diagrams bleeding into regions nothing renders into this frame (e.g. an element that just scrolled
into view). [MAN-multiple-scenes]

## Cull elements that are off-screen before doing anything else

```js
const transform = `translateY(${window.scrollY}px)`;
renderer.domElement.style.transform = transform;

for (const { elem, fn } of sceneElements) {
  const rect = elem.getBoundingClientRect();
  const { left, right, top, bottom, width, height } = rect;

  const isOffscreen =
    bottom < 0 ||
    top > renderer.domElement.clientHeight ||
    right < 0 ||
    left > renderer.domElement.clientWidth;

  if (isOffscreen) {
    continue;
  }
  // ... scissor/viewport/render this element (below)
}
```

Skip the `setScissor`/`setViewport`/`render` calls entirely for anything fully outside the current
viewport. This is a correctness step as much as a performance one: computing a scissor rectangle
for an element that is off-screen is wasted GPU state churn on every single scroll frame.
[MAN-multiple-scenes]

## Convert rect coordinates to scissor coordinates

`getBoundingClientRect()` is **top-down** — `top` is distance from the top of the viewport. The
WebGL scissor rectangle is **bottom-up** — its origin is the bottom-left of the canvas. Mixing them
up silently renders every diagram upside-down or in the wrong vertical slot:

```js
const rectHeight = bottom - top;
const positiveYUpBottom = renderer.domElement.clientHeight - bottom;

renderer.setScissor(left, positiveYUpBottom, width, rectHeight);
renderer.setViewport(left, positiveYUpBottom, width, rectHeight);
```

`setScissor` and `setViewport` must be called with the **identical** rectangle — the scissor test
clips pixels, the viewport maps clip-space to pixels, and if they disagree the rendered image is
stretched or cropped relative to what was clipped. [MAN-multiple-scenes] [API-webglrenderer]

## Per-element camera aspect, every frame

```js
const camera = element.camera; // stored on the {elem, fn} entry, or closed over by fn
camera.aspect = width / height;   // rect width/height, not canvas width/height
camera.updateProjectionMatrix();
```

Each diagram's rectangle can have a different aspect ratio than the canvas as a whole, and that
rectangle's size changes on every resize and (for elements near text reflow) potentially on scroll.
Recomputing `camera.aspect` once at scene-init time is not enough — it has to happen per element,
per frame, immediately before `renderer.render(scene, camera)` for that element.
[MAN-multiple-scenes] [MAN-responsive]

## Per-element controls, camera-parented lights

Two things belong to the *element's* scene, not to the shared renderer:

- **Controls.** Each diagram that wants orbit/pan/zoom interaction constructs its own
  `OrbitControls(camera, elem)` (or another controls class) bound to that element's DOM node — not
  to the shared canvas. Binding to the wrong element means pointer events over one diagram would
  drive the camera of a different one.
- **Lights.** If a diagram's lighting should track the camera as the user orbits it (so the object
  never goes dark from one angle), parent the light to that scene's camera rather than adding it as
  a sibling of the object. Each scene's camera and lights are scoped to that scene; nothing here is
  shared across the `sceneElements` entries except the renderer and canvas itself.

[MAN-multiple-scenes]

## Putting the frame loop together

```js
function render() {
  renderer.setScissorTest(false);
  renderer.clear(true, true);
  renderer.setScissorTest(true);

  renderer.domElement.style.transform = `translateY(${window.scrollY}px)`; // see phase 2

  for (const { elem, fn } of sceneElements) {
    const rect = elem.getBoundingClientRect();
    const { left, right, top, bottom, width, height } = rect;
    const rectHeight = bottom - top;

    const isOffscreen =
      bottom < 0 ||
      top > renderer.domElement.clientHeight ||
      right < 0 ||
      left > renderer.domElement.clientWidth;
    if (isOffscreen) continue;

    const positiveYUpBottom = renderer.domElement.clientHeight - bottom;
    renderer.setScissor(left, positiveYUpBottom, width, rectHeight);
    renderer.setViewport(left, positiveYUpBottom, width, rectHeight);

    fn(rect, rectHeight); // updates that scene's camera.aspect + updateProjectionMatrix, then renders
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
```

This unconditional `requestAnimationFrame` loop is the starting point. Phase 5 replaces it with a
render-on-demand version once the per-diagram plumbing above is working. [MAN-multiple-scenes]
[MAN-rendering-on-demand]
