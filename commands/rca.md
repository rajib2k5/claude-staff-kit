---
description: Root-cause a bug or failure systematically — reproduce, bisect, one hypothesis at a time, prove the cause
argument-hint: [the symptom, error, or failing test]
---

Invoke the `staff-debug` skill.

Symptom: $ARGUMENTS

Discipline:
- **Reproduce first.** An unreproduced bug cannot be verified fixed — say so rather than guessing.
- Write the reproduction as a **failing test** before fixing.
- Establish what **changed** — most bugs are a change, and often not where the symptom appears.
- **One hypothesis at a time**, stated with its falsifying observation. Do not accumulate speculative fixes.
- Prove the mechanism: you can make the bug appear and disappear on demand.
- Distinguish **absence vs zero vs stoppage** — they look identical and have different causes.
- A restart that worked is **not** a diagnosis. Say so if that is what happened.

Finish with the fix, the test that now covers it, and the detector that should have caught it.
