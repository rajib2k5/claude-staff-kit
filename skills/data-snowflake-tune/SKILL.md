---
name: data-snowflake-tune
description: Tune a slow or expensive Snowflake query using the Query Profile — diagnose pruning, then spill, then idle compute, in that order, with before and after numbers. Use for any slow warehouse query or unexpected credit burn. Triggers - slow snowflake query, expensive query, tune this query, warehouse is slow, query costs too much.
---

# Snowflake query tuning

Read `~/.claude/rules/snowflake-standards.md` and `sql-standards.md`.
If the Snowflake MCP server is unavailable, run every query with the `snowflake-sql` skill (`~/.claude/skills/snowflake-sql/sf.py`; the PAT comes from the environment variable named in its `config.json`, and it is read-only by default).

**Never tune from intuition.** Get the Query Profile first. Almost every problem is one of three things,
and the diagnostic order matters because the wrong lever costs money and fixes nothing.

## Diagnose in this order

**1. Pruning** — `partitions scanned / partitions total` in the profile.
Bad pruning means you read data you did not need. Causes, in order of frequency:
- A **non-sargable filter**: `TO_DATE(ts) = '...'`, `UPPER(col) = '...'`, or arithmetic on the filtered
  column. Rewrite to compare the raw column against a literal or expression.
- Filtering on a column with no natural clustering (usually you want load or event time).
- `SELECT *` on a wide columnar table — a scan multiplier. Project only what you use.
- A genuinely unclustered large table. Only *then* consider a clustering key — and require a **measured
  before/after pruning ratio** on a >1 TB multi-partition table with a stable filter pattern.
  Continuous reclustering bills forever, so an unjustified clustering key is a permanent cost.

**2. Spill** — *bytes spilled to local / remote storage* in the profile.
Remote spill is the genuine "warehouse too small" signal. But first check for an **exploding join**: a
fan-out produces exactly the same symptom as an undersized warehouse, and sizing up to absorb a fan-out
pays credits forever to compute wrong rows. Verify join-key uniqueness before resizing.

**3. Idle / queueing.**
- **Size up to fix spilling. Scale out (multi-cluster) to fix queueing.** These are different problems.
- Doubling size doubles credits per second — it is cost-neutral **only if the query gets ≥2× faster**.
  Measure that; do not assume it.
- `AUTO_SUSPEND` 60s, `AUTO_RESUME` on, `STATEMENT_TIMEOUT_IN_SECONDS` set.

## Also check

- **Result cache** — identical SQL text, same role, unchanged data is free. Deliberate query-text reuse is
  a real optimisation.
- Row-by-row constructs: cursors, scalar UDF loops, per-row procedure calls. Rewrite set-based.
- Deep `VARIANT` filtering at scale — flatten hot paths into typed columns.
- Aggregating before joining where the aggregate reduces cardinality.
- A repeatedly-recomputed aggregate that should be a table, dynamic table, or MV.

## Report

Before and after: elapsed time, credits, partitions scanned/total, bytes spilled — **each with the window
and warehouse it was measured on**. State what you changed and what you did not. Label anything projected
as projected. Any credit-saving figure headed to a decision-maker goes through `staff-validate`.
