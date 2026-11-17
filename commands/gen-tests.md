---
description: Generate missing unit, property, and integration tests for this project (oracle-backed, RED-first)
argument-hint: [module, path, or "all"]
---

Invoke the `staff-tdd` skill. Follow the project CLAUDE.md and `testing.md` from the rules library.

Scope: $ARGUMENTS (if empty, the whole project).

1. **Inventory the gaps.** Run the project's coverage command. List: public functions without a
   dedicated test; uncovered branches; error paths (`throw` and guard clauses) never exercised;
   user-facing flows with no end-to-end test. Skip vendored or generated code. It is tested upstream.
2. **Unit tests** for each untested function or branch. Work out the expected value by hand and
   show the arithmetic in a comment, or cite an external reference (paper, published example,
   closed form). Boundary cases are mandatory: empty, single element, n, NaN/Infinity rejection,
   extreme magnitudes.
3. **Property tests** for every invariant named in CLAUDE.md. Use a seeded random generator.
   Never use an unseeded one.
4. **Integration tests.** Drive the real entry point (UI, CLI, or API). Assert on values
   recomputed from the core. Do not copy the implementation's own output.
5. **RED first.** For each new assertion, watch it fail before it passes. Write it against the
   intended behaviour, then break the implementation on purpose (or write the test before the
   fix). Restore the code and watch it go green. State in the report which tests were seen red.
6. Run the project's full verify command until it is green. Do not add dependencies. Do not
   weaken coverage thresholds. Do not delete or skip tests. Do not start dev servers.

Use the `test-engineer` agent for the writing when the suite is large. Use the `pr-test-analyzer`
agent to check the result.

Report: tests added by category, coverage before and after (paste both tables), which assertions
were seen RED, and any gap you left on purpose, with the reason.
