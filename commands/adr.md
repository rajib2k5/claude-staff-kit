---
description: Write an Architecture Decision Record capturing the decision, rejected alternatives, and revisit conditions
argument-hint: [the decision to record]
---

Invoke the `staff-adr` skill.

Decision: $ARGUMENTS

Write to `docs/adr/NNNN-slug.md` (next sequential number — check the directory first).

The **Alternatives considered** section is the most valuable part of the document: each option with a real
rejection *reason*, not a dismissal. It is what stops the same debate being re-run in eighteen months.

Include a **Revisit when** trigger — a scale threshold, cost figure, vendor change, or date. Without one an
ADR becomes permanent by accident.

If a load-bearing fact is unknown, mark the status `Proposed`, not `Accepted`, and record the gap as
`TODO(unknown)`.
