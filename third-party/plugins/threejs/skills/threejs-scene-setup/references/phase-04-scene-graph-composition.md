# Phase 4 — Scene graph composition

**Triggers:** building a hierarchy of objects, parts should move relative to a parent, orbiting
objects, a child mesh is in the wrong place or the wrong size, scale-inheritance bugs, `Object3D`,
`parent.add`/`remove`, `AxesHelper`, `GridHelper`, local-space debugging.

## Bare Object3D nodes as pure structural pivots

`THREE.Object3D` is the base class every three.js scene-graph node inherits from (`Scene`, `Mesh`,
`Light`, cameras, …), and it is also directly usable on its own as a structural node that carries no
geometry or material — a pure pivot for grouping and transforming other objects. Build a hierarchy
with `parent.add(child)` and tear it down with `parent.remove(child)`. [MAN-scenegraph]

```js
const solarSystem = new THREE.Object3D();
scene.add(solarSystem);

const earthOrbit = new THREE.Object3D();
solarSystem.add(earthOrbit);

const earthMesh = new THREE.Mesh(sphereGeometry, earthMaterial);
earthMesh.scale.set(1, 1, 1);
earthOrbit.add(earthMesh);
earthOrbit.position.x = 10;
```

Each node's local transform (`position`/`rotation`/`scale`) composes with every ancestor's transform
to produce its world transform. That composition is the entire point of a scene graph — rotate
`solarSystem` and every orbit and planet under it rotates with it — but it's also exactly what
creates the next trap.

## The scale-inheritance trap

Scale composes multiplicatively down the hierarchy. The manual's example: parent a small "earth"
mesh at local `x = 10` under a "sun" node that has been scaled `(5, 5, 5)`, and the earth doesn't
just orbit at distance 10 — it ends up **50 units away and 5× too big**, because the parent's scale
multiplies through every descendant's position and scale. [MAN-scenegraph]

```js
// TRAP: sun's scale leaks into everything parented under it
const sun = new THREE.Mesh(sphereGeometry, sunMaterial);
sun.scale.set(5, 5, 5);
scene.add(sun);

const earth = new THREE.Mesh(sphereGeometry, earthMaterial);
earth.position.x = 10;
sun.add(earth); // earth is now 50 units away and 5x too big
```

**Fix: keep structural nodes at scale `(1,1,1)` and put visual scale only on leaf meshes.** Insert an
unscaled `Object3D` between the thing that needs to look big and the things that need to move
relative to it: [MAN-scenegraph]

```js
const sunSystem = new THREE.Object3D(); // structural, stays (1,1,1)
scene.add(sunSystem);

const sunMesh = new THREE.Mesh(sphereGeometry, sunMaterial);
sunMesh.scale.set(5, 5, 5); // visual scale lives here, on a leaf
sunSystem.add(sunMesh);

const earthOrbit = new THREE.Object3D(); // also structural, (1,1,1)
sunSystem.add(earthOrbit);

const earthMesh = new THREE.Mesh(sphereGeometry, earthMaterial);
earthMesh.position.x = 10; // correct distance, unaffected by sunMesh's scale
earthOrbit.add(earthMesh);
```

The rule generalizes: any node you intend to use as a pivot for children's positions or rotations
should never itself carry non-uniform or non-identity scale. If something needs to look big, scale
the leaf mesh, not the node other things are parented to.

## World-space queries

To read an object's actual world position after the hierarchy has moved (rather than its
parent-relative local `position`): [MAN-scenegraph]

```js
const worldPosition = new THREE.Vector3();
someObject.updateWorldMatrix(true, false);
someObject.getWorldPosition(worldPosition);
```

Use `lookAt(target)` to aim an object at a world-space point.

## Visualizing local spaces while building

`AxesHelper` and `GridHelper` render the local axes/grid of the object they're added to, which is
useful for eyeballing whether a pivot ended up where you think it did. Because helpers are often
added at the same position as the geometry they're helping you debug, they need to win the depth
test regardless of what's in front of them, and they need a deliberate draw order relative to other
transparent/overlapping helpers: [MAN-scenegraph]

```js
const axes = new THREE.AxesHelper();
axes.material.depthTest = false;
axes.renderOrder = 1;
someNode.add(axes);

const grid = new THREE.GridHelper(10, 10);
grid.material.depthTest = false;
grid.renderOrder = 2;
someNode.add(grid);
```

Without `depthTest = false` a helper can be silently occluded by whatever geometry sits at the same
point, making it look like the helper didn't render at all rather than that it lost the depth test.
