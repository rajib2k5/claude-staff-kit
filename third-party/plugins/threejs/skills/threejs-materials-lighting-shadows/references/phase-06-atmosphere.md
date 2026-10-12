# Phase 6 — Atmosphere

**Triggers:** fog, `scene.fog`, `scene.background` mismatch, cubemap sky, equirectangular sky,
`envMap` for reflections, an object needs to ignore fog.

## Fog vs FogExp2

```js
scene.fog = new THREE.Fog(0x8899aa, 10, 50);        // linear falloff between near and far
// or
scene.fog = new THREE.FogExp2(0x8899aa, 0.02);        // exponential density falloff
```

`Fog` is linear (explicit near/far distances); `FogExp2` uses a density value with exponential
falloff and no explicit far distance. Pick `Fog` when you want to art-direct exactly where fog
starts and ends; pick `FogExp2` for a more natural, distance-independent thickening.

## The background-must-match rule

Fog only affects objects — it does not tint the empty space behind them, which is drawn from
`scene.background`. A fog colour that doesn't equal the background colour is immediately, visibly
wrong: objects fade into a fog colour that doesn't match the sky/void behind them, producing a
visible seam at the horizon.

```js
const fogColor = 0x8899aa;
scene.fog = new THREE.Fog(fogColor, 10, 50);
scene.background = new THREE.Color(fogColor); // must be set to the SAME colour
```

## Per-object escape hatch

```js
material.fog = false; // this material ignores scene fog entirely
```

Use this for anything that must stay fully visible/legible regardless of distance — HUD-like
in-world UI, a skybox mesh, or anything else that would look wrong fading into the fog colour.

## Skies: cubemap or equirectangular

```js
// six-image cubemap
const cubeLoader = new THREE.CubeTextureLoader();
scene.background = cubeLoader.load([
  'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg',
]);

// single equirectangular image
const equirect = new THREE.TextureLoader().load('sky.jpg');
equirect.mapping = THREE.EquirectangularReflectionMapping; // required for correct sampling as a background/env
scene.background = equirect;
```

Both forms can also be reused as `scene.environment` (or a material's `envMap`) to light PBR
reflections from the same imagery — see the next section. The manual documents that a background
image also needs its aspect corrected against the canvas; treat the exact aspect-correction math as
something to check directly in `backgrounds.html` rather than a value restated here (see
`references/gotchas.md` section D for why this isn't spelled out further in this skill).

## envMap for PBR

`MeshPhysicalMaterial` (and PBR use of `MeshStandardMaterial`) should always be given an `envMap` —
the material reference states this explicitly for correct-looking reflections:

```js
material.envMap = equirect; // same texture loaded above, with EquirectangularReflectionMapping
material.needsUpdate = true;
```

Without an `envMap`, `roughness`/`metalness` have nothing physically plausible to reflect and PBR
surfaces read flat no matter how they're tuned — this is the same rule introduced in
`references/phase-01-material-tier-selection.md`, closed out here with where the map actually comes
from.
