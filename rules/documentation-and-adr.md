# Rule: Documentation, ADRs and Design Docs

## What is worth writing

Write down what **cannot be recovered from the code**: why this approach, what was rejected and why,
what invariant must hold, what will break if you change this, how to operate it when it fails.

Do not write down what the code already says. A doc that restates the code becomes wrong the first
time the code changes, and a wrong doc is worse than no doc — people trust it.

## Architecture Decision Records

One file per significant decision, immutable once accepted, numbered, in-repo
(`docs/adr/0007-use-dynamic-tables-for-cdc.md`).

```markdown
# ADR-0007: <decision, stated as a decision>
Status: Proposed | Accepted | Superseded by ADR-0012
Date: 2026-08-17
Deciders: <names/roles>

## Context
The forces at play: constraints, requirements, what we know, what we don't.
Written so someone with no memory of the discussion can evaluate it.

## Decision
What we are doing. Active voice, present tense: "We will use ...".

## Alternatives considered
Each with why it was rejected. **This is the most valuable section** — it is what stops
the same debate being re-run in eighteen months.

## Consequences
Positive, negative, and the risks we are accepting. Name the negatives honestly;
an ADR with no downsides listed was not thought about.

## Revisit when
The condition that should make us reopen this: a scale threshold, a cost figure,
a vendor change, a date.
```

A decision is "significant" if it is expensive to reverse, constrains future options, or someone will
ask "why on earth is it like this". Choice of database, auth model, sync vs async, build vs buy,
warehouse topology, incremental strategy — yes. Choice of variable name — no.

Never edit an accepted ADR to reflect a new decision. Write a new one and mark the old **Superseded**.
The history of decisions is the artefact.

## Design docs / RFCs — before a large change

For anything multi-week or cross-team, written *before* implementation: problem and why now, goals
and explicit **non-goals**, proposed design, alternatives, data model and interface changes, failure
modes, rollout and migration plan, observability plan, security and privacy review, cost estimate,
open questions.

The non-goals section prevents the majority of scope arguments. The open questions section is what
makes the review useful — a design doc with no open questions is a status report.

## READMEs

The entry point answers, in order: **what** this is (one sentence), **how to run it**, **how to test
it**, **how it is deployed**, **where to look when it breaks**, **who owns it**. Anything longer
belongs in linked docs.

Every setup command in a README must be one someone can paste and have work. Untested setup
instructions are the most reliably broken documentation in any repo — run them on a clean checkout.

## Runbooks

Per alert and per recurring operational task. Structure: symptom → how to confirm → immediate
mitigation → diagnosis steps → escalation path → related dashboards and queries.

Written for someone at 3 a.m. who did not build the system: exact commands, exact dashboard links, no
"obviously" and no assumed context. If a step requires judgement, say what the judgement is between.

## Code-level documentation

- Public functions and modules: what it does, what it assumes, what it raises, and any non-obvious
  complexity or ordering requirement.
- Data models and dbt marts: **grain first** ("one row per order line per day"), then every column
  with units and semantics. An undocumented mart column becomes a misread number in a board deck.
- Comment the *why* of a non-obvious decision, with a link to the issue or ADR.

## Keeping docs true

Docs live next to the code and change in the same PR. A PR that changes behaviour and not the docs
that describe it is incomplete. Prefer generated documentation (`dbt docs`, OpenAPI from schema,
types from source) wherever it removes a chance to drift.
