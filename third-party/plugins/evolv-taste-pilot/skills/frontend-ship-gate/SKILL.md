---
name: frontend-ship-gate
description: Run a countable pre-flight gate over a frontend and refuse a pass while any mechanical check fails. Catches the AI-slop tells: em-dashes in UI copy, eyebrow over-use, repeated layout families, hero line and word overruns, off-brand palette and fonts, filler verbs. Executes bundled gates instead of self-attesting. Use for "check this page", "review this landing page", "does this look AI-generated", or "ship gate".
---

# Frontend ship gate

Most frontend review is self-attestation: an agent reads its own output, decides it looks
fine, and ships. This skill does the opposite — it **runs** the checks and reports what
failed, with the rule's provenance attached so a block is arguable rather than oracular.

Two layers, because they catch different classes of defect:

- **Source layer** (`scripts/ship_gate.py`) — 27 checks against the file as written.
- **Rendered layer** (`scripts/render_probe.mjs`) — 9 checks that only exist after layout.

The split is load-bearing. The upstream rule this encodes is *"a 4-line hero headline is
always a font-size error, never a copy-length error."* That is a statement about **rendered**
lines. A source-level check counts `<br>` tags and will happily pass a two-break headline
that renders in four lines. Running only the source layer gives false confidence on the most
visible failure mode there is.

## Run it first, read second

```bash
python3 scripts/ship_gate.py page.html [more.html ...] [--json]
node scripts/render_probe.mjs page.html [--viewport 1440x1000] [--json]
```

Both exit non-zero on failure. Run **both** on any HTML surface. Playwright is an optional
dependency — with it absent the rendered layer skips cleanly and the source layer still runs.

Do not paraphrase the output. Report the findings verbatim with their provenance, then fix
the page. An agent that summarises a gate's output as "looks good with minor nits" has
defeated the gate.

## Phases

Read the reference for the phase you are in. Do not load all four.

| Phase | Read | When |
|---|---|---|
| 1. Countable sweep | `references/phase-01-countable-checks.md` | Any request to check, audit, or review a page. Triggers: check this page, ship gate, pre-flight, slop, AI-generated, review this landing page |
| 2. Rendered measurement | `references/phase-02-rendered-checks.md` | The surface is HTML you can open. Triggers: hero wraps, headline too long, overflow, grid gap, nav height, above the fold |
| 3. Layout annotation | `references/phase-03-layout-taxonomy.md` | Authoring or annotating sections; the families check reports it cannot see anything. Triggers: data-layout, layout family, section variety, zigzag, bento |
| 4. Precedence | `references/phase-04-precedence.md` | Two rules conflict, or brand colour and typography are in play. Triggers: which rule wins, brand colours, palette, fonts, dials, EV-1 |

`references/gotchas.md` holds the failure modes found by running this on real pages.
`references/worked-example.html` is a page that passes 27/27 and 9/9 — diff against it when
a finding is unclear.

## The seven things it cannot check

`ship_gate.py` prints these as an attestation list rather than silently ticking them. An
unticked attestation is not a pass, and saying "attested" without doing the work is worse
than not running the gate at all.

1. Every animation justifiable in one sentence — hierarchy, storytelling, feedback, state.
2. Every visible string re-read for grammar, referent clarity, accidental cuteness.
3. Hero visual is a real asset, not a gradient blob or a div-built fake screenshot.
4. One copy register page-wide, not technical mono mixed with editorial and marketing punch.
5. Contrast measured, not assumed: 4.5:1 body, 3:1 for text at 18px and above.
6. Any figure presented as data is real, or explicitly marked mock.
7. Layout-family annotations honestly describe the sections they sit on.

Number 7 is the one that rots quietly. Labelling three uniform card grids as `bento`,
`card-grid`, and `asymmetric` passes the machine and fails the reader.

## Definition of done

- Both gates run and report zero failures, or every remaining failure has a recorded reason.
- The seven attestations are actually walked, not asserted.
- Findings were reported with provenance, not summarised away.
- If a rule was wrong, that disagreement is recorded rather than silently bypassed.

## Out of scope

Choosing the aesthetic direction. Writing the frontend. Motion implementation correctness.
Accessibility breadth beyond the two contrast ratios. Copy voice and brand tone. Backend,
API, or build-config review.
