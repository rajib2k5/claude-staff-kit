---
name: report-measured-not-estimated
description: Verification language is reserved for commands actually executed this session; measurements are quoted with their window.
metadata:
  type: feedback
---

State measured numbers, never estimates dressed as measurements. Anything modelled, extrapolated, or based
on a single sample is **labelled as such**. Every figure is quoted with the **window it came from**. When a
check fails, say so and paste the output.

Reserved phrasings — forbidden unless a command was actually executed in this session:
"tests pass", "the build is green", "verified", "confirmed working", "this is faster".

Related measurement trap: `SNOWFLAKE.ACCOUNT_USAGE` has up to 45 minutes of latency and 365-day retention
while `INFORMATION_SCHEMA` is real-time but narrow. Comparing a figure from one against the other produces
a fake discrepancy that will consume a real investigation.

**Why:** a confident unmeasured claim is indistinguishable from a measured one to the reader, so it is
acted on identically — and the correction arrives after the decision.

**How to apply:** run the command, keep the output, quote the window. Say explicitly what you did not
verify. `UNVERIFIABLE`, flagged honestly, is more useful than a confident guess. See
[[adversarial-validation-mandate]] and `~/.claude/rules/definition-of-done.md`.
