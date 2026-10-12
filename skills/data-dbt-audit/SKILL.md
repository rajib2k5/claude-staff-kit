---
name: data-dbt-audit
description: Audit a dbt project for layering violations, untested keys, unsafe incremental models, missing contracts, and undocumented marts — then report ranked by which would put a wrong number in front of someone. Use on any dbt project you inherit or before trusting its output. Triggers - audit dbt, review dbt project, dbt health check, is this dbt project sound.
---

# dbt project audit

Read `~/.claude/rules/dbt-standards.md`.

Rank every finding by **whether it could put a wrong number in front of a decision-maker**, not by how
untidy it is.

## Run these checks — execute them, do not read code and infer

**Layering**
- `grep -r "source(" models/ --include=*.sql | grep -v "models/staging"` → every hit is a violation.
  `source()` belongs only in staging.
- Joins or aggregations in `stg_` models → violation.
- Any mart selecting from a source, or a model skipping a layer.
- Hardcoded database/schema names instead of `ref()`/`{{ target }}` — these create invisible dependencies
  that run in the wrong order.

**Tests**
- Every model: does the PK have `unique` **and** `not_null`? List the models that do not — this is the
  highest-value finding in most projects.
- Every FK with a `relationships` test? Every enum with `accepted_values`?
- **Is the declared grain asserted?** A `unique_combination_of_columns` test on each fact. Missing grain
  tests are why fan-out bugs reach dashboards.
- Source freshness declared on every source? Stale-but-successful is the classic silent data failure.
- Any reconciliation to the system of record, or only internal consistency?
- Count `severity: warn` tests — are they being read, or are they noise teaching the team to ignore output?

**Incremental models** — the highest-risk construct. For each one, verify all five:
1. `unique_key` present **and actually unique** (test it).
2. Strategy stated and appropriate.
3. **Lookback window.** `where updated_at > (select max(updated_at) from {{ this }})` silently drops
   late-arriving rows forever. Flag every occurrence of the strict `>` pattern.
4. `on_schema_change` set if the source evolves.
5. Full-refresh affordability.
Then: **does a full refresh produce the same result as an incremental run?** Run both and diff. Almost
nobody checks this and it is where the real bugs are.

**Contracts and consumers**
- `contract: {enforced: true}` on marts consumed outside the project?
- `exposures` declared? Without them you cannot answer "what breaks if I change this" during an incident.
- Any breaking change made in place rather than as a new version?

**Documentation**
- Mart columns with no description — each is a future misread number.
- Models with no declared grain in their description.

**Hygiene** — `SELECT *` in marts · committed `target/` or credentials in `profiles.yml` · unpinned
packages · CI building the world instead of `state:modified+ --defer`.

## Method

Dispatch `dbt-engineer` (Opus) for the model-logic judgement and `data-quality-auditor` (Opus) for the
data-level checks, in parallel. Run `dbt build` on the affected selector and **paste the output**.
`dbt compile` and read the generated SQL for any non-trivial Jinja.

## Report

Ranked by consequence: wrong-number risk first, then silent-failure risk, then operability, then hygiene.
Per finding: the check you ran, what it returned, the impact, and the fix. State what you could not verify.
