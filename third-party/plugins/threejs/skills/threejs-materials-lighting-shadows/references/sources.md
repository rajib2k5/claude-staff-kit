# Sources

Everything in this skill traces to one of these. Nothing here is asserted from general model
knowledge; where a source is silent, the reference files say so explicitly (see `gotchas.md`
section D). This substitutes for the `llm-kb` scout stage — the source table below is carried
forward from `/home/claude/scout/threejs-research.md`, which was fetched via `WebFetch` against
live threejs.org pages.

Pinned at **r185** (npm `three@0.185.1`), confirmed via `registry.npmjs.org/three/latest`.

| Tag | Source | Type | Access | Confidence | Grounds |
|---|---|---|---|---|---|
| `[MAT]` | [threejs.org/manual/en/materials.html](https://threejs.org/manual/en/materials.html) | official-docs | fetched | high | the material ladder with perf ordering; `needsUpdate` rules after `flatShading`/map changes; the 1×1-white-texture removal workaround |
| `[TEX]` | [threejs.org/manual/en/textures.html](https://threejs.org/manual/en/textures.html) | official-docs | fetched | high | `TextureLoader`/`LoadingManager`/`onProgress`; wrap modes, `repeat`/`offset`/`center`/`rotation`; `magFilter`/`minFilter` choice; the `width*height*4*1.33` VRAM formula; CORS |
| `[LGT]` | [threejs.org/manual/en/lights.html](https://threejs.org/manual/en/lights.html) | official-docs | fetched | high | the six light types; `light.target` + `updateMatrixWorld`; `RectAreaLightUniformsLib` and its three constraints; helper names |
| `[SHD]` | [threejs.org/manual/en/shadows.html](https://threejs.org/manual/en/shadows.html) | official-docs | fetched | high | `shadowMap.type` options; `castShadow`/`receiveShadow` defaults; shrinking the `DirectionalLight` shadow camera and `CameraHelper`; `mapSize`/`bias`/`normalBias`; per-light shadow-pass cost; `PointLight` 6× cubemap cost; the fake plane-shadow technique |
| `[FOG]` | [threejs.org/manual/en/fog.html](https://threejs.org/manual/en/fog.html) | official-docs | fetched | high | `Fog` vs `FogExp2`; the background-must-match-fog-colour rule; `material.fog = false` |
| `[BKG]` | [threejs.org/manual/en/backgrounds.html](https://threejs.org/manual/en/backgrounds.html) | official-docs | fetched | high | `scene.background`; background aspect handling; `CubeTextureLoader`; `EquirectangularReflectionMapping` |
| `[TRN]` | [threejs.org/manual/en/transparency.html](https://threejs.org/manual/en/transparency.html) | official-docs | fetched | high | sort-order problem with `transparent`/`opacity`; `alphaTest` for hard cutouts; the `BackSide`/`FrontSide` double-mesh technique |
| `[CVS]` | [threejs.org/manual/en/canvas-textures.html](https://threejs.org/manual/en/canvas-textures.html) | official-docs | fetched | high | `CanvasTexture`, `needsUpdate`, NPOT filtering considerations |
| `[PHY]` | [threejs.org/docs/api/en/materials/MeshPhysicalMaterial.html](https://threejs.org/docs/api/en/materials/MeshPhysicalMaterial.html) | official-docs | fetched | high | the 32 added properties over `MeshStandardMaterial`; explicit per-pixel cost warning; "always specify envMap" |
| `[CLR]` | [threejs.org/manual/en/color-management.html](https://threejs.org/manual/en/color-management.html) | official-docs | fetched | high | `ColorManagement.enabled` default; `colorSpace` annotation rules (`SRGBColorSpace` vs `NoColorSpace`); the washed-out/dark diagnostic table |

## Provenance note

This skill was compiled in stage 2–5 of the skill-forge pipeline directly from the validated
skill-brief and the saved doc-mining research file (`threejs-research.md`), substituting for the
unavailable `llm-kb` scouting tool. No page was re-fetched for this compile step; the fetch log,
URL-validity findings (including the two 404s the research file records —
`manual/en/render-targets.html` and the legacy `docs/api/en/materials/...` variants for other
classes — neither of which affects the pages used here), and confidence ratings above are inherited
unchanged from that file's section A.

## Deliberate exclusions

- **`docs/pages/*` flat-URL variants** of the same API classes were not re-cited separately — the
  research file confirms both the flat `docs/pages/` form and (for `MeshPhysicalMaterial`) the
  legacy `docs/api/en/materials/` form resolve to the same content at r185; the legacy form is
  tagged `[PHY]` above since that's the URL the brief carries.
- **Custom GLSL/`ShaderMaterial` authoring** — explicitly out of scope per the brief; no manual page
  teaches it, so this skill does not either.
- **TSL/WebGPU node materials, post-processing, texture authoring/compression tooling, and
  model/texture loading mechanics** — each is a separate skill's concern per the brief's boundary
  section and is not duplicated here.
