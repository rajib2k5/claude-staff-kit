---
name: data-snowflake-audit
description: Audit a Snowflake account for RBAC hygiene, warehouse topology, credit waste, missing recoverability, and unmasked PII — every finding backed by a query you ran with its measurement window. Use for platform review or before taking ownership of an account. Triggers - audit snowflake, snowflake health check, review snowflake setup, snowflake rbac review, snowflake cost review.
---

# Snowflake account audit

Read `~/.claude/rules/snowflake-standards.md`.
If the Snowflake MCP server is unavailable, run every query with the `snowflake-sql` skill (`~/.claude/skills/snowflake-sql/sf.py`; the PAT comes from the environment variable named in its `config.json`, and it is read-only by default).

Every finding must come from a query you executed, with the **window it covers** stated. Note that
`ACCOUNT_USAGE` has up to 45 minutes of latency and 365 days of retention, while `INFORMATION_SCHEMA` is
real-time but narrow — **never compare a figure from one against the other and call it a discrepancy.**

## Access model

- Grants made directly to **users** rather than roles (`GRANTS_TO_USERS`) — every one is a finding.
- `ACCOUNTADMIN` usage for daily work, and whether `ACCOUNTADMIN` **owns objects** (it must not).
- Whether `FUTURE GRANTS` exist per schema — without them every new dbt model needs a manual grant, and
  someone will use `ACCOUNTADMIN` to unblock a dashboard.
- Object ownership held by a **person-shaped role** rather than a functional role. People leave.
- Service accounts (dbt, Airflow, Fivetran): password auth instead of key-pair, shared roles, or a shared
  warehouse that makes their cost and blast radius unattributable.
- Users without MFA; stale users with grants; roles with no members.
- **PII**: masking policies and row access policies present, and applied **by tag** rather than manually —
  manual application means coverage depends on someone remembering.

## Warehouses

- `AUTO_SUSPEND` above 60s without a measured cache justification; `AUTO_RESUME` off.
- Missing `STATEMENT_TIMEOUT_IN_SECONDS` — a runaway query on an XL is a real bill.
- No resource monitor on a warehouse, or none at the account level.
- Warehouses **shared across workloads** (ELT + BI + ad-hoc) — makes cost unattributable and lets one
  ad-hoc query queue the dashboards.
- High uptime with low utilisation (oversized) vs queueing (needs multi-cluster, not a bigger size).

## Performance and credits

- Worst **pruning ratios**: queries where `partitions_scanned / partitions_total` is high on large tables.
- Queries **spilling to remote storage** — the genuine size-up signal.
- Longest-running and most expensive queries, joined `QUERY_HISTORY` × `WAREHOUSE_METERING_HISTORY`.
- Whether `QUERY_TAG` is set — without it, warehouse spend is one opaque number and dbt runs cannot be
  attributed per model.
- Clustering keys present with **no measured pruning gain** — continuous reclustering bills forever.
- Non-sargable filters (`TO_DATE(ts) = ...`, `UPPER(col) = ...`) defeating pruning entirely.

## Recoverability

- `DATA_RETENTION_TIME_IN_DAYS` on critical schemas — is your undo window adequate?
- Tables with runaway Time Travel storage (cost scales with change volume, not table size).
- Permanent tables holding rebuildable staging data that should be `TRANSIENT`.
- Any evidence of destructive DDL run without a clone taken first.

## Method

Dispatch `snowflake-architect` (Opus) for the topology and access judgement and `cost-optimizer` (Opus)
for the credit analysis, in parallel. Any savings figure headed to a decision-maker then goes through
`staff-validate` — a wrong number in front of a decision-maker is the top-priority defect class.

## Report

Grouped: **access risk · recoverability risk · credit waste · performance**. Per finding: the query, the
result, the window, the impact, the fix. Savings figures as labelled ranges with assumptions, never point
estimates.
