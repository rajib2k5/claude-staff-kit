---
description: Multi-lens staff review of a diff or PR — correctness, security, data integrity, silent failure, rollback
argument-hint: [PR number, branch, or path — defaults to the working diff]
---

Invoke the `staff-review` skill.

Target: $ARGUMENTS  (if empty, review the current working diff — establish the base explicitly first)

Dispatch in **one message** so they run in parallel, with explicit models:
- `principal-code-reviewer` (Opus) — correctness, data integrity, silent failure, rollback
- `security-auditor` (Opus) — only if the diff touches auth, input handling, secrets, or PII
- `test-engineer` (Opus) — the test that is missing and would have caught this
- `codebase-explorer` (Sonnet) — every call site of anything whose signature or semantics changed

Then **verify each BLOCKER and MAJOR yourself before reporting it**. Subagent findings are evidence, not
verdicts. A confidently wrong BLOCKER costs more trust than a missed MINOR.

Label every finding by severity with a concrete failure scenario. Rank most-severe first.
