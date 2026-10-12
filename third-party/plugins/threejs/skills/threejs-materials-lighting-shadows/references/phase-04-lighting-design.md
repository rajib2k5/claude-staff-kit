# Phase 4 — Lighting design

**Triggers:** which light to use, scene looks flat/unlit, `light.target`, light helpers,
`RectAreaLight` not lighting anything, key/fill setup.

## The six light types

The manual documents six light types. Build a readable setup by composing a small number of them
deliberately rather than adding lights until it looks right:

- `AmbientLight` — flat, uniform light added to every surface with no direction; cheapest way to
  lift the darks.
- `HemisphereLight` — a softer, direction-aware alternative to `AmbientLight`: one colour from the
  sky, one from the ground.
- `DirectionalLight` — parallel rays, no falloff with distance (like sunlight); the typical key
  light.
- `PointLight` — falls off from a single point in all directions (like a bare bulb).
- `SpotLight` — a cone of light from a point, with `angle`/`penumbra`.
- `RectAreaLight` — light emitted from a rectangular plane; needs the setup below.

## Base + key pattern

```js
const hemi = new THREE.HemisphereLight(0xddeeff, 0x202020, 1.0); // sky, ground, intensity
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 3);
key.position.set(5, 10, 7);
scene.add(key);
scene.add(key.target); // target must be added to the scene to take effect
key.target.position.set(0, 0, 0);
key.target.updateMatrixWorld(); // required after moving the target
```

Start with a base (`HemisphereLight` or `AmbientLight`) to lift the darks, then add a
`DirectionalLight` as the key. `DirectionalLight` and `SpotLight` both aim at `light.target`, and
that target is a real `Object3D` that must be added to the scene — if you move `light.target` after
the initial add, call `light.target.updateMatrixWorld()` or the light keeps aiming at the stale
position.

## RectAreaLight setup

`RectAreaLight` needs explicit initialization and has three constraints not shared by the other
five light types:

```js
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
RectAreaLightUniformsLib.init(); // required once, before any RectAreaLight renders correctly

const rectLight = new THREE.RectAreaLight(0xffffff, 5, 4, 1); // color, intensity, width, height
rectLight.position.set(0, 5, 0);
rectLight.rotation.x = -Math.PI / 2; // RectAreaLight is aimed with rotation, not a target
scene.add(rectLight);

const helper = new RectAreaLightHelper(rectLight);
rectLight.add(helper); // the helper must be a child of the light, not a scene sibling
```

1. `RectAreaLightUniformsLib.init()` must run once before the light will render correctly.
2. It **only** works with `MeshStandardMaterial` and `MeshPhysicalMaterial` — it has no effect on
   Basic/Lambert/Phong surfaces.
3. It's aimed with `rotation`, not `light.target` like Directional/Spot.
4. Its helper is added as a **child of the light**, not as a scene-level sibling.

## Helpers

The manual's debugging material names `DirectionalLightHelper`, `SpotLightHelper`, and
`CameraHelper` (the last one visualizes a light's shadow camera — see
`references/phase-05-shadow-budgeting.md`). Overlapping helper geometry needs
`material.depthTest = false` plus a deliberate `renderOrder` to stay visible against scene geometry.

```js
scene.add(new THREE.DirectionalLightHelper(key, 1));
scene.add(new THREE.SpotLightHelper(spot));
```

The research underlying this skill does not confirm helper class names for `PointLight`,
`HemisphereLight`, or `AmbientLight` beyond what's listed above — treat those as an open question
rather than assuming a name (see `references/gotchas.md` section D).
