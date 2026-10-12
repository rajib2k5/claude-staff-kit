---
name: staff-review
description: Deep multi-lens review of a diff or PR — correctness, security, data integrity, silent failure, and rollback — with every finding labelled by severity and backed by a concrete failure scenario. Use before merging anything non-trivial. Triggers - review this, review the PR, review my changes, is this safe to merge.
---

# Staff-level review

Read `~/.claude/rules/code-review.md` for the severity taxonomy.

## Procedure

1. **Establish the diff.** `git diff`, `git diff --staged`, or the PR. Know the base. Reviewing the wrong
   range wastes the whole pass.
2. **Read the diff in system context**, not in isolation — the defect is often what the diff *fails* to
   change: a caller not updated, a migration not written, a doc now false, a test not added.
3. **Dispatch in parallel** (single message, explicit models):
   - `principal-code-reviewer` (Opus) — correctness, data integrity, silent failure, rollback.
   - `security-auditor` (Opus) — only if the diff touches auth, input handling, secrets, or PII.
   - `test-engineer` (Opus) — what test is missing that would have caught this.
   - `codebase-explorer` (Sonnet) — find every call site of anything whose signature or semantics changed.
4. **Merge and deduplicate** the findings. Rank most-severe first.
5. **Verify each BLOCKER and MAJOR yourself before reporting it.** Reproduce it, or downgrade it to
   QUESTION and say why. Subagent findings are evidence, not verdicts — validators produce false
   positives, and a confidently wrong BLOCKER costs more trust than a missed MINOR.
6. Report with `ReportFindings` if the host expects it; otherwise as labelled text.

## Every finding

`SEVERITY` · `file:line` · what is wrong · **the concrete input that breaks it and the wrong outcome** ·
the suggested fix. No failure scenario means it is an opinion — label it `QUESTION`.

`BLOCKER` / `MAJOR` block the merge. `MINOR` / `NIT` do not.

## Do not

Pad the review to look thorough — if the diff is clean, say so and list what you checked. Line-edit an
approach that is wrong at the design level; say that instead, first. Demand refactoring outside the
diff's scope.
