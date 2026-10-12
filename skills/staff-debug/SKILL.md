---
name: staff-debug
description: Root-cause a bug systematically — reproduce, bisect the change, form one hypothesis at a time, and prove the cause before fixing. Use for any bug, test failure, or unexplained behaviour, before proposing a fix. Triggers - debug this, why is this failing, root cause, this is broken, unexpected behaviour.
---

# Systematic debugging

The goal is the **cause**, not a change that makes the symptom go away. A symptom suppressed without a
cause identified will return, usually worse and further from the person who understood it.

## Procedure

1. **Reproduce it.** Deterministically if possible; if it is intermittent, find the conditions that raise
   the rate. **An unreproduced bug cannot be verified fixed** — say so rather than guessing.
   Capture the exact error text, not a paraphrase of it.
2. **Write the reproduction as a failing test** (see `staff-tdd`). This is what proves the fix and
   prevents the regression.
3. **Establish the timeline.** When did it last work? What changed between — a deploy, a dependency
   bump, a config or credential change, a data volume shift, an upstream vendor change? Most bugs are a
   change, and the change is often not where the symptom is.
4. **Bisect.** Over commits (`git bisect`), over inputs, over the pipeline, or over the config surface.
   Halving beats reading.
5. **One hypothesis at a time**, stated before you test it, with the observation that would falsify it.
   Change one variable. Report the result. Accumulating speculative fixes makes the system unanalysable
   and you will not know which one worked.
6. **Prove the cause** before fixing: you can explain the mechanism, and you can make the bug appear and
   disappear on demand by toggling that mechanism.
7. **Fix the cause.** Then check for the same class of bug elsewhere — the pattern usually repeats.
8. **Add the detector** that should have caught this: a test, an assertion, a log, an alert.

## Traps

- **Absence vs zero vs stoppage.** No rows, no result, and no service look identical and have different
  causes. Establish which before diagnosing.
- **Correlation as cause.** A correlated deploy is a lead, not a conclusion.
- **The restart that worked.** That is not a diagnosis. Say plainly that service was restored without the
  cause being found, if that is what happened.
- **Heisenbugs.** Adding logging changed the timing — suspect a race, not magic.
- **The error is not where the exception is raised.** It is usually where the bad value was created.
- **Suppression disguised as a fix**: `try/except: pass`, a widened type, a loosened assertion, a
  `-Wno-error`. These are defects, not fixes.

## Report

The reproduction, the mechanism (why it happens, not just where), the evidence that proves it, the fix,
the test that now covers it, and the detector added. If you could not find the cause, say that — with
what you ruled out and how.
