# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Page works fine, then a diagram or the hero canvas just stops rendering with no error | The ~8-context cap was exceeded and the browser silently dropped the oldest `WebGLRenderer`'s context | Audit for one canvas per diagram; consolidate to a single shared canvas/renderer (phase 1) |
| A diagram renders upside-down, or content from one diagram bleeds into another's rectangle | Scissor Y computed as top-down (straight from `getBoundingClientRect`) instead of converted to bottom-up | Convert with `clientHeight - bottom` before every `setScissor`/`setViewport` call (phase 1) |
| One diagram looks stretched or cropped relative to its own placeholder | `setScissor` and `setViewport` were called with different rectangles for the same element | Always compute the rect once and pass the identical values to both calls (phase 1) |
| Diagrams near the top/bottom of the page render into the wrong spot, or nothing, while scrolling fast | The canvas is `position: fixed` and unsynced, or `translateY` sync is applied on a different frame than the scissor math | Use `position: absolute` + `translateY(scrollY)` computed in the *same* render call as the scissor rectangles (phase 2) |
| Clicking a button or link behind the hero canvas does nothing | The canvas has no `pointer-events: none`, so it silently intercepts the click | Set `pointer-events: none` on any canvas that is purely visual furniture (phase 3) |
| Canvas draws an opaque background even though the scene's clear alpha looks transparent | `WebGLRenderer` was constructed without `alpha: true` (or without `premultipliedAlpha: false`) | Construct with `{alpha: true, premultipliedAlpha: false}` (phase 3) |
| A label sits at the wrong screen position, or drifts as the page scrolls | `clientWidth`/`clientHeight` used for the NDC-to-CSS conversion belong to the wrong element, or are stale from before a resize | Recompute from the canvas/element actually being projected into, every frame (phase 4) |
| A label stays visible when its object is off-screen or behind the camera | The `Math.abs(z) > 1` check was skipped, or only checked once at creation instead of every frame | Re-check every frame per phase 4; remember it is an origin-only test (section D below) |
| `OrbitControls` with damping never settles; the page never goes idle; fan spins up | `change` was bound directly to `render`, and damping's own `controls.update()` re-emits `change`, creating a self-sustaining loop | Route through the `renderRequested` flag pattern (phase 5) — never bind `render` to `change` directly when `enableDamping` is on |
| A scene stops updating after the user interacts, even though `renderRequested` logic is in place | A source of change (a GUI control, a custom animation) was never wired to `requestRenderIfNotRequested` | Audit every state mutation and confirm it calls the request function (phase 5) |

## B. Verified discrepancies

No discrepancies between the manual's prose and its own code samples were found for this skill's
capability set during this research pass. Unlike the react-force-graph skill's README-vs-types
diffing (which had a second source — the `.d.ts`/`.js` files — to diff against), the grounding here
is a single family of manual pages describing one library's own documented behavior, with no
competing API-reference table to diff it against for this specific capability set. Stated honestly
rather than fabricated: **section B is empty for this skill.** If a future pass diffs
`multiple-scenes`/`align-html-elements-to-3d`/`rendering-on-demand` prose against the current
`WebGLRenderer` API reference in more depth than the scissor/viewport signatures already checked
here, record findings in this section rather than assuming none exist.

## C. Traps that are not discrepancies, just easy to miss

- **"One canvas" means one canvas for the whole page, not one per section.** It's easy to read
  "scissor and viewport" and still reach for a canvas-per-diagram implementation out of habit,
  especially when each diagram is built as an independently-authored component. The context cap is
  the reason this fails at diagram #9, not before — small pages with a handful of diagrams can look
  fine right up until they don't.
- **Registering placeholders is a one-time DOM query, not a per-frame one.** `querySelectorAll` and
  reading `dataset.diagram` belong in setup code, once. Re-running them inside the render loop
  reintroduces DOM query cost into a per-frame budget that's already spending time on
  `getBoundingClientRect()` per element.
- **The bottom-up/top-down mismatch shows up twice, in two different forms.** Phase 1's scissor-Y
  conversion (`clientHeight - bottom`) and phase 4's NDC-Y flip (`* -0.5 + 0.5`) are two independent
  instances of the same top-down-vs-bottom-up axis mismatch, not the same bug fixed once. Fixing one
  does not fix the other.
- **`position: fixed` is correct for a pure backdrop and wrong for a scroll-synced viewport.** Phase
  3's hero-canvas recipe deliberately uses `fixed`; phase 2's scroll-sync recipe deliberately avoids
  it. The same CSS property is right in one usage pattern and the documented cause of visible skew
  in the other — the difference is whether the canvas is meant to move with scroll (synced) or stay
  put (furniture).
- **`drawImage` + `globalCompositeOperation: 'copy'` is a fallback, not an optimization.** It exists
  for the specific case of an element needing normal document flow; reaching for it by default
  instead of the scissor/viewport path adds the documented slowdown for no benefit if flow isn't
  actually required.
- **Occlusion raycasting for labels doesn't scale to "every label, every frame."** The manual's own
  caution about raycast cost per label per frame means a page with many labels needs a filtering
  strategy (hover-triggered, an "important labels" subset) rather than uniformly raycasting
  everything.
- **Render-on-demand is a per-page-region decision, not a blanket rule.** A continuously animated
  hero object should keep an unconditional loop; applying `renderRequested` bookkeeping to genuinely
  continuous animation adds complexity without saving anything.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **Label visibility checks the object's origin only.** `Math.abs(tempV.z) > 1` in
   `align-html-elements-to-3d` tests a single projected point, so a large object can have its label
   pop visible/invisible at the wrong moment relative to what's actually on screen. The manual names
   `Frustum.setFromProjectionMatrix` as the more accurate, more expensive alternative but never works
   through an implementation of it. Treat frustum-based visibility as something to build and cost
   yourself.
2. **No no-WebGL fallback, `prefers-reduced-motion` handling, or preloader strategy is documented**
   for a page whose hero or primary content is a 3D canvas. Nothing in the manual's website-oriented
   pages (`multiple-scenes`, `tips`, `align-html-elements-to-3d`, `rendering-on-demand`,
   `responsive`) addresses what to show a visitor without WebGL support, how to respect a
   reduced-motion preference, or how to structure a loading state while the scene/assets initialize.
   Any of these need to be designed and verified independently of this skill's sources.
3. **No accessibility guidance for canvas content beyond a `tabindex` mention** (noted in the
   `tips` page in passing, in the broader research pass behind this skill, but not developed into a
   pattern). Screen-reader behavior, keyboard interaction with orbit controls, and ARIA labeling for
   DOM-anchored 3D labels are all undocumented by the sources this skill is grounded in.
4. **GSAP/ScrollTrigger/Lenis/Locomotive Scroll integration is unverified in both directions.**
   Neither the three.js manual nor react-three-fiber's own docs mention any of these scroll-animation
   libraries. If a build combines this skill's scroll-synchronisation technique (phase 2) with one of
   these libraries for scroll-driven *animation* (as opposed to just keeping the canvas visually
   locked to the page), that combination has not been validated against any official source and
   should be treated as a real gap, not an oversight to route around silently.
