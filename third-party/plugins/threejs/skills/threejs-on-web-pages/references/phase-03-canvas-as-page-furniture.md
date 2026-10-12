# Phase 3 — Canvas as page furniture

**Triggers:** hero canvas behind text, 3D background for a whole site, canvas capturing clicks that
should reach the page underneath, transparent WebGL canvas over a page background, embedding a
complex 3D page inside a simpler one, `pointer-events`, `premultipliedAlpha`.

## The hero-canvas-behind-content recipe

For a canvas that exists purely as visual backdrop — hero art behind a headline, an ambient
background for a whole page — the manual's recipe is three CSS declarations plus a renderer option:

```css
#bg {
  position: fixed;
  z-index: -1;
  pointer-events: none;
}
```

- `position: fixed` — the canvas covers the viewport and does not participate in document scroll
  (unlike the scroll-synced multi-diagram case in phases 1–2, a pure backdrop is *supposed* to stay
  put, so `fixed` is correct here — it is only wrong when the canvas needs to track scrolling
  content).
- `z-index: -1` — sits behind every normal-flow element on the page.
- `pointer-events: none` — clicks, hovers and drags pass through the canvas to whatever DOM content
  is visually on top of it. Without this, a full-viewport canvas silently eats every click on the
  page, including ones that look like they landed on a button or a link.

[MAN-tips]

## Transparent canvas over page content

To let the page's own background (color, image, gradient) show through the canvas instead of the
canvas drawing an opaque background of its own, construct the renderer with both `alpha` and
`premultipliedAlpha` set:

```js
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  premultipliedAlpha: false,
});
```

`alpha: true` enables an alpha channel in the drawing buffer at all — without it the canvas is
opaque no matter what the scene's clear color alpha is set to. `premultipliedAlpha: false` is
documented alongside it as the pairing that gives correct-looking transparency when compositing the
canvas over other page content, rather than the default premultiplied blending, which is tuned for
compositing WebGL output over an opaque black background. [MAN-tips]

## Recommendation for complex pages: isolate in an iframe

For anything beyond a simple background — a fully interactive 3D scene that needs to coexist with a
complex page (its own scroll, its own overlapping fixed elements, its own event handlers) — the
manual's recommendation is to put the three.js content in an **iframe** rather than trying to make it
a first-class citizen of the host page's DOM and event system. An iframe gives the 3D content its
own document, its own `pointer-events` boundary, and isolates it from the host page's CSS/JS in both
directions, at the cost of the two documents needing an explicit message channel if they need to
talk to each other. [MAN-tips]

Choose between "canvas as a styled DOM element on the host page" (phases 1–2, and the transparent
backdrop above) and "canvas inside an iframe" based on how much the 3D content and the host page
need to interoperate: heavy interop (scroll-synced diagrams, DOM-anchored labels) favors keeping it
in the host document; a self-contained 3D widget embedded in an otherwise unrelated page favors the
iframe.

## Relationship to the multi-viewport pattern

A hero/background canvas and the scroll-synced multi-diagram canvas from phase 1 can be the *same*
canvas and the *same* `WebGLRenderer` — nothing about the ~8-context cap changes just because one
region of the canvas is "background" and another is "an inline diagram." The difference is purely in
which CSS positioning strategy (`fixed` vs `absolute` + `translateY`) and which scissor rectangle (a
diagram's placeholder rect vs the full canvas) apply to that region. Treat "canvas as furniture" and
"canvas as scroll-synced viewport" as two usage patterns of one shared context, not two different
canvases. [MAN-multiple-scenes] [MAN-tips]
