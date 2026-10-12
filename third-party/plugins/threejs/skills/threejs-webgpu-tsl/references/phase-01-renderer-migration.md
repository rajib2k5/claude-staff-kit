# Phase 1 — Renderer migration

**Triggers:** "should I migrate to WebGPURenderer", "three/webgpu", "WebGPU experimental in
three.js", `renderer.setAnimationLoop` vs `await renderer.init()`, "forceWebGL fallback", framing
the migration risk to a client or lead.

**Source coverage: partial.** The manual and the API reference give the migration mechanics and
the unsupported-feature list, but neither gives a decision matrix, a performance benchmark, or a
browser/device support table. Treat this phase as "how to move, and how to say what you don't
know" rather than "proof this is safe."

## The decision, stated honestly

Before writing any code, decide whether this project should move at all, and say so in writing.
The two sources disagree in tone:

- The manual (`webgpurenderer.html`) says `WebGPURenderer` "is still in an experimental state,"
  names missing features, and warns that **some apps may run slower than on `WebGLRenderer`**.
- The API reference (`docs/pages/WebGPURenderer.html`) does not use the word "experimental" and
  instead calls it "the new alternative of `WebGLRenderer`."

This skill follows the manual's framing — it is the more conservative one, and it is the surface
that actually states the risk. Recommend to whoever is paying: this is a bet on a still-evolving
renderer, not yet a default choice, and `WebGLRenderer` remains maintained with no plans for major
new features moving there. Projects that need every feature working today, or that cannot tolerate
a possible performance regression, should stay on `WebGLRenderer`.

## Imports and importmap

Import from `three/webgpu` (not the plain `three` core module) and, once shading enters the
picture, from `three/tsl`. An importmap needs both mapped to their WebGPU-specific build files:

```html
<script type="importmap">
{
  "imports": {
    "three/webgpu": "<cdn-or-local-path>/three.webgpu.js",
    "three/tsl": "<cdn-or-local-path>/three.tsl.js",
    "three/addons/": "<cdn-or-local-path>/examples/jsm/"
  }
}
</script>
```

```js
import * as THREE from 'three/webgpu';
import { pass, mrt, output } from 'three/tsl';
```

The exact CDN path structure is not spelled out for the WebGPU build files in the sources this
skill traces to; pin whatever path you use to a single three.js revision, the same way the core
`"three"` / `"three/addons/"` importmap pair must be pinned together.

## Constructing the renderer

```js
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setAnimationLoop(render);
```

`setAnimationLoop` handles the renderer's async initialization for you — you do not need to await
anything before calling it in this pattern.

## When you must await init yourself

If you drive frames with your own loop instead of `setAnimationLoop`, or if you touch the renderer
(e.g. read a capability, call a method) during initialization, await the async init explicitly
first:

```js
await renderer.init();
// now safe to call renderer methods directly, or drive your own loop
```

The sources state this rule but do not describe the failure mode of skipping it (error vs. silent
misbehavior) — treat "await init() first" as a hard rule to follow, not an optimization to skip
and see what happens.

## Constructor options and their confidence level

The `WebGPURenderer` API reference page lists constructor options including `forceWebGL`,
`multiview`, and `reversedDepthBuffer`. That page is tagged medium confidence in this skill's
sources (see `references/sources.md`) because it is one of the r185 docs pages still mid-migration
to the flat `docs/pages/` URL form, and because it is the surface that omits the "experimental"
language the manual uses. Use the options, but don't treat that page's more upbeat framing as a
second, independent confirmation that the renderer is production-ready.

## Testing the WebGL2 fallback deliberately

```js
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: true });
```

`forceWebGL` exists specifically to fall back to the WebGL2 backend. The manual's framing implies
this fallback exists precisely because WebGPU support or feature parity can't be assumed — so
exercise it deliberately in whatever environments the project must support, rather than assuming
it works because it's automatic. No source in this skill's grounding states which features (if
any) behave differently under the fallback; if that matters to the project, verify it directly
rather than assuming parity.
