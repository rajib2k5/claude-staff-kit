# Phase 2 — Instancing

**Triggers:** many movable copies of the same geometry, `InstancedMesh`, `setMatrixAt`,
`setColorAt`, `instanceMatrix.needsUpdate`, culling or raycasting acting wrong after bulk updates,
"how many instances can I have."

## When to reach for InstancedMesh instead of merging

Phase 1's merge collapses static geometry into one draw call but forfeits independent movement.
When the objects are copies of one geometry that *do* need to move, rotate, scale, or recolor
independently at runtime, `InstancedMesh` is the documented tool: one draw call, N independent
transforms.

## Constructing it

```js
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial();
const count = 10000;

const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
scene.add(instancedMesh);
```

**`count` is a hard maximum, decided at construction time.** There is no method to grow an
`InstancedMesh` after construction — if you need more instances than the count you built it with,
you construct a new `InstancedMesh`. Size `count` to the real ceiling you expect, not to how many
instances exist right now.

## Setting per-instance state

```js
const matrix = new THREE.Matrix4();
const color = new THREE.Color();

for (let i = 0; i < count; i++) {
  matrix.compose(position[i], quaternion[i], scale[i]);
  instancedMesh.setMatrixAt(i, matrix);
  instancedMesh.setColorAt(i, color.setHSL(i / count, 1, 0.5));
}

instancedMesh.instanceMatrix.needsUpdate = true;
instancedMesh.instanceColor.needsUpdate = true;
```

`setMatrixAt(index, matrix)` writes a per-instance transform; `setColorAt(index, color)` writes a
per-instance color (only meaningful if the material's `instanceColor` path is in use). Neither
write reaches the GPU until you flag the underlying attribute dirty:

- After any batch of `setMatrixAt` calls: `instancedMesh.instanceMatrix.needsUpdate = true`.
- After any batch of `setColorAt` calls: `instancedMesh.instanceColor.needsUpdate = true`.

## Recompute bounds after bulk updates

If a batch of `setMatrixAt` calls moved instances meaningfully — not just a small jitter — call
`instancedMesh.computeBoundingSphere()` afterward. The bounding sphere is not automatically
recomputed from instance transforms, and a stale bounding sphere is the documented cause of
instances that get frustum-culled when they shouldn't be, or that fail to register in
raycasting, after a bulk update moved them outside the old bounds.

## Practical checklist

1. Decide the real maximum instance count up front — this is a construction-time decision, not a
   runtime one.
2. Write transforms with `setMatrixAt`/colors with `setColorAt` in a loop, then set
   `instanceMatrix.needsUpdate` / `instanceColor.needsUpdate` once per batch, not once per instance
   — the per-instance write is cheap; forgetting the single needsUpdate flag afterward is what
   silently drops the whole batch.
3. Call `computeBoundingSphere()` after any bulk repositioning or culling/raycasting will misbehave.
4. If you hit the constructed `count`, stop trying to squeeze more instances in — construct a new
   `InstancedMesh` (and, if warranted, reconsider whether some of those instances are actually
   static and belong in the phase-1 merge path instead).

## Relationship to phase 1

The two techniques answer different questions and are often used together in the same scene: merge
what is permanently static (phase 1), instance what is a repeated shape that still needs to move
(phase 2). Neither replaces the other.
