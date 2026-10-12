# Rule: Snowflake Standards

## The mental model that prevents most mistakes

Snowflake separates **storage** (immutable micro-partitions, ~16 MB compressed, columnar) from
**compute** (virtual warehouses billed per second, 60-second minimum). Almost every performance and
cost problem is one of three things:

1. **Bad pruning** — the query read partitions it did not need.
2. **Wrong warehouse** — too small (spilling to disk/remote), too large (paying for idle threads), or
   too many queued.
3. **Idle compute** — a warehouse running while nobody is querying.

Diagnose in that order, using the **Query Profile**: `partitions scanned / partitions total` is the
pruning number, and *bytes spilled to remote storage* is the sizing number. Never tune from intuition.

## Warehouses

- **Separate warehouses by workload, not by team**: ELT, BI/dashboards, ad-hoc, and reverse-ETL each
  get their own. Mixing them makes cost unattributable and lets one bad ad-hoc query queue the
  dashboards.
- `AUTO_SUSPEND` = 60s for interactive/ELT. Longer only where warm cache measurably pays for the
  idle. `AUTO_RESUME = TRUE` always.
- **Size up to fix spilling, not to fix queueing. Scale out (multi-cluster) to fix queueing.** These
  are different problems and the wrong lever wastes money without improving anything.
- Doubling size doubles credits per second. It is cost-neutral only if the query gets ≥2× faster —
  verify that, do not assume it.
- `STATEMENT_TIMEOUT_IN_SECONDS` set on every warehouse. A runaway query on an XL is a real bill.
- Resource monitors with notify-and-suspend thresholds on every warehouse, and on the account.

## Pruning, clustering and query design

- Snowflake prunes on min/max metadata per micro-partition. Filter on **columns with natural
  clustering** (usually load or event time) and keep the filter **sargable**: a function on the
  filtered column (`TO_DATE(ts) = ...`, `UPPER(col) = ...`) defeats pruning. Compare the raw column
  to a literal/expression instead.
- Do not add a clustering key by default — it costs continuous reclustering credits. Justify it with
  a measured pruning ratio on a large (>1 TB, multi-partition) table with a stable filter pattern.
  Small tables never need it.
- `SELECT *` on a wide columnar table is a scan multiplier. Project only what you use.
- Prefer set-based SQL. Row-by-row cursors, scalar UDF loops, and per-row calls are anti-patterns.
- Result cache is free and exact-match: identical SQL text, same role, unchanged data. Deliberate
  reuse of query text is a real optimisation.
- Check for exploding joins before blaming compute: a fan-out looks exactly like "the warehouse is
  too small".

## RBAC — roles, not users

Never grant to a user. Grant to a role; grant roles to users. Use the standard hierarchy:

```
ACCOUNTADMIN            (break-glass; MFA; never used for daily work; never owns objects)
  └── SYSADMIN          (owns all databases/warehouses)
        └── <DOMAIN>_ADMIN         functional ownership
              ├── <DOMAIN>_READWRITE     ELT / dbt service roles
              └── <DOMAIN>_READONLY      BI, analysts
  └── SECURITYADMIN → USERADMIN    (grants and users only)
```

- **Access roles** (privileges on objects) are granted to **functional roles** (what a job or person
  is). Do not grant object privileges directly to a person-shaped role.
- `FUTURE GRANTS` on schemas so new objects inherit access. Otherwise every new dbt model needs a
  manual grant and someone will use `ACCOUNTADMIN` to unblock a dashboard.
- Object ownership sits with a role, never a person — people leave.
- Service accounts (dbt, Airflow, Fivetran) use **key-pair auth**, their own role, and a dedicated
  warehouse so their cost and blast radius are attributable.
- PII: mask with **dynamic data masking** policies and restrict with **row access policies**, applied
  by tag where possible so coverage does not depend on remembering.
- `ACCOUNTADMIN` usage is an event to be alerted on, not a convenience.

## Data engineering constructs — pick the right one

| Need | Use | Watch out for |
|---|---|---|
| Declarative refresh of derived data | **Dynamic Table** | `TARGET_LAG` drives cost; not all SQL is incrementalisable — check the refresh mode is `INCREMENTAL`, not `FULL` |
| CDC over a table | **Stream** | Streams have an offset that advances **when consumed in a committed DML** — reading a stream twice outside a transaction loses data |
| Scheduled/dependent work | **Task** (DAG) | Serverless vs warehouse tasks bill differently; set `SUSPEND_TASK_AFTER_NUM_FAILURES` |
| Continuous file ingest | **Snowpipe** / Snowpipe Streaming | Charged per file — many tiny files is expensive and slow; batch to 100–250 MB |
| Bulk load | `COPY INTO` | Use a defined `FILE FORMAT`; `ON_ERROR` chosen deliberately; validate first |
| Semi-structured data | `VARIANT` + `PARSE_JSON` | Flatten hot paths into typed columns; do not filter deep JSON at scale |
| Query external files | External table / Iceberg | Pruning depends on partitioning; expect slower than native |

`TRANSIENT` tables for staging/rebuildable data (no Fail-safe, cheaper storage). Permanent for
anything you would need to recover.

## Time Travel, cloning and recovery

- `DATA_RETENTION_TIME_IN_DAYS` is your undo. Default 1; raise for critical schemas (Enterprise up to
  90). Storage cost scales with change volume, not table size.
- **Zero-copy clone** is the correct way to build a dev/test environment or a pre-migration safety
  net: instant, no storage cost until divergence.
  `CREATE TABLE t_bak CLONE t;` before any destructive DDL is a one-second insurance policy.
- Recovery: `AT | BEFORE (TIMESTAMP => ...)` / `(OFFSET => -600)` / `(STATEMENT => '<query_id>')`,
  and `UNDROP TABLE|SCHEMA|DATABASE`.
- Fail-safe is Snowflake-operated, 7 days, permanent tables only. It is **not** a backup you control.

## Cost governance

- `SNOWFLAKE.ACCOUNT_USAGE` is the source of truth (note: up to 45 min latency, 365-day retention).
  `INFORMATION_SCHEMA` is real-time but narrow. Do not compare a number from one against the other.
- Attribute every credit: `QUERY_HISTORY` + `WAREHOUSE_METERING_HISTORY` joined on warehouse, plus
  `QUERY_TAG` set per job/model so dbt runs are attributable to a model.
- Recurring review targets: longest-running queries, worst pruning ratios, remote spill, warehouses
  with low utilisation but high uptime, unused tables, and tables with runaway Time Travel storage.
- Set `QUERY_TAG` in dbt (`query_tag` config) — without it, warehouse spend is a single opaque number.

## Forbidden

- Daily work as `ACCOUNTADMIN`; grants direct to users.
- Destructive DDL on production without a clone taken first.
- String-interpolated SQL in a stored procedure or script — bind variables.
- Adding a clustering key without a measured before/after pruning ratio.
- Quoting a cost or performance figure without the window it was measured over.
- `SELECT *` in a production view over a wide table.
