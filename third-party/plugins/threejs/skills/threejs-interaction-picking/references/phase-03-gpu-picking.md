# Phase 3 — GPU picking: when raycasting cannot be trusted

**Triggers:** raycasting is wrong on displaced/skinned/alpha-cut geometry, pick misses a texture
hole, picking against too many objects to raycast every frame, need pixel-accurate picking,
`camera.setViewOffset`, `WebGLRenderTarget`, `readRenderTargetPixels`.

## Know the limit first

CPU raycasting (`references/phase-02-cpu-raycasting.md`) hits the *geometric silhouette* of a mesh.
It ignores three things a scene can easily be doing: vertex-shader displacement, skinning, and
texture alpha holes. [MAN-PICK] None of these produce an error — the raycaster just returns a hit
(or miss) for the wrong shape, silently and confidently. If the visible pickable surface is any of
those three things, or if the scene has enough pickable objects that raycasting every one every
frame is the documented-slow case, reach for GPU picking instead of re-checking the NDC math from
phase 2.

## The idea

Render a second, parallel scene — the **picking scene** — where every pickable object is drawn with
a solid color that encodes its integer id instead of its real appearance. Render that scene to a
1x1 render target positioned exactly at the pointer, read back that one pixel, and decode the id
from its RGB channels. Whatever the GPU actually rasterizes for that mesh (displaced, skinned,
alpha-cut) is what gets sampled — there is no separate silhouette to disagree with the render.
[MAN-PICK]

## Build the picking scene

Give each pickable object a picking-only material whose `emissive` color is set to that object's
integer id, with blending disabled so nothing mixes with the id color: [MAN-PICK]

```js
const idToObject = {};
let currentId = 1;

function makePickingMaterial(displayMaterial) {
  const material = new THREE.MeshStandardMaterial({
    emissive: 0x000000,
    color: 0x000000,
    // match the display material so alpha-cut geometry picks correctly (see below)
    alphaMap: displayMaterial.alphaMap,
    alphaTest: displayMaterial.alphaTest,
    blending: THREE.NoBlending,
  });
  return material;
}

pickableObjects.forEach((obj) => {
  const id = currentId++;
  idToObject[id] = obj;
  const pickingMesh = obj.clone();
  pickingMesh.material = makePickingMaterial(obj.material);
  pickingMesh.material.emissive.setHex(id, THREE.NoColorSpace);
  pickingScene.add(pickingMesh);
});
```

Encoding the id via `emissive.setHex(id, THREE.NoColorSpace)` and `blending: THREE.NoBlending`
matters together: `NoBlending` guarantees the rasterized pixel is exactly the id color with no
alpha/lighting blending it toward something else, and `NoColorSpace` guarantees the id's raw
integer value survives color-management conversion instead of being reinterpreted as sRGB. [MAN-PICK]

## Render a 1x1 region at the pointer and read it back

Use `camera.setViewOffset` to make the camera render only the single pixel under the pointer (in
full-resolution pixel coordinates `px`, `py`), render that into a 1x1 `WebGLRenderTarget`, then read
the pixel back: [MAN-PICK]

```js
const pickingRenderTarget = new THREE.WebGLRenderTarget(1, 1);
const pixelBuffer = new Uint8Array(4);

function pick(px, py, fullWidth, fullHeight) {
  camera.setViewOffset(fullWidth, fullHeight, px, py, 1, 1);

  renderer.setRenderTarget(pickingRenderTarget);
  renderer.render(pickingScene, camera);
  renderer.setRenderTarget(null);

  renderer.readRenderTargetPixels(pickingRenderTarget, 0, 0, 1, 1, pixelBuffer);

  const id = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | pixelBuffer[2];

  camera.clearViewOffset();

  return idToObject[id]; // undefined if id is 0 / background
}
```

That is the full sequence: `camera.setViewOffset(fullW, fullH, px, py, 1, 1)` narrows the camera's
projection to the single pixel at `(px, py)`; render the picking scene into the 1x1 target;
`readRenderTargetPixels` pulls back the 4-byte RGBA pixel; `id = (r<<16) | (g<<8) | b` decodes it;
`camera.clearViewOffset()` restores the camera to its normal full-frame projection afterward.
[MAN-PICK] The `1x1` render target mechanics — allocate, `setRenderTarget`, render, read back,
`setRenderTarget(null)` to return to the canvas — are the same mechanics documented generally for
any render target. [MAN-RT]

`px`/`py` are the same canvas-relative, drawing-buffer-space coordinates computed in
`getCanvasRelativePosition` in phase 2 — GPU picking reuses that pointer math, it does not replace
it.

## Match alphaTest between pick and display materials

If the display material uses `alphaTest` to cut holes in a texture (foliage, chain-link, cutout
signage), the picking material must use the **same** `alphaTest` value and the same alpha source.
[MAN-PICK] Skipping this makes GPU picking solid where the display mesh has holes — the picking
draw call rasterizes the full quad while the display draw call does not, so clicking through a
"hole" in the texture wrongly registers a hit on the object behind it.

## Why setPixelRatio matters here specifically

The manual is explicit that `renderer.setPixelRatio(window.devicePixelRatio)` should not be used —
compute the backing buffer size yourself (`clientWidth * devicePixelRatio`, capped) — because losing
control of the true buffer size breaks post-processing, screenshots, `gl_FragCoord`, **and GPU
picking**. `setViewOffset`'s `px`/`py`/`fullWidth`/`fullHeight` arguments are in drawing-buffer
pixels; if the buffer size is not the size you think it is, the 1x1 region lands on the wrong pixel.

## Filter what you raycast/pick

The same importance-filtering rule from phase 2 applies to GPU picking's construction cost: build
the picking scene from the pickable subset, not from every object in the main scene, and rebuild it
only when the pickable set changes rather than every frame. [MAN-PICK]
