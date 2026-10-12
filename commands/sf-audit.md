---
description: Audit a Snowflake account — RBAC hygiene, warehouse topology, credit waste, recoverability, unmasked PII
argument-hint: [optional focus: rbac | cost | warehouses | recovery]
---

Invoke the `data-snowflake-audit` skill.

Focus: $ARGUMENTS  (if empty, cover all four areas)

Every finding must come from a query you **executed**, with the **window it covers** stated.

Critical measurement caveat: `SNOWFLAKE.ACCOUNT_USAGE` has up to 45 minutes of latency and 365-day
retention; `INFORMATION_SCHEMA` is real-time but narrow. **Never compare a figure from one against the
other and report it as a discrepancy** — that is a fake finding that wastes a real investigation.

Dispatch `snowflake-architect` (Opus) and `cost-optimizer` (Opus) in parallel. Any savings figure headed to
a decision-maker then goes through `/validate` before you present it.
