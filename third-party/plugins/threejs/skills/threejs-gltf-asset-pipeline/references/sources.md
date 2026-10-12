# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D).

Pinned at three.js **r185** (npm `three@0.185.1`), read from the rendered manual/docs pages at
threejs.org, per the doc-mining research run on 2026-08-06 and the validated skill brief that
scoped this skill.

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[GLTF]` | [threejs.org/manual/en/load-gltf.html](https://threejs.org/manual/en/load-gltf.html) | official-docs | fetched | high | `GLTFLoader` usage, `dumpObject` hierarchy dump, `Box3`-based camera framing, Blender apply-scale trap, Z-up/Y-up wrapper nodes, shadow `traverse` pattern, lights-in-code rule |
| `[OBJ]` | [threejs.org/manual/en/load-obj.html](https://threejs.org/manual/en/load-obj.html) | official-docs | fetched | high | MTL-before-OBJ load order, `preload()`/`setMaterials()`, `Kd 0 0 0` / `Ks 0 0 0` black-texture bugs, the `norm` keyword for normal maps, `Box3` auto-framing applying equally to OBJ |
| `[LOAD3D]` | [threejs.org/manual/en/loading-3d-models.html](https://threejs.org/manual/en/loading-3d-models.html) | official-docs | fetched | high | glTF 2.0 recommendation, loaders living in `three/addons`, OBJ's lack of hierarchy/skeleton/animation |
| `[GLTFDOC]` | [threejs.org/docs/pages/GLTFLoader.html](https://threejs.org/docs/pages/GLTFLoader.html) | official-docs | fetched | high | extension list, `setDRACOLoader`/`setKTX2Loader`/`setMeshoptDecoder`, the `gltf` result shape (`scene`/`scenes`/`animations`/`cameras`/`asset`/`parser`/`userData`), the image-bitmap disposal note |
| `[CLEANUP]` | [threejs.org/manual/en/cleanup.html](https://threejs.org/manual/en/cleanup.html) | official-docs | fetched | high | the four dispose kinds, the full `ResourceTracker` implementation, the SPA route-change leak warning, the shared-resource-across-trackers caveat, objects attached post-load |
| `[TEX]` | [threejs.org/manual/en/textures.html](https://threejs.org/manual/en/textures.html) | official-docs | fetched | high | `LoadingManager`/`onProgress(url, itemsLoaded, itemsTotal)`; the texture-memory formula that governs what a loaded asset actually costs |
| `[COLOR]` | [threejs.org/manual/en/color-management.html](https://threejs.org/manual/en/color-management.html) | official-docs | fetched | high | `colorSpace` annotation as the documented cause of washed-out or dark imported assets |

Every tagged claim above was carried forward from `/home/claude/scout/threejs-research.md`
("### 2. Get an artist's asset into a lit, correctly-scaled, correctly-colored scene" and
"### 11. Resource lifecycle and memory across route changes"), which itself records the fetch log
and confidence for each URL.

## Deliberate exclusions

- **`gltf-transform` and `gltfpack`** (or any other asset-authoring/compression toolchain) are not
  treated as sources here. The mined material never names them — only the *runtime* decoder wiring
  (`setDRACOLoader`/`setKTX2Loader`/`setMeshoptDecoder`) is documented. Deciding how to compress an
  asset is a different surface and a different skill's concern.
- **Blender/Maya modelling workflows** are out of scope. This skill only covers what three.js can
  observe and correct for at load time (scale/orientation traps), not how to model or export
  correctly in the first place.
- **Material *authoring*** (the material ladder, texture maps beyond the colorSpace/black-texture
  bugs, PBR properties) is `threejs-materials-lighting-shadows`'s concern. This skill only flags
  material symptoms that look like import corruption.
- **Animation *playback*** (`AnimationMixer`, clips, actions) is `threejs-animation-system`'s
  concern. This skill only notes that `gltf.animations` exists on the load result.
- **React/Suspense-based loading** (`useLoader`, automatic caching-by-URL, the `gltfjsx` CLI) is
  owned by the react-three-fiber plugin's `r3f-asset-loading-pipeline` skill, which wraps the exact
  loader mechanics documented here in a different surface.
- **Loading UX, preloaders, and LOD streaming** — no source in the mined material covers these; they
  are not merely descoped, they are genuinely unsourced.

## Provenance note

This skill was compiled manually (stages 2–5 of the skill-forge pipeline — compile, distill,
optimize, package) because the `llm-kb` tool was unavailable in this environment. The scout research
(`/home/claude/scout/threejs-research.md`) and the validated skill brief (portfolio manifest entry
`threejs-gltf-asset-pipeline`) stand in for that tool's output and are the sole grounding for every
procedural claim above. No fact here was added from general model knowledge; the three genuine gaps
the research surfaced (Draco/KTX2/Meshopt encoding, shared-resource ownership, image-bitmap
disposal) are carried forward as open questions in `gotchas.md` section D rather than filled in.
