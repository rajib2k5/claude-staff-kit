# Rule: Testing

## The test is the specification

Write the test first when the behaviour is specifiable — it forces the interface to be usable and
proves the test can actually fail. The sequence is **RED → GREEN → REFACTOR**, and the RED step is
mandatory: a test never observed failing has not been shown to test anything.

Before fixing any bug: **reproduce it in a failing test.** A fix without a reproduction is a guess,
and the regression will return unnoticed. This is not optional for bug work.

## Shape of the suite

| Layer | Proportion | Scope | Speed |
|---|---|---|---|
| **Unit** | most | one unit, no I/O, no clock, no network | microseconds; run on every save |
| **Integration** | some | real DB / real HTTP / real queue, ephemeral | seconds; run pre-push |
| **End-to-end** | few | critical user journeys only | minutes; run in CI |
| **Contract** | per boundary | the shape each side promises | seconds |

Inverted pyramids are slow, flaky, and give poor localisation — a failing E2E test tells you
something is broken, not what.

## What makes a test good

- **One behaviour per test**, named for the behaviour: `refund_fails_when_order_already_refunded`.
  Not `test_refund_2`.
- **Arrange / Act / Assert**, visible. One logical assertion — a test with eight unrelated asserts
  hides seven results behind the first failure.
- **Deterministic.** Inject clocks, seeds, IDs, and timezones. `Date.now()`, `random()`, and real
  `sleep` in a test are flake generators.
- **Independent and order-free.** No shared mutable fixture, no dependence on a sibling test having
  run. Parallel-safe by construction.
- **Tests behaviour through the public interface**, not private internals. A test that breaks on
  every refactor is a maintenance tax that teaches the team to distrust the suite.
- **Failure message is diagnostic.** `assert result == expected` with rich diffs beats
  `assert flag is True`.

## Mocking

Mock the **edge**, own the **core**. Mock the payment gateway; do not mock your own domain service.

Every mock is an assumption that the real thing behaves as you imagine — mocks that drift from
reality produce green suites over broken systems. Prefer fakes (an in-memory implementation of the
real interface) over mocks, real ephemeral infrastructure (containers) over fakes, and verify
critical boundaries with **contract tests** run against the real dependency.

Never assert on mock call counts as a substitute for asserting on outcomes.

## What to test, ranked

1. **The money paths** — auth, permissions, payment, data deletion, anything irreversible.
2. **Boundaries** — 0, 1, n, n+1, empty, null, max, negative, unicode, duplicate.
3. **Error paths** — the untested `catch` block is where outages live.
4. **Concurrency and idempotency** — the same request twice, two writers, retried after timeout.
5. **Regressions** — every fixed bug leaves a permanent test behind.
6. Happy path. Necessary, and the least informative.

Property-based testing where an invariant exists (round-trip encode/decode, sort ordering,
idempotency, commutativity) finds the cases nobody enumerated. Prefer it for parsers, serialisers,
and arithmetic.

## Coverage

Coverage measures **execution, not verification** — a test that runs a line and asserts nothing
counts identically to one that checks it. Use it to find *untested* code, never as a target to hit.
Chasing a number produces assertion-free tests written to satisfy the metric.

Judge instead: are the branches that matter exercised, and would a mutation survive? Run a mutation
testing pass on genuinely critical modules — surviving mutants are the honest signal.

## Flakes

A flaky test is a **failing test**. Two allowed responses: fix it, or delete it. Retrying it in CI is
forbidden — `--retries` converts a real intermittent bug into invisible noise and destroys trust in
the suite.

## Absolutely forbidden

- Changing an assertion or deleting a test to make the suite green.
- `skip`/`xfail`/`@Ignore` without a linked issue and an owner.
- Claiming tests pass without having executed them in this session — paste the output. See
  `adversarial-validation.md`.
- Committing a test that has only ever been observed passing.
