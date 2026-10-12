---
name: data-model
description: Design a data model or dbt model correctly — declare the grain first, choose keys, pick the SCD type and materialisation, then write the tests that prove the grain holds. Use before building any table, mart, or dbt model. Triggers - design a table, data model, new dbt model, star schema, dimensional model, what grain.
---

# Data model design

Read `~/.claude/rules/data-modeling.md`, `dbt-standards.md`, and `sql-standards.md`.

## Declare these five before writing any SQL

1. **Grain** — "one row per ___". This is the first sentence of the documentation. A model written before
   the grain is stated will have a fan-out bug.
2. **Primary key** — and how it is generated (`generate_surrogate_key`, never `||` concatenation, which
   collides on embedded delimiters and NULLs).
3. **Layer** — `stg_` / `int_` / `dim_` / `fct_`, which determines what the model is *allowed* to do.
4. **Update pattern** — append-only, mutable, or late-arriving. This determines the materialisation.
5. **Latency requirement** — which determines whether it is a view, a table, an incremental, or a dynamic
   table.

## Design

**Facts** are measurements at a grain: numeric, FKs to dimensions, no descriptive text. Choose the shape
deliberately — transaction, periodic snapshot, or accumulating snapshot; choosing wrong makes every
downstream question awkward. Flag semi-additive measures (balances) as never-summable across time.

**Dimensions** are descriptive context: wide, textual, denormalised **on purpose**. Snowflaking a
dimension to save storage optimises the cheapest resource in the system and taxes every query.

**Conform** — one `dim_customer` used by every fact. Two competing customer dimensions is how an
organisation ends up with two revenue numbers and no way to adjudicate.

**SCD type per attribute**, written down: Type 1 (overwrite, history worthless) · Type 2 (new row with
`valid_from`/`valid_to`/`is_current`, history matters) · Type 3 · Type 6. Type 2 requires half-open
intervals, exactly one `is_current` per natural key, and no gaps or overlaps — broken Type 2 duplicates
facts on every point-in-time join.

## Then write the tests that prove it

- `unique` + `not_null` on the PK. Non-negotiable.
- **Grain assertion**: `unique_combination_of_columns` on the declared grain — this is the test that
  catches join fan-out, the most damaging bug in this domain.
- `relationships` on every FK; `accepted_values` on every enum.
- Reconciliation to the source, and to the system of record for anything financial.
- For Type 2: exactly-one-current, and no interval overlap.

## Materialisation

`view` (cheap, always fresh — the staging default) · `table` (expensive logic read often) ·
`incremental` (large facts; then see `dbt-standards.md` for the five required declarations, especially the
**lookback window**) · `ephemeral` (used once or twice) · dynamic table (platform-managed refresh —
verify the refresh mode resolves to `INCREMENTAL`, not `FULL`).

## Report

The five declarations, the DDL or dbt model, the tests added, and the **executed** grain check
(`GROUP BY <pk> HAVING COUNT(*) > 1` returning zero rows). Never claim a model is correct without having
run that check.
