# Phase 5 — Shadow budgeting

**Triggers:** turning on shadows, shadow acne, peter-panning, blocky/pixelated shadows, shadows not
appearing, too many lights slowing things down, `PointLight` shadow cost.

## Turn shadows on — three separate switches

Shadows require three independent things to be true, and missing any one produces "no shadow, no
error":

```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // see type choice below

mesh.castShadow = true;     // per-mesh, defaults to false
mesh.receiveShadow = true;  // per-mesh, defaults to false

light.castShadow = true;    // per-light, also required
```

Neither `castShadow` nor `receiveShadow` is on by default for any mesh — every shadow-participating
object needs both flags set deliberately.

## Shadow map type

```js
renderer.shadowMap.type = THREE.BasicShadowMap;     // cheapest, hard-edged, aliased
renderer.shadowMap.type = THREE.PCFShadowMap;       // default — soft-ish edges
renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // softer edges, more expensive
renderer.shadowMap.type = THREE.VSMShadowMap;       // variance shadow map, different tradeoffs
```

Pick the cheapest type that reads correctly for the shot — `BasicShadowMap` for a stylized/hard look
under a tight frame budget, `PCFShadowMap` (the default) as the general-purpose choice,
`PCFSoftShadowMap` when the softness is visually load-bearing, `VSMShadowMap` when its specific
tradeoffs are worth evaluating for the scene.

## Shrink the shadow camera — the single biggest lever for DirectionalLight shadows

A `DirectionalLight`'s shadow is rendered through an `OrthographicCamera`. Its default frustum is
usually much larger than the scene, which wastes shadow-map resolution on empty space and produces
blocky shadows even at a large `mapSize`:

```js
const cam = light.shadow.camera;
cam.left = -10;
cam.right = 10;
cam.top = 10;
cam.bottom = -10;
cam.near = 0.5;
cam.far = 50;
cam.updateProjectionMatrix(); // required after touching any of the above

scene.add(new THREE.CameraHelper(light.shadow.camera)); // visualize the frustum while tuning
```

**A larger shadow camera stretched over the same map size gives blocky shadows — area, not just
resolution, is the lever.** Shrink the frustum to the tightest box that covers everything that needs
to cast or receive a shadow before touching `mapSize`.

## mapSize and bias

```js
light.shadow.mapSize.width = 1024;   // default is 512
light.shadow.mapSize.height = 1024;
console.log(renderer.capabilities.maxTextureSize); // check mapSize against this ceiling

light.shadow.bias = -0.001;      // reduces shadow acne (self-shadowing noise)
light.shadow.normalBias = 0.02;  // reduces acne differently; both can overcorrect into peter-panning
```

Tune `bias`/`normalBias` to fix acne (dark, mottled self-shadowing artifacts) without overshooting
into peter-panning (the shadow visibly detaches from the object's base). There's no single correct
value — it's scene-scale dependent, which is why the shrunk `CameraHelper`-visualized frustum should
be dialed in first.

## Count the cost before adding another shadow-casting light

Every shadow-casting light causes an additional render pass over every shadow-casting object: 5
shadowed lights means 6 total render passes for the frame (5 shadow passes + the main render).
`PointLight` shadows are worse on their own — a cube map has 6 faces, so a single shadow-casting
`PointLight` costs 6× by itself, independent of how many other lights exist.

## The fake-shadow alternative

For an object where a real shadow is visual overkill (crowds, small props, mobile budgets), the
documented cheaper alternative is a flat plane with a pre-made round shadow texture instead of a
real shadow-casting light:

```js
const fakeShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false, // avoids z-fighting with the ground plane underneath it
  })
);
fakeShadow.rotation.x = -Math.PI / 2;
fakeShadow.position.y = 0.01;
scene.add(fakeShadow);
```

One draw call, no shadow-map render pass, no `castShadow`/`receiveShadow` bookkeeping. This is the
right trade whenever the shadow only needs to read as "grounded," not as geometrically accurate.
