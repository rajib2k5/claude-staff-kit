# Phase 5 — Main-thread offloading

**Triggers:** main-thread jank despite low GPU cost, page feels stuttery while scrolling/typing,
`transferControlToOffscreen`, `OffscreenCanvas`, running the renderer in a Worker, proxying DOM
properties into a worker, OrbitControls inside a worker.

## Diagnose the right problem first

This phase solves *main-thread jank*, not GPU cost. If the GPU is the bottleneck, moving the
renderer into a worker doesn't help — the same draw calls still hit the same GPU. This lever is for
the case where the render loop itself, running on the main thread, is competing with page
JavaScript (layout, event handlers, other page scripts) for main-thread time, and that contention
— not raw rendering cost — is what's producing dropped frames.

## Feature-detect before committing

`canvas.transferControlToOffscreen()` is not universally available. Feature-detect it and fall
back to a normal main-thread renderer when it's missing, rather than assuming the API exists:

```js
if (canvas.transferControlToOffscreen) {
  // worker path
} else {
  // ordinary main-thread three.js setup, unchanged
}
```

## The ElementProxy / ProxyManager pattern

A `Worker` has no DOM. `OffscreenCanvas` gives it a canvas to draw to, but everything a normal
three.js setup reads off the DOM — `clientWidth`, `clientHeight`, `getBoundingClientRect()`, and
every pointer/wheel/keyboard/touch event — has to be proxied across the main-thread/worker
boundary by hand:

1. On the main thread, transfer the canvas and post its initial size:

   ```js
   const offscreen = canvas.transferControlToOffscreen();
   worker.postMessage({ type: 'start', canvas: offscreen, width: canvas.clientWidth, height: canvas.clientHeight }, [offscreen]);
   ```

2. On the main thread, forward the DOM events the worker's controls need (`pointermove`, `wheel`,
   `keydown`, touch events, `resize`) as plain serializable messages — property-by-property, since
   the actual `Event` object can't cross the boundary as-is.
3. In the worker, stand in an **ElementProxy** for the canvas element: an object that exposes
   `clientWidth`/`clientHeight` (kept current from the main thread's forwarded messages) and a
   `getBoundingClientRect()`-shaped method, so that any library code expecting a DOM element (most
   notably `OrbitControls`) can be pointed at the proxy instead of a real element.
4. A **ProxyManager** on the main thread fans events from possibly-multiple DOM elements out to
   their corresponding proxies in the worker, so more than one three.js canvas on the page can each
   have its own proxied element without the worker needing direct DOM access to any of them.

## OrbitControls needs DOM stubs

`OrbitControls` expects to call real DOM methods (`addEventListener`, `getBoundingClientRect`, and
similar) on the element it's given. Inside a worker there is no such element, so the ElementProxy
above needs enough of that surface stubbed out — event listener registration that actually receives
the forwarded events, and a `getBoundingClientRect()` that returns the proxied size — for
`OrbitControls` to function unmodified inside the worker. This is described as a hack in the
source material precisely because it's papering over the absence of a real DOM, not a supported
API surface.

## What's handled and what isn't

The documented sample handles **resize**: a size change forwarded from the main thread updates the
proxy and the offscreen canvas together. It does **not** handle canvas **reposition** — see
`references/gotchas.md` section D for what that means in practice on a scrolling page.

## Relationship to the rest of the skill

Main-thread offloading is orthogonal to phases 1–4: it changes *where* the render loop runs, not
how much work it does per frame. A scene that's still issuing thousands of draw calls will jank a
worker just as it janks the main thread — do the geometry and frame-budget work in phases 1–4
first, and reach for a worker specifically when profiling shows main-thread contention, not GPU
load, as the cause of dropped frames.
