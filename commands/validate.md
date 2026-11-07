---
description: Route a claim, number, migration, or fix to the right validation method and run it (Opus adversarial validator only when routed, never downgraded)
argument-hint: [the claim or artifact to validate]
---

Invoke the `staff-validate` skill.

Target: $ARGUMENTS

Procedure reminders:
- **Step 0 — classify with the router** (`~/.claude/skills/evidence-gated-validation/references/validation-router.md`):
  consequence, oracle, novelty, claim shape; pick every row touched; write
  `route: rows <n> | primary: ... | complement: ... | not-run: ... | stop: ...` at the top of the report.
  Rows 1, 2, 10, 11 stop at Tier 0 or a Sonnet `verifier`; rows 3–4 go to dual-channel EGV; row 5 to the
  pre-registered holdout test.
- Write the claims down first, one per line, each **falsifiable**. "Performance improved" is not a claim.
- Dispatch `adversarial-validator` on **Opus** only when routed (rows 6–9, 12, 13; row-5 procedure claims).
  Never downgrade it — a weak validator manufactures false confidence, which is worse than no validation.
- Require **executed** checks: compile the SQL, run the build, re-derive the number by a different method
  over a different window.
- Label every claim `CONFIRMED` / `REFUTED` / `PARTIALLY-CORRECT` / `UNVERIFIABLE`. Leave none unaddressed.
- **Reproduce any flagged blocker yourself** before acting on it. Validators produce false positives.
