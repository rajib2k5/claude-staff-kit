# Phase 3 — Colour correctness

**Triggers:** colours look washed out, colours look too dark, an imported asset doesn't match the
DCC tool, normal/roughness maps look wrong, `colorSpace`, `SRGBColorSpace`, `NoColorSpace`.

## The annotation rule

Every texture has a `colorSpace` property, and getting it wrong is the documented cause of scenes
that look washed-out or too dark. The rule is a two-way split by what the texture's pixels *mean*:

- **Colour/albedo maps** (diffuse/base-color textures, anything a human looked at and picked colours
  for — typically JPEG/PNG colour photos or hand-painted colour maps):

  ```js
  texture.colorSpace = THREE.SRGBColorSpace;
  ```

- **Data maps** — normal, roughness, metalness, ao, height/displacement — encode numeric data per
  channel, not perceptual colour. Leave these at the default:

  ```js
  normalTexture.colorSpace = THREE.NoColorSpace; // the default — do not set SRGBColorSpace here
  ```

Applying `SRGBColorSpace` to a normal/roughness/metalness map corrupts the numeric data it encodes;
applying `NoColorSpace` to a colour map leaves it looking flat/washed-out because the gamma curve
never gets applied.

## Diagnosing washed-out vs dark

The manual gives a specific diagnostic split for a scene that reads wrong overall:

| Symptom | Likely cause |
|---|---|
| Whole scene reads **too dark** | `renderer.outputColorSpace` misconfigured (should be `THREE.SRGBColorSpace`) |
| Whole scene reads **too light / washed out** | Double colour-space conversion — commonly a missing `OutputPass` when post-processing is in the pipeline |
| One asset looks wrong, others look right | That asset's texture(s) have the wrong per-texture `colorSpace` annotation, not a renderer-level setting |

Use this to decide where to look first: a single wrong-looking imported model points at its own
textures' `colorSpace`; the *entire* scene skewing one direction points at the renderer/output stage
instead.

## Baseline renderer setup this depends on

`THREE.ColorManagement.enabled` defaults to `true`, and the renderer's output should be explicitly
set:

```js
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

Getting per-texture `colorSpace` right (this phase) and getting `renderer.outputColorSpace` right
are two different, additive fixes — both are required for an asset to look like it did in the DCC
tool it was authored in.
