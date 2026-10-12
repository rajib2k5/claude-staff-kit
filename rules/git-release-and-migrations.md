# Rule: Git, Release and Migrations

## Branch and commit

- Trunk-based: short-lived branches, merged in days not weeks. Long-lived branches convert integration
  risk into a single painful event.
- **Commit messages explain why.** The diff already says what. Conventional Commits
  (`feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `test:`, `chore:`, `feat!:` for breaking) so
  release notes and versioning can be derived.
- Subject in the imperative, under ~72 chars. Body covers context, the approach and why alternatives
  were rejected, and how it was verified. Link the issue.
- One logical change per commit. Mechanical changes (format, rename, codemod) get their own commit,
  labelled, so review can skip them safely.
- Never rewrite published history on a shared branch. Never force-push a branch someone else may have
  pulled.
- Never commit: secrets, credentials, large binaries, generated artifacts, `.env`, IDE state,
  `target/`, `node_modules/`.
- **Commit and push only when asked.** If on the default branch, branch first.

## Pull requests

The description answers four questions: **what** changed, **why**, **how it was verified** (with the
actual command output), and **how to roll back**. A PR that cannot answer the fourth is not ready for
a T2+ change.

Keep it under ~400 lines of substantive diff. Defect detection collapses beyond that, and a large PR
gets an approval rather than a review.

## Release

- CI is the gate: build, lint, type-check, unit, integration, security scan, dependency audit. Red
  means stop — never merge through a failure, never disable a check to go green.
- Artifacts are **built once** and promoted through environments. Rebuilding per environment means
  you tested a different binary than you shipped.
- Semantic versioning on anything consumed by someone else. A breaking change is a major bump, every
  time, with no exceptions for "nobody uses that".
- Deploy is progressive and reversible: canary → percentage → full, with automated rollback bound to
  an SLI. See `reliability-observability.md`.
- **Separate deploy from release** with feature flags. The risky moment becomes a config change you
  can undo in seconds rather than a deployment you have to redo.
- Every flag has an owner and a removal date. Stale flags become untested control flow.

## Migrations — the expand/contract discipline

A migration is **forward-only** in practice: once data is written in the new shape, a code revert
alone does not restore correctness. So never couple a schema change to a code change in one step.

```
1. EXPAND    add the new column/table, nullable, no writer yet          (safe, revertible)
2. BACKFILL  populate in bounded batches, monitored, resumable, idempotent
3. DUAL      write both, read old — verify the new path matches the old
4. SWITCH    read new (behind a flag, so the switch is instant to undo)
5. CONTRACT  stop writing old, then drop it — a separate release, days later
```

Rules that make this safe:

- **Never** add a `NOT NULL` column without a default in one step on a large table; never rename a
  column in place (add, dual-write, drop); never drop a column in the same release that stops using
  it.
- Backfills are **batched, rate-limited, resumable, and idempotent** — a backfill that cannot be
  re-run from the middle will be re-run from the start at the worst possible time.
- Locking: know what lock your DDL takes and for how long. A migration that locks a hot table is an
  outage.
- Every migration has a **tested rollback plan** — not "revert the commit", but the actual sequence
  that restores a working system, and the answer to what happens to rows written in the new shape.
- Take a backup/clone immediately before, and verify it exists. See `snowflake-standards.md` for
  zero-copy clones.
- Dry-run against a production-shaped copy, with production-scale row counts. A migration validated
  on 100 rows tells you nothing about the one that will run on 100 million.
- Migrations are **T3 on the irreversibility ladder** → adversarial validation is mandatory before
  execution. See `adversarial-validation.md`.

## Environments

Dev → staging → production, with staging shaped like production (data volume and topology, not
necessarily real data). Production data is never copied to a lower environment unmasked. Access to
production is audited, and read-only by default.
