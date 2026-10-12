---
name: validator-false-positives
description: Adversarial validators raise false blockers; reproduce every flagged blocker empirically before acting on it.
metadata:
  type: feedback
---

Two real cases from prior engagements, both of which would have caused wasted work if trusted:

1. A validator twice flagged **valid `PARSE_JSON()` usage** as a blocker.
2. A validator inferred a **25-hour data-pipeline lag from `MAX(START_TIME)`** when the actual cause was a
   service that had been **deliberately shut down**. A stopped service and a lagging view produce an
   identical signal.

**Why:** trusting the validator is the mirror-image failure of not validating at all. Escalating an
unconfirmed blocker spends the same credibility as shipping an unvalidated change, and it sends people
chasing a defect that does not exist.

**How to apply:** on any flagged blocker, reproduce it yourself first — a throwaway round-trip, a real
build, the actual query. If it does not reproduce, record it as a validator false positive and continue.
Specifically: never infer a pipeline lag from `MAX(START_TIME)` alone, and always distinguish **absence**
from **zero** from **deliberate stoppage** before reporting a cause. See
[[adversarial-validation-mandate]].
