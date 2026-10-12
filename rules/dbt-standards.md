# Rule: dbt Standards (Analytics Engineering)

## Layering — never skip a layer

```
sources  →  staging  →  intermediate  →  marts  →  (exposures / semantic layer)
 (raw)      stg_       int_             dim_/fct_
```

| Layer | Prefix | Job | Hard rules |
|---|---|---|---|
| **Source** | — | declared raw tables | Declared in `sources:` with freshness. Referenced **only** by staging. |
| **Staging** | `stg_<source>__<entity>` | rename, cast, cast timezone, light dedupe | 1:1 with source table. **No joins. No aggregation. No business logic.** Materialised as views unless proven costly. |
| **Intermediate** | `int_<entity>_<verb>` | joins, fan-out, pivots, reusable business logic | Never exposed to BI. Ephemeral or view unless reused expensively. |
| **Marts** | `dim_` / `fct_` / `agg_` | the consumable model, business-conformed | Documented, tested, contracted. Grain stated explicitly. |

**`source()` appears only in staging models.** Everywhere else uses `ref()`. This single rule is what
makes lineage true and lets you re-point a source without a repo-wide rewrite.

No model reaches across two layers upward (a mart selecting from a source is a defect). No cycles.
No `ref()` into another project's internals — cross-project goes through a declared public model.

## Naming

- Models: snake_case, plural for facts of events (`fct_orders`), singular concept for dimensions
  (`dim_customer`). Be consistent within a project — consistency beats the specific convention.
- Primary keys: `<entity>_id`. Surrogate keys: `<entity>_sk`, built with
  `dbt_utils.generate_surrogate_key([...])` — never string concatenation with `||`, which collides on
  embedded delimiters and NULLs.
- Booleans `is_`/`has_`. Timestamps `_at` (UTC, always). Dates `_date`. Amounts carry currency and
  scale: `amount_usd`, `price_usd_cents`.
- Never a column named `date`, `timestamp`, `value`, `type`, `status` with no qualifier — and never a
  reserved word.

## Testing — the minimum bar

Every model has, non-negotiably:
- `unique` + `not_null` on the primary key.
- `relationships` on every foreign key.
- `accepted_values` on every low-cardinality status/enum column.
- `not_null` on every column the business would call required.

Beyond the minimum, where it applies:
- **Freshness** on every source (`warn_after` / `error_after`) — stale-but-successful is the classic
  silent data failure.
- **Row-count reconciliation** against the source, or against the prior run for incrementals.
- **Grain assertion** — a `unique_combination_of_columns` test proving the declared grain. Fan-out
  from a join is the most common and most damaging dbt bug, and it presents as "revenue went up".
- **Financial totals** reconciled to the system of record, not just internally consistent.
- **Singular tests** for genuine business invariants (no negative inventory, no order shipped before
  it was placed, sum of allocations equals the total).

Severity used deliberately: `error` blocks the build; `warn` is for a signal you will actually look
at. A warn nobody reads is worse than no test — it teaches the team the build output is noise.

## Contracts, versions and freshness

- Put `contract: {enforced: true}` on every mart consumed outside the project. It converts a silent
  breaking change into a build failure.
- Breaking a public model = a **new version** (`v2`) with the old version deprecated on a date, not
  an in-place edit.
- Declare `exposures` for dashboards and reverse-ETL. Without them you cannot answer "what breaks if
  I change this", which is the question that gets asked during an incident.

## Materialisation — choose deliberately

| Choice | Use when |
|---|---|
| `view` | cheap, small, always-fresh; the default for staging |
| `table` | expensive logic read many times; full refresh is affordable |
| `incremental` | large fact tables where full refresh is too slow/costly |
| `ephemeral` | small intermediate logic used once or twice; keeps the warehouse clean |
| dynamic table / MV | platform-managed refresh; see `snowflake-standards.md` |

**Incremental models are the highest-risk construct in dbt.** Every incremental model must state:

1. Its `unique_key` — and that key must genuinely be unique, tested.
2. Its strategy (`merge` / `delete+insert` / `insert_overwrite` / `microbatch`) and why.
3. A **lookback window** wide enough to absorb late-arriving data. `where updated_at > (select
   max(updated_at) from {{ this }})` silently drops late records forever — use
   `>= max - interval '3 days'` with an idempotent merge.
4. Behaviour on schema change (`on_schema_change`) — not the default if the schema evolves.
5. How to full-refresh it, and whether a full refresh is affordable.

Incremental logic is guarded by `{% if is_incremental() %}` and **tested both ways**: full refresh
and incremental run must produce the same result. Assert that, do not assume it.

## Jinja and macros

Jinja is a code generator, not a programming language. Readability of the **compiled SQL** is what
matters — `dbt compile` and read the output before trusting a clever macro.

- Extract a macro at the third repetition, not the first.
- Macros get docstrings and their own tests (via a fixture model).
- Never use Jinja to build a `WHERE` clause from untrusted input.
- Prefer `dbt_utils` and `dbt_expectations` over hand-rolled equivalents; pin package versions.

## Project hygiene

- `dbt build` (not `run` then `test` — build interleaves them and stops on failure at the right node).
- CI runs **slim CI**: `dbt build --select state:modified+ --defer --state <prod manifest>`. Building
  the world on every PR is a warehouse bill, not a quality gate.
- `--fail-fast` in CI; full lineage rebuild on merge.
- `dbt docs` generated and published; every mart column has a description. An undocumented mart
  column will be misinterpreted by someone reporting to a decision-maker.
- No `SELECT *` in a mart. In staging it is acceptable only immediately after an explicit rename.
- Zero uncommitted `target/`, `dbt_packages/`, or profile credentials. `profiles.yml` uses env vars.

## Forbidden

- Business logic in staging; joins in staging.
- `source()` outside staging.
- A mart with no primary key test.
- An incremental model with no lookback window or an untested `unique_key`.
- Hardcoded database/schema names — use `{{ target }}`, `{{ ref }}`, and variables.
- Editing production tables outside dbt, then relying on dbt to preserve it.
