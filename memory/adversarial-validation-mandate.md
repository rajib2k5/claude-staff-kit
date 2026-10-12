---
name: adversarial-validation-mandate
description: The conditions under which adversarial validation is compulsory, and why it outranks speed and tidiness.
metadata:
  type: feedback
---

Validation is **mandatory**, not discretionary, when any of these hold: a number will reach a human
decision · SQL or dbt will run against production data or defines a reported metric · a schema change,
migration, or backfill (tier T3+) · something is being reported "fixed" without the original failure
having been reproduced · concurrency, transactions, retries, or idempotency are involved · timezone,
date-boundary, or currency arithmetic · the change is security-relevant.

Validation means an **independent attempt to break the claim**, executed, by a different route than the
one that produced it. Re-running the author's script and observing that it agrees with itself proves only
that the script is deterministic.

**Why:** a validated wrong answer is worse than no answer. It gets acted on with confidence, and by the
time it surfaces the person who had the context has moved on. This is why the rule outranks speed and the
desire to report success.

**How to apply:** run the `staff-validate` skill or `/validate`. Dispatch `adversarial-validator` on Opus.
Require executed checks and per-claim verdicts (`CONFIRMED` / `REFUTED` / `PARTIALLY-CORRECT` /
`UNVERIFIABLE`) with the measured number beside the claimed one — no claim left unaddressed. Then apply
[[validator-false-positives]] before acting on anything it flags. See
`~/.claude/rules/adversarial-validation.md`.
