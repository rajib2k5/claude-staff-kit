# Phase 5 — Camera framing

**Triggers:** choosing fov/near/far, subject is invisible or clipped, flickering surfaces at a
distance, z-fighting, `logarithmicDepthBuffer`, degrees vs radians confusion, `PerspectiveCamera`.

## The frustum: near, far, and what's actually visible

A `PerspectiveCamera` only renders what falls inside its viewing frustum — bounded by `fov`
(vertical field of view), `aspect`, and the `near`/`far` clipping planes. Anything closer than `near`
or farther than `far` is clipped and simply doesn't render, regardless of how correctly it's
positioned in the scene. [MAN-cameras]

```js
const fov = 75;
const aspect = 2; // overwritten by camera.aspect on resize — see phase 2
const near = 0.1;
const far = 5;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
```

`fov` is the one angle in three.js expressed in **degrees**; every other angle in the API
(rotations, `Object3D.rotation`, etc.) is in **radians**. This asymmetry is called out explicitly
because it's the one place unit-confusion bugs are likely to originate from copy-pasted rotation
code. [MAN-cameras] [B5-scenegraph]

## Scale convention: 1 unit = 1 metre

There's no enforced unit in three.js, but the ecosystem convention — used by physics engines, glTF,
and WebXR alike — is 1 unit = 1 metre. Choosing `near`/`far` and object scale consistent with that
convention keeps camera defaults, physics defaults, and imported-asset scale all compatible without
per-project unit conversion.

## Near/far tightness and z-fighting

The gap between `near` and `far`, combined with the GPU's fixed-precision depth buffer, determines
how much depth precision is available at any given distance. Two surfaces close together far from
the camera can end up mapped to the *same* depth-buffer value, and the GPU picks unpredictably which
one wins per pixel — visible as flickering or interleaved fragments, called z-fighting.
[MAN-cameras]

Mitigations documented on the `cameras` page: [MAN-cameras]

- Keep `near` as large as the scene allows and `far` as small as the scene allows — the tighter the
  frustum, the more depth precision is available where it's needed. Don't reflexively set
  `near = 0.001, far = 1000000` for a normal scene (that combination is explicitly a *debugging*
  technique for ruling out framing bugs, not a production default — see the debugging skill's use of
  it).
- Enable `logarithmicDepthBuffer` on the renderer when a scene genuinely needs a huge near/far range
  (e.g. astronomical scale mixed with close-up detail) and can't be solved by tightening the frustum:

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, logarithmicDepthBuffer: true });
```

`logarithmicDepthBuffer` redistributes depth precision logarithmically instead of linearly, trading
some precision at the far end for much more at the near end — useful exactly when near and far are
forced far apart by the scene's own content, not as a default-on setting for every scene.

## Framing checklist for a new scene

1. Pick `near`/`far` from the scene's actual content scale, not from habit — measure the
   smallest and largest distances the camera needs to resolve.
2. Leave `aspect` as a placeholder at construction time; it gets corrected the moment resize wiring
   (phase 2) runs, and the placeholder value only matters for the first frame before that.
3. If two surfaces flicker against each other at distance, that's z-fighting: tighten the frustum
   first, reach for `logarithmicDepthBuffer` only if tightening isn't enough.
4. Camera `fov` is degrees; everything else you rotate is radians. Convert deliberately
   (`THREE.MathUtils.degToRad`) rather than passing a degree value where radians are expected.
