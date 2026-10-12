---
name: threejs-performance-instancing
description: Hold a framerate and power budget in three.js on real hardware — collapse thousands of individual meshes into one draw call with BufferGeometryUtils.mergeGeometries, render many movable copies with InstancedMesh (setMatrixAt/setColorAt), author custom BufferGeometry by hand, decide when to render at all, and offload the renderer to a worker with OffscreenCanvas. Use whenever three.js is slow / low fps, "too many draw calls", "how do I render thousands of objects", InstancedMesh, mergeGeometries, vertexColors after merging, morphAttributes on merged geometry, custom BufferGeometry / BufferAttribute / setIndex, DynamicDrawUsage, render-target facades / billboards for distant objects, rendering on demand, requestAnimationFrame damping loops, transferControlToOffscreen, OffscreenCanvas, or main-thread jank in a three.js scene. Not for react-force-graph's own perf props, GPU vendor profilers, WebGPU/TSL tuning, or physics cost.
---

# three.js performance and instancing

Grounded in the three.js manual and docs at **r185** (npm `three@0.185.1`), read from
`threejs.org/manual/en/*` and `threejs.org/docs/*`. Every claim in the reference files traces to
one of those pages; see `references/sources.md`. This distillation was compiled from a saved
doc-mining research file (`threejs-research.md`, sections 7 and 9 primarily) rather than a live
fetch — nothing here goes beyond what that research recorded.

## Scope

**Covers:** merging static geometry into one draw call, preserving per-object identity with vertex
colors, animating merged geometry with morph targets, InstancedMesh for movable copies, hand-built
BufferGeometry, render-target facades for distant objects, the fixed per-frame cost levers,
rendering only when something changed, and moving the renderer off the main thread with
OffscreenCanvas.

**Does not cover:** react-force-graph's own performance props (`warmupTicks`, `autoPauseRedraw`,
`nodeResolution`, …) — that is a different plugin's scope. GPU vendor profiling tools. WebGPU/TSL
tuning — see `threejs-webgpu-tsl`. The scroll-page render loop itself — see `threejs-on-web-pages`.
Physics/simulation cost — not part of three.js core.

## The one thing to internalize first

**Measure before you pick a lever.** The manual's own benchmark is ~19,000 individual box meshes
at ~19–20 fps; merging them into one mesh reaches ~60 fps and removes roughly 80,000 nodes from
scene-graph traversal. That gap — draw calls and node count, not triangle count — is usually the
actual bottleneck. Count draw calls and scene-graph nodes first, then choose among the five levers
below; do not reach for InstancedMesh or a worker before you know which cost you're actually
paying.

| Symptom | Likely lever | Phase |
|---|---|---|
| Thousands of *static* meshes, never move independently | merge geometries | 1 |
| Thousands of *movable* copies of one shape | InstancedMesh | 2 |
| No primitive fits, or you must mutate vertices per frame | custom BufferGeometry | 3 |
| GPU/vertex cost is fine but you render every frame anyway, or a worker isn't the issue yet | render-on-demand + fixed-cost cuts | 4 |
| Page feels janky even though the GPU has headroom | move the renderer into a worker | 5 |

## Workflow

Work the phases in order for a scene that has never been profiled; jump straight to one for a
narrow, already-diagnosed problem.

| Phase | Read | When |
|---|---|---|
| 1 | `references/phase-01-draw-call-reduction.md` | many static objects, draw-call count is the bottleneck, need per-object color or limited animation after merging |
| 2 | `references/phase-02-instancing.md` | many movable copies of one geometry, InstancedMesh, setMatrixAt/setColorAt, culling/raycasting acting wrong after bulk updates |
| 3 | `references/phase-03-custom-geometry-authoring.md` | no primitive or merge/instance path fits, hand-building BufferGeometry, per-frame vertex mutation, normal seams |
| 4 | `references/phase-04-frame-budgeting.md` | deciding whether to render a frame at all, distant complex objects, cutting lights/shadows/texture size/material tier |
| 5 | `references/phase-05-main-thread-offloading.md` | main-thread jank (not GPU cost) is the problem, OffscreenCanvas, running the renderer in a worker |

Read `references/gotchas.md` whenever a lever doesn't behave the way you expect — it lists the
traps that produce no error message and the honest unknowns the sources never resolve.

## Definition of done

A finished optimization pass satisfies all of these:

1. Draw-call count and scene-graph node count were measured before and after the change — not
   guessed.
2. Static geometry that will never move independently again has been merged with
   `BufferGeometryUtils.mergeGeometries`, with each piece's `applyMatrix4(matrixWorld)` applied
   *before* the merge.
3. If per-object identity mattered before merging, a `color` `BufferAttribute` plus
   `material.vertexColors = true` reproduces it.
4. Movable repeated geometry uses `InstancedMesh` with `count` sized to the real hard maximum, not
   sized to the current count.
5. Every bulk `setMatrixAt`/`setColorAt` pass is followed by `instanceMatrix.needsUpdate = true`
   (and `instanceColor.needsUpdate = true`) and, if bounds moved, `computeBoundingSphere()`.
6. Hand-built geometry indexes with `Uint16Array` under 65k vertices and `Uint32Array` above, and
   any attribute mutated every frame is marked `DynamicDrawUsage`.
7. The render loop only renders when something actually changed, or the team has explicitly
   decided continuous rendering is required (e.g., a live animation).
8. The fixed per-frame costs — light count, shadow-casting light count, texture dimensions,
   material tier — were reviewed, not just the geometry.
9. If a worker/OffscreenCanvas path was added, it has a feature-detected fallback for browsers
   without `transferControlToOffscreen`, and canvas *reposition* (not just resize) is handled or
   explicitly flagged as unhandled (see `references/gotchas.md` section D).
10. Nothing in the change relies on a number the sources don't give. No source states target
    draw-call/triangle/texture-MB budgets per device class — those thresholds are this skill's own
    judgment call, made explicitly rather than presented as documented fact.
