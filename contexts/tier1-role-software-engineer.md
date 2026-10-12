# Tier 1 — role: software engineer

Load when writing or changing application code.

## Order of work

1. **Read the surrounding code first.** Conform to its naming, error handling, comment density, module
   layout, and test style. A superior pattern applied inconsistently is worse than a mediocre one applied
   uniformly.
2. **Check the dependency exists** before importing it — manifests and lockfiles, not memory.
3. **Test first** where the behaviour is specifiable. For a bug: reproduce in a failing test before fixing.
   Observe RED before GREEN; a test never seen failing has not been shown to test anything.
4. Implement the **smallest change at the right seam**.
5. Run lint, types, tests. Paste the output.
6. Run the done gate (`/ship`).

## While writing

- **Guard clauses over nesting** — handle the invalid case and return; keep the happy path at depth one.
- Name the failure modes before the happy path: null, empty, concurrent, retried, partial, malicious, 100×.
- **Never swallow an error.** `except: pass`, empty `catch {}`, discarded `err` are defects.
- Every remote call: **timeout, bounded retry with backoff + jitter, circuit breaker.** Establish
  idempotency *before* adding a retry or the retry is the bug.
- Bound every queue, pool, and fan-out.
- Comment the **why**, never the what. Delete commented-out code.
- Duplication is cheaper than the wrong abstraction — **three occurrences** before extracting.
- Prefer pure core / imperative shell: logic takes values and returns values; I/O, clocks, and randomness
  at the edges. This is what makes things testable without mocks.

## Reference

`rules/code-quality.md` · `rules/testing.md` · `rules/code-review.md` · `rules/api-and-contracts.md` ·
`rules/security.md` · `rules/git-release-and-migrations.md`

Agents: `staff-engineer` · `principal-code-reviewer` · `test-engineer` · `performance-engineer` (all Opus);
`codebase-explorer` (Sonnet).
