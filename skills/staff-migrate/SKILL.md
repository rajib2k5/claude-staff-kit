---
name: staff-migrate
description: Plan and execute a schema, data, or API migration using expand/contract with a resumable backfill, a real rollback plan, and a production-scale dry run. Use before any migration, backfill, or breaking interface change. Triggers - migration, migrate the schema, backfill, breaking change, alter table, rename column.
---

# Migration

Read `~/.claude/rules/git-release-and-migrations.md`.

Migrations are effectively **forward-only**: once data exists in the new shape, reverting the code does
not restore correctness. Production will sit in every intermediate state, so every intermediate state
must be safe.

## The only acceptable shape

```
1. EXPAND    add the new column/table, nullable, no writer yet      (safe, revertible)
2. BACKFILL  bounded batches, monitored, resumable, idempotent
3. DUAL      write both, read old — verify the new matches the old on live traffic
4. SWITCH    read new, behind a flag (instant to undo)
5. CONTRACT  stop writing old, then drop it — a separate release, days later
```

Each step independently deployable and independently revertible. If a step is not, decompose further.
**Never a cutover where a sequence would do.**

## Non-negotiables

- No `NOT NULL` without a default in one step on a large table. No in-place rename. No dropping a column
  in the release that stops using it.
- The backfill is **batched, rate-limited, resumable, and idempotent**. One that cannot resume from the
  middle will be restarted from the beginning at the worst moment.
- **Know the lock** the DDL takes and for how long. A migration that locks a hot table is an outage.
- A **rollback plan** that is an actual sequence, and an explicit answer to *what happens to rows already
  written in the new shape*.
- A **backup or zero-copy clone taken immediately before**, verified to exist:
  `CREATE TABLE t_bak CLONE t;` costs a second in Snowflake.
- A **dry run at production scale** on a production-shaped copy. Validated on 100 rows tells you nothing
  about 100 million.

## Procedure

1. Dispatch `migration-planner` (Opus) for the phased plan.
2. **Run `staff-validate`** — a migration is tier T3, so adversarial validation is mandatory before
   execution, and any flagged blocker must be reproduced by you before you act on it.
3. Execute one phase at a time. After each: verify with a query, not an assumption.
4. During DUAL, run the comparison query on real traffic and report the mismatch count. A non-zero
   mismatch stops the migration.
5. State the **abort criteria** before starting — the specific observation that means roll back.

## Report

The phased plan with a revert per phase, the dry-run result with real row counts and timings, the DUAL
comparison result, the abort criteria, and what you could not test.
