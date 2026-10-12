# Phase 4 — Frame budgeting

**Triggers:** rendering continuously when nothing changed, deciding whether to render at all,
distant complex objects, facades, billboards, power/battery complaints, fewer lights, shadow cost,
texture memory, material tier.

This phase covers two different questions that both cut per-frame cost without touching geometry
counts: *should this frame render at all*, and *what are the fixed costs every frame pays
regardless of geometry*.

## Render on demand instead of every frame

The default `requestAnimationFrame` loop renders whether or not anything changed. On a mostly
static scene — a product viewer, a diagram, anything driven by user interaction rather than
continuous animation — that is pure waste of GPU time and battery.

1. Delete the unconditional loop. Call `render()` once, at startup.
2. Add a guarded re-render request:

   ```js
   let renderRequested = false;

   function requestRenderIfNotRequested() {
     if (!renderRequested) {
       renderRequested = true;
       requestAnimationFrame(render);
     }
   }

   function render() {
     renderRequested = false;
     controls.update();
     renderer.render(scene, camera);
   }
   ```

3. Wire every source of visible change through that same guarded function:
   `controls.addEventListener('change', requestRenderIfNotRequested)`,
   `window.addEventListener('resize', requestRenderIfNotRequested)`, and any GUI/state control's
   `.onChange(requestRenderIfNotRequested)`.
4. If a tween or animation is actively running, re-request from inside `render()` on every frame
   until it finishes, then stop requesting.

### The damping feedback-loop trap

If `OrbitControls.enableDamping` is on, do **not** bind `render` directly to the controls' `change`
event. Damping means `controls.update()` itself emits a `change` event as it eases toward its
target — if that event's handler is `render` directly, and `render()` doesn't itself track a guard,
you get an infinite loop of `change` triggering render, which (if render also updates controls)
retriggers change. The `renderRequested` boolean above is the documented fix: `change` requests a
frame; the frame flips the flag back to false before doing anything else, so a burst of `change`
events during one damped ease coalesces into the frames actually needed, not one request per event.

## Cut the fixed costs every frame pays

These don't depend on how many objects are in the scene — they're paid once per frame (or once per
shadow-casting light) regardless of geometry, so they're worth reviewing even after phases 1–3 are
done:

- **Fewer lights.** Every light adds shading cost; every *shadow-casting* light forces an extra
  render pass over every caster to build its shadow map, on top of the main pass.
- **One shadow-casting light, or a fake shadow.** If the scene doesn't need physically accurate
  shadows from multiple sources, restrict shadow casting to a single light, or replace a shadow
  with a cheap faked one (e.g. a flat, semi-transparent plane placed under the object) instead of a
  real shadow-map pass.
- **Smaller texture dimensions.** Texture cost is driven by pixel dimensions, not file size on
  disk — shrinking the actual width/height of a texture reduces GPU memory and sampling cost in a
  way that recompressing the source file does not.
- **A cheaper material tier.** Material choice has a real, ordered cost; stepping down a tier
  (e.g. away from a physically-based material toward a simpler one) when the visual difference
  doesn't matter for a given object is a direct per-pixel saving.

## Facades: replace distant complex objects with a texture

For an object that's far enough away that its geometric detail is wasted — visually equivalent to a
flat image from that distance — render it once into an off-screen target and reuse that image on a
cheap `Sprite` instead of drawing the real geometry every frame:

1. Render the complex object into a `WebGLRenderTarget` once (not every frame):

   ```js
   const rt = new THREE.WebGLRenderTarget(width, height);
   renderer.setRenderTarget(rt);
   renderer.render(facadeScene, facadeCamera);
   renderer.setRenderTarget(null);
   ```

2. Build a `Sprite` whose material samples that render target's texture:

   ```js
   const spriteMaterial = new THREE.SpriteMaterial({ map: rt.texture });
   const sprite = new THREE.Sprite(spriteMaterial);
   sprite.position.copy(distantObjectPosition);
   scene.add(sprite);
   ```

3. Use the sprite in place of the real object for distant instances. A `Sprite` always faces the
   camera and costs a single flat quad's worth of geometry regardless of how complex the object it
   depicts actually is.

This is a different lever from merging (phase 1) or instancing (phase 2): those reduce draw calls
for objects you still render in full; a facade reduces the *cost per remaining draw* by swapping
real geometry for a flat image where the viewer can't tell the difference.

## Ordering these levers

Cutting fixed costs and rendering on demand are cheap to try and don't require restructuring
geometry, so they're a reasonable first pass even before merging/instancing work in phases 1–2 —
but they don't fix a scene whose fundamental problem is draw-call count or node-traversal count.
Use the "measure first" table in `SKILL.md` to decide which problem you actually have.
