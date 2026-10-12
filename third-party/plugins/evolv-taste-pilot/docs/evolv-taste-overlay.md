# evolv taste overlay

Read this **alongside** the installed upstream skills (`design-taste-frontend`,
`redesign-existing-projects`, `image-to-code`), not instead of them. Upstream supplies the
rules. This supplies the three things it does not: an arbitration order, the layout family
taxonomy it references but never defines, and the reconciliation with evolv's own brand.

Every rule below cites its upstream section so it can be argued with. Where a rule is
evolv's own, it is tagged `EV-n`.

---

## 1. Precedence (the arbitration upstream has nowhere)

The source ships at least six direct contradictions across its own skills. Nothing in the
repo says which wins. This does, in strict order:

**EV-1 — `evolv-brand` wins on color and typography, always.** No upstream palette, font
rotation, or serif recommendation overrides it. The six approved values are
`#D15635` orange, `#2E3952` navy, `#D68B60` tan, `#D9D9D9` light grey, `#343434` charcoal,
`#FFFFFF` white. `#FAF8F5` paper and `#E4E0DA` hairline are sanctioned soft neutrals, not a
seventh and eighth brand color. Body text is charcoal, never `#000000`.

This resolves, in one stroke: the beige/brass ban (`taste-skill §4.2 L192-207`) becomes
moot because we are not choosing a palette; the serif rotation pool (`§4.1 L173-181`)
becomes moot because Montserrat and Nunito Sans are fixed; and the `Fraunces` /
`Instrument Serif` conflict between `taste-skill:180` (banned) and
`stitch-skill:51` (recommended) never fires.

**EV-2 — accessibility and stated client constraints beat aesthetic preference.** Upstream
asserts this (`§0.A L23`) without operationalizing it. Operationalized: if a rule in this
document would reduce contrast below 4.5:1 body / 3:1 for text ≥18px, remove focus
affordances, or break keyboard order, the rule loses. `design:accessibility-review` owns the
full check; this only refuses to fight it.

**EV-3 — `taste-skill` §4 and §9 beat the aesthetic packs.** Where `soft-skill` mandates an
eyebrow before every major heading (`soft-skill:52`) and `taste-skill` caps eyebrows at one
per three sections (`§4.7 L253-257`), the cap wins. Same for `brutalist-skill:28` listing
Inter as optimal against four other files banning it — moot under EV-1 anyway.

**EV-4 — the hero CTA count is 1 primary + at most 1 secondary.** `taste-skill:243` allows
two, `stitch-skill:69` allows one. Two, because a secondary "see the work" path is real in
consulting and suppressing it costs a conversion.

**EV-5 — overlap is permitted, deliberately.** `stitch-skill/DESIGN.md:66,73` bans
overlapping elements; `taste-skill:556` prescribes negative-margin overlaps. Overlap is
allowed as one of the ten layout families below, used at most once per page.

**EV-6 — drop the dial abstraction.** `DESIGN_VARIANCE` / `MOTION_INTENSITY` /
`VISUAL_DENSITY` are under-wired upstream: only about seven rules in 1206 lines branch on a
dial, the thresholds are mutually inconsistent (`>3`, `>4`, `>5`, `>7`), the banded
reference in `§7` does not align to those thresholds, and `stitch-skill/DESIGN.md:9-16`
ships a competing four-dial variant. The individual gates the dials feed are kept; the
abstraction is not. If someone wants a dial, use plain words in the brief.

**EV-7 — cross-generation rotation rules are dropped, not implemented badly.** Upstream's
"do not reuse the same serif or palette as your previous project" needs cross-session
memory nothing persists, and the `gpt-taste` RNG seeds on prompt character count, so two
similar prompts of equal length select identically. Under EV-1 palette rotation is moot;
layout variety is enforced per-page by the family rule instead, which is checkable.

---

## 2. The layout family taxonomy (EV-8)

Upstream enforces "a landing page with 8 sections must use at least 4 different layout
families" (`§4.7 L251`) and never says what a family is. `§10` lists ~50 pattern names and
labels them explicitly "a vocabulary, not a library"; `§12`, the Block Library that would
resolve it, ships zero blocks. So the taxonomy is authored here, and it is what
`ship_gate.py` checks against.

Annotate every section with `data-layout="<family>"`. Ten families, and the annotation is
load-bearing — an unannotated page fails the check rather than passing silently.

| `data-layout` | What it is | Use |
| --- | --- | --- |
| `full-bleed` | Edge-to-edge band, type or media, no container gutter | Tonal breaks. The one permitted page-theme exception. |
| `split` | Two roughly equal columns, content beside asset | Capped at 2 consecutive; the 3rd is a fail (`§4.7 L252`) |
| `asymmetric` | Unequal tracks (`2fr 1fr 1fr`, offset column, indented start) | The default for content sections |
| `bento` | Mixed-span grid, dense flow, item count equals cell count | Feature sets of 4-8 |
| `card-grid` | Uniform repeated cells, 3-up or 4-up | Only when the items genuinely are peers |
| `editorial` | Single narrow measure, ~60-70ch, long-form voice | Argument, not features |
| `rail` | Horizontal scroll-snap track | The escalation for lists over 5 items |
| `stacked-list` | Grouped rows or definition lists, one hairline per group | Specs, comparisons, deliverables |
| `overlap` | Layered composition using negative margin | At most once per page (EV-5) |
| `centered-focal` | Single centered block | At most once per page, and earn it |

**EV-9 — the annotation must be honest.** Labelling three uniform card grids as `bento`,
`card-grid`, and `asymmetric` passes the machine and fails the reader. This is on the
human-attestation list for that reason.

---

## 3. Taste elements kept, and why

These are the elements from the surface that survive EV-1 through EV-7 and are worth
carrying into evolv work. Each is checkable; the check name in brackets is the
`ship_gate.py` / `render_probe.mjs` rule that enforces it.

**Structure**

- Layout family variety, at least 4 across 8 sections `[families]` — `§4.7 L251`
- No more than 2 consecutive split layouts `[zigzag]` — `§4.7 L252`
- Bento cell count equals item count, and the grid interlocks with no dead cells
  `[gridHoles]` — `§4.7 L250`, `gpt-tasteskill L42-44`
- No triple-nested containers. A section is not a prison of cards `[nesting]` —
  `image-to-code §16`
- One shape family per page: all-sharp, all-soft 12-16px, or all-pill `[shape_lock]` —
  `§4.4 L217`

**Hero discipline** — the highest-yield cluster, because it is where generated pages fail most visibly

- Headline renders in at most 2 lines at desktop `[headlineLines]` — `§4.7 L236-237`.
  Upstream's framing is the useful part: *a 4-line hero headline is always a font-size
  error, never a copy-length error*. Fix the scale, not the copy.
- Subtext at most 20 words `[hero_words]` — `§4.7 L236`
- At most 4 stack slots: eyebrow-or-brand / headline / subtext / CTA row `[hero_stack]` —
  `§4.7 L239-245`. No trust micro-strip, no pricing teaser, no avatar row.
- Primary CTA label at most 3 words, and it must not wrap `[cta_words, ctaWrapped]` —
  `§4.5 L226`
- CTAs visible without scrolling `[ctaVisible]` — `§4.7 L236`
- Nav on one line, at most 80px `[navHeight, navSingleLine]` — `§4.7 L247-248`

**Restraint**

- Eyebrow allowance is `ceil(sections / 3)`, hero counts as one `[eyebrow]` — `§4.7
  L253-257`. Upstream calls this its most-violated rule; our first proof-of-concept
  violated it 7-for-8, which is a decent argument that it is real.
- Lists over 5 items escalate out of a default bulleted list — grouped columns, card grid,
  tabs, or a scroll-snap rail `[list_escalation]` — `§4.9 L307-314`
- No decorative section numbering, no scroll cues, no fake version footers, no decorative
  status dots `[section_number, scroll_cue, fake_footer]` — `§9.F L638-682`
- No em-dashes or en-dashes in user-visible strings `[emdash]` — `§9.G L685-701`.
  Scoped deliberately: this is a UI-copy rule, not a prose rule. It does not apply to this
  document or to reports.

**Copy**

- No fake-precise figures. `92%`, `4.1×`, `5.8mm` are fine only if real or explicitly marked
  `<!-- mock -->` `[fake_precision]` — `§4.9 L327-330`. This one matters most for evolv:
  invented metrics on a consulting page are a credibility problem, not a taste problem.
- No placeholder brand names, no filler marketing verbs `[slop_name, slop_word]` —
  `§9.D L615-620`
- Quotes at most 3 lines, attribution always name plus role, never a bare name — `§4.9
  L333-339`
- One copy register per page — `§4.9 L331`

**Motion**

- Reduced-motion handling is mandatory once any motion exists `[reduced_motion]` — `§6 L526`
- Animate transform and opacity only — `§6 L519-548`
- No `window` scroll listener; no continuous input value in component state
  `[scroll_listener, state_continuous]` — `§5.D L509-515`, `§3.B L138`
- Motion must be justifiable in one sentence: hierarchy, storytelling, feedback, or state
  transition. Otherwise drop it — `§5 L360`. Not machine-checkable; on the attestation list.

**Craft details worth stealing outright**

- `text-wrap: balance` on headings, `text-wrap: pretty` on body — `redesign-skill:18-29`
- `font-variant-numeric: tabular-nums` on any figure that sits in a column — same
- Italic display words containing descenders (`y g j p q`) need `line-height` at least 1.1
  plus bottom padding, because `leading-none` clips them — `§4.1 L183`
- Verify every import exists in `package.json` before using it — `redesign-skill:112-121`
- The strategic-omissions list: legal links, back navigation, custom 404, form validation,
  skip-to-content, cookie consent — `redesign-skill:123-130`

---

## 4. Deliberately excluded

- The three aesthetic packs, in full. Token files with competing palettes; EV-1 settles it.
- The dial system (EV-6) and the rotation rules (EV-7).
- The `DESIGN.md` export format — targets a tool not in the toolchain, and its worked example
  contradicts its own spec.
- Anything sourced from `research/laziness/`. The effect sizes are specific and falsifiable
  (+45% output length, 34%→80% accuracy, +115% combined, +35% context reduction) and not one
  carries an author, venue, DOI, or URL. Two figures from different papers are presented under
  a single heading. Do not build on numbers we cannot check.
- Mobile platform guidance. Real shape, zero numbers: no 44pt iOS or 48dp Android touch
  target, no safe-area insets, no type ramp, no canvas dimensions, no HIG or Material 3
  citation. If we need it, the sources are `developer.apple.com/design/human-interface-guidelines`
  and `m3.material.io`, not this repo.

---

## 5. Running the gates

```bash
# source-level checks (27), each printing its provenance
python3 ship_gate.py page.html [more.html ...] [--json]

# rendered checks (9) - the ones that only exist after layout
node render_probe.mjs page.html [--viewport 1440x1000] [--json]
```

Both exit non-zero on failure, so either works as a pre-commit hook or a CI step. Run both:
they catch different classes of problem, and the rendered one caught a 4-line hero in a page
that the source-level one had already passed.

Neither replaces review. `ship_gate.py` prints seven human attestations it cannot check —
motion justification, string-by-string copy audit, real hero asset, register consistency,
measured contrast, real figures, honest layout annotations. An unticked attestation is not a
pass.

---

## 6. Worked example

`evolv-taste-poc.html` — an evolv-branded assessment page carrying eight sections across
seven layout families, on the six approved brand values, passing 27/27 source checks and
9/9 rendered checks.

It is also the honest record of the gates working: the first draft failed on eyebrow count
(7 across 8 sections against an allowance of 3), hero stack slots, a 4-line rendered
headline, and a dead cell in the bento. All four were found by the tooling, not by reading.
