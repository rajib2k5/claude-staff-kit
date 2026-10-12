# Gotchas, verified discrepancies, and honest unknowns

## A. Situations documented as broken or unsupported

None of the sources this skill traces to describe whether these situations fail loudly (an error)
or silently (nothing happens, wrong output). Treat the "fix" column as a rule to follow
proactively, not a symptom you'll definitely be warned about.

| Situation | Cause | Fix |
|---|---|---|
| Renderer used before it's ready, when driving frames yourself or touching the renderer during init | `WebGPURenderer` initializes asynchronously | `await renderer.init()` before that use (phase 1) |
| Assuming the WebGL2 fallback "just works" because it's automatic | `forceWebGL` was never actually exercised | test `{forceWebGL: true}` deliberately in every environment that matters (phase 1) |
| A `ShaderMaterial` / `RawShaderMaterial` / `onBeforeCompile` shader used under `WebGPURenderer` | all three are explicitly unsupported on this path | rewrite as TSL (phase 2) |
| `EffectComposer` used for post-processing under `WebGPURenderer` | unsupported on this path | rebuild as a `RenderPipeline` `outputNode` (phase 3) |
| FXAA or Lut3D producing wrong-looking output | tone mapping / colour conversion happens at the end of the chain by default, but these effects need sRGB input earlier | set `outputColorTransform = false` (phase 3) |
| MRT setup using more memory than expected | attachments default to `RGBA16` half-float | downgrade `texture.type` to `UnsignedByteType` (phase 3) |

## B. Verified manual-vs-docs tone discrepancy

Established by comparing `[MAN-webgpurenderer]` against `[DOCS-WebGPURenderer]` directly (see
`sources.md`) — not reported by either page about the other.

| Source | What it says |
|---|---|
| [threejs.org/manual/en/webgpurenderer.html](https://threejs.org/manual/en/webgpurenderer.html) | `WebGPURenderer` "is still in an experimental state"; names missing features; warns some apps may run **slower** than on `WebGLRenderer`. |
| [threejs.org/docs/pages/WebGPURenderer.html](https://threejs.org/docs/pages/WebGPURenderer.html) | Omits "experimental" entirely; calls it "the new alternative of `WebGLRenderer`." |

**Resolution rule: follow the manual's framing.** It's the more conservative of the two, it's the
surface that states the actual risk (feature gaps, possible perf regression), and the API
reference page is one of the r185 docs pages mid-migration to the flat `docs/pages/` URL scheme —
less settled than the manual as a source. When advising on a migration, quote the manual's
language, not the API page's more upbeat one.

## C. Traps that are not discrepancies, just easy to miss

- **"Automatic" async init isn't the same as "no init step exists."** `setAnimationLoop` absorbs
  the async initialization for you, but only if you use it — driving your own frame loop or
  touching the renderer early still needs `await renderer.init()`.
- **The unsupported list is about the *authoring* mechanism, not the *visual* capability.**
  `ShaderMaterial`/`RawShaderMaterial`/`onBeforeCompile` being unsupported doesn't mean custom
  shading is impossible under `WebGPURenderer` — it means it has to go through TSL instead. Don't
  read the unsupported list as "custom shaders don't work here."
- **A rebuilt `RenderPipeline` chain may use fewer, differently-named effect nodes than the
  `EffectComposer` chain it replaces.** The goal is the same rendered result, not a guaranteed
  1:1 pass-for-pass equivalence — don't assume every old `ShaderPass` maps to exactly one new
  `tsl/display` node.
- **`WebGLRenderer` staying "maintained" is not the same as "actively getting new capability."**
  The manual is explicit that the project has no plans for major new features there. That's a
  strategic signal for planning, not a bug to route around.
- **The 400+ TSL node functions visible in the docs sidebar are not this skill's vocabulary.** Only
  `pass`, `mrt`, `output`, `velocity`, and the four named `tsl/display` effect nodes (`fxaa`,
  `traa`, `rgbShift`, `dotScreen`) are sourced here. Don't assume any other TSL function name from
  general familiarity with node-based shader systems — verify against actual three.js docs first.

## D. Honest unknowns — no source covers these

This skill carries **three** open unknowns — more than any sibling skill in this plugin, because
it is the thinnest-sourced one. State these as unknowns rather than guessing, and verify
empirically if the work depends on them.

1. **The manual-vs-docs tone disagreement itself is partly unresolved.** Section B above gives the
   resolution rule this skill follows (trust the manual), but no third, higher-authority source
   confirms which framing is more accurate going forward — this is a judgment call, documented as
   such, not an adjudicated fact.
2. **TSL has no dedicated manual page.** `manual/list.json` (the recovered table of contents) has
   no TSL-specific entry. The TSL vocabulary grounded in this skill is limited to what the
   post-processing pages and the API entry use — the 400+ TSL function nodes visible in the docs
   sidebar are effectively unwalked by any source this skill traces to. Phase 2 states this
   directly rather than filling the gap with plausible-sounding node names.
3. **No browser or device support matrix exists anywhere in the manual**, including on
   `webgpurenderer.html` itself. "Will this run on the client's actual device fleet?" cannot be
   answered from any source here — this is a documented absence, not an inference, and it's also
   explicitly out of scope for this skill per the brief.
