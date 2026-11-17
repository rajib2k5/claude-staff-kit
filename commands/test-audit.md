---
description: Audit test-suite quality (vacuous assertions, self-agreement, untested error paths, surviving mutants) and fix findings
argument-hint: [module, path, or "all"]
---

Invoke the `staff-tdd` skill. Audit test quality, not coverage, per `testing.md` in the rules library.

Scope: $ARGUMENTS (if empty, the whole project).

Hunt, with file:line evidence:
1. **Assertions that cannot fail.** Examples: "is defined" on a value that is always defined,
   bounds that any number meets, snapshot or golden assertions with no independent oracle.
2. **Self-agreement.** Tests that call the implementation to produce the expected value for that
   same implementation. This proves determinism, not correctness.
3. **Untested error paths.** Every `throw` and guard clause in project code (not vendored code)
   needs a test that asserts the failure and its message.
4. **Missing boundaries.** Functions tested only with mid-range, happy-path inputs.
5. **Mutation spot-check.** Pick the 3 most business-critical functions. For each, introduce one
   plausible bug (off-by-one, flipped comparison, dropped term). Run the suite. Record whether any
   test catches it. Restore the code exactly. A surviving mutant is a finding.

Then FIX the findings. Replace vacuous assertions with oracle-backed ones. Add the missing error
path and boundary tests. Add a killing test for every surviving mutant. Go RED-first where the
assertion is new. End with the project's full verify command green.

Use the `pr-test-analyzer` agent for the hunt and the `test-engineer` agent for the fixes when the
suite is large.

Report: findings by category with file:line, mutants killed and survived (before and after), tests
added or strengthened, coverage delta.
