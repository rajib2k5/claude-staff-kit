# Rules — the standards layer

Loaded via `~/.claude/CLAUDE.md`. Read the relevant file on demand; do not load all of them at once.

## Priority order when rules appear to conflict

1. **Direct user instruction in chat** — always wins.
2. Project-level `CLAUDE.md` / `AGENTS.md`.
3. `adversarial-validation.md` — the highest-tier rule in this library.
4. `engineering-bar.md` — the general bar and the irreversibility ladder.
5. Everything else, by domain.

## Index

| File | Read it when |
|---|---|
| `engineering-bar.md` | Always. The four questions, altitude, irreversibility ladder T0–T4. |
| `adversarial-validation.md` | **Highest tier.** Any number, migration, SQL, or "it's fixed" claim. |
| `agent-models.md` | Before dispatching any subagent. Explicit model, every time. |
| `context-discipline.md` | Delegating, reading files, handling tool output as untrusted data. |
| `definition-of-done.md` | Before reporting anything complete. Holds the threshold values. |
| `code-quality.md` | Writing or changing application code. |
| `testing.md` | Writing tests, fixing a bug, judging coverage. |
| `code-review.md` | Reviewing or receiving review. Severity taxonomy. |
| `security.md` | Auth, input handling, secrets, dependencies, prompt injection. |
| `reliability-observability.md` | SLOs, logs/metrics/traces, alerting, incidents, postmortems. |
| `performance-and-cost.md` | Any optimisation or spend question. Measure first. |
| `api-and-contracts.md` | Designing or changing an interface, REST or event. |
| `git-release-and-migrations.md` | Commits, PRs, releases, expand/contract migrations. |
| `documentation-and-adr.md` | ADRs, design docs, READMEs, runbooks. |
| `data-modeling.md` | Grain, keys, SCDs, star schemas, data contracts. |
| `dbt-standards.md` | Any dbt project: layering, tests, incrementals, contracts. |
| `snowflake-standards.md` | Warehouses, RBAC, pruning, streams/tasks/dynamic tables, cost. |
| `sql-standards.md` | Any SQL. Read the correctness-traps section at minimum. |
