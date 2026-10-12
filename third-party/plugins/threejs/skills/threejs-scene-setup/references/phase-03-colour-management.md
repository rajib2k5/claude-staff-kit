# Phase 3 — Colour management

**Triggers:** colours look washed out, colours look too dark, colours don't match the source
asset/design file, `ColorManagement`, `outputColorSpace`, `SRGBColorSpace`, `NoColorSpace`, textures
look wrong only in-scene.

## Leave ColorManagement.enabled at its default

`THREE.ColorManagement.enabled` defaults to `true`. This is the setting that makes three.js do
colour-space-aware math internally (working in linear space, converting at the boundaries) instead
of naively treating every colour value as already being in the space it needs to be in. The manual's
guidance is to leave this alone — it's on by default for a reason, and turning it off is a legacy
escape hatch, not a normal step in scene setup. [MAN-color-management]

## Set the renderer's output colour space explicitly

```js
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

This tells the renderer to convert its internal linear-space result to sRGB before it hits the
screen, which is what makes it match what an image viewer or browser `<img>` would show for the same
asset. [MAN-color-management] [DOCS-WebGLRenderer]

## The washed-out / dark diagnosis table

The manual gives a specific two-symptom diagnostic table for colour bugs, worth carrying verbatim
because it's the fastest way to triage which end of the pipeline is wrong: [MAN-color-management]

| Symptom | Likely cause |
|---|---|
| Scene is globally too dark | `renderer.outputColorSpace` missing or wrong (not set to `SRGBColorSpace`) |
| Scene is globally too light / washed out | Double sRGB conversion — e.g. a colour or texture already treated as sRGB gets converted again |

This phase's brief also names this same failure mode from the texture side: assigning the wrong
`texture.colorSpace` (color/albedo maps should be tagged `THREE.SRGBColorSpace`; normal/roughness/
metalness data maps should stay `THREE.NoColorSpace`) is the documented cause of washed-out or dark
assets, and it's the same underlying bug class as getting `outputColorSpace` wrong on the renderer —
one is per-texture, one is renderer-wide. Texture-level `colorSpace` annotation itself belongs to the
materials/textures skill; this skill's boundary is the renderer-level `outputColorSpace` setting.

## Why this matters even in a scene with no textures yet

A brand-new scene with flat `MeshBasicMaterial` colours can still look wrong if
`renderer.outputColorSpace` isn't set, because the renderer's conversion step runs regardless of
whether the source colours came from a texture or a hex literal. Set it as part of initial renderer
setup (phase 1/2), not as an afterthought once textures are introduced.

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.outputColorSpace = THREE.SRGBColorSpace;
```
