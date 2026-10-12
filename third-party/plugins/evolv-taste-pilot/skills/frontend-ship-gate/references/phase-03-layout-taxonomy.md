# Phase 3 — the layout family taxonomy

Triggers: data-layout, layout family, section variety, zigzag, bento

Upstream enforces "a landing page with 8 sections must use at least 4 different layout
families" (§4.7 L251) and **never defines what a family is**. §10 lists roughly 50 pattern
names and labels them explicitly "a vocabulary, not a library"; §12, the Block Library that
would have resolved it, ships zero blocks. So the taxonomy below is authored, not lifted —
and it is what `ship_gate.py` checks against.

## The ten families

Annotate every `<section>` with `data-layout`. An unannotated page fails rather than passing.

| `data-layout` | What it is | Use it for |
|---|---|---|
| `full-bleed` | edge-to-edge band, no container gutter | tonal breaks; the one permitted page-theme exception |
| `split` | two roughly equal columns, content beside asset | capped at 2 consecutive — the 3rd is a fail |
| `asymmetric` | unequal tracks (`2fr 1fr 1fr`, offset or indented column) | the default for content sections |
| `bento` | mixed-span dense grid, cell count equals item count | feature sets of 4-8 |
| `card-grid` | uniform repeated cells, 3-up or 4-up | only when the items genuinely are peers |
| `editorial` | single narrow measure, 60-70ch | argument and long-form, not features |
| `rail` | horizontal scroll-snap track | the escalation for lists over 5 items |
| `stacked-list` | grouped rows or definition lists, one hairline per group | specs, comparisons, deliverables |
| `overlap` | layered composition using negative margin | at most once per page |
| `centered-focal` | single centred block | at most once per page, and earn it |

## Annotate the hero properly

```html
<section data-layout="asymmetric" data-hero="true">
  <div class="wrap hero-grid">
    <div data-hero-stack>
      <p class="eyebrow">…</p>
      <h1>Two lines<br>at most.</h1>
      <p class="hero-sub">Twenty words at most.</p>
      <div class="hero-actions"><a class="cta cta-1">Book a read</a></div>
    </div>
    <aside>…</aside>
  </div>
</section>
```

Without `data-hero-stack` the slot count includes the aside and over-reports. Without
`data-hero="true"` the hero checks skip entirely and report that they did.

## The annotation has to be honest

This is the one rule in the whole gate that is trivially gameable and impossible to
mechanise. Labelling three uniform card grids as `bento`, `card-grid`, and `asymmetric`
satisfies the families check and fails the reader completely. It sits on the attestation
list for exactly that reason.

The test is not "does the label parse". It is: could a reader, shown the page with the
labels hidden, sort the sections into those buckets the same way?

## Choosing between the near-neighbours

- `bento` vs `card-grid` — does the grid have **mixed** spans that interlock with no dead
  cells? If every cell is the same size, it is `card-grid`, and calling it `bento` is the
  dishonesty above.
- `asymmetric` vs `split` — `split` is roughly 50/50. Anything with genuinely unequal tracks
  is `asymmetric`, and preferring it is how you avoid the zigzag cap.
- `stacked-list` vs a default `<ul>` — a bulleted list over 5 items should escalate to
  `stacked-list` (grouped, one hairline per group) or `rail`. Upstream is blunt that a
  10-row spec sheet with a hairline under every row is the worst available default.
