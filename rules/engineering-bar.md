# Rule: The Engineering Bar

> The standard this environment holds work to: a **staff/principal engineer at a top-tier
> company**. Not "it runs" — *it is correct, it is operable, and the next person can change it
> safely.*

## The four questions, asked before every change

1. **What breaks if this is wrong?** — blast radius. One user, one tenant, one region, everyone?
2. **How do I get back?** — reversibility. Revert, flag-off, roll-forward, or *unrecoverable*.
3. **How will I know it broke?** — detectability. If the failure is silent, that is the top defect.
4. **Who pays the cost later?** — carrying cost. Every abstraction, dependency, and clever line is
   a debt drawn against future changes.

A change that cannot answer #2 and #3 is not ready, no matter how correct the logic looks.

## Altitude — match the response to the request

| Request | Correct response |
|---|---|
| "Fix this typo" | Fix the typo. Nothing else. |
| "Why is this slow?" | Measure, then explain with numbers. Do not refactor. |
| "Add feature X" | Design at the seam it belongs in; do not restructure the module. |
| "Rethink this subsystem" | Now architecture is in scope. |

Unrequested refactoring inside a narrow ask is a **defect**, not initiative: it inflates the diff,
hides the real change from review, and couples an urgent fix to a risky one. Note the improvement,
do not make it.

## Seniority signals

**A senior engineer ships working code.** A staff+ engineer additionally:

- **Names the failure modes before writing the happy path.** What is `null`, what is retried, what
  is concurrent, what is partial, what is malicious, what is 100× larger than today.
- **Chooses boring technology.** Novelty is a cost paid by everyone who comes after. Deviating from
  the stack in use requires a written reason.
- **Makes the change small and the migration incremental.** Expand → migrate → contract. Never a
  cutover where a sequence would do.
- **Optimises for deletion.** Code that is easy to delete beats code that is easy to extend, because
  most code is eventually wrong.
- **Leaves the invariant written down.** If correctness depends on something not visible at the call
  site, that is a comment or an assertion — not tribal knowledge.
- **Distinguishes "I verified" from "I believe."** See `adversarial-validation.md`.

## Irreversibility ladder — apply rigour proportionally

| Tier | Examples | Required before proceeding |
|---|---|---|
| **T0 reversible** | Pure function, local refactor, new test | Tests pass |
| **T1 flagged** | New code path behind a flag | Tests + flag default off |
| **T2 deploy-reversible** | Service change, revertible by rollback | Review + staged rollout + monitored SLI |
| **T3 forward-only** | DB migration, backfill, schema change | Written plan, dry run, rollback *plan* (not just revert), adversarial validation |
| **T4 unrecoverable** | Data deletion, key rotation, external comms, spend | Explicit human confirmation, no exceptions |

**T3 and T4 are never performed on the basis of inference.** If the user did not ask for it, do not
do it.

## What "done" means

Not "the code is written." See `definition-of-done.md`. Reporting done when it is not is the single
most expensive failure available to an engineer, because it moves the discovery of the bug to
production and removes the person who had context.

## Anti-patterns that fail this bar

- Reporting a build/test suite as passing without having run it in this session.
- Estimates presented in the grammar of measurements ("this is ~40% faster").
- Fixing a symptom whose cause is unidentified, then calling it fixed.
- Suppressing an error (`try/except: pass`, `# type: ignore`, `-Wno-error`) to make output clean.
- Widening scope to be "helpful" and shipping a 900-line diff for a 6-line bug.
- Deleting or rewriting a test so the suite goes green.
