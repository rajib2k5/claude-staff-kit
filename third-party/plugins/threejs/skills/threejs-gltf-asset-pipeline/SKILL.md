---
name: threejs-gltf-asset-pipeline
description: Load a glTF/.glb model into a three.js scene with the right decoders wired first (GLTFLoader, Draco/KTX2/Meshopt), inspect its real hierarchy and bounds before touching transforms, fix the scale/orientation/material problems baked in at export (Blender scale-not-applied, Z-up vs Y-up wrapper nodes, OBJ/MTL Kd-black-texture bug, norm vs map_bump), get it lit and shadowed since exported lights rarely survive, and dispose every geometry/material/texture on route change so nothing leaks. Use when the user wants to load a glTF/.glb model, wire up GLTFLoader, load OBJ+MTL, says a model is too big/small/dark/washed-out/black/sideways/upside-down after import, mentions Draco/KTX2/Meshopt decoders, asks how to dispose three.js resources, or is chasing a memory leak on SPA route change.
---

# threejs glTF asset pipeline

Grounded in the three.js manual and docs @ r185 (`three@0.185.1`) — `load-gltf.html`,
`load-obj.html`, `loading-3d-models.html`, `https://threejs.org/docs/pages/GLTFLoader.html`, `cleanup.html`,
`textures.html`, `color-management.html`. Every claim in the references carries a source tag; see
`references/sources.md`.

## Scope

**Covers:** glTF 2.0 (.glb) as the recommended transport and OBJ's stated limits; wiring
`GLTFLoader` (from `three/addons`) with `setDRACOLoader`/`setKTX2Loader`/`setMeshoptDecoder` before
the first load; `loadAsync` and the full `gltf` result shape; dumping an unfamiliar hierarchy before
assuming anything about it; `Box3.setFromObject` for camera framing and near/far; enabling shadows
via `traverse`; adding lights in code because exported lights rarely survive; the Blender
apply-scale and Z-up/Y-up traps; the OBJ/MTL load order and its black-texture/normal-map bugs;
`LoadingManager`/`onProgress`; the four dispose kinds and a per-file `ResourceTracker`; the SPA
route-change leak and the shared-resource caveat.

**Does not cover:** asset authoring/optimization toolchains (`gltf-transform`, `gltfpack` — never
named in the sourced material, only runtime decoder wiring is); modelling in Blender/Maya; material
*authoring* (see `threejs-materials-lighting-shadows`); animation *playback* (see
`threejs-animation-system`); loading UX, preloaders, and LOD streaming (no source covers these);
React/Suspense-based loading — `useLoader`, automatic caching-by-URL, the `gltfjsx` CLI. That layer
is owned by the react-three-fiber plugin's **`r3f-asset-loading-pipeline`** skill, which wraps the
exact loader mechanics documented here; this skill is what that one ultimately depends on.

## The one thing to internalise first

Nothing about an artist's file arrives correct. Scale, orientation, lighting and even which
textures are actually wired up are all things the exporter may have silently mangled. The fix is
never to guess a transform or hard-code a rotation — it is to **inspect first**: dump the hierarchy,
compute the `Box3`, and only then decide what, if anything, needs correcting. Every phase below
exists because guessing was tried first and failed.

## Workflow

Work the phases in order for a new asset; jump straight to one when the task is narrow.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-loading-and-decoding.md` | first load of a `.glb`, "model won't load", missing-extension errors, choosing glTF vs OBJ, wiring Draco/KTX2/Meshopt |
| 2 | `references/phase-02-inspect-and-frame.md` | unfamiliar asset, "where is X in this model", camera framing, deriving near/far, before writing any transform code |
| 3 | `references/phase-03-export-trap-remediation.md` | model is too big/small/sideways/upside-down/dark/black after import, missing shadows, missing lights, OBJ textures look wrong |
| 4 | `references/phase-04-resource-lifecycle.md` | unloading a model on route change, SPA memory growth, "when do I call dispose", swapping models in the same view |

Read `references/gotchas.md` whenever behaviour contradicts what you expected — it lists the silent
failure modes, an honest note on version-drift, easy-to-miss traps, and the open questions no source
answers.

## Definition of done

A finished asset-loading integration satisfies all of these:

1. glTF 2.0 (.glb) was chosen over OBJ unless the source asset genuinely has no hierarchy, skeleton,
   or animation to lose.
2. Any Draco/KTX2/Meshopt decoder the asset needs is wired onto the loader **before** the first
   `load`/`loadAsync` call, not after.
3. The hierarchy was dumped and the bounding box computed (`Box3.setFromObject` → `getSize`/
   `getCenter`) before any transform, camera position, or near/far value was written by hand.
4. Object scale/orientation oddities were traced to a known export trap (unapplied Blender scale,
   a `RootNode_(gltf_orientation_matrix)`-style wrapper) rather than patched with a guessed
   correction factor.
5. Lights exist in code, not assumed from the file; `castShadow`/`receiveShadow` were set via
   `traverse` and `renderer.shadowMap.enabled` is on if shadows are expected.
6. For OBJ: `.mtl` loaded and `preload()`'d, `setMaterials()` called, **then** `.obj` loaded — in
   that order — with `Kd`/`Ks` and the `norm` keyword checked if a texture looks wrong.
7. Every texture involved in the visual bug list (washed-out, too dark, black) was checked for a
   `colorSpace` annotation before touching lights or exposure.
8. Every load that can be unmounted has a `ResourceTracker`, and its `dispose()` is called from the
   route-change / unmount hook — not left to garbage collection, which three.js explicitly cannot do
   for WebGL resources.
9. Nothing in the integration relies on a behaviour the sources do not state. The three real
   unknowns (Draco/KTX2/Meshopt *encoding*, shared-resource ownership across trackers, image-bitmap
   disposal) are listed in `references/gotchas.md` section D; if the work depends on one, say so
   rather than assuming.
