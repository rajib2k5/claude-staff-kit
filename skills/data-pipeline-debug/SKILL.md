---
name: data-pipeline-debug
description: Root-cause a data pipeline failure across dbt, Airflow, Snowflake tasks and streams, and ingestion — including the hard case where the run succeeded but the data is stale or wrong. Use for any pipeline incident or unexplained data discrepancy. Triggers - pipeline failed, dbt run failed, airflow task failed, data did not load, pipeline succeeded but no data.
---

# Pipeline debugging

Read `~/.claude/rules/reliability-observability.md` and `dbt-standards.md`.

## First: classify the failure — the class determines where to look

| Class | Signal | Look at |
|---|---|---|
| **Hard failure** | task errored | the failing node, the real error text |
| **Silent staleness** | ran fine, no new data | source freshness, upstream extract, stream offset |
| **Silent corruption** | ran fine, data wrong | grain/fan-out, schema drift, late-arriving rows |
| **Partial** | some nodes succeeded | dependency order, retry side effects, non-idempotency |
| **Performance** | succeeded, far too slow/costly | Query Profile → `data-snowflake-tune` |

The middle two are the dangerous ones: nothing alerted, and someone is already using the numbers.

## Procedure

1. **Get the real error text** and the failing node. Do not theorise from the DAG picture.
2. **Establish the timeline.** When did it last work? What changed between — a deploy, a schema change, a
   volume spike, a credential rotation, an upstream vendor change? Most pipeline incidents are a change,
   and the change is usually not in the pipeline.
3. **Walk the lineage upstream from the symptom** to the first point where the data is correct. The fault
   is at that boundary. Do not start at the source and work down — that wastes the whole investigation.
4. **One hypothesis, tested with a query.** State the falsifying observation first.
5. Dispatch `pipeline-debugger` (Opus).
6. Fix the cause, repair the data, and **add the detector** — it evidently did not exist.

## Component traps — check these specifically

- **dbt incrementals** — a missing lookback window drops late-arriving rows permanently while the run still
  succeeds. Check whether full-refresh and incremental agree.
- **Snowflake streams** — the offset advances on consumption inside a **committed DML**. A stream read
  twice outside a transaction loses data silently.
- **Snowflake tasks** — `TASK_HISTORY` for suspended-after-failures, and for a predecessor that never ran.
  A suspended task produces no error, just silence.
- **Airflow** — sensor timeouts, `depends_on_past`, catchup backfills stampeding the warehouse, retries
  re-running non-idempotent work, a zombie task marked success.
- **Ingestion** — source schema drift, `ON_ERROR` silently skipping rows, many-tiny-files cost on Snowpipe,
  a truncating cast.
- **Implicit dependencies** — a model using a hardcoded schema instead of `ref()`, so it runs before its
  input is ready. These produce intermittent wrongness that looks like flakiness.

## Distinguish

**Absence vs stoppage vs lag** — no rows may mean upstream stopped deliberately, a credential expired, a
filter changed, or a view lagged. Identical symptom, different fixes.

## Report

The root cause with the **evidence that proves it** (the query, the log line, the counts), the fix, the
repair/backfill plan if data was wrong, and the detector added. If you restored service without finding
the cause, say exactly that — never present a restart as a diagnosis.
