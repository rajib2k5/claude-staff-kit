# Rule: Adversarial Validation — HIGHEST TIER

> This is the top-priority rule in this environment. It outranks speed, tidiness, and the desire to
> report success. **A validated wrong answer is worse than no answer**, because it is acted on with
> confidence and the person who could have caught it has moved on.

## Principle

Confirmation is not validation. Re-running the author's script and observing that it agrees with
itself proves only that the script is deterministic. Validation means an **independent attempt to
break the claim**, executed, by a different route than the one that produced it.

## When validation is MANDATORY

Non-negotiable for any of:

- **Numbers destined for a human decision** — cost models, capacity plans, performance figures,
  savings estimates, row counts, revenue/metric definitions.
- **SQL or dbt that will run against production data**, or that defines a metric someone reports on.
- **Schema changes, migrations, backfills** — anything on tier T3+ of the irreversibility ladder.
- **Anything reported as "fixed"** where the original failure was not reproduced first.
- **Concurrency, transactions, retries, idempotency** — the class where wrong looks identical to
  right until load arrives.
- **Timezone, date-boundary, and currency arithmetic** — silently wrong, universally trusted.
- **Security-relevant changes** — authz checks, secret handling, input trust boundaries.

Optional (judgement) for: pure refactors under green tests, docs, formatting, single-file additive
tests.

## How validation runs

Dispatch the `adversarial-validator` subagent. **Always Opus — never downgrade it.** A weaker
validator confirms plausible arithmetic, which manufactures exactly the false confidence this rule
exists to prevent. See `agent-models.md`.

The validator's contract:

1. **Execute, do not read.** Compile the SQL. Run the build. Round-trip a throwaway row. A verdict
   with no executed check behind it is worthless.
2. **Re-derive independently.** Different query, different window, different method. Then compare
   the two numbers side by side.
3. **Test out-of-sample.** A model fitted on Tuesday must be checked on a weekend. A fit that only
   holds where it was fitted is a curve, not a finding.
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
