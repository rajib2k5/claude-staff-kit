---
name: staff-validate
description: Route a claim, number, migration or fix to the right validation method (validation router), then run it — an Opus validator when routed, never downgraded; deterministic gates plus a Sonnet verifier when that is the route — and empirically confirm any blocker before acting. Use before reporting anything complete, and always for numbers headed to a decision-maker. Triggers - validate this, verify this, double check, is this number right, adversarial validation.
---

# Validation gate — route first, then run the method

**Validation is mandatory; the method is routed.** Read
`~/.claude/skills/evidence-gated-validation/references/validation-router.md` first; then
`rules/adversarial-validation.md` in claude-staff-kit (installed at `~/.claude/rules/` in dotfiles mode)
when the route includes the adversarial method.

A validated wrong answer is worse than no answer, because it gets acted on with confidence and the
person who could have caught it has moved on.

## Is validation mandatory here?

Yes, non-negotiably, if any of these hold. The router row names the method; the adversarial
validator runs only where the row says so (rows 6–9, 12, 13; row-5 procedure claims).

- A **number will reach a human decision** — cost, capacity, performance, savings, a business metric.
  → row 6: verifier re-measures every figure **and** adversarial re-derives by a different method;
  human sign-off when the decision is spend or stake. A research number runs row 5 first.
- **SQL or dbt will run against production data**, or defines a metric someone reports on.
  → row 7: compile/run/`dbt test` gates, then adversarial executing a different query
  (absence-vs-zero, date boundary).
- **Schema change, migration, or backfill** — tier T3+ on the irreversibility ladder.
  → row 8: `destructive-ops-guard`, prod-scale dry run, rehearsed rollback, adversarial on the
  plan, human yes in chat.
- Something is being reported as **"fixed"** without the original failure having been reproduced first.
  → row 12: reproduce RED first, mutant-check the new test; adversarial when T2+.
- **Concurrency, transactions, retries, or idempotency** are involved.
  → row 13: gates, then adversarial constructing the interleaving (the class where wrong looks
  identical to right until load arrives); row 12 when it is reported as fixed.
- **Timezone, date-boundary, or currency arithmetic** is involved.
  → row 13: adversarial constructing the boundary input; row 7 when it is SQL, row 12 when it is a fix.
- The change is **security-relevant**.
  → row 9: SAST/secret gates, then adversarial constructing the exploit input.

Not this gate: rows 1, 2, 10 and 11 (trivial edits, routine code under tests with a mutant
check, docs, config lint) stop at Tier 0 or a Sonnet `verifier`; rows 3 and 4 (API-existence,
unfamiliar libraries, ML pipeline code) go to dual-channel EGV; row 5 (a quant research claim,
"A beats B" on per-date metrics) goes to the pre-registered holdout test in
`references/complementary-methods.md`, with the adversarial method on its procedure claims only.

## Procedure

0. **Classify with the router and write the route line.** Answer consequence (T0–T4), oracle
   (deterministic / partial / statistical / none), novelty and claim shape; pick every row the change
   touches; put `route: rows <n> | primary: ... | complement: ... | not-run: ... | stop: ...` at the top
   of the report. If the row stops at Tier 0 or the verifier, say so and do not dispatch Opus.
1. **Write down the claims** to be validated, one per line, each falsifiable. A vague claim cannot be
   validated — "performance improved" is not a claim, "p99 dropped from 820 ms to 310 ms over the 14:00–
   15:00 window under 200 rps" is.
2. **Dispatch the primary the router chose.** When it is `adversarial-validator` (installed here as
   `adversarial-reviewer`), it is always Opus, never downgraded. A weaker validator confirms plausible
   arithmetic, manufacturing exactly the false confidence this gate exists to prevent.
3. Require the validator to **execute**: compile the SQL, run the build, round-trip a throwaway row,
   re-derive the number by a *different method over a different window*. A verdict with no executed check
   behind it is worthless. For a quant research claim (row 5) the executed check is the pre-registered
   holdout with block-resampled, multiplicity-corrected inference (`~/.claude/skills/evidence-gated-validation/references/complementary-methods.md` §4–5); the validator
   attacks the procedure (holdout sealed, k honest, proxy labelled, block length measured), not the
   value — a different window is not independence on an autocorrelated series.
4. Read the verdicts: `CONFIRMED` / `REFUTED` / `PARTIALLY-CORRECT` / `UNVERIFIABLE`, each with the
   measured number beside the claimed number. **No claim may be left unaddressed.**
5. **Reproduce every flagged blocker yourself** before acting on it. Validators produce false positives —
   real examples include valid `PARSE_JSON()` flagged as a blocker, and a 25-hour pipeline lag inferred
   from `MAX(START_TIME)` when the service had been deliberately shut down. If it does not reproduce,
   record it as a validator false positive and continue.
6. Fix what is genuinely refuted. Re-validate the fix.

## Reporting

The route line comes first; a report without one is not done. Measured numbers only, with the window
they came from. Anything modelled or extrapolated is labelled as
such. When a check fails, say so **and paste the output**.

Never say "tests pass", "verified", "confirmed", or "faster" without a command executed in this session
behind it.
