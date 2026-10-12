# Phase 4 — Touch parity

**Triggers:** touch controls for a three.js scene, tap/hold to pick on mobile, browser stealing the
gesture (page scrolls or zooms instead of the scene responding), ghost/duplicate mouse events on
touch.

## Mirror the mouse handlers with touch equivalents

Custom pointer-driven picking code (the `mousemove`/`click` handlers from phase 2, or a
GPU-picking tap handler from phase 3) needs a touch equivalent registered alongside it —
`touchstart`/`touchmove`/`touchend` mirroring the same logic, not a separate code path. [MAN-PICK]

```js
canvas.addEventListener('mousemove', (event) => {
  setPickPosition(event, canvas, pickPosition);
});

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  setPickPosition(event.touches[0], canvas, pickPosition);
}, { passive: false });

canvas.addEventListener('touchmove', (event) => {
  setPickPosition(event.touches[0], canvas, pickPosition);
}, { passive: false });

canvas.addEventListener('touchend', () => {
  clearPickPosition(pickPosition);
});
```

`setPickPosition` is the same function from phase 2 — it reads `clientX`/`clientY`, and a touch
event's first active touch point (`event.touches[0]`) exposes the same two properties, so the
canvas-relative + NDC conversion is shared code, not a rewrite. [MAN-PICK]

## Register touch listeners with `{passive: false}`, and call preventDefault on start

Both parts matter together: `{passive: false}` tells the browser this listener may call
`preventDefault()`, and calling it (at least on `touchstart`) stops the browser from treating the
gesture as a page scroll/zoom instead of scene interaction. [MAN-PICK] A `passive: true` (or
default) listener that calls `preventDefault()` has that call silently ignored by the browser — the
page still scrolls underneath the canvas.

## Missing preventDefault also produces synthetic mouse events

Beyond the scroll/zoom hijack, an unhandled touch sequence on the main thread can cause the browser
to synthesize a following mouse event for compatibility with mouse-only code — a documented trap
when a canvas is driven from a background thread: touch events need `preventDefault()` on the main
thread, or synthetic mouse events fire. If a picking handler is wired for both `touchstart` and
`mousedown` on the same canvas without `preventDefault()`, a single tap can double-fire the pick
logic once as a touch event and once as a synthesized mouse event.

## What is not covered here

`OrbitControls`' own built-in touch handling (its `touches.ONE`/`touches.TWO` gesture mapping) is
not walked in the source material behind this skill — only the general `update()`/`dispose()`
requirement and the props table are grounded (`references/phase-01-camera-control.md`). Whether a
custom touch-driven picking handler on the same canvas as `OrbitControls` needs additional
coordination beyond `preventDefault()` (for example, distinguishing a one-finger orbit drag from a
one-finger tap-to-pick) is an open question — see `references/gotchas.md` section D.
