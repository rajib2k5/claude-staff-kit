---
name: staff-ship
description: Run the definition-of-done gate before declaring work complete — executes build, tests, lint, and types, checks rollback and observability, and reports honestly what was skipped. Use before saying "done", opening a PR, or merging. Triggers - is this done, ready to ship, pre-merge check, definition of done, ship it.
---

# The done gate

Read `~/.claude/rules/definition-of-done.md`, which also holds this environment's threshold values.

"Done" is not "the code is written". Reporting done prematurely moves bug discovery to production and
removes the person who had the context — it is the most expensive failure available.

## Execute — do not infer

Run each of these **in this session** and keep the output:

```
<install>      # only if the lockfile changed
<lint>
<typecheck>
<test>         # the full relevant suite, the one CI runs
<build>
```

For data work, additionally: `dbt build` on the affected selector, and a grain check
(`GROUP BY <pk> HAVING COUNT(*) > 1` returns zero rows) on anything new or changed.

If a command does not exist in the project, say so. If it fails, **stop and report the failure with its
output** — do not proceed to the checklist and do not describe the work as done.

## Then check

**Correctness** — original problem reproduced and the reproduction now passes · tests observed failing
before the fix · boundaries considered (empty/null/1/n/n+1/max/negative/duplicate/unicode) · error paths
exercised.

**Operability** — failure is detectable via a log, metric, or alert · rollback path stated (a real
sequence for T3+, not "revert") · no new unbounded retry, queue, fan-out, or missing timeout.

**Review readiness** — one logical change in the diff · no debug prints, commented-out code, unlinked
TODOs, skipped tests, or stray files · docs/README/ADR/dbt descriptions updated in the same change · no
secrets added, logged, or committed.

**Validation** — the `staff-validate` gate run if the change is T3+, produces a number for a human,
touches production data, or is security-relevant.

## Report

State what you executed and its result. State explicitly what you **did not** do and why — a skipped
check named is fine, a skipped check implied is a defect. Never use "tests pass", "verified", or
"working" without the command output behind it.
