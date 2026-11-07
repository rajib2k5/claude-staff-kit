# Rule: Adversarial Validation — validation is mandatory, the method is routed

> Validation is mandatory; the method is routed. It outranks speed, tidiness, and the desire to
> report success. **A validated wrong answer is worse than no answer**, because it is acted on with
> confidence and the person who could have caught it has moved on.
>
> This file is the contract for the adversarial **method**. Whether a task gets it is decided by the
> validation router, `~/.claude/skills/evidence-gated-validation/references/validation-router.md`
> (rows 6–9, 12, 13; row-5 procedure claims). A routed holdout test or a falsified runtime probe satisfies
> the principle without a reviewer; a reviewer dispatched where the router says Tier 0 or verifier is
> spend, not validation. Blanket adversarial passes fail both ways: an Opus attack on a rename finds
> nothing, and a reviewer that only reads cannot tell a 0.0009 metric gap from noise.

## Principle

Confirmation is not validation. Re-running the author's script and observing that it agrees with
itself proves only that the script is deterministic. Validation means an **independent attempt to
break the claim**, executed, by a different route than the one that produced it. Every substantive
change is validated; which independent route — Tier 0 gates, a verifier re-measurement, dual-channel
EGV, a pre-registered holdout test, or this adversarial attack — is picked by the router from the
claim's consequence, oracle, novelty and shape, never by reflex.

## When the router selects this method

Rows 6–9, 12 and 13 of the router; in words:

- **Numbers destined for a human decision** — cost models, capacity plans, performance figures,
  savings estimates, row counts, revenue/metric definitions.
- **SQL or dbt that will run against production data**, or that defines a metric someone reports on.
- **Schema changes, migrations, backfills** — anything on tier T3+ of the irreversibility ladder.
- **Anything reported as "fixed"** where the original failure was not reproduced first.
- **Concurrency, transactions, retries, idempotency** (row 13; row 12 when reported fixed) — the
  class where wrong looks identical to right until load arrives; the attack constructs the interleaving.
- **Timezone, date-boundary, and currency arithmetic** (row 13; row 7 in SQL, row 12 as a fix) —
  silently wrong, universally trusted; the attack constructs the boundary input.
- **Security-relevant changes** — authz checks, secret handling, input trust boundaries.

Rows 1, 2, 10 and 11 (trivial edits, routine code under tests with a mutant check, docs, formatting,
config lint) stop at Tier 0 or the verifier. Rows 3 and 4 (API-existence, unfamiliar or
version-sensitive libraries, ML pipeline code) go to dual-channel EGV: reading cannot settle
existence. Row 5 (quant research claims, "A beats B" on per-date metrics) uses this method on
**procedure** claims only — holdout sealed, k honest, metric labelled proxy, block length measured —
because a different window is not independence on an autocorrelated series; the value is settled by
`references/complementary-methods.md` in the evidence-gated-validation skill.

## How validation runs

When routed, dispatch the `adversarial-validator` subagent. **Always Opus — never downgrade it.** A weaker
validator confirms plausible arithmetic, which manufactures exactly the false confidence this rule
exists to prevent. See `agent-models.md`.

The validator's contract:

1. **Execute, do not read.** Compile the SQL. Run the build. Round-trip a throwaway row. A verdict
   with no executed check behind it is worthless.
2. **Re-derive independently.** Different query, different window, different method. Then compare
   the two numbers side by side.
3. **Test out-of-sample.** A model fitted on Tuesday must be checked on a weekend. A fit that only
   holds where it was fitted is a curve, not a finding. For an autocorrelated per-period series a
   different window is not independence; the check is the pre-registered holdout with block
   sign-flip and corrected p (`~/.claude/skills/evidence-gated-validation/references/complementary-methods.md` §4–5), and the attack is on that procedure, not the value.
4. **Attack the premise, not the arithmetic.** Most real errors are upstream: wrong window, wrong
   day boundary, stale rate, `absent rows == 0`, a sample of one presented as a trend.
5. **Separate absence from zero.** "No rows" and "no cost" look the same and are not. Nor are "the
   service stopped" and "the view lagged".
6. **Cite primary sources** for mechanism claims — official docs with URLs, not recollection.

## Verdict format

Every claim gets a label, and **no claim is left unaddressed**:

- **CONFIRMED** — independently reproduced. State the measured number beside the claimed number.
- **REFUTED** — with the correct value and the evidence.
- **PARTIALLY-CORRECT** — true in the tested regime, not in general. State the boundary.
- **UNVERIFIABLE** — could not be checked. State *why*, and what would falsify it.

`UNVERIFIABLE`, flagged honestly, is more valuable than a confident guess. Do not manufacture
findings to look thorough — if the work is sound, saying so **per claim** is the finding.

## Validators are also wrong — the second failure mode

Do **not** act on a flagged blocker until it is empirically confirmed. Observed false positives from
real engagements:

- A validator twice flagged valid `PARSE_JSON()` usage as a blocker.
- A validator inferred a 25-hour pipeline lag from `MAX(START_TIME)` when the real cause was a
  service that had been deliberately shut down.

Protocol on a flagged blocker: **reproduce it yourself** with a throwaway round-trip or a real
build. If it does not reproduce, record it as a validator false positive and continue. Escalating an
unconfirmed blocker wastes the same trust as shipping an unvalidated change.

## Reporting

State measured numbers, never estimates dressed as measurements. Label anything modelled,
extrapolated, or based on a single sample. Quote the time window the number came from. When a check
fails, say so **and paste the output**.

Forbidden phrasings unless a command was actually executed this session:
"tests pass", "the build is green", "this is faster", "verified", "confirmed working".
