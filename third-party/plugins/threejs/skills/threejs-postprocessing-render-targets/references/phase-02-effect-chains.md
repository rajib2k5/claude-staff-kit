# Phase 2 — Effect chains

**Triggers:** adding bloom/grain/vignette, `EffectComposer`, `RenderPass`, `OutputPass`, pass
ordering, "colours look wrong after I added an effect", `composer.render`, replacing
`renderer.render(...)` with a composer.

## Build the composer in the right order

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// import whatever effect passes are needed, e.g.:
// import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// composer.addPass(new UnrealBloomPass(...));   // effect passes go here, in the middle
composer.addPass(new OutputPass());               // always last
```

The order is not stylistic — it's the contract: [MAN-post-processing] [DOCS-EffectComposer]

1. **`RenderPass(scene, camera)` first.** This is what actually draws the 3D scene into the chain's
   first intermediate buffer; every later pass reads and rewrites that buffer.
2. **Effect passes in the middle**, each one reading the previous pass's output and writing a new
   buffer (or the same one, depending on the pass), in whatever order the visual effect calls for.
3. **`OutputPass` last.** It performs the sRGB conversion and tone-mapping step that produces a
   correct on-screen image. An effect pass placed after `OutputPass` is operating on already
   colour-converted data, which is a documented way to get a wrong-looking result.

## Drive frames with the composer, not the renderer directly

Once a composer exists, it replaces the direct render call: [MAN-post-processing]

```js
const clock = new THREE.Clock();

function render() {
  const deltaTime = clock.getDelta(); // seconds since the previous frame, not elapsed time
  composer.render(deltaTime);
  requestAnimationFrame(render); // or setAnimationLoop, per threejs-scene-setup
}
```

`composer.render(deltaTime)` expects a **real per-frame delta in seconds** — not the total elapsed
time since the app started. Any effect pass that's time-driven (a bloom pulse, a grain animation,
anything reading a passed-in time-like uniform) depends on that being a genuine per-frame delta;
feeding it elapsed time instead produces motion that runs at the wrong, ever-accelerating rate rather
than erroring. Keep a `then`/`now` pair or use `THREE.Clock.getDelta()` — the same delta-time
discipline used by the animation system (`AnimationMixer.update(dt)`). [MAN-post-processing]
[B5-animation]

## Colour management interaction

`OutputPass`'s placement is directly load-bearing for colour correctness, and the manual's
diagnosis table for colour bugs (`color-management.html`) applies here exactly as it does to the base
renderer setup: [MAN-color-management] [MAN-post-processing]

| Symptom | Likely cause |
|---|---|
| Result is globally too light / washed out after adding post-processing | Double conversion — `OutputPass` missing (so a fallback/implicit conversion elsewhere runs unexpectedly), or `OutputPass` applied twice in the chain |
| Result is globally too dark | `renderer.outputColorSpace` not set to `THREE.SRGBColorSpace` — this is a renderer-level setting, not something `OutputPass` placement fixes |

The confidence on the *mechanism* here (medium, per the brief) is lower than on the composer-ordering
rule itself (high): the manual states plainly that `OutputPass` performs sRGB conversion and tone
mapping and must go last, and that colour-management.html's washed-out/dark table applies, but it
does not walk through the exact internal double-conversion path step by step. Treat "OutputPass last,
exactly once" as the actionable rule, and the light/dark diagnosis table as the triage tool when
something still looks wrong.

## Composing render-to-texture with an effect chain

Phase 1's render-to-texture pattern and this phase's `EffectComposer` pattern are independent and
compose without special handling: a scene rendered into a `WebGLRenderTarget` for a mirror/screen
texture is unaffected by whether the *main* scene that eventually displays that texture is itself
run through a composer. Nothing in the research states an interaction between the two beyond "they
are separate render passes issued in sequence" — if the inner (`rtScene`) render itself needs
post-processing, it would need its own composer targeting the render target, which is not something
either source page walks through explicitly. Treat that combination as unverified rather than assumed
to just work.
