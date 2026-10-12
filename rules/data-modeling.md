# Rule: Data Modeling

## State the grain first — before writing any SQL

**"One row per ___"** is the first sentence of every model's documentation. Almost every serious data
bug is a grain violation: an unintended fan-out, a mixed-grain union, or an aggregation over a grain
the author misunderstood.

Then state, explicitly: the **primary key**, the **partition/cluster column**, the **update pattern**
(append-only, mutable, late-arriving), and the **latency requirement**. Those four determine the
physical design; guessing at them produces a rewrite.

## Dimensional modelling for analytics

- **Facts** are measurements at a grain: `fct_order_lines` (one row per order line). Numeric,
  additive where possible, with foreign keys to dimensions and no descriptive text.
  - *Transaction* facts (an event happened), *periodic snapshot* facts (state at a regular interval),
    *accumulating snapshot* facts (a pipeline with milestones). Choosing wrong makes every downstream
    question awkward.
  - Semi-additive measures (balances) must never be summed across time. Document that.
- **Dimensions** are the descriptive context: `dim_customer`, `dim_product`, `dim_date`. Wide, mostly
  textual, denormalised on purpose. Snowflaking a dimension to save storage optimises the cheapest
  resource in the system and costs every query a join.
- **Conform your dimensions.** One `dim_customer` used by every fact. Two competing customer
  dimensions is how an organisation ends up with two different revenue numbers, and no way to
  adjudicate.
- A **date dimension** always, with fiscal periods, holidays and business-day flags. Deriving fiscal
  quarters inline in each query guarantees they eventually disagree.

## Keys

- **Natural key**: the business identifier. May be composite, may be reused, may be dirty.
- **Surrogate key**: system-generated, stable, single-column, meaningless. Facts join on surrogates.
  Generate with a deterministic hash of the natural key parts, not concatenation.
- Never expose a surrogate key in a UI or API as though it were a business identifier.
- Every key column is tested `unique` and `not_null`. Untested keys are assumed broken.

## Slowly changing dimensions

Decide per attribute, and write the decision down:

| Type | Behaviour | Use when |
|---|---|---|
| **1** | overwrite | history has no value (a corrected typo) |
| **2** | new row + `valid_from`/`valid_to`/`is_current` | history matters (a customer's tier when the order was placed) |
| **3** | prior-value column | one specific prior value is needed |
| **6** | 1 + 2 + 3 hybrid | both "as-was" and "as-is" reporting required |

Type 2 requires half-open intervals (`valid_from <= t < valid_to`), exactly one `is_current` row per
natural key (tested), and a documented far-future or NULL sentinel for the open interval. Getting
this wrong produces duplicate facts on every point-in-time join.

## Normalisation, applied with judgement

3NF for **operational** systems where write correctness and constraint enforcement dominate.
Denormalised star schemas for **analytical** systems where read simplicity and query cost dominate.
Applying the wrong one is a common and expensive category error — a 3NF warehouse makes every
business question a 9-table join, and a denormalised OLTP schema makes every update a race.

Medallion layering (bronze/raw → silver/conformed → gold/marts) is the same discipline expressed for
the lakehouse; the layer rules in `dbt-standards.md` are the implementation.

## Data contracts

Any dataset consumed by another team or system has a contract: **schema** (names, types,
nullability), **semantics** (what each column means, in units), **grain**, **freshness SLA**, **volume
expectation**, and an **owner**. Enforce it in CI — a contract that is only documentation is a
convention, and conventions break silently.

Schema evolution is **additive by default**. Adding a nullable column is safe. Renaming, retyping,
narrowing, or changing the meaning of an existing column is a **breaking change**: version it,
announce it, dual-write through a deprecation window, then remove.

## Quality dimensions to test for

Completeness (rows and columns present), uniqueness (no unintended duplicates), validity (in the
allowed domain), consistency (agrees with the system of record), timeliness (arrived inside the SLA),
accuracy (reconciles to an independent source).

The two that catch the most real incidents: **freshness** (a pipeline that succeeded but moved no
new data) and **reconciliation** (totals that no longer match the source). Both are silent failures,
so both need explicit detectors.

## Historisation and deletes

Prefer append-only, immutable event storage with derived current-state views: it makes the pipeline
replayable and every number auditable. Where regulation requires true deletion, design the deletion
path deliberately — including backups, caches, search indexes, and downstream copies — and test it.
