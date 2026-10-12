---
name: staff-validate
description: Run the mandatory adversarial validation gate — dispatch an Opus validator to break a claim, number, migration, or fix, then empirically confirm any blocker it raises before acting. Use before reporting anything complete, and always for numbers headed to a decision-maker. Triggers - validate this, verify this, double check, is this number right, adversarial validation.
---

# Adversarial validation gate

**The highest-tier rule in this environment.** Read `~/.claude/rules/adversarial-validation.md`.

A validated wrong answer is worse than no answer, because it gets acted on with confidence and the
person who could have caught it has moved on.

## Is validation mandatory here?

Yes, non-negotiably, if any of these hold:

- A **number will reach a human decision** — cost, capacity, performance, savings, a business metric.
- **SQL or dbt will run against production data**, or defines a metric someone reports on.
- **Schema change, migration, or backfill** — tier T3+ on the irreversibility ladder.
- Something is being reported as **"fixed"** without the original failure having been reproduced first.
- **Concurrency, transactions, retries, or idempotency** are involved.
- **Timezone, date-boundary, or currency arithmetic** is involved.
- The change is **security-relevant**.

## Procedure

1. **Write down the claims** to be validated, one per line, each falsifiable. A vague claim cannot be
   validated — "performance improved" is not a claim, "p99 dropped from 820 ms to 310 ms over the 14:00–
   15:00 window under 200 rps" is.
2. **Dispatch `adversarial-validator`** — always Opus, never downgraded. A weaker validator confirms
   plausible arithmetic, manufacturing exactly the false confidence this gate exists to prevent.
3. Require the validator to **execute**: compile the SQL, run the build, round-trip a throwaway row,
   re-derive the number by a *different method over a different window*. A verdict with no executed check
   behind it is worthless.
4. Read the verdicts: `CONFIRMED` / `REFUTED` / `PARTIALLY-CORRECT` / `UNVERIFIABLE`, each with the
   measured number beside the claimed number. **No claim may be left unaddressed.**
5. **Reproduce every flagged blocker yourself** before acting on it. Validators produce false positives —
   real examples include valid `PARSE_JSON()` flagged as a blocker, and a 25-hour pipeline lag inferred
   from `MAX(START_TIME)` when the service had been deliberately shut down. If it does not reproduce,
   record it as a validator false positive and continue.
6. Fix what is genuinely refuted. Re-validate the fix.

## Reporting

Measured numbers only, with the window they came from. Anything modelled or extrapolated is labelled as
such. When a check fails, say so **and paste the output**.

Never say "tests pass", "verified", "confirmed", or "faster" without a command executed in this session
behind it.
