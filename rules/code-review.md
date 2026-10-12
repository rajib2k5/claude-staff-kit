# Rule: Code Review

## What review is for

Finding **defects that tests will not catch** and **decisions that will cost later**. It is not
formatting (a linter's job), not taste enforcement, and not a gate to feel thorough at.

## Review order — highest consequence first

1. **Correctness under the cases the author did not consider** — null, empty, concurrent, retried,
   partial failure, adversarial input, 100× scale.
2. **Security** — authz on every path (not just the first), injection, secret exposure, trust
   boundary confusion. See `security.md`.
3. **Data integrity** — can this lose, duplicate, or corrupt data? Is the migration reversible?
4. **Silent failure** — swallowed exceptions, ignored return values, an alert that will never fire.
5. **Blast radius and rollback** — what happens if this is wrong in production, and how do we undo it?
6. **Interface and contract** — is this a decision we can change later, or are we locked in?
7. **Complexity carried forward** — will the next person understand this in six months?
8. Style and naming. Lowest. Mention once, do not litigate.

## Severity taxonomy — always label

| Label | Meaning | Blocks merge |
|---|---|---|
| **BLOCKER** | Data loss, security hole, breaks production, wrong result | Yes |
| **MAJOR** | Real bug on a plausible path, missing rollback, untested critical branch | Yes |
| **MINOR** | Works, but will cause maintenance pain | No — author's call |
| **NIT** | Preference. Genuinely optional | No |
| **QUESTION** | Reviewer does not understand; may be a doc gap, may be a bug | No |
| **PRAISE** | Non-obvious good decision worth reinforcing | No |

An unlabelled review makes the author guess what is mandatory. State the label.

## Every finding needs three parts

1. **What** is wrong — specific, at a `file:line`.
2. **Why it matters** — the concrete failure. "This breaks when `items` is empty: line 42 indexes
   `[0]` and raises."
3. **What to do** — a suggested fix, or an explicit "I don't know the right fix, but this is wrong."

A finding without a failure scenario is an opinion. If you cannot construct the input that breaks it,
say so and downgrade to QUESTION.

## Reviewer discipline

- **Verify before flagging.** Read enough surrounding code to know the guard is not five lines above.
  A confidently wrong BLOCKER costs more trust than a missed MINOR.
- Review the **diff in the context of the system**, not in isolation. The bug is often what the diff
  *fails* to change — a caller not updated, a migration not written, a doc now false.
- Ask about the **test that is missing**, not just the code that is present.
- Do not review the person. "This function does X when Y" — never "you always".
- If the design is wrong, say so early and at the design level. Do not line-edit a doomed approach.

## Receiving review

- Technical rigour, not performative agreement. **Verify the claim before implementing the
  suggestion.** Reviewers are wrong regularly; implementing a wrong suggestion is your defect now.
- If a finding is incorrect, say so with evidence — the reproduction that does not reproduce.
- If a finding is unclear, ask. Guessing wastes a round trip.
- Push back on scope creep in review the same way you would in a ticket. "Good idea, separate PR"
  is a complete answer.
- Every BLOCKER and MAJOR gets resolved or explicitly waived with a reason. Silence is not resolution.

## PR hygiene that makes review possible

- **One logical change per PR.** Mixed refactor + behaviour change is unreviewable — the behaviour
  change hides in the noise. Split them, refactor first.
- Under ~400 lines of substantive diff. Beyond that, defect detection falls off a cliff.
- Mechanical changes (rename, format, codemod) go in their own commit, flagged as mechanical.
- The description states: what changed, why, how it was verified, and how to roll back.
