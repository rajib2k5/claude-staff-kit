---
name: data-metric
description: Define a business metric completely, or reconcile two conflicting versions of one — grain, filters, time semantics, and additivity made explicit. Use when defining a KPI or when two dashboards disagree about the same number. Triggers - define this metric, KPI definition, two dashboards disagree, which revenue number is right, semantic layer.
---

# Metric definition and reconciliation

Read `~/.claude/rules/data-modeling.md`.

Two dashboards disagreeing about revenue is an engineering defect, not a BI problem.

## A metric is not defined until all six are written down

1. **Name and business definition** — one sentence a non-engineer would agree with.
2. **Grain** it is measured at, and the grains it may be aggregated to.
3. **Numerator and denominator** as explicit expressions (for rates).
4. **Filters and exclusions** — test accounts, internal users, refunds, cancellations, specific regions.
   **This is where two definitions of "revenue" diverge**, and it is the section people skip.
5. **Time semantics** — event time or processing time? Which timestamp column? Which timezone? Is the
   current period partial, and is that disclosed?
6. **Additivity** — summable across time? Across customers? Balances and rates are **not**, and summing a
   rate is one of the most common silent reporting errors in existence.

## Reconciling a discrepancy — in this order

1. Confirm both numbers cover the **same window, timezone, and filter set**. This resolves most cases
   immediately, and skipping it wastes hours.
2. Check the **grain** each aggregates from — a fan-out on one side explains a clean 2× or 3×.
3. Check **absence vs zero** — one side inner-joined away the empty periods.
4. Check **refresh timing** — the two were computed at different moments over a mutable source.
5. Only then diff the logic, starting with the filter lists.

Report the **cause of the difference**, not merely which number is larger. "A is right" without a mechanism
will not be believed and will not stop the next occurrence.

## Governance

Define once, in code, version-controlled and tested. A metric re-typed into a BI tool has forked. Declare
`exposures` so you know which dashboards break when a definition changes. Publish a deprecation window
rather than editing a live definition under people's feet.

When you find two competing definitions, the deliverable is not a third one — it is the reconciliation:
which is correct, why they differ, and which is deprecated on which date.

## Report

All six elements, the implementing SQL, the reconciliation to the system of record **with actual numbers**,
and any rogue variant definitions you found that need retiring. Dispatch `analytics-engineer` (Opus) for
the definition work; run `staff-validate` on any number that will be reported upward.
