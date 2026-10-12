# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Model is huge or tiny after load | Blender object scale not applied to vertices before export | re-export with scale applied; don't hard-code a load-time multiplier (phase 3) |
| Model is sideways or rotated unexpectedly | Z-up→Y-up wrapper node (`RootNode_(gltf_orientation_matrix)`-style) already correcting for it | dump the hierarchy first; don't add a compensating rotation on top (phase 2, phase 3) |
| Scene renders fully lit with no shadows | `castShadow`/`receiveShadow` are off by default per mesh, and `renderer.shadowMap.enabled` is a separate switch | `traverse` to set both flags, and enable the renderer's shadow map (phase 3) |
| No lights appear to be "from the file" | Lights authored in the source tool do not reliably survive glTF export | add lights in code; stop looking for an import bug (phase 3) |
| OBJ texture appears solid black | `Kd 0 0 0` in the `.mtl` multiplies an otherwise-correct diffuse map to black | check `Kd`/`Ks` values in the `.mtl` (phase 3) |
| Normal map has no visible effect | `MTLLoader` requires the `norm` keyword; `map_bump` is not treated as a normal map | use `norm` in the `.mtl` (phase 3) |
| OBJ loads with no material at all | `.obj` was loaded before `.mtl` was `preload()`'d and `setMaterials()` called | load `.mtl` → `preload()` → `setMaterials()` → **then** `.obj` (phase 3) |
| Imported asset looks washed-out or dark | Missing/incorrect `texture.colorSpace` annotation, mistaken for a lighting problem | annotate color maps `SRGBColorSpace`, leave data maps `NoColorSpace` (phase 3) |
| Memory grows on every route change | No `dispose()` call on unmount/route change | wrap the load in a `ResourceTracker`, call `dispose()` on teardown (phase 4) |
| One loaded model corrupts or crashes after a second one is disposed | Geometry/material shared across two `ResourceTracker`s; disposing one tracker disposes a resource the other still uses | don't share tracked resources across trackers without designing explicit ownership (phase 4) |
| Extension load silently fails or errors deep in a worker | `setDRACOLoader`/`setKTX2Loader`/`setMeshoptDecoder` wired *after* the first `load`/`loadAsync` call instead of before | wire every decoder the asset needs before the first load (phase 1) |

## B. Version-drift discrepancies

No genuine version-drift discrepancy was found for this skill. The mined research did surface one
**documentation-location** finding rather than a content discrepancy: at r185, the legacy docs path
`docs/api/en/loaders/GLTFLoader.html` (and the legacy examples path) 404s; the current, authoritative
form is the flat `docs/pages/GLTFLoader.html`. That is a URL-shape fact, not a conflict between two
sources describing the loader differently — there was no README-vs-types-style diff to run here, so
none is reported. If a future revision changes the `GLTFLoader` extension-hook names or the `gltf`
result shape, re-verify against `docs/pages/GLTFLoader.html` directly rather than trusting this file.

## C. Traps that are not discrepancies, just easy to miss

- **`gltf.scene` is not the whole result.** The load also carries `scenes`, `animations`, `cameras`,
  `asset`, `parser`, and `userData` — worth checking even if you only ever `add()` the one scene.
- **OBJ's missing hierarchy/skeleton/animation is a hard limit, not a configuration option.** There
  is no loader flag that recovers what the format never stored.
- **The MTL load order is strict and unforgiving.** `.mtl` load → `preload()` → `setMaterials()` →
  `.obj` load. Skipping or reordering any step produces no error — just an unmaterialed object.
- **A wrapper node can look like a bug.** `RootNode_(gltf_orientation_matrix)`-style nodes exist
  specifically to reconcile Blender's Z-up with three.js's Y-up; treating one as noise to delete, or
  adding your own correction on top of it, doubles the error instead of fixing it.
- **Objects attached after the initial load aren't tracked for free.** A prop placed into a
  character's hand post-load needs its own `track()` call or it survives `dispose()`.
- **An unused decoder instance is harmless but not free.** Wiring `setDRACOLoader`/`setKTX2Loader`/
  `setMeshoptDecoder` defensively for an asset that doesn't use that extension costs nothing at
  runtime but is one more object to account for when reasoning about what's loaded.
- **`Box3.setFromObject` needs a settled hierarchy.** Framing before you've dumped and understood the
  tree risks framing around a wrapper node's bounds rather than the visible content's.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **Draco/KTX2/Meshopt encoding.** The mined material documents only the *runtime* decoder wiring
   (`setDRACOLoader`/`setKTX2Loader`/`setMeshoptDecoder`). How to actually compress an asset into one
   of these formats — compression settings, `gltf-transform`, `gltfpack` — is not covered by any
   source used here and needs a different surface entirely.
2. **Shared-resource ownership across `ResourceTracker`s.** The cleanup manual names the risk of
   disposing a geometry or material out from under another tracker that still references it, but
   gives no reference-counting or ownership pattern to prevent it. If your app shares resources
   across multiple loaded assets, you have to design that ownership yourself.
3. **Image-bitmap disposal "special handling."** The `GLTFLoader` docs state that image bitmaps are
   not automatically garbage-collected and need "special disposal handling," without specifying what
   that handling is. Whether the standard `texture.dispose()` call in a `ResourceTracker` is
   sufficient for every image-bitmap case glTF can produce is unconfirmed by any source here.
