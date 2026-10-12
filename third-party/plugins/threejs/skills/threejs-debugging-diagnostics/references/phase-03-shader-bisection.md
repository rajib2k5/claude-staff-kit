# Phase 3 — Shader bisection

**Triggers:** the object exists (phases 1–2 ruled out invisible/numeric causes) but a custom
`ShaderMaterial`/`RawShaderMaterial` looks wrong; a GLSL shader produces black, garbage colour, or
nothing; deciding whether a shader bug is in the vertex stage or the fragment stage; want to
visualise a `vec3`/`vec2` varying instead of guessing at its value.

## Bisect vertex vs fragment first, before any fragment theorising

Custom shaders have two independently-failing stages, and they fail differently:

- A **vertex-shader** bug typically means vertices end up somewhere degenerate (collapsed to a point,
  pushed outside the frustum, or otherwise not forming visible triangles) — the documented result is
  that the object renders as **nothing at all**, which looks identical to several of the phase-1/2
  causes.
- A **fragment-shader** bug still has correctly-placed triangles, so something visibly renders — just
  the wrong colour, or garbage, or solid black.

Because a vertex-stage failure and a fragment-stage failure can both present as "I don't see
anything," the manual's fix is to force the fragment shader to a known-good solid colour **first**,
before spending any time theorising about fragment logic: [MAN-debugging-glsl]

```glsl
void main() {
  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // force solid red, ignore everything else
}
```

- **The object now renders solid red, correctly shaped and positioned** → the vertex stage is fine.
  The bug is in the fragment shader's actual logic (a bad sample, a wrong uniform, a broken
  calculation) — go debug that.
- **Still nothing renders** → the vertex shader is the problem (degenerate positions, a broken
  `gl_Position` calculation, an attribute not bound correctly). Go back to inspecting vertex-stage
  math, not fragment logic — this is the same "isolate before theorising" move as the
  `MeshBasicMaterial` red-swap in phase 1, one level lower in the pipeline.

Skipping this bisect and diving straight into fragment-shader logic when the actual bug is in the
vertex shader is a documented way to waste time on the wrong stage entirely — the symptom (nothing
renders) does not distinguish the two causes, but this ten-second test does. [MAN-debugging-glsl]

## Visualise suspect values by scaling them into 0–1 as colour

Once the solid-colour bisect confirms the vertex stage is fine, the next-cheapest move is to stop
guessing at what a varying's actual value is and *look at it*, by writing it directly to
`gl_FragColor` scaled into the visible `[0, 1]` colour range: [MAN-debugging-glsl]

```glsl
// Normals are in [-1, 1]; scale into [0, 1] so negative components are visible as colour
// rather than clamped to black.
gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0);
```

```glsl
// UVs should tile [0, 1] per unit; fract() reveals repeats/seams/stretching directly as a
// visible checker-like pattern instead of an invisible number.
gl_FragColor = vec4(fract(vUv), 0.0, 1.0);
```

This pattern generalises to any varying or computed value you suspect is wrong: pick the scaling that
maps its expected range into `[0, 1]`, render it as colour, and compare what you see against what you
expect (a normal map should look like smoothly-varying pastel colours; broken UVs often show as hard
seams or an unexpected solid colour across a whole face). [MAN-debugging-glsl]

## The Shader Editor browser extension

The manual also points at a **Shader Editor** browser extension as a way to inspect and live-edit the
actual compiled GLSL a running page is using, without round-tripping through your own source and a
page reload for every change. [MAN-debugging-glsl] No further detail on the extension's specific
capabilities is given in the sourced page beyond its existence and purpose — treat it as a tool worth
having installed for shader work, not something this skill can walk you through step-by-step.

## Once the shader is fixed

Once the bisect and the 0–1 visualisation have located and confirmed the fault, remove the temporary
`gl_FragColor` overrides and restore the real shader logic with the fix applied. If the bug is now
understood well enough to reproduce reliably, hand the reproduction to
`deterministic-headless-validation` to lock it in as a regression check — this skill's job ends at
diagnosis and fix, not at writing the test that proves it stays fixed.

To make the failure easier to see while you work through any of the above — where the camera is
pointed, where a light is aimed, where local axes actually sit — see
`references/phase-04-in-scene-instrumentation.md`.
