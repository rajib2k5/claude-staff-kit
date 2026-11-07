---
name: adversarial-validation-mandate
description: The conditions under which adversarial validation is compulsory, and why it outranks speed and tidiness.
metadata:
  type: feedback
---

Validation is **mandatory**, not discretionary, on every substantive change; the **method** is picked by
`~/.claude/skills/evidence-gated-validation/references/validation-router.md` (consequence, oracle,
novelty, claim shape), never by reflex. The adversarial method is routed when any of these hold: a
number will reach a human decision · SQL or dbt will run against production data or defines a reported
metric · a schema change, migration, or backfill (tier T3+) · something is being reported "fixed" without
the original failure having been reproduced · new concurrency, transactions, retries, or idempotency code
· timezone, date-boundary, or currency arithmetic · the change is security-relevant (rows 6–9, 12, 13).
Trivial edits, routine code under tests and prose (rows 1, 2, 10) stop at the gates — row 2 adds one hand mutant per new or changed test — or a Sonnet verifier, unless another row also applies; API-existence
and unfamiliar-library claims go to dual-channel EGV; a quant research claim goes to a pre-registered
holdout test with the adversarial pass on its procedure only.

Validation means an **independent attempt to break the claim**, executed, by a different route than the
one that produced it. Re-running the author's script and observing that it agrees with itself proves only
that the script is deterministic.

**Why:** a validated wrong answer is worse than no answer. It gets acted on with confidence, and by the
time it surfaces the person who had the context has moved on. This is why the rule outranks speed and the
desire to report success.

**How to apply:** run the `staff-validate` skill or `/validate`: classify with the router, write the route
line, then dispatch `adversarial-validator` on Opus only when routed.
Require executed checks and per-claim verdicts (`CONFIRMED` / `REFUTED` / `PARTIALLY-CORRECT` /
`UNVERIFIABLE`) with the measured number beside the claimed one — no claim left unaddressed. Then apply
[[validator-false-positives]] before acting on anything it flags. See
`~/.claude/rules/adversarial-validation.md` (installed at `~/.claude/rules/` in dotfiles mode).
