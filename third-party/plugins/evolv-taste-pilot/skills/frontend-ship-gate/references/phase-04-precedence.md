# Phase 4 — precedence, and the brand lock

Triggers: which rule wins, brand colours, palette, fonts, dials, EV-1

The upstream skills contradict each other in at least six places and none of them knows
about your brand. This is the arbitration order. Where it disagrees with an upstream skill,
this wins.

## EV-1 — brand wins on colour and typography, always

The authoritative source for colour and type is the organisation's own brand skill, not any
palette shipped by a taste skill. For evolv that is six values:

| Role | Hex |
|---|---|
| Primary Orange | `#D15635` |
| Dark Navy | `#2E3952` |
| Tan/Beige | `#D68B60` |
| Light Grey | `#D9D9D9` |
| Charcoal (all body text) | `#343434` |
| White | `#FFFFFF` |

`#FAF8F5` (page) and `#E4E0DA` (hairline) are sanctioned soft neutrals, not a seventh and
eighth brand colour. Body text is charcoal, never `#000000`. Headings Montserrat, body
Nunito Sans.

This single rule dissolves three upstream conflicts at once: the banned beige/brass palette
becomes moot because you are not choosing a palette; the 20-font serif rotation pool becomes
moot because the faces are fixed; and the `Fraunces` / `Instrument Serif` disagreement
between two upstream skills never fires.

`ship_gate.py`'s `off_palette` check enforces this. Pointing it at a different
organisation means editing `EVOLV_APPROVED` in that script — do that rather than
disabling the check.

## EV-2 — accessibility and stated client constraints beat aesthetics

Upstream asserts this without operationalising it. Operationalised: if a rule here would
push contrast below 4.5:1 body or 3:1 for text at 18px and up, remove focus affordances, or
break keyboard order, the rule loses.

## EV-3 — the ban corpus beats the aesthetic packs

Where one upstream skill mandates an eyebrow before every major heading and another caps
eyebrows at one per three sections, the cap wins.

## EV-4 — hero CTAs are 1 primary plus at most 1 secondary

Two upstream skills disagree (one, versus one-plus-one). Two, because a secondary path is
real in a consulting context and suppressing it costs a conversion.

## EV-5 — overlap is permitted, once

One upstream file bans overlapping elements; another prescribes negative-margin overlap.
Allowed, as one of the ten families, at most once per page.

## EV-6 — the dial system is dropped

`DESIGN_VARIANCE` / `MOTION_INTENSITY` / `VISUAL_DENSITY` look like the spine of the
upstream skill and are not wired: roughly seven rules in 1206 lines branch on a dial, the
thresholds are mutually inconsistent (`>3`, `>4`, `>5`, `>7`), the banded reference in §7
does not align to those thresholds, and a sibling file ships a competing four-dial variant
with no arbitration anywhere. The individual gates the dials fed are kept. The abstraction
is not. Describe intent in words.

## EV-7 — cross-generation rotation rules are dropped

"Do not reuse the same serif or palette as your previous project" needs cross-session memory
nothing persists, and one upstream variant seeds its randomiser on prompt character count,
so two similar prompts of equal length select identically — the opposite of the stated goal.
Under EV-1 palette rotation is moot anyway. Per-page variety is enforced by the families
rule instead, which is checkable.

## EV-8 — annotate layouts

See `references/phase-03-layout-taxonomy.md`.

## EV-9 — the annotation must be honest

Also phase 3. Repeated here because it is the rule most likely to decay.

## Deliberately excluded

The three aesthetic style packs (they ship competing palettes; EV-1 settles it). The
`DESIGN.md` export format for a third-party generator (its worked example contradicts its own
spec — nine sections against a seven-section template, four dials against three). Anything
sourced from the upstream research folder: the effect sizes are specific and falsifiable
(+45% output length, 34%→80% accuracy, +115% combined) and **not one carries an author,
venue, DOI, or URL**, with two figures from different papers presented under one heading. Do
not build on numbers you cannot check.
