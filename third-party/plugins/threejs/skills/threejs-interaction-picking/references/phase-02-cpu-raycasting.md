# Phase 2 — CPU raycasting: pointer to object

**Triggers:** click/hover a 3D object, `Raycaster`, "raycasting not detecting the right object",
wrong object picked, coordinates wrong on resize or on a non-square canvas, `intersectObjects`,
nearest-hit logic, hover highlight.

## Convert the pointer event to canvas-relative coordinates

Pointer events (`mousemove`, `click`) report coordinates relative to the **viewport**, not the
canvas. Subtract the canvas's own position first: [MAN-PICK]

```js
function getCanvasRelativePosition(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}
```

Using `event.clientX`/`clientY` directly (without subtracting `rect.left`/`rect.top`) is the most
common cause of picking that seems to work near the top-left of the page and drift wrong the
farther the canvas is scrolled or offset from the viewport origin.

## Convert canvas-relative coordinates to normalized device coordinates (NDC)

`Raycaster.setFromCamera` expects NDC: both axes in `[-1, 1]`, with `y` flipped versus screen
space. [MAN-PICK]

```js
function setPickPosition(event, canvas, pickPosition) {
  const pos = getCanvasRelativePosition(event, canvas);
  pickPosition.x = (pos.x / canvas.width) * 2 - 1;
  pickPosition.y = (pos.y / canvas.height) * -2 + 1;
}
```

That is `x = pos.x/canvas.width*2 - 1` and `y = pos.y/canvas.height*-2 + 1`. [MAN-PICK] Do the
division against `canvas.width`/`canvas.height` (the actual drawing-buffer size), not
`clientWidth`/`clientHeight` — on a HiDPI display or after any pixel-ratio scaling those two differ,
and dividing by the wrong one shifts every pick by a scale factor that only shows up away from
dead-center.

## Raycast and read the nearest hit

```js
const raycaster = new THREE.Raycaster();

raycaster.setFromCamera(pickPosition, camera);
const intersects = raycaster.intersectObjects(scene.children);
const hit = intersects[0]; // nearest hit, or undefined if nothing was hit
if (hit) {
  hit.object.material.emissive.set(0xff0000); // e.g. hover highlight
}
```

`raycaster.setFromCamera(ndc, camera)` builds the ray from the camera through that NDC point;
`intersectObjects(list)` returns hits sorted nearest-first, so `[0]` is the object actually under
the pointer. [MAN-PICK] `intersects` is empty (not `undefined`) when nothing is hit — check length
or index `0` before dereferencing `.object`.

## Scope what you raycast

Raycasting per frame against every object in the scene is documented as slow. [MAN-PICK] Pass a
deliberately scoped list to `intersectObjects` — the pickable subset — rather than defaulting to
`scene.children` (which also recurses into helpers, lights, and non-visual objects unless
`recursive` is handled carefully). Filter by importance: only raycast what the interaction actually
needs this frame (e.g. only on `pointermove` with a throttle, or only against currently-visible
pickable objects), not by trying to make raycasting-everything fast enough to not matter.

## Sprite/SpriteMaterial billboards as pickable markers

A `Sprite` (built from a `SpriteMaterial`) is always screen-facing — three.js rotates it to face
the camera every frame — which makes it a convenient marker/label shape: a pin, an icon, a
callout dot placed at a 3D position that should always read flat-on regardless of orbit angle.
[MAN-BILL] Sprites are ordinary scene objects for picking purposes: add them to the same list
passed to `intersectObjects`, and `Raycaster` reports hits on them the same way it does for meshes.
This makes sprites a lighter-weight alternative to a full mesh when the only requirement is "a
clickable/hoverable marker at a point in space," without needing GPU picking or custom geometry.

`SpriteMaterial` also supports `alphaTest` for cutout marker textures (e.g. a pin icon on a
transparent PNG) the same way any material does — if a sprite marker's visible shape is
alpha-cut, the same "raycasting sees the geometric silhouette, not the alpha" limitation applies,
and GPU picking's alphaTest-matching rule (phase 3) is the fix if clicks on the transparent part of
the sprite are wrongly registering as hits.

## Where this stops being enough

CPU raycasting tests against the geometric silhouette of a mesh's `BufferGeometry` as uploaded —
it has no knowledge of what a vertex shader does to that geometry at render time, no knowledge of
skinning/bone transforms, and no knowledge of a texture's alpha channel. A displaced ocean surface,
a skinned character bent into a pose, or a leaf texture with `alphaTest`-cut holes will all raycast
against their undisplaced/unposed/un-cut shape. [MAN-PICK] See `references/phase-03-gpu-picking.md`
for the fix.
