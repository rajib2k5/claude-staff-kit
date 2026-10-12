# Phase 1 — Material tier selection

**Triggers:** which material to use, a scene feels expensive, `needsUpdate` not taking effect,
transparency looks wrong, sort-order artifacts, "should this be MeshPhysicalMaterial",
clearcoat/transmission/sheen/iridescence.

## The ladder

The manual documents one perf ordering, fastest to slowest, and nothing else needs to be memorised
before this:

```
MeshBasicMaterial → MeshLambertMaterial → MeshPhongMaterial → MeshStandardMaterial → MeshPhysicalMaterial
```

Pick the material by asking "what is the cheapest one on this ladder that still looks right for the
shot" — not by defaulting to `MeshStandardMaterial` because it's the common PBR choice. Each step
right costs more to render.

## Only pay for MeshPhysicalMaterial when you can name the effect

`MeshPhysicalMaterial` is an extension of `MeshStandardMaterial` with 32 added properties
(clearcoat, transmission, iridescence, sheen, anisotropy, dispersion, ior, and more). Every one of
them is off by default, and every one you turn on adds cost. The API reference states this as an
explicit **per-pixel cost warning** — this is the most expensive material in the ladder, and the
warning is not incidental.

The actionable rule: before reaching for `MeshPhysicalMaterial`, name the specific property the shot
needs (clear-coated car paint → `clearcoat`; glass or liquid → `transmission`; brushed metal →
`anisotropy`; soap-bubble/oil-slick colour shift → `iridescence`; fabric → `sheen`). If you can't
name one, `MeshStandardMaterial` is the right stopping point on the ladder.

```js
const material = new THREE.MeshPhysicalMaterial({
  color: 0x8888ff,
  roughness: 0.2,
  metalness: 0,
  transmission: 1.0,   // named effect: glass — this is what justifies Physical over Standard
  thickness: 0.5,
  envMap,               // see "Always supply an envMap" below
});
```

## The needsUpdate rules

`material.needsUpdate = true` is required in two documented situations:

1. **After changing `flatShading`.** Toggling `material.flatShading` at runtime does nothing visible
   until you set `material.needsUpdate = true`.
2. **After adding or removing a map** (e.g. assigning or clearing `material.map`,
   `material.normalMap`, etc.).

For **removing** a map, the documented workaround is not to set the map to `null` — swap it to a
1×1 white texture instead, then set `needsUpdate`:

```js
material.map = whitePixelTexture; // documented removal workaround, not `null`
material.needsUpdate = true;
```

## Transparency: transparent/opacity vs alphaTest

Two different material configurations solve two different transparency problems, and picking the
wrong one produces sort-order artifacts:

- **`transparent: true` + `opacity`** — for genuinely translucent surfaces (glass, smoke, fades).
  This puts the object in the transparent render pass, which is depth-sorted back-to-front per
  object (not per-triangle) — overlapping transparent objects can still show sort-order problems
  because three.js does not sort at the triangle level.
- **`alphaTest`** — for hard-edged cutouts (foliage, chain-link, cutout signage) where pixels are
  either fully opaque or fully discarded. Because there's no partial blending, `alphaTest` avoids
  the sort-order problem entirely and is the cheaper, more correct choice whenever the edge is meant
  to be sharp rather than soft.

```js
// hard-edged cutout — no sort-order fighting
const leafMaterial = new THREE.MeshStandardMaterial({
  map: leafTexture,
  alphaTest: 0.5,
  transparent: false, // alphaTest does not need the transparent pass
});
```

## The BackSide/FrontSide double-mesh technique

For a shape that needs to show believable transparency from both inside and outside (e.g. a glass
bottle), the documented technique is two meshes sharing geometry: one material with
`side: THREE.BackSide` and one with `side: THREE.FrontSide`, both transparent, rendered together.
This sidesteps the fact that a single mesh can't correctly depth-sort its own front and back faces
against itself.

```js
const inside = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ side: THREE.BackSide, transparent: true, ...opts }));
const outside = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ side: THREE.FrontSide, transparent: true, ...opts }));
scene.add(inside, outside);
```

## Always supply an envMap for PBR

The `MeshPhysicalMaterial` reference states explicitly to always specify an `envMap` for best
results. Without one, PBR reflections have nothing to reflect and the material reads flat regardless
of `roughness`/`metalness` tuning. See `references/phase-06-atmosphere.md` for how to source a
cubemap or equirect environment map.

## Cross-origin note

Textures loaded cross-origin need CORS headers from the host; most hosts don't send them, and the
texture will silently fail rather than error usefully. This applies to every material tier that
uses `map`, and is the same constraint covered in `references/phase-02-texture-budgeting.md`.
