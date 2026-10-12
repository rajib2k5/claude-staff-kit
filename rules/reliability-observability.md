# Rule: Reliability, Observability and Incidents

## Measure what users experience

An SLI is measured **at the user's boundary**, not at your service's internals. Availability that
counts a 200-with-empty-body as success measures nothing.

- Latency SLIs are **percentiles** — p50, p95, p99, and the max. A mean latency hides every outage
  that matters, because the mean of a bimodal distribution describes nobody.
- Set an SLO with an **error budget**, and mean it: budget consumed → reliability work outranks
  features. An SLO with no consequence is a wish.
- 100% is the wrong target. It forbids deploying.

## The three signals, used correctly

**Structured logs** — one event per line, machine-parseable (JSON), with a correlation/request ID
threaded through every hop. Levels used honestly: `ERROR` means a human must act, `WARN` means
degraded, `INFO` is a state transition, `DEBUG` is off in production. If everything is ERROR, nothing
is. Never log secrets or PII.

**Metrics** — cheap, aggregate, alertable. Watch **cardinality**: a label containing a user ID, a
request ID, or a URL path with IDs in it will take down your metrics backend and your budget.
Prefer the RED method for request-driven services (Rate, Errors, Duration) and USE for resources
(Utilisation, Saturation, Errors).

**Traces** — the only tool that answers "where did the 3 seconds go" across services. Propagate
context at every boundary; sample intelligently but always keep the errors and the slow tail.

Every one of the three should be reachable from the others: a log line links to its trace, a trace
links to the metric it moved.

## Alerting

- **Alert on symptoms, page on user pain.** "p99 checkout latency above SLO" pages. "CPU at 80%" does
  not — it is a dashboard, and paging on it trains people to ignore pages.
- Every page has a **runbook link** and a human action. An alert with no action is deleted.
- Anything that fires and gets routinely ignored is deleted or downgraded. Alert fatigue is the
  mechanism by which real incidents are missed.
- Alert on **absence** too. A cron that silently stopped, a queue that stopped receiving, a pipeline
  that produced zero rows — silent failure is the worst class, so build the detector for it.

## Designing for failure

- Every remote call: **timeout, bounded retry with exponential backoff and jitter, circuit breaker.**
  Missing timeouts are the classic cause of cascading failure; retries without jitter synchronise
  clients into a thundering herd; retries without idempotency duplicate writes.
- Bound every queue, pool, and fan-out. Apply backpressure; shed load deliberately rather than
  collapsing.
- Degrade gracefully: serve stale, serve partial, serve a smaller result — in a documented order.
- Health checks distinguish **liveness** (am I running) from **readiness** (should I receive
  traffic). Conflating them causes restart loops under dependency failure.
- Assume the network partitions, the clock skews, the disk fills, and the dependency returns garbage
  with a 200.

## Deploy safety

Progressive delivery, always: canary → percentage rollout → full, with automated rollback bound to
an SLI. Decouple **deploy** from **release** with feature flags so the risky moment is a config
change, not a shipment. Flags are temporary — every flag has an owner and a removal date, or the
flag graph becomes the system's real, untested control flow.

## Incidents

**Order of operations: mitigate, then diagnose.** Restore service first — roll back, flag off, shift
traffic, scale out. Root cause is a peacetime activity. Do not debug a live outage in production
while users are down if a rollback is available.

Roles named out loud: **incident commander** (decides, does not type), **communicator**, **operator**.
Keep a timestamped timeline as you go — memory is reconstructed wrong afterwards.

## Postmortems

Blameless, written, and about the **system**, not the person. "Human error" is never a root cause —
it is the starting point of the question *why did the system permit it, and why was it not caught*.

Required contents: user-visible impact with duration and scope, timeline, contributing factors,
**how it was detected** (and how long detection took — often the real finding), what made it worse,
what made it better, and action items with owners and dates. Action items without an owner do not
exist. Ask what would make the class of failure impossible, not just this instance.
