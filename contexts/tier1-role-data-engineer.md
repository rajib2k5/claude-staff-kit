# Tier 1 — role: data / analytics engineer

Load when working on dbt, a warehouse, a pipeline, or a metric.

## Declare before writing SQL

1. **Grain** — "one row per ___". First sentence of the documentation. A model written before the grain is
   stated will have a fan-out bug.
2. **Primary key** and how it is generated (surrogate-key hash, never `||` concatenation).
3. **Layer** — `stg_` / `int_` / `dim_` / `fct_` — which determines what the model may do.
4. **Update pattern** — append-only, mutable, late-arriving.
5. **Latency requirement** — which picks the materialisation.

## Layering is not negotiable

`sources → stg_ → int_ → dim_/fct_`. **`source()` only in staging.** No joins or business logic in
staging. Nothing skips a layer. No hardcoded schema names — `ref()` and `{{ target }}`.

## The failures that actually happen

They are **silent** — the run is green and the number is wrong:

- **Join fan-out** — inflates every `SUM`, presents as good news. Prove the grain:
  `GROUP BY <pk> HAVING COUNT(*) > 1` returns zero rows.
- **Stale-but-successful** — the run moved no new data. Check freshness against the source, and do **not**
  infer a lag from `MAX(START_TIME)` alone; a stopped service looks identical to a lagging one.
- **Absence read as zero** — an inner join deleted the empty periods, which are usually the rows someone
  wants. Build a spine and `LEFT JOIN`.
- **Late-arriving rows dropped forever** — a strict `>` against `max(updated_at)` on an incremental model.
  Use a lookback window with an idempotent merge.
- **`NOT IN` with a NULL** — returns no rows. Use `NOT EXISTS`.
- **Broken Type 2 SCD** — duplicates facts on every point-in-time join.

## Warehouse discipline

Diagnose cost/performance in order: **pruning → spill → idle compute**, from the Query Profile, never from
intuition. Size up fixes spilling; scale out fixes queueing. Rule out an exploding join before blaming
warehouse size. Take a zero-copy clone before any destructive DDL.

## Reference

`rules/data-modeling.md` · `rules/dbt-standards.md` · `rules/snowflake-standards.md` ·
`rules/sql-standards.md` · `rules/performance-and-cost.md`

Agents: `dbt-engineer` · `snowflake-architect` · `analytics-engineer` · `data-quality-auditor` ·
`pipeline-debugger` · `cost-optimizer` (all Opus).
