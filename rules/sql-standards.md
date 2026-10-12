# Rule: SQL Standards

## Correctness traps that produce wrong numbers silently

These are ranked by how often they put a wrong figure in front of a decision-maker.

1. **Join fan-out.** A join to a table that is not unique on the join key multiplies rows and inflates
   every `SUM`. Symptom: "revenue is up". Before aggregating after a join, **prove the grain** —
   `SELECT key, COUNT(*) ... GROUP BY key HAVING COUNT(*) > 1` returns zero rows.
2. **NULL semantics.** `NULL = NULL` is unknown, not true. `NOT IN (subquery containing NULL)` returns
   **no rows** — use `NOT EXISTS`. `COUNT(col)` skips NULLs while `COUNT(*)` does not. `SUM` over an
   empty set is NULL, not 0 — wrap in `COALESCE` when a zero is meant.
3. **Absence vs zero.** A missing row is not a zero. If a report must show zero, generate the date
   spine and `LEFT JOIN` onto it. Inner joins silently delete the days you most want to see.
4. **Date boundaries and timezones.** Store UTC, convert at the edge for display. Half-open intervals
   only: `ts >= '2026-01-01' AND ts < '2026-02-01'`. `BETWEEN` on timestamps double-counts the
   boundary instant. Never compare a `DATE` to a `TIMESTAMP` and hope.
5. **`DISTINCT` used as a bug fix.** `SELECT DISTINCT` after an accidental fan-out hides the duplicate
   but leaves the `SUM` wrong. Fix the join.
6. **Float money.** Use `DECIMAL`/`NUMBER` with explicit scale. Never `FLOAT` for currency.
7. **Non-deterministic aggregation.** A column in the `SELECT` that is neither grouped nor aggregated
   is undefined behaviour where permitted at all. Use `ANY_VALUE` deliberately or `QUALIFY
   ROW_NUMBER()`.
8. **Filtering an outer join in `WHERE`.** A predicate on the right table in `WHERE` converts a
   `LEFT JOIN` into an inner join. Put it in the `ON` clause.

## Style

- Keywords uppercase, identifiers lowercase snake_case. One column per line for anything non-trivial.
- Leading commas or trailing commas — pick one per repo and never mix.
- **CTEs over nested subqueries**, always. Name each CTE for what it *is* (`orders_deduped`), not what
  it does (`step2`). A readable chain of CTEs is the single biggest reviewability win in SQL.
- Always qualify columns with a table alias in any query with more than one table. Aliases are
  meaningful (`o`, `c` at minimum; `orders`, `customers` preferred) — never `a`, `b`, `t1`.
- Explicit `JOIN ... ON`. Comma joins and implicit cross joins are forbidden.
- `SELECT *` never appears in a view, a mart, or production application code.
- Comment the *why* of a non-obvious predicate, especially a magic ID or a business carve-out.

## Constructs worth reaching for

- **Window functions** instead of self-joins for ranking, running totals, deltas, and dedupe:
  `QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1` is the canonical
  latest-record-per-key pattern (Snowflake/BigQuery/Databricks).
- `EXISTS` / `NOT EXISTS` for semi- and anti-joins — NULL-safe and usually better-planned than `IN`.
- `GROUP BY ALL` / `GROUP BY GROUPING SETS` where supported, for readability and multi-grain rollups.
- `COALESCE` deliberately, with a comment explaining why the default is correct.
- `TRY_CAST` / `TRY_TO_NUMBER` over `CAST` on untrusted data — a hard cast failure aborts the batch.

## Performance

- Read the **query plan** before optimising. Guessing at SQL performance is unusually unreliable.
- Filter early, project narrowly, aggregate before joining when the aggregate reduces cardinality.
- Beware functions on filtered columns — they defeat index use and partition pruning alike.
- `UNION ALL` unless you actually need dedupe; `UNION` sorts.
- For large `DELETE`/`UPDATE`, batch by key range. A single unbounded DML on a huge table locks or
  spills.

## Safety

- **Parameterised/bound values only.** String-interpolated SQL is a defect regardless of the input's
  apparent source.
- Before any `UPDATE`/`DELETE` on production: run the `SELECT` with the identical `WHERE`, count the
  rows, and confirm the count is what you expect. Wrap in a transaction where the engine supports it.
- Never `DROP`/`TRUNCATE` in production without a clone/backup first (see `snowflake-standards.md`).
- Any query that will run against production data at cost is validated adversarially before it runs.
