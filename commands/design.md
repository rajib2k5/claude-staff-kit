---
description: Run a staff-level design process — constraints, non-goals, real alternatives, recommendation, migration path
argument-hint: [what to design]
---

Invoke the `staff-design` skill.

Subject: $ARGUMENTS

Require:
- Constraints restated, including any the request **implies but did not state** (scale, latency,
  consistency, budget, deadline) — named as assumptions.
- **Explicit non-goals.** Most design disputes are scope disputes.
- 2–3 **genuinely different** options. One option plus two strawmen is not a design process.
- A recommendation, with what would change your mind.
- The **incremental path** (expand → migrate → contract). A design with no incremental path is not
  implementable.
- Failure modes, blast radius, rollback, the SLI that shows it working, and an order-of-magnitude cost.

Say plainly if the right answer is "do not build this" or "the existing thing is adequate".
