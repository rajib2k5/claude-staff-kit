---
name: data-quality
description: Hunt the silent data failures — grain violations and join fan-out, freshness gaps, reconciliation drift, absence-vs-zero, broken SCDs, and untested keys. Use when a number looks wrong, when a pipeline succeeds but data seems stale, or before a dataset is trusted. Triggers - data quality, this number looks wrong, revenue is off, data is stale, reconcile the numbers.
---

# Data quality audit

Read `~/.claude/rules/data-modeling.md` and `sql-standards.md`.

These failures do not raise errors. The pipeline is green, the dashboard renders, and the number is wrong.

## The seven checks — run them, in this order

1. **Grain / fan-out.** `SELECT <pk>, COUNT(*) FROM t GROUP BY <pk> HAVING COUNT(*) > 1` must return zero
   rows. Then verify the right side of **every join** is unique on its key. Fan-out inflates every `SUM`
   and presents as good news — this is the first check because it is the most damaging.
2. **Freshness.** Did the run succeed *and* move new data? Compare `MAX(loaded_at)` to the SLA and to the
   source. **Do not infer a lag from `MAX(START_TIME)` alone** — a deliberately stopped service looks
   identical to a lagging one; establish which before reporting.
3. **Reconciliation.** Do totals match the **system of record**, not just themselves? Row counts, money
   sums, distinct entity counts, period-over-period deltas.
4. **Absence vs zero.** A missing row is not a zero. Did an inner join delete the days, tenants, or
   categories with no activity — the exact rows someone is looking for? Generate a spine and `LEFT JOIN`.
5. **Key integrity.** Every PK unique and not-null, every FK with no orphans. Untested keys are broken keys.
6. **Date and timezone boundaries.** UTC storage, half-open intervals (`>= start AND < end`), no `BETWEEN`
   on timestamps, no `DATE`-to-`TIMESTAMP` comparison. Off-by-one-day errors are endemic and invisible.
7. **SCD correctness.** Exactly one `is_current` per natural key; `valid_from <= t < valid_to` with no
   gaps and no overlaps. Broken Type 2 duplicates facts on every point-in-time join.

## Then

- **Distribution drift** — a column whose null rate, cardinality, or mean moved sharply is an unannounced
  upstream schema or semantics change.
- **Duplicates from at-least-once delivery** — is the consumer idempotent by key?
- **Late-arriving data** on incrementals — is the lookback window wide enough?
- **Silent casts** — `TRY_CAST` returning NULL en masse looks exactly like missing source data.

## Method

Dispatch `data-quality-auditor` (Opus). **Every check must be executed**, not inferred from reading model
code — an audit assembled from code review misses all seven of the above.

**Re-derive at least one headline number by a different route** than the pipeline that produced it, then
compare the two side by side. That single act catches more real defects than any other check here.

## Report

Per finding: the SQL you ran, the number you got, the number expected, the business impact, the fix.
Ranked by whether a wrong number reaches a decision-maker. State explicitly what you could not verify —
`UNVERIFIABLE`, flagged, beats a confident guess.
