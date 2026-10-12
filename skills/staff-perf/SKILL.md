---
name: staff-perf
description: Investigate a performance problem from a measurement rather than intuition — baseline, profile, one change, re-measure, report both numbers with their window. Use when something is slow and the actual cause is needed. Triggers - this is slow, optimize this, performance problem, why is this taking so long, latency issue.
---

# Performance investigation

Read `~/.claude/rules/performance-and-cost.md`.

**No optimisation without a profile.** Intuition about hot paths is wrong often enough to be worthless;
the bottleneck is routinely somewhere nobody proposed.

## Procedure — step 2 cannot be skipped

1. **Define the target in user terms**: "p99 render under 400 ms", not "make it faster". A target you
   cannot measure is a target you cannot hit.
2. **Baseline.** Measure the current state and record the **exact window, load level, and conditions**.
   Without a baseline you cannot claim an improvement later, and you will be asked to.
3. **Profile** to find where the time actually goes. Do not optimise a component you have not profiled.
4. **One change.**
5. **Re-measure identically** — same window shape, same load, same method. Report both numbers and the
   delta.
6. Dispatch `performance-engineer` (Opus) for the analysis if the cause is not obvious from the profile.

## Check in this order — by how often it is the real answer

1. **N+1 queries / chatty I/O** — the loop that hits the network per row.
2. **Missing or wrong index** — read the plan, do not guess.
3. **Serial work that could be concurrent** — sequential awaits over independent calls.
4. **Over-fetching** — `SELECT *`, no pagination, unbounded results.
5. **Absent caching** at a stable, high-read boundary.
6. **Accidental quadratic** — `contains` in a loop, string concat in a loop, nested scans.
7. Algorithmic complexity. Last in application code, first in a hot library.

For warehouse queries, use `data-snowflake-tune` instead — the diagnostic order is different (pruning,
then warehouse sizing, then idle compute).

## Discipline

Optimise the **tail** (p99), not the mean — the mean of a bimodal distribution describes nobody. Say
whether you optimised latency or throughput; improving one often degrades the other. Measure under
realistic concurrency, not on an idle machine.

## Report

Before and after, each with its window and conditions. What you changed and what you did not. Label
anything modelled or extrapolated — never present an estimate in the grammar of a measurement. Any figure
headed for a decision-maker goes through `staff-validate` first.
