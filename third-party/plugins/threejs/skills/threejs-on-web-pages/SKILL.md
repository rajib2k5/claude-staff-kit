---
name: threejs-on-web-pages
description: Put three.js inline with real page content instead of a single full-bleed canvas — scroll-synced 3D diagram viewports down a long article, a hero canvas behind text, HTML labels pinned to moving 3D points — all on one shared WebGL context. Use for "multiple three.js scenes on one page", "scroll-synced 3D diagram", "canvas skews while scrolling", "canvas lags behind scroll", "hero canvas behind text", "3D background for a website", "WebGL context limit", "too many canvases", "data-diagram", "scissor and viewport", "pin HTML label to 3D object", "align-html-elements-to-3d", "getBoundingClientRect for a 3D scene", "render on demand", "three.js battery drain", or "canvas captures clicks / pointer-events". Not for a single embedded canvas, react-three-fiber apps, GSAP/ScrollTrigger scroll animation, or the 3D content itself.
---

# three.js on web pages

Grounded in the three.js manual @ r185 (npm `three@0.185.1`) — `multiple-scenes`,
`align-html-elements-to-3d`, `rendering-on-demand`, `tips`, `responsive`, `libraries-and-plugins`,
and the `WebGLRenderer` API reference. Every claim in the references carries a source tag; see
`references/sources.md`.

## Scope

**Covers:** the ~8 WebGL-context browser cap and why a page with several 3D "windows" must share
one canvas; the scissor/viewport multi-scene pattern (`data-diagram` placeholders, per-element
`getBoundingClientRect`, `setScissorTest`/`setScissor`/`setViewport`, clear order, offscreen
culling, per-element camera aspect); the bottom-up scissor-Y vs top-down rect-Y conversion; the
`position: absolute` + per-frame `translateY(scrollY)` fix for scroll skew, and the
`drawImage`/`globalCompositeOperation: 'copy'` alternative for elements that must stay in normal
document flow; sitting a canvas behind or between DOM content (`position:fixed`, `z-index:-1`,
`pointer-events:none`, transparent-canvas construction, the iframe-isolation recommendation for
complex pages); DOM-anchored 3D labels (`Vector3.project`, NDC-to-CSS math, off-screen hiding,
occlusion raycast, zIndex sorting); per-element controls and camera-parented lights; render-on-demand
with the `renderRequested` flag and the `enableDamping` infinite-loop trap.

**Does not cover:** react-three-fiber, Threlte, tresjs, or any declarative wrapper for a single
embedded canvas — those are scouted separately (see the react-three-fiber plugin), and its
`r3f-canvas-and-app-integration` skill owns Vite/Next.js/React/React Native mounting and bundler
setup when the app is React. Notably, R3F's own docs have no dedicated multi-viewport/scroll-scene
page analogous to `multiple-scenes.html`, so this scissor/viewport technique stays owned here even
inside a React app. GSAP, ScrollTrigger, Lenis and Locomotive Scroll are never mentioned in the
three.js manual or in react-three-fiber's docs — a real gap in both surfaces, not an oversight in
this skill; treat any scroll-animation-library integration as unverified territory (see
`references/gotchas.md` section D). The 3D content itself — assets, materials, animation — belongs
to the sibling skills (`threejs-gltf-asset-pipeline`, `threejs-materials-lighting-shadows`,
`threejs-animation-system`). OffscreenCanvas worker architecture belongs to
`threejs-performance-instancing`.

## The one thing to internalise first

A browser caps WebGL contexts at roughly **8** and silently drops the oldest one when a page tries
to create more — with no resource sharing between contexts. A page with five scroll-synced diagrams
and a hero background cannot be five-plus-one canvases; it must be **one** canvas, one
`WebGLRenderer`, one set of GL resources, with every visible "diagram" being a scissored/viewported
region of that single canvas re-rendered every frame. Everything else in this skill — the
`data-diagram` registration pattern, the scissor math, the scroll sync, render-on-demand — exists in
service of that one constraint.

## Workflow

Work the phases in order for a new scroll-page build; jump straight to one when the task is narrow.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-multi-viewport-on-one-context.md` | several 3D diagrams on one page, "too many canvases", WebGL context limit, `data-diagram`, scissor/viewport, camera aspect per element |
| 2 | `references/phase-02-scroll-synchronisation.md` | canvas lags or skews while scrolling, `position: fixed` vs `absolute`, keeping a scissored region locked to its DOM anchor, elements that must stay in normal document flow |
| 3 | `references/phase-03-canvas-as-page-furniture.md` | hero canvas behind text, 3D background, canvas eating clicks, transparent canvas, embedding a 3D page inside a larger page |
| 4 | `references/phase-04-dom-anchored-3d-labels.md` | HTML tooltip/label pinned to a moving 3D object, labels popping through geometry, label z-index fighting, label stacking order |
| 5 | `references/phase-05-page-citizen-render-loop.md` | mostly-static page burning battery/GPU, `requestAnimationFrame` running forever, OrbitControls damping loop that never stops |

Read `references/gotchas.md` whenever behaviour contradicts expectation — it lists silent failures,
verified discrepancies (or the honest absence of any), traps that aren't discrepancies, and the open
unknowns the manual doesn't answer.

## Definition of done

A finished "three.js on a web page" build satisfies all of these:

1. There is exactly **one** `WebGLRenderer`/canvas on the page for every 3D region, never one
   canvas per diagram or per section.
2. Every 3D placeholder is a real DOM element (`<span data-diagram="...">` or similar), discovered
   once via `querySelectorAll('[data-diagram]')` and registered into a `sceneElements` array of
   `{elem, fn}` (or equivalent), not re-queried every frame.
3. Each frame clears in the documented order — `setScissorTest(false)`, `clear(true, true)`,
   `setScissorTest(true)` — before any per-element scissor/viewport render.
4. Elements fully outside the viewport (`bottom<0 || top>clientHeight || right<0 ||
   left>clientWidth`) are skipped before any `setScissor`/`setViewport`/`render` call for that
   element.
5. The scissor rectangle's Y is converted from the DOM's top-down `getBoundingClientRect` Y to the
   scissor's bottom-up Y (`clientHeight - bottom`) before every `setScissor`/`setViewport` pair, and
   the two calls use **identical** rectangles.
6. Each element's camera has `aspect = rect.width / rect.height` and `updateProjectionMatrix()`
   called every frame, not just once.
7. If the canvas is `position: fixed`, scroll sync uses `position: absolute` plus a per-frame
   `translateY(window.scrollY)` — never a `fixed` canvas left unsynced, which is documented to skew
   visibly when a frame lands late.
8. A hero/background canvas that must not intercept input has `pointer-events: none` and a negative
   `z-index`; if it needs to show DOM content through it, the renderer was constructed with
   `{alpha: true, premultipliedAlpha: false}`.
9. DOM-anchored labels use `getWorldPosition` → `Vector3.project` → NDC-to-CSS transform, hide when
   `Math.abs(z) > 1`, and are sorted with a `zIndex` derived from projected depth — with the
   origin-only visibility caveat (open question, section D of gotchas) called out rather than
   silently trusted for large objects.
10. The render loop is on-demand (`renderRequested` flag driven by `controls`' `change` event and
    `resize`), not an unconditional `requestAnimationFrame`/`setAnimationLoop` loop, unless the scene
    is continuously animated by design.
11. Nothing here relies on a behaviour the sources don't state — the three open unknowns (origin-only
    label visibility, no no-WebGL/`prefers-reduced-motion`/preloader guidance, no canvas-content
    accessibility guidance beyond a `tabindex` mention) are named in `references/gotchas.md` section D
    rather than assumed away.
