---
name: threejs-scene-setup
description: Go from empty HTML to a correctly sized, DPI-aware, colour-managed three.js canvas with a sane scene graph and a render loop that survives resize, mobile and tab-switching. Use for "three.js scene setup", "new THREE.Scene", "WebGLRenderer", blurry canvas, canvas fills the whole page (or doesn't), canvas stuck at 300x150, colours look washed out or dark, setPixelRatio, devicePixelRatio, resizeRendererToDisplaySize, scene graph, Object3D hierarchy, scale-inheritance bugs, camera.aspect / updateProjectionMatrix, near/far and z-fighting, logarithmicDepthBuffer, ColorManagement, outputColorSpace, SRGBColorSpace, AxesHelper/GridHelper, importmap for three, file:// CORS errors loading three.js, or setAnimationLoop vs requestAnimationFrame. Does not cover materials/lights/shadows, loading glTF/OBJ assets, multi-viewport/scroll pages, clip animation, or debugging a blank canvas — see the sibling skills for those.
---

# three.js scene setup

Grounded in the three.js manual and API docs @ r185 (npm `three@0.185.1`) — `creating-a-scene`,
`fundamentals`, `responsive`, `scenegraph`, `cameras`, `color-management`, `installation`, `setup`,
`tips`, and the `WebGLRenderer` API reference. Every claim in the references carries a source tag;
see `references/sources.md`.

## Scope

**Covers:** the local-HTTP-server requirement, npm/importmap install paths, `WebGLRenderer`
construction against a queried canvas plus the CSS contract, `resizeRendererToDisplaySize` and the
mandatory `false` third argument to `setSize`, `camera.aspect` + `updateProjectionMatrix` on resize,
the stance against `setPixelRatio(window.devicePixelRatio)` and the pixel-count cap,
`setAnimationLoop` vs `requestAnimationFrame`, `ColorManagement.enabled` and `outputColorSpace`,
`Object3D` hierarchy and the scale-inheritance trap, radians-vs-degrees and metre-scale convention,
camera frustum/near/far/z-fighting/`logarithmicDepthBuffer`, and `AxesHelper`/`GridHelper` with
`depthTest`/`renderOrder`.

**Does not cover:** materials, lights and shadows (`threejs-materials-lighting-shadows`); loading
glTF/OBJ assets (`threejs-gltf-asset-pipeline`); multi-viewport, scroll pages and DOM-anchored labels
(`threejs-on-web-pages`); clip-based animation (`threejs-animation-system`); diagnosing why nothing
renders (`threejs-debugging-diagnostics`); the primitive-geometry parameter catalog (reference lookup,
not competence). React apps get their own mounting and JSX-expression mechanics from the sibling
react-three-fiber plugin's `r3f-canvas-and-app-integration` and `r3f-scene-graph-authoring` skills —
those wrap this exact material (R3F "transparently maps JSX components to Three.js objects": same
concepts, JSX syntax), they don't replace it. Reach for this skill's concepts either way; reach for
the R3F plugin's skills for the mounting and JSX-expression mechanics when the app is React.

## The one thing to internalise first

The most-copied tutorial line on the internet — `renderer.setPixelRatio(window.devicePixelRatio)` —
is exactly what the three.js manual tells you **not** to do. Handing DPR to `setPixelRatio` gives up
control of the true drawing-buffer size, and that buffer size is what post-processing, screenshots,
GPU picking and `gl_FragCoord` all depend on. The manual's own pattern is: multiply
`clientWidth`/`clientHeight` by `devicePixelRatio` yourself inside `resizeRendererToDisplaySize`,
cap the pixel count for fractional OS scaling, and pass the result to `renderer.setSize(w, h, false)`.
Every blurry-on-retina or overheating-on-150%-scaling report traces back to skipping this.

## Workflow

Work the phases in order for a new scene; jump straight to one when the task is narrow.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-canvas-and-renderer-setup.md` | first canvas, local server / CORS errors, npm vs importmap install, `WebGLRenderer` constructor, the html/body/#c CSS contract |
| 2 | `references/phase-02-resize-and-render-loop.md` | canvas stuck at 300x150, resize breaks aspect, blurry or overheating canvas, `setPixelRatio`, `setAnimationLoop`, tab-switch behaviour, WebXR |
| 3 | `references/phase-03-colour-management.md` | colours look washed out or dark, `ColorManagement.enabled`, `outputColorSpace`, `SRGBColorSpace` |
| 4 | `references/phase-04-scene-graph-composition.md` | building a hierarchy, parts moving relative to a parent, scale-inheritance bugs, `AxesHelper`/`GridHelper` |
| 5 | `references/phase-05-camera-framing.md` | choosing fov/near/far, z-fighting, `logarithmicDepthBuffer`, radians vs degrees |

Read `references/gotchas.md` whenever behaviour contradicts expectation — it lists silent failures,
version-drift discrepancies (or the honest absence of any), traps that aren't discrepancies, and the
open unknowns the docs don't answer.

## Definition of done

A finished scene setup satisfies all of these:

1. The page is served over a local HTTP server, not opened via `file://`.
2. three.js is installed either via `npm install --save three`, or an importmap whose `"three"` and
   `"three/addons/"` entries point at the **same** version and the same CDN.
3. The renderer is constructed against a queried canvas (`new THREE.WebGLRenderer({antialias: true,
   canvas})`), and the CSS contract (`html,body{margin:0;height:100%}`, `#c{width:100%;height:100%;
   display:block}`) is in place — the un-styled canvas default is 300×150.
4. `resizeRendererToDisplaySize` compares `canvas.width/height` against `clientWidth/clientHeight`
   and calls `renderer.setSize(w, h, false)` only on change; `camera.aspect` and
   `updateProjectionMatrix()` are updated only when a resize actually happened.
5. `renderer.setPixelRatio(window.devicePixelRatio)` is **not** called; DPR is applied manually with
   a pixel-count cap for fractional OS scaling.
6. Frames are driven by `renderer.setAnimationLoop(render)`, not a raw `requestAnimationFrame` loop.
7. `THREE.ColorManagement.enabled` is left at its default `true`, and
   `renderer.outputColorSpace = THREE.SRGBColorSpace` is set explicitly.
8. Structural pivots in the scene graph are bare `Object3D` nodes held at scale `(1,1,1)`; visual
   scale lives only on leaf meshes.
9. Camera `fov` is in degrees, every other angle is in radians, and near/far are chosen tight enough
   to avoid z-fighting without documented workarounds (`logarithmicDepthBuffer`) left unconsidered.
10. Nothing here relies on a behaviour the sources don't state — the two open unknowns (no browser
    support matrix in the docs, `manual/` index returning only an SPA shell) are named in
    `references/gotchas.md` section D rather than silently assumed away.
