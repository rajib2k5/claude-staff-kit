---
name: threejs-materials-lighting-shadows
description: Choose a three.js material (MeshBasic/Lambert/Phong/Standard/Physical), budget texture VRAM, fix washed-out or too-dark colours, and light/shadow a scene at a cost a mid-range phone can hold. Trigger on "which three.js material should I use", "texture memory budget", "colours washed out or too dark", "how to add shadows in three.js", "shadow acne", "peter-panning", "PBR envMap", "MeshPhysicalMaterial clearcoat/transmission", "fog in three.js", "too many lights slow", "material.needsUpdate not working", "colorSpace SRGBColorSpace vs NoColorSpace", "DirectionalLight shadow camera", "shadowMap type PCFSoft/VSM", "RectAreaLight not lighting anything", or "scene.background doesn't match fog".
---

# three.js materials, lighting and shadows

Grounded in the three.js manual and docs @ r185 (npm `three@0.185.1`) — `materials.html`,
`textures.html`, `lights.html`, `shadows.html`, `fog.html`, `backgrounds.html`,
`transparency.html`, `canvas-textures.html`, `color-management.html`, and the
`MeshPhysicalMaterial` API reference. Every claim in the references carries a source; see
`references/sources.md`.

## Scope

**Covers:** the material perf ladder and `needsUpdate` rules, transparency (`transparent`/`opacity`
vs `alphaTest`, the double-mesh technique), `TextureLoader`/`LoadingManager`, texture wrap/filter/
repeat, the texture-memory formula, `colorSpace` annotation, the six light types and their helpers,
shadow map type selection and shadow-camera tuning, the per-light shadow cost, fog vs background,
and cubemap/equirect skies plus `envMap` for PBR.

**Does not cover:** custom GLSL/`ShaderMaterial` authoring (no manual page teaches it — see
`references/gotchas.md` section D), TSL/WebGPU node materials (`threejs-webgpu-tsl`),
post-processing and render targets (`threejs-postprocessing-render-targets`), loading the models
and textures themselves (`threejs-gltf-asset-pipeline`), and texture authoring/compression tooling.

## The one thing to internalise first

Every number in this skill is defensible against a real budget, not a vibe. The single most
actionable one: **texture VRAM cost is `width * height * 4 * 1.33` bytes, and file compression is
irrelevant to it.** A 157 KB JPEG at 3024×3761 still costs about 60 MB of VRAM — the fix is to
shrink the *dimensions*, never the file size. Everything else in this skill (material tier,
shadow-map size, light count) is the same move applied to a different budget: pick the cheapest
setting that still reads correctly for the shot, then verify the cost against a real device number
(`renderer.capabilities.maxTextureSize`, a shadow-camera frustum, a shadow-casting-light count) —
not against how good the demo looked on a desktop GPU.

## Workflow

Work the phases in order for a scene built from scratch; jump straight to one for a narrow fix.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-material-tier-selection.md` | choosing a material, `needsUpdate` not taking effect, transparency/alphaTest, "should I use MeshPhysicalMaterial" |
| 2 | `references/phase-02-texture-budgeting.md` | texture VRAM, `TextureLoader`/`LoadingManager`, wrap/repeat/filter choice, `CanvasTexture` |
| 3 | `references/phase-03-colour-correctness.md` | colours look washed out or too dark, `colorSpace` on a map, normal/roughness maps looking wrong |
| 4 | `references/phase-04-lighting-design.md` | picking light types, `light.target`, helpers, `RectAreaLight` not lighting anything |
| 5 | `references/phase-05-shadow-budgeting.md` | turning on shadows, shadow acne/peter-panning, blocky shadows, too many shadow-casting lights |
| 6 | `references/phase-06-atmosphere.md` | fog, matching `scene.background`, cubemap/equirect skies, `envMap` for PBR |

Read `references/gotchas.md` whenever behaviour contradicts what you expect — it lists silent
failures, the honest result of checking for version-drift discrepancies, and the open questions the
manual does not answer.

## Definition of done

A finished materials/lighting/shadow pass satisfies all of these:

1. The material is the cheapest one on the ladder (`MeshBasicMaterial` → `MeshLambertMaterial` →
   `MeshPhongMaterial` → `MeshStandardMaterial` → `MeshPhysicalMaterial`) that still delivers a
   *named* required effect — you can say which `MeshPhysicalMaterial` property (clearcoat,
   transmission, sheen, iridescence, …) forced the upgrade, or you didn't need to upgrade.
2. Every colour/albedo map has `texture.colorSpace = THREE.SRGBColorSpace`; every normal/roughness/
   metalness map is left at `NoColorSpace`.
3. Texture VRAM is computed as `width * height * 4 * 1.33` per texture, summed, and checked against
   a real budget for the target device — not inferred from file size.
4. `castShadow`/`receiveShadow` are set deliberately per mesh (both default to `false`), the
   `DirectionalLight` shadow camera is shrunk to the tightest box that covers the scene and was
   visually checked with a `CameraHelper`, and the shadow-casting-light count was chosen knowing
   each one re-renders every caster (a `PointLight` shadow costs 6× on its own).
5. If fog is present, `scene.background` is set to the same colour as `scene.fog.color`, with
   `material.fog = false` used deliberately on anything that must escape it.
6. If any material relies on PBR reflections, an `envMap` is supplied — the `MeshPhysicalMaterial`
   reference asks for this explicitly.
7. Nothing here relies on a behaviour the manual does not state. The two real gaps — no
   `toneMapping`/`useLegacyLights`/`PointLight.decay` coverage on `lights.html`, and no end-to-end
   HDRI/`PMREMGenerator` workflow — are listed in `references/gotchas.md` section D; verify
   empirically if the work depends on either.
