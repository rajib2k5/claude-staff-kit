# Phase 1 — the countable sweep

Triggers: check this page, ship gate, pre-flight, slop, AI-generated, review this landing page

`scripts/ship_gate.py` runs 27 checks against the file as written. Every finding prints the
upstream section it came from, so a block can be argued with.

```bash
python3 scripts/ship_gate.py page.html [--json] [--lenient-emdash]
```

## What it counts

**Restraint**

| Rule | Threshold | Provenance |
|---|---|---|
| `emdash` | zero em-dashes or en-dashes in user-visible strings | taste-skill §9.G L685-701 |
| `eyebrow` | at most `ceil(sections / 3)`, hero counts as one | §4.7 L253-257 |
| `scroll_cue` | no "scroll to explore", "↓ scroll", animated wheel icons | §9.F L682 |
| `section_number` | no `00 / INDEX`, `001 · Capabilities` decoration | §9.F L638-642 |
| `fake_footer` | no `v0.6.2-rc.1`, "last sync 4s ago" | §9.E L654-656 |

The em-dash rule is deliberately binary. Upstream's own note explains why: the agent
historically ignored it when phrased as "use sparingly". It is scoped to **rendered UI
strings** — it does not apply to prose, docs, commit messages, or reports.

The eyebrow rule is upstream's self-declared most-violated rule, and the worked example in
this skill violated it 7-for-8 on its first draft. Treat a finding here as probably correct.

**Structure**

| Rule | Threshold | Provenance |
|---|---|---|
| `families` | 4+ distinct `data-layout` values across 8 sections | §4.7 L251 |
| `zigzag` | at most 2 consecutive `split` layouts | §4.7 L252 |
| `nesting` | no triple-nested `.card` containers | image-to-code §16 |
| `shape_lock` | at most 3 distinct `border-radius` values | §4.4 L217 |
| `marquee` | at most 1 per page | §5 L361 |
| `list_escalation` | a `<ul>` over 5 items needs class `escalated` | §4.9 L307-314 |
| `dvh` | `min-h-[100dvh]`, never `h-screen` or `100vh` | §3.E L150 |

`families` **fails** when no section carries `data-layout` rather than passing silently. A
check that cannot see anything should say so. See phase 3 for the taxonomy.

**Hero**

Requires `data-hero="true"` on the section and `data-hero-stack` on its text column, or the
slot count measures the whole section and over-reports.

| Rule | Threshold |
|---|---|
| `hero_lines` | headline hard-broken into at most 2 lines |
| `hero_words` | subtext at most 20 words |
| `hero_stack` | at most 4 stack slots: eyebrow-or-brand / headline / subtext / CTA row |
| `cta_words` | primary CTA label at most 3 words |

**Copy**

`slop_word` (filler marketing verbs), `slop_name` (Acme, Nexus, SmartFlow), and
`fake_precision` — invented figures like `92%`, `4.1×`, `5.8mm` unless real or marked
`<!-- mock -->`. For consulting and client-facing work `fake_precision` is the highest-stakes
rule here: an invented metric is a credibility problem, not a taste problem.

**Palette, fonts, motion**

`banned_palette` (the premium-consumer beige/brass hex family), `off_palette` (anything
outside the approved brand values — see phase 4), `pure_black`, `banned_font` (Inter as a
default family, Fraunces, Instrument Serif), `reduced_motion` (a
`prefers-reduced-motion` block is mandatory once any motion exists), `scroll_listener`,
`state_continuous`.

## Reading the output

Report findings verbatim with provenance. Do not compress a gate into "a few minor issues" —
the provenance line is what makes a finding contestable, and dropping it turns a checkable
claim into an assertion.

## Known limits

- The visible-string extractor is regex-based, not a parser. It is adequate for HTML and JSX
  but will miss strings assembled at runtime.
- `nav` height is only checkable when a `--nav-h` custom property is declared; otherwise it
  reports that and defers to phase 2, which measures it for real.
- `fake_precision` suppresses on any `<!-- mock -->` anywhere in the file, not per-figure.
