# Gotchas, verified discrepancies, and honest unknowns

## A. Silent failures — no error, no warning, nothing happens

| Symptom | Cause | Fix |
|---|---|---|
| Toggled `flatShading` but nothing changed | Missing `material.needsUpdate = true` | set it after every `flatShading` change (phase 1) |
| Removed a map but the surface still shows the old texture | Setting `material.map = null` doesn't trigger the documented cleanup path | swap to a 1×1 white texture, then `needsUpdate = true` (phase 1) |
| Transparent objects fight each other in draw order | `transparent`+`opacity` sorts per-object, not per-triangle | switch to `alphaTest` if the edge is meant to be hard (phase 1) |
| A glass/bottle-like mesh looks wrong from one side | A single mesh can't self-sort front/back correctly | use the BackSide/FrontSide double-mesh technique (phase 1) |
| Texture never appears, no console error | Cross-origin load without CORS headers from the host | check the host sends CORS headers before debugging further (phases 1–2) |
| Scene reads flat/desaturated even with high-res textures | File size was checked instead of pixel dimensions — the real VRAM cost is uncapped | compute `width*height*4*1.33` and cap dimensions, not file size (phase 2) |
| `CanvasTexture` shows stale content after drawing to the canvas | Missing `canvasTexture.needsUpdate = true` | set it every time the backing canvas changes (phase 2) |
| Whole scene is too dark | `renderer.outputColorSpace` misconfigured | set `THREE.SRGBColorSpace` explicitly (phase 3) |
| Whole scene is washed out / too light | Double colour-space conversion, often a missing `OutputPass` in a post-processing chain | check the pipeline, not the individual textures (phase 3) |
| One imported asset looks wrong, others fine | That asset's `colorSpace` annotation is wrong on a specific texture | check per-texture `colorSpace`, not the renderer (phase 3) |
| `RectAreaLight` visibly does nothing | Missing `RectAreaLightUniformsLib.init()`, or the material isn't Standard/Physical | call `.init()` once; confirm material tier (phase 4) |
| Moved `light.target` but the light didn't re-aim | Missing `light.target.updateMatrixWorld()` after moving it | call it after every manual move of the target (phase 4) |
| Shadows don't appear at all | One of `renderer.shadowMap.enabled`, `light.castShadow`, `mesh.castShadow`, `mesh.receiveShadow` is still `false` | all four default to off/false except the renderer flag isn't default-on either — set all deliberately (phase 5) |
| Shadows are blocky despite a large `mapSize` | The shadow camera's frustum is larger than the scene — area, not resolution, is the lever | shrink the `OrthographicCamera` bounds first (phase 5) |
| Shadow has dark speckly noise (acne) or visibly detaches from its object (peter-panning) | `bias`/`normalBias` mistuned in one direction | nudge in small increments; both are overcorrectable (phase 5) |
| Frame rate drops after adding a second/third shadow-casting light | Each shadow-casting light re-renders every caster; a `PointLight` shadow alone costs 6× (cubemap faces) | count total render passes before adding lights; consider the fake-shadow plane technique (phase 5) |
| Fog looks like a visible seam at the horizon | `scene.background` doesn't match `scene.fog.color` | set both to the same colour (phase 6) |
| PBR surface looks flat no matter how roughness/metalness are tuned | No `envMap` supplied | always set one — the `MeshPhysicalMaterial` reference asks for this explicitly (phases 1 and 6) |

## B. Verified version-drift discrepancies

None found. This skill was compiled from a single doc-mining pass against the current r185 manual
and the `MeshPhysicalMaterial` API reference at the same revision — there was no older revision's
docs or types to diff against, unlike a library with a versioned README/`.d.ts` history. No
manual-page-vs-API-reference contradiction was found in the underlying research either. If a future
refresh of this skill fetches a different three.js revision, diff against this file's claims and
add rows here rather than assuming continuity.

## C. Traps that are not discrepancies, just easy to miss

- **The perf ladder is an ordering, not a scale.** `materials.html` documents fastest-to-slowest;
  it does not give per-step cost multipliers. Don't over-index on "how much slower" — use the
  ordering to break ties, and use the `MeshPhysicalMaterial` per-pixel-cost warning as the one place
  the manual is explicit that a jump is expensive.
- **`needsUpdate` is required for two specific triggers, not everything.** It's documented for
  `flatShading` changes and add/remove-map changes — don't assume every material property mutation
  needs it.
- **Texture memory ignores compression entirely.** A smaller JPEG at the same pixel dimensions costs
  the same VRAM as a larger, less-compressed one. This is the one number in the whole skill worth
  double-checking on every asset pass.
- **`RectAreaLight` is aimed differently from every other directional-ish light.** It uses
  `rotation`; `DirectionalLight`/`SpotLight` use `light.target`. Applying the wrong mental model
  silently misaims it.
- **A shadow camera that "looks right" from the default angle can still be far larger than the
  scene.** Always confirm with `CameraHelper` from multiple angles before trusting `mapSize` tuning.
- **Fog and background are two separate settings that must be kept in sync manually.** Nothing
  couples them automatically; a code change to one without the other is a common regression.

## D. Honest unknowns — no source covers these

State these as unknowns rather than guessing, and verify empirically if the work depends on them.

1. **`renderer.toneMapping`, `useLegacyLights`, and `PointLight.decay` semantics.** `lights.html`
   says nothing about any of these — this is a genuine documentation gap in the manual, not a fetch
   failure on this skill's part. If light intensity or falloff behaviour looks unexpected, treat
   these three as unverified rather than assuming a specific default or formula.
2. **An end-to-end environment-lighting workflow (HDRI selection, `PMREMGenerator` usage).** No
   manual page walks through this despite `PMREMGenerator` appearing in the docs sidebar. This skill
   documents *that* PBR materials need an `envMap` and *how* to load a cubemap/equirect texture for
   one (phase 6), but not a full HDRI-to-`PMREMGenerator`-to-`scene.environment` pipeline — that
   pipeline is not sourced and should not be asserted from memory.
3. **The exact background-image aspect-correction math.** `backgrounds.html` is recorded in the
   research as covering "aspect-fix math" for `scene.background` images, but the specific formula
   was not captured in the saved research file. Phase 6 points at the source page directly rather
   than restating a formula that isn't in the grounding material.
4. **Helper classes for `PointLight`, `HemisphereLight`, and `AmbientLight`.** Only
   `DirectionalLightHelper`, `SpotLightHelper`, `CameraHelper`, and `RectAreaLightHelper` are
   confirmed by the underlying research. Don't assume analogous helper names for the other light
   types without checking directly.
