# Phase 4 — DOM-anchored 3D labels

**Triggers:** HTML label or tooltip pinned to a 3D object, label doesn't disappear when the object
is off-screen or behind something, labels overlapping in the wrong order, `Vector3.project`, NDC to
CSS pixels, occlusion for HTML overlays, `zIndex` stacking for 3D-driven DOM.

## The core transform: 3D world position to CSS pixels

```js
const tempV = new THREE.Vector3();

function updateLabel(obj, elem, camera, clientWidth, clientHeight) {
  obj.getWorldPosition(tempV);
  tempV.project(camera);

  const x = (tempV.x * 0.5 + 0.5) * clientWidth;
  const y = (tempV.y * -0.5 + 0.5) * clientHeight;

  elem.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
}
```

- `getWorldPosition(tempV)` reads the object's position in world space, accounting for any parent
  transforms — not its local position.
- `Vector3.project(camera)` converts that world position into **normalized device coordinates**
  (NDC): x and y each run from -1 to 1 across the visible frustum, and z runs from -1 (near plane) to
  1 (far plane).
- The NDC-to-pixel conversion flips Y (`* -0.5 + 0.5` instead of `* 0.5 + 0.5`) because NDC's +Y is
  up while CSS's +Y is down — the same top-down/bottom-up mismatch that phase 1 handles for the
  scissor rectangle, showing up again here in a different axis.
- `translate(-50%, -50%)` centers the label element on the projected point before the pixel offset
  is applied, so the label's anchor (not its top-left corner) sits on the 3D point.

[MAN-align-html]

## Hiding labels for off-screen or behind-camera objects

```js
if (Math.abs(tempV.z) > 1) {
  elem.style.display = 'none';
} else {
  elem.style.display = '';
  // ... apply the transform above
}
```

NDC z outside [-1, 1] means the object is in front of the near plane, behind the far plane, or
behind the camera entirely — points that project mathematically valid X/Y coordinates even though
they aren't actually visible. Skipping the transform and hiding the element for `|z| > 1` prevents a
label from appearing to "wrap around" to the wrong side of the screen when its object passes behind
the camera. [MAN-align-html]

### Unknown: this only checks the object's origin

This test evaluates a single point — the object's world-space origin — not its full extent. A large
object can have its origin just inside the visible frustum while most of its geometry is off-screen,
or vice versa, causing the label to pop visible/invisible at the wrong moment relative to what the
viewer actually sees on screen. The manual names a more accurate alternative,
`Frustum.setFromProjectionMatrix`, testing the object's actual bounds against the camera frustum
instead of a single projected point — and states that it is more expensive, but does not work
through an implementation. Treat the origin-only check as the default for small/point-like anchors,
and treat frustum-based visibility for large objects as something to build and cost yourself, not a
documented recipe. [MAN-align-html]

## Occlusion: hiding a label whose object is behind something else

A label can be within the frustum (passes the `|z| > 1` check) while its object is hidden behind
some other piece of geometry — the projection math has no idea what's in front of what. The
documented fix is a raycast identity check: cast a ray from the camera through the object's
projected position, and only show the label if the *nearest* hit is the object the label belongs to
(or if there is no closer occluder). This is the same `Raycaster` + NDC pattern used for pointer
picking, driven by the label's own projected coordinates instead of the mouse. [MAN-align-html]

Per the same source, raycasting once per label per frame is documented as slow at scale — filter to
labels that matter (visible-on-hover, a bounded "important" set) rather than running an occlusion
raycast for every label on a busy scene, every frame.

## Stacking order with `zIndex`

Multiple labels near each other in screen space need a deterministic stacking order, and CSS
`z-index` on the label elements is how the manual achieves it — derived from the same projected
depth already computed for positioning:

```js
elem.style.zIndex = (-tempV.z * 0.5 + 0.5) * 100000 | 0;
```

Closer objects (more negative NDC z) get a higher `zIndex`, so nearer labels visually stack above
farther ones, matching what depth-testing would do for the 3D geometry itself. [MAN-align-html]

## Stacking-context prerequisite

`z-index` on a label element only has the intended effect if the label sits in a stacking context
where `z-index` is actually being compared against its siblings — a label with no explicit
stacking context on its container can interleave unpredictably with ordinary page content instead of
just with other labels. Give the label container its own stacking context (e.g. a `position:
relative` or `absolute` wrapper) before relying on the `zIndex` values above. [MAN-align-html]

## Putting it together for one frame

```js
function updateAllLabels(labelEntries, camera, renderer, raycaster) {
  const clientWidth = renderer.domElement.clientWidth;
  const clientHeight = renderer.domElement.clientHeight;

  for (const { obj, elem } of labelEntries) {
    obj.getWorldPosition(tempV);
    tempV.project(camera);

    if (Math.abs(tempV.z) > 1) {
      elem.style.display = 'none';
      continue;
    }

    // optional occlusion check (expensive — filter to labels that matter)
    // if (isOccluded(obj, camera, raycaster)) { elem.style.display = 'none'; continue; }

    elem.style.display = '';
    const x = (tempV.x * 0.5 + 0.5) * clientWidth;
    const y = (tempV.y * -0.5 + 0.5) * clientHeight;
    elem.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    elem.style.zIndex = (-tempV.z * 0.5 + 0.5) * 100000 | 0;
  }
}
```

[MAN-align-html]
