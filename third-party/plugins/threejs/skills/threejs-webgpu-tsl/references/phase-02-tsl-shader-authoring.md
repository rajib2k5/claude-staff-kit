# Phase 2 — TSL shader authoring

**Triggers:** "TSL node materials", rewriting a custom shader for `WebGPURenderer`, "why doesn't
my `ShaderMaterial` work under WebGPURenderer", `onBeforeCompile` no longer applying,
`RawShaderMaterial` migration.

**Source coverage: partial — the thinnest cluster in this skill.** TSL has **no dedicated manual
page** in `manual/list.json`. Everything grounded here comes from what the two post-processing
pages and the API entry say about TSL in passing, plus the explicit unsupported list from the
renderer-migration page. Do not expect (and do not invent) a catalogue of TSL node functions —
the docs sidebar lists 400+ of them, and none of that vocabulary was walked by the research this
skill is built from.

## What TSL is, per the sources

TSL (the "Three.js Shading Language") is JavaScript-authored: you build a node graph in JS, and
the backend transpiles it to WGSL or GLSL depending on whether the renderer ended up on the WebGPU
or WebGL2 (fallback) backend. That is the full extent of what this skill's sources state about
TSL's mechanism — there is no fetched page walking through node types, syntax, or a
"write your first TSL node material" example.

## What TSL replaces, and why the replacement is mandatory

On the `WebGPURenderer` path, TSL is the *only* supported way to author custom shading. The
following are explicitly named as unsupported:

- `ShaderMaterial`
- `RawShaderMaterial`
- `onBeforeCompile()`

If a project has any custom GLSL authored through these three mechanisms, that shader logic has
to be re-expressed as a TSL node graph before the project can run on `WebGPURenderer` — there is
no compatibility shim named in the sources. Treat this as a required rewrite, not a
configuration flag.

## What this phase can and cannot tell you

Can tell you, with a source behind it:
- TSL is JS, not GLSL strings.
- It transpiles to WGSL or GLSL depending on backend.
- The three legacy custom-shader mechanisms above do not work under `WebGPURenderer`.

Cannot tell you, because no source in this skill's grounding covers it:
- The concrete TSL API for building a color/normal/position node graph on a material (e.g. what a
  `NodeMaterial` or `colorNode` assignment looks like in practice).
- Any node function names beyond the handful used for post-processing in phase 3
  (`pass`, `mrt`, `output`, and the named effect nodes — `fxaa`, `traa`, `rgbShift`, `dotScreen`).
- Compute-shader authoring in TSL, beyond acknowledging it exists as a use case the two fetched
  pages don't elaborate on (explicitly out of scope for this skill per the brief).

If a real migration needs custom TSL shading logic beyond the post-processing node vocabulary in
phase 3, that is new research this skill does not yet cover — say so rather than guessing at
plausible-sounding TSL syntax.

## Practical guidance given the gap

1. Inventory every `ShaderMaterial` / `RawShaderMaterial` / `onBeforeCompile` use in the project
   before committing to the migration — this is the concrete cost the manual's unsupported list
   implies, and it's enumerable even without deep TSL knowledge.
2. For the post-processing-shaped subset of custom shading (screen-space effects composited over
   a rendered scene), phase 3's `pass()`/effect-node vocabulary is fully sourced and should be
   preferred over guessing at a from-scratch TSL material.
3. For anything else — custom lighting models, procedural surface shading, vertex displacement —
   flag it as unresearched TSL territory for this skill and treat the effort as a spike, not a
   known quantity, until a TSL-specific manual page or worked example is fetched and added to this
   skill's sources.
