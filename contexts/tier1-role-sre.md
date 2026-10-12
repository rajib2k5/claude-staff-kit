# Tier 1 — role: SRE / platform

Load when working on reliability, deployment, observability, or during an incident.

## Incident order — never invert it

**Mitigate → stabilise → diagnose → fix → postmortem.**
Preference order for mitigation: **roll back · flag off · shift traffic · scale out · shed load.**
Do not debug in production while users are down if a rollback exists.

Scope first (who, how many, since when, worsening?). Timeline as you go. Roles named: commander (decides,
does not type), communicator, operator. One hypothesis at a time, announced.

## Every remote interaction needs three controls

**Timeout · bounded retry with exponential backoff and jitter · circuit breaker.**
Missing timeouts cause cascading failure. Retries without jitter synchronise a thundering herd. Retries
without idempotency duplicate writes.

## Signals

Logs structured with a correlation ID, honest levels, no secrets. Metrics with **bounded cardinality** — a
user ID or raw URL path in a label will take down the backend and the budget. Traces propagated at every
boundary, always keeping errors and the slow tail.

## Alerting

**Alert on symptoms, page on user pain.** CPU at 80% is a dashboard, not a page — paging on it trains
people to ignore pages. Every page has a runbook and a human action. **Alert on absence** too: the cron
that stopped, the queue that went quiet, the pipeline that produced zero rows.

## SLOs

Measured at the **user's boundary**. Latency as percentiles (p50/p95/p99/max) — a mean describes nobody.
An error budget with a real consequence, or it is a wish. 100% is the wrong target.

## Deploy

Canary → percentage → full, with automated rollback bound to an SLI. Separate deploy from release with
flags. Every flag has an owner and a removal date.

## Reference

`rules/reliability-observability.md` · `rules/git-release-and-migrations.md` ·
`rules/performance-and-cost.md`

Agents: `sre-reliability` · `incident-responder` · `migration-planner` · `performance-engineer` (Opus);
`release-manager` (Sonnet).
