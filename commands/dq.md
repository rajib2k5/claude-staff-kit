---
description: Hunt silent data failures — grain/fan-out, freshness, reconciliation, absence-vs-zero, broken SCDs
argument-hint: [table, model, or the number that looks wrong]
---

Invoke the `data-quality` skill.

Target: $ARGUMENTS

Run all seven checks, in order — starting with the grain check, because fan-out is the most damaging and
presents as good news:

`SELECT <pk>, COUNT(*) FROM <t> GROUP BY <pk> HAVING COUNT(*) > 1` must return zero rows.

Two traps to handle explicitly:
- **Do not infer a pipeline lag from `MAX(START_TIME)` alone.** A deliberately stopped service looks
  identical to a lagging one. Establish which it is before reporting.
- **Absence is not zero.** Check whether an inner join deleted the periods with no activity — usually the
  exact rows someone is looking for.

**Re-derive at least one headline number by a different route** than the pipeline that produced it, then
compare side by side. That single act catches more real defects than any other check.

Report the SQL you ran, the number you got, the number expected, and the business impact.
