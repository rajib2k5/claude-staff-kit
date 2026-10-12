# Pilot upstream, forge the delta

**Decision:** install the upstream taste-skill artifacts and run them on real work before
building anything. Forge scope drops from five skills to one thin overlay plus two
executables. This document is the plan; `evolv-taste-overlay.md` is the delta artifact.

Source surface: `github.com/Leonxlnx/taste-skill` (MIT, cloned and read in full 2026-08-05).

---

## What changes when you pilot first

The original scout manifest proposed five net-new skills. Four of them were, in substance,
re-authorings of material that already installs with one command. Piloting first converts
those four from *build* into *observe*, and leaves behind a much smaller thing to build:

| Original candidate | Under pilot-first |
| --- | --- |
| `frontend-ship-gate` | **Becomes the delta.** Upstream ships the rules; nothing runs them. The executables below are the whole increment. |
| `legacy-ui-redesign-audit` | Pilot `redesign-existing-projects` on the next inherited client frontend. Forge only if the SEO/analytics-preservation half proves missing in practice. |
| `scroll-motion-engineering` | Pilot the §5 skeletons directly from `design-taste-frontend`. Forge only the parts the pilot finds absent (parallax, Three.js, bundle thresholds). |
| `comp-to-design-tokens` | Pilot `image-to-code`. The known gap is the token output schema, which is small enough to be a reference file in the overlay rather than a skill. |
| `ui-reference-comp-direction` | Pilot `imagegen-frontend-web`. Its missing prompt template is a one-file addition, not a skill. |

**Net:** one overlay document, two scripts, one worked example. Roughly a day of work
instead of a five-skill build, and every rule in it is now falsifiable against a pilot.

---

## Install set

Install the three that carry real procedural content, and skip the aesthetic packs — they
ship competing palettes and `evolv-brand` is authoritative here.

```bash
# the general default (v2) - dial system, ban corpus, GSAP skeletons, pre-flight gate
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"

# inherited codebases - the ~90-item symptom-to-fix catalogue
npx skills add https://github.com/Leonxlnx/taste-skill --skill "redesign-existing-projects"

# image-first intake - the ~37-slot extraction rubric
npx skills add https://github.com/Leonxlnx/taste-skill --skill "image-to-code"
```

Deliberately **not** installed:

- `high-end-visual-design`, `minimalist-ui`, `industrial-brutalist-ui` — token files with
  their own palettes and type stacks. They conflict with `evolv-brand` by construction.
  Install one only for a non-evolv client project, and only per-project.
- `stitch-design-taste` — targets Google Stitch, which is not in the toolchain, and its
  shipped example contradicts its own spec (nine sections against a seven-section template,
  four dials against three).
- `full-output-enforcement` — 49 lines of model-behavior posture. If truncation becomes a
  real problem, `system-prompt-optimizer` is the right home.
- `design-taste-frontend-v1`, `gpt-taste` — variants of the default. Running three variants
  in one pilot makes the result unattributable.

---

## Pilot protocol

Two engagements or four weeks, whichever comes first. The point is to produce evidence, so
the protocol is mostly about not losing it.

**Setup**

1. Install the three skills above.
2. Add `evolv-taste-overlay.md` to the repo where the team will actually see it
   (`docs/frontend/` or the project `CLAUDE.md`), because the overlay is what resolves the
   conflicts between the installed skills.
3. Drop `ship_gate.py` and `render_probe.mjs` into the project and wire them as a
   pre-commit hook or a CI step. This is the only part that is genuinely new, so it is the
   part worth instrumenting.

**Run**

4. One greenfield surface and one inherited surface, so both the default skill and the
   redesign skill get exercised.
5. Every time the gate blocks a commit, log the rule that fired and whether the engineer
   agreed with it. A rule that fires often and is always overridden is a bad rule; a rule
   that fires often and is always accepted is the one to keep.
6. Every time a reviewer catches something the gate missed, log it as a candidate check.
   That log is the forge backlog.

**Decide**

7. At the end, three lists: rules that earned their place, rules to delete, and misses to
   mechanize. Forge only against the third list.

---

## What to measure

Deliberately small, because a pilot that needs a dashboard will not get run.

| Signal | How | What it decides |
| --- | --- | --- |
| Gate block rate per rule | `ship_gate.py --json` output collected per commit | Which rules are load-bearing versus noise |
| Override rate per rule | The engineer's log line when they bypass a block | A high-override rule gets deleted, not tuned |
| Review findings the gate missed | Reviewer notes | The forge backlog |
| Rework after design review | Count of "make it look less generic" round trips, before versus after | Whether any of this is worth keeping at all |
| Conflicts hit in practice | Any time two installed skills disagreed | Whether the overlay's precedence rules are complete |

The last row matters most. The repo has at least six direct rule conflicts across its own
skills with no arbitration document anywhere. The overlay asserts a precedence order; the
pilot is what tells you whether that order is right.

---

## What the delta actually is

Three files, and nothing else:

1. **`evolv-taste-overlay.md`** — the arbitration document upstream lacks, plus the layout
   family taxonomy upstream references but never defines, plus the evolv-brand
   reconciliation. Read alongside the installed skills, not instead of them.
2. **`ship_gate.py`** — the countable checks, run rather than self-attested. 27 checks
   against source, each printing its provenance back to the upstream section so a failure
   is arguable instead of oracular. Judgment calls are emitted as an explicit attestation
   list rather than silently ticked.
3. **`render_probe.mjs`** — the checks that only exist after layout. Upstream's rule is
   "a 4-line hero headline is always a font-size error"; that is about rendered lines and
   is unverifiable from source. This measures nine such properties in headless Chromium,
   including dense-grid hole detection.

The worked example (`evolv-taste-poc.html`) is the proof the three files agree with each
other: it passes both gates and demonstrates every surviving taste element on evolv tokens.

---

## Risks worth naming before you start

- **The gate becomes a ritual.** If the override rate is high and nobody deletes rules, the
  team learns to bypass it and the whole thing is worse than nothing. The override log is
  the mitigation, and it only works if someone reads it.
- **Upstream moves.** The default skill is explicitly "v2 experimental, actively iterating."
  Pin what you pilot, and diff before upgrading, or the pilot's findings stop referring to
  the thing you have installed.
- **The provenance is asserted, not shown.** Rules like "the #1 violated rule in production
  tests" have no test artifacts in the repo. Treat the ban corpus as a strong prior from
  someone who has shipped a lot of AI-generated pages, not as measured fact. The pilot is
  how it becomes measured.
- **Attribution.** MIT licensed, so reuse is fine, but the overlay should keep citing
  section numbers back to the source rather than absorbing the rules silently.
