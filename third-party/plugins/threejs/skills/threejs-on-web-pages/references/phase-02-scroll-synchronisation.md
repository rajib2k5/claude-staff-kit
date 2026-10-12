# Phase 2 — Scroll synchronisation

**Triggers:** canvas lags behind scroll, diagram skews or jumps while scrolling, `position: fixed`
vs `position: absolute` for a full-page canvas, keeping a scissored region locked to its DOM anchor,
an element that must stay in normal document flow instead of behind it.

## The problem: `position: fixed` skews under scroll

A single canvas covering the page (phase 1) has to visually track scroll, because the scissor
rectangles are computed from `getBoundingClientRect()`, which is viewport-relative. The naive fix —
`position: fixed` on the canvas, so it never moves relative to the viewport — looks correct until a
frame lands late: the browser has already scrolled the real DOM content by the time that frame's
scissor rectangles are computed and drawn, so the 3D content visibly skews out of alignment with the
text and placeholders it's supposed to sit under. This is documented as a real, visible artifact,
not a theoretical one. [MAN-multiple-scenes]

## The documented fix

Use `position: absolute` instead of `fixed`, and manually re-position the canvas to track scroll
every frame:

```css
#c {
  position: absolute; /* not fixed */
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}
```

```js
function render() {
  renderer.domElement.style.transform = `translateY(${window.scrollY}px)`;
  // ... scissor/viewport loop from phase 1 ...
  requestAnimationFrame(render);
}
```

Because the canvas is `absolute`, it scrolls with the page by default, like any other block
content. The `translateY(scrollY)` offset then pulls it back so it always covers the current
viewport — and because this repositioning happens inside the *same* render call that computes the
scissor rectangles (via `getBoundingClientRect()` on each placeholder), the canvas and the rectangles
it's about to draw into are always computed against the same scroll position, frame by frame. There
is no window between "the browser scrolled" and "the canvas caught up." [MAN-multiple-scenes]

## Why this differs from just leaving the canvas `fixed`

With `fixed` positioning, the canvas's on-screen location is entirely up to the browser's
compositor and is not something your JS re-asserts every frame — so a slow frame (heavy scene, GC
pause, a dropped frame under scroll-jank) leaves stale pixels rendered for the *previous* scroll
position sitting under content that has already moved. With `absolute` + manual `translateY`, the
canvas's position is something your render function actively re-declares every single frame,
in lockstep with the scissor math, so a late frame draws late but never draws *misaligned*.
[MAN-multiple-scenes]

## Alternative: elements that must stay in normal document flow

The scissor/viewport technique assumes the canvas can sit behind everything at `z-index: -1` while
placeholders are transparent holes text flows around. Some layouts need the opposite — a diagram
that must behave like a normal inline/block element for layout purposes (its own stacking context,
its own scroll clipping, etc.) rather than a transparent window onto a shared background canvas.

For that case, the manual documents rendering into the shared off-screen canvas as before, then
copying the relevant rectangle into a **per-element 2D canvas** that lives in normal flow:

```js
// after rendering this element's scene into the shared WebGL canvas at its scissor rect:
const ctx = elem2dCanvas.getContext('2d');
ctx.globalCompositeOperation = 'copy';
ctx.drawImage(
  renderer.domElement,
  left, positiveYUpBottom, width, rectHeight,   // source rect in the shared canvas
  0, 0, width, rectHeight,                       // dest rect in the 2D canvas
);
```

`globalCompositeOperation = 'copy'` replaces the destination canvas's pixels outright rather than
compositing over them, which is what you want for a straight snapshot of this frame's render.
The manual is explicit that this `drawImage` approach is **slower** than the direct scissor/viewport
technique — it's the documented fallback for when normal document flow is a hard requirement, not
the default choice. [MAN-multiple-scenes]

## What this phase does not decide

Neither `multiple-scenes` nor any other source in this skill's grounding mentions GSAP,
ScrollTrigger, Lenis, or Locomotive Scroll. If a design calls for scroll-driven animation *timing*
(easing a camera move over a scroll range, pinning a section, scrubbing an animation to scroll
position) rather than just keeping a canvas visually locked to the page, that is unverified
territory for this skill — see `references/gotchas.md` section D.
