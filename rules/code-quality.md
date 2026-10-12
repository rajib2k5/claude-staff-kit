# Rule: Code Quality

## Match the codebase before improving it

Read the surrounding code first. Naming, error-handling idiom, comment density, module layout,
test style — **conform**. A technically superior pattern applied inconsistently makes a codebase
harder to reason about than a mediocre pattern applied uniformly. Change idiom only as a deliberate,
separately-reviewed migration, never as a side effect.

Never introduce a library, framework, or dependency without checking it is already in use
(`package.json`, `pyproject.toml`, `go.mod`, lockfiles, existing imports).

## Naming

- Names state **what a thing is or does**, not its type or its history. `retryBudget`, not
  `intVal2`, not `newHandler`.
- Booleans read as assertions: `isExpired`, `hasQuota`, `shouldRetry`.
- Units and currency belong in the name: `timeoutMs`, `sizeBytes`, `priceUsdCents`.
- The scope-length rule: a 3-line closure may use `i`; a module-level export may not.
- Do not encode "new"/"v2"/"tmp"/"final" in a permanent name. That names a moment, not a concept.

## Functions and structure

- One reason to change per unit. If the summary needs "and", it is two functions.
- **Guard clauses over nesting.** Handle the invalid case and return; keep the happy path at
  indentation depth one.
- Cyclomatic complexity above ~10 is a smell, above ~15 is a defect waiting to happen. Extract.
- Prefer **pure core, imperative shell**: logic in functions that take values and return values;
  I/O, clocks, randomness, and network at the edges. This is what makes a thing testable without
  mocks.
- Argument lists past ~4 want a struct/dataclass. Boolean parameters at a call site are unreadable —
  use an enum or two functions.
- Duplication is cheaper than the wrong abstraction. **Three occurrences** before extracting, and
  only if they change together for the same reason.

## Error handling

- Never swallow. `except: pass`, empty `catch {}`, and discarded `err` are defects, not style.
- Fail fast and loudly at the boundary; degrade gracefully in the interior only where a documented
  fallback exists.
- Errors carry **context and identity**: what operation, on what entity, with what inputs (never
  secrets), and whether it is retryable.
- Distinguish the four classes and handle them differently: **invalid input** (4xx, do not retry),
  **transient** (retry with backoff + jitter + cap), **permanent remote failure** (fail, alert),
  **programmer error** (crash — do not paper over an invariant violation).
- Retries without idempotency create duplicates. Establish idempotency *before* adding a retry.

## Comments

Comment the **why**, never the what. The code states what it does; only a human can state why it
does it that way.

Worth a comment: a non-obvious invariant, a workaround with a ticket/issue link, a deliberate
performance tradeoff, an ordering dependency, a citation for a formula or spec.

Not worth a comment: `// increment i`, a restatement of the signature, commented-out code (delete
it — that is what version control is for), or a changelog in a header.

## Types and interfaces

- Make illegal states unrepresentable. A parsed value beats a validated one; a sum type beats a
  bag of optional fields.
- Narrow types at the boundary, then trust them inside. Do not re-validate in the interior.
- `any`, `interface{}`, `Object`, and bare `dict` at a module boundary are unfinished work.
- Never widen a public type to make a caller compile. Fix the caller or version the interface.

## Dependency hygiene

- Every dependency is a permanent liability: supply chain, CVEs, upgrade tax, transitive bloat.
- For anything under ~50 lines with no edge cases, write it.
- Prefer the standard library. Prefer one well-maintained dependency over three narrow ones.
- Pin and lock. Reproducible builds are non-negotiable.
- Check licence compatibility before adding.

## Concurrency

- Shared mutable state is the source of nearly every concurrency bug. Prefer message passing,
  immutability, or a single owner.
- Every lock acquisition documents its ordering. Consistent global order or no ordering discipline
  at all — the second is a deadlock.
- No unbounded queues, no unbounded goroutine/task spawning, no unbounded fan-out. Everything gets
  a ceiling and a backpressure story.
- Every remote call has a **timeout, a retry policy, and a circuit breaker**. A missing timeout is
  the most common cause of cascading outage.
