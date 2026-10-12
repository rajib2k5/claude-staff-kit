# Rule: Performance and Cost Engineering

## Measure, then change

**No optimisation without a profile.** Intuition about hot paths is wrong at a rate that makes it
worthless; the bottleneck is routinely somewhere nobody proposed. Sequence:

1. Define the target in user terms ("p99 page render under 400 ms"), not "make it faster".
2. Measure the current state. Record the **exact window and conditions** the number came from.
3. Profile to find where the time or money actually goes.
4. Change one thing.
5. Re-measure the same way. Report **both numbers and the delta**.

An unmeasured optimisation is a refactor with extra risk. Report only measured figures — anything
modelled or extrapolated is labelled as such. See `adversarial-validation.md`.

## Where the time usually is

Ordered by how often it is the real answer:

1. **N+1 queries and chatty I/O** — the loop that hits the network per row.
2. **Missing index / wrong index** — check the plan, do not guess.
3. **Serial work that could be concurrent** — sequential awaits over independent calls.
4. **Over-fetching** — `SELECT *`, no pagination, unbounded result sets, no projection pushdown.
5. **Absent caching** at a stable, high-read boundary.
6. **Accidental quadratic** — a `contains` inside a loop, string concatenation in a loop, a nested
   scan over a growing list.
7. Algorithmic complexity. Genuinely last in application code, first in a hot library.

## Latency discipline

- Optimise the **tail**, not the mean. p99 is what users notice and what fills queues.
- Distinguish **latency** (one request) from **throughput** (all requests). Improving one commonly
  degrades the other — batching is the canonical example.
- Measure under realistic concurrency. A benchmark on an idle machine measures the machine.
- Set complexity and size budgets on the things that silently regress: bundle size, cold start,
  query count per request, payload size. Enforce in CI or they regress.

## Caching

Every cache needs, written down: **key**, **TTL**, **invalidation trigger**, and **staleness
tolerance**. A cache without an invalidation story is a bug on a timer.

- Cache derived data, not the source of truth.
- Beware stampedes on expiry — jitter TTLs, use single-flight.
- Never cache per-user data under a shared key. That is an authorisation bug that presents as a
  performance feature.

## Cost is a first-class engineering constraint

Cost and performance are the same discipline in the cloud: compute you did not need is latency you
did not need, and both bill.

- Know the **unit economics**: cost per request, per tenant, per pipeline run, per GB scanned. A total
  monthly figure is not actionable; a per-unit figure is.
- Attribute spend with tags/labels from day one. Untagged spend cannot be optimised or defended.
- The big four wins, in order: **turn off what nobody uses**, **right-size what is over-provisioned**,
  **stop scanning data you do not need**, **commit/reserve what is genuinely steady**.
- Egress, cross-region traffic, NAT, and log ingestion are the line items that surprise people.
- Set budgets and alerts *before* running anything that scales elastically.
- A cost model presented to a decision-maker is validated adversarially. Getting a spend forecast
  wrong is a wrong number in front of a decision-maker, which is the top-priority defect class.

For warehouse-specific cost mechanics (credits, warehouse sizing, pruning, spill) see
`snowflake-standards.md`.
