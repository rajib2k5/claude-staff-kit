# Phase 5 — Page-citizen render loop

**Triggers:** mostly-static 3D page burning battery or GPU, "why is the fan running for a static
scene", unconditional `requestAnimationFrame` loop, `OrbitControls` with `enableDamping` causing an
infinite render loop, render-on-demand, `renderRequested`.

## The premise: most of a marketing/content page's 3D is static

Phases 1–4 build an unconditional render loop (`requestAnimationFrame(render)` calling itself every
frame, forever) because that's the simplest thing that works while the scissor/scroll/label plumbing
is being built. For a page whose 3D content only changes when the user does something — orbits a
diagram, resizes the window — rendering 60 times a second forever is pure waste: GPU cycles, battery,
and (on a laptop) fan noise, for pixels that are identical to the previous frame. [MAN-rendering-on-demand]

## The fix: render once, then render only on request

```js
let renderRequested = false;

function render() {
  renderRequested = false;

  // ... scissor/viewport loop from phase 1, scroll sync from phase 2, label update from phase 4 ...

  if (someControlsAreStillAnimating()) {
    requestRenderIfNotRequested();
  }
}

function requestRenderIfNotRequested() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(render);
  }
}

render(); // draw the initial frame
```

Wire every source of visual change into `requestRenderIfNotRequested` instead of into an
unconditional loop:

```js
controls.addEventListener('change', requestRenderIfNotRequested);
window.addEventListener('resize', requestRenderIfNotRequested);
// any GUI control that mutates scene state:
gui.add(params, 'someValue').onChange(requestRenderIfNotRequested);
```

The `renderRequested` flag is cleared at the very top of `render()`, before the frame is actually
drawn — so if something requests another render *while* this frame is being built (e.g. an
in-progress tween), that request is honored on the next tick rather than being swallowed by the flag
still being `true` from this frame. [MAN-rendering-on-demand]

## The trap: `enableDamping` binding directly to `render` is an infinite loop

```js
// WRONG — do not do this with enableDamping on
controls.addEventListener('change', render);
```

`OrbitControls` with `enableDamping: true` calls `controls.update()` internally on every render to
apply the damping easing, and `controls.update()` itself **emits** a `change` event as part of
applying that damping. If `render` is the direct listener, each render's damping update fires
another `change` event, which triggers another `render`, forever — a self-sustaining loop that never
settles, defeating the entire point of render-on-demand. Routing through the `renderRequested` flag
breaks the cycle: a `change` event while a render is already scheduled (or in flight) is a no-op,
not a fresh call to `render`. This is documented explicitly as the reason the flag pattern exists,
not just an optimization detail. [MAN-rendering-on-demand]

## When a request needs to keep going

Some interactions are legitimately animated for more than one frame — a damped orbit drifting to a
stop, a tween easing a camera move. The pattern for those is to re-request from *inside* `render()`
itself while the animation is still in progress, and stop once it settles:

```js
function render() {
  renderRequested = false;

  controls.update(); // applies damping this frame

  // ... draw ...

  if (controls.dampingIsStillSettling() /* or your own animation state check */) {
    requestRenderIfNotRequested();
  }
}
```

This keeps the loop self-terminating: as long as something is actively changing, rendering
continues frame-by-frame; the moment nothing is changing, the loop stops requesting new frames and
the page goes idle. [MAN-rendering-on-demand]

## Interaction with the multi-viewport pattern (phase 1)

Render-on-demand applies to the *whole* shared render call, not per diagram — because all of the
scissored regions are drawn inside one `render()` invocation on one canvas, a single `change` event
from any one diagram's controls has to trigger a full re-render of every visible region, not just the
region whose controls changed. If different diagrams' controls fire `change` independently, route all
of them through the same `requestRenderIfNotRequested`, so simultaneous changes across several
diagrams still coalesce into one scheduled frame rather than one `requestAnimationFrame` call per
diagram. [MAN-rendering-on-demand] [MAN-multiple-scenes]

## What full-time animation looks like instead

If a scene is continuously animated by design (a spinning hero object, a particle system meant to
run indefinitely), render-on-demand is the wrong tool — an unconditional loop
(`renderer.setAnimationLoop(render)` or a plain `requestAnimationFrame` loop) is correct there, and
forcing render-on-demand onto genuinely continuous animation just adds bookkeeping with no power
saved. Apply this phase to the parts of a page that are static most of the time, not uniformly to
every three.js usage on the page.
