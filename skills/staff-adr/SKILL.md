---
name: staff-adr
description: Write an Architecture Decision Record capturing a decision, the alternatives rejected, and the conditions to revisit it. Use after any significant technical decision. Triggers - write an ADR, document this decision, architecture decision record, why did we choose.
---

# Write an ADR

Read `~/.claude/rules/documentation-and-adr.md`.

## Is it significant enough?

Yes if it is **expensive to reverse**, **constrains future options**, or someone will later ask "why on
earth is it like this". Database choice, auth model, sync vs async, build vs buy, warehouse topology,
incremental strategy, a deliberate deviation from a standard — yes. A variable name — no.

## Location and lifecycle

`docs/adr/NNNN-short-slug.md`, sequentially numbered, in the repo with the code.

**An accepted ADR is immutable.** When the decision changes, write a new ADR and mark the old one
`Superseded by ADR-NNNN`. Editing an accepted ADR destroys the record of what was believed and when,
which is the entire value of the artefact.

## Template

```markdown
# ADR-NNNN: <the decision, stated as a decision>

Status: Proposed | Accepted | Superseded by ADR-NNNN
Date: YYYY-MM-DD
Deciders: <names or roles>

## Context
The forces at play: constraints, requirements, what is known, what is not. Written so someone
with no memory of the discussion can evaluate the reasoning. Include the numbers that mattered.

## Decision
What we are doing. Active voice, present tense: "We will ...".

## Alternatives considered
Each option, and **why it was rejected**. This is the most valuable section in the document —
it is what stops the same debate being re-run in eighteen months by someone who assumes
nobody thought of the obvious idea.

## Consequences
Positive, negative, and the risks being accepted. Name the negatives honestly. An ADR with no
downsides listed was not thought about.

## Revisit when
The specific condition that should reopen this: a scale threshold, a cost figure, a vendor
change, a date. An ADR with no revisit trigger becomes permanent by accident.
```

## Quality bar

- The Context section contains the actual constraint numbers, not adjectives.
- Every alternative has a rejection **reason**, not a dismissal.
- The Consequences section is honest about what this makes harder.
- No unresolved `TODO(unknown)` in an ADR marked Accepted. If a fact is unknown, the status is Proposed.
