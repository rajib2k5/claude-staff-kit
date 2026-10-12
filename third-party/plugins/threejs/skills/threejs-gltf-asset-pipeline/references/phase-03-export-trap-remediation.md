# Phase 3 — Export-trap remediation

**Triggers:** model is 100× too big or too small, model is sideways or upside-down, model renders
pure black or has no visible texture, model looks washed-out or too dark, no shadows appear, no
lights appear to be in the scene, OBJ textures look wrong, normal maps look flat or broken.

Nothing here is a three.js bug — every item is a documented, named trap in how the *source file* was
authored or exported. Fix the file's effect on the scene; don't fix three.js.

## Scale: never trust the exported object scale

> Never rely on Blender object scale — apply scale to vertices before export. A parent scale of
> `0.01` silently multiplies through every child. `[GLTF]`

If a model is absurdly large or small after phase 2's `Box3` framing made the mismatch obvious, the
fix belongs in the source file (apply scale before re-export), not in a hard-coded multiplier at
load time — a hard-coded fix has to be re-applied every time the asset is re-exported and hides the
real cause from the next person who touches the file.

## Orientation: Z-up vs Y-up wrapper nodes

Blender is Z-up; three.js is Y-up. Exporters commonly inject a wrapper node to reconcile the two —
the manual names `RootNode_(gltf_orientation_matrix)` as an example. `[GLTF]` This is exactly why
phase 2's `dumpObject` comes first: a rotation that looks wrong is very often already being
corrected by a wrapper node, and adding your own rotation on top compounds the error instead of
fixing it. Inspect the tree; don't hard-code a rotation to compensate for what you assume is missing.

## Lights: exported lights do not reliably survive

> Add lights in code — the manual states lights in a `.blend` do not reliably survive glTF export.
> `[GLTF]`

Treat every imported asset as unlit by default and add a `HemisphereLight`/`AmbientLight` plus a key
`DirectionalLight` in your own scene setup code, regardless of what the artist configured in their
tool. Don't spend time debugging "why aren't the file's lights showing up" — the answer is
structural, not a bug to find.

## Shadows: off by default on every mesh

```js
root.traverse((obj) => {
  if (obj.castShadow !== undefined) {
    obj.castShadow = true;
    obj.receiveShadow = true;
  }
});
renderer.shadowMap.enabled = true;
```

`load-gltf.html` gives this exact `traverse` pattern. `[GLTF]` Neither `castShadow` nor
`receiveShadow` is on by default per mesh, and `renderer.shadowMap.enabled` is a separate switch —
missing either one silently produces a fully lit scene with no shadows at all, no error.

## Colour: washed-out or dark imports trace to colorSpace

If an imported texture looks washed-out or unexpectedly dark, the documented cause is the texture's
`colorSpace` annotation, not lighting. `[COLOR]` Check that color/albedo maps are annotated
`THREE.SRGBColorSpace` and that data maps (normal/roughness/metalness) are left `NoColorSpace`
before touching light intensity or exposure — see `threejs-materials-lighting-shadows` for the full
material-side treatment; this phase only flags it as a source of *apparent* import corruption.

## OBJ/MTL: order and the black-texture bugs

OBJ carries no hierarchy, skeleton, or animation `[LOAD3D]`, and material loading has a strict,
documented order:

```js
const mtlLoader = new MTLLoader();
const materials = await mtlLoader.loadAsync('model.mtl');
materials.preload();

const objLoader = new OBJLoader();
objLoader.setMaterials(materials);
const object = await objLoader.loadAsync('model.obj');
scene.add(object);
```

`load .mtl` → `preload()` → `setMaterials()` → **then** load `.obj`. `[OBJ]` Loading the `.obj`
first, or skipping `setMaterials`, leaves the geometry unmaterialed even though the `.mtl` loaded
successfully with no error.

Two specific `.mtl` values silently kill otherwise-correct texture maps:

- `Kd 0 0 0` multiplies the diffuse map to black — the texture is loaded and wired up correctly, it
  is just being multiplied to zero. `[OBJ]`
- `Ks 0 0 0` kills specular maps the same way. `[OBJ]`

And `MTLLoader` wants the `norm` keyword for normal maps, not the more common `map_bump` — a normal
map declared with `map_bump` will not be picked up as a normal map. `[OBJ]`

## Frame OBJ the same way as glTF

The same `Box3`-based auto-framing from phase 2 applies to OBJ results — there is nothing
OBJ-specific about camera framing once the object is in the scene. `[OBJ]`

### Unknown: none flagged for this phase

No source in the mined material raises an open question specific to scale/orientation/material
remediation itself. The genuine unknowns (decoder encoding, shared-resource disposal, image-bitmap
disposal) live in phases 1 and 4 and are collected in `references/gotchas.md` section D.
