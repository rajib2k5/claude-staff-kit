---
description: Run the adversarial validation gate on a claim, number, migration, or fix (Opus validator, never downgraded)
argument-hint: [the claim or artifact to validate]
---

Invoke the `staff-validate` skill.

Target: $ARGUMENTS

Procedure reminders:
- Write the claims down first, one per line, each **falsifiable**. "Performance improved" is not a claim.
- Dispatch `adversarial-validator` on **Opus**. Never downgrade it — a weak validator manufactures false
  confidence, which is worse than no validation.
- Require **executed** checks: compile the SQL, run the build, re-derive the number by a different method
  over a different window.
- Label every claim `CONFIRMED` / `REFUTED` / `PARTIALLY-CORRECT` / `UNVERIFIABLE`. Leave none unaddressed.
- **Reproduce any flagged blocker yourself** before acting on it. Validators produce false positives.
