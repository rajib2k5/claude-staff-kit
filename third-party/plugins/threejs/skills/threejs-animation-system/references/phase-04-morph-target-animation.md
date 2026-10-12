# Phase 4 — Morph-target animation

**Triggers:** geometry merged for draw-call reduction that needs to move again, procedurally
generated geometry that needs per-instance animation, `morphAttributes`, `morphTargetInfluences`,
"can I still animate this after merging", "morphAttributes not updating".

## Why this phase exists: merging forfeits per-object movement

Merging many separate meshes into one `BufferGeometry` (via `BufferGeometryUtils.mergeGeometries`,
for draw-call reduction) removes the ability to move any one of the original pieces independently —
there is no longer a separate `Object3D` per piece to translate, rotate, or scale. That trade is
the whole point of merging for performance, but it means "animate this piece" can no longer mean
"move its transform." Morph targets are the documented way to animate geometry in that state: the
geometry's vertex data itself is blended between named states, instead of any object being moved.

The same need applies to procedurally generated geometry that was never separate per-object meshes
to begin with — anything built as one `BufferGeometry` from the start faces the identical
constraint.

## Setting up morph attributes

```js
// geometry already exists (merged, or built directly as one BufferGeometry)
geometry.morphAttributes.position = [
  targetPositionsStateA, // a BufferAttribute matching the base position attribute's layout
  targetPositionsStateB,
];
// optional: morph target colors alongside positions
geometry.morphAttributes.color = [
  targetColorsStateA,
  targetColorsStateB,
];

const mesh = new THREE.Mesh(geometry, material);
// influence for each entry in morphAttributes.position, in order
mesh.morphTargetInfluences = [0, 0];
```

`morphAttributes.position` (and, alongside it, `morphAttributes.color`) is an array of
per-state `BufferAttribute`s, each shaped like the base attribute it morphs. `mesh.
morphTargetInfluences` is the parallel array of blend weights — one entry per morph target — that
determines how much of each target state is mixed into the rendered geometry right now.

## Animating the influences

Because the influences are just numbers on the mesh, animating morph targets is ordinary
per-frame value tweening — set them directly, or drive them through the animation system's clip
mechanism if the morph weights themselves were authored as keyframe tracks:

```js
function render() {
  const dt = clock.getDelta();
  // tween influence[0] up and influence[1] down, or whatever the desired blend curve is
  mesh.morphTargetInfluences[0] = someTweenedValue(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
```

There is no separate "morph mixer" concept called out in the sources beyond this: it's the same
render-loop-driven value mutation described as the simpler alternative in Phase 1, applied to
`morphTargetInfluences` instead of `position`/`rotation`/`scale`.

## The hard constraint: `morphAttributes` cannot change after first render

`BufferGeometry.morphAttributes` cannot be changed once the geometry has been rendered for the
first time. If the set of morph target states needs to change after that point — new states added,
existing ones replaced — the geometry must be disposed and rebuilt from scratch, not mutated in
place:

```js
// WRONG after first render: mutating morphAttributes on a live geometry
// geometry.morphAttributes.position.push(newTargetPositions); // will not take effect correctly

// RIGHT: dispose and rebuild
const oldGeometry = mesh.geometry;
const newGeometry = buildGeometryWithMorphTargets(/* including the new state */);
mesh.geometry = newGeometry;
oldGeometry.dispose();
```

This is a hard rule from `BufferGeometry`'s own docs, not a performance suggestion — plan the full
set of morph target states up front where possible, and treat "the set of states needs to grow" as
a rebuild event, not a live edit.
