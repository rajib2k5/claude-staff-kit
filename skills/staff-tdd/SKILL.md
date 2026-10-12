---
name: staff-tdd
description: Drive a feature or bugfix test-first — reproduce, observe RED, minimal GREEN, then refactor under a green suite. Use before writing implementation code for any feature or fix. Triggers - write tests, TDD, test first, add test coverage, reproduce this bug.
---

# Test-driven implementation

Read `~/.claude/rules/testing.md`.

## The loop — the RED step is mandatory

```
1. RED       write the test. RUN IT. Watch it fail for the RIGHT reason.
2. GREEN     minimal code to pass. RUN IT. Watch it pass.
3. REFACTOR  clean up with the suite green. RUN IT again.
```

A test never observed failing has not been shown to test anything — an assertion-free or
wrongly-targeted test passes silently forever. If the test passes on the first run, it is testing the
wrong thing; find out why before continuing.

## For a bugfix, reproduce first

Write the failing test **that reproduces the reported bug** before touching the implementation. A fix
with no reproduction behind it is a guess, and the regression will return unnoticed. The reproduction
test is the primary deliverable; the fix is secondary.

If you cannot reproduce it, say so and stop — do not "fix" an unreproduced bug and report it fixed.

## Test design

One behaviour per test, named for the behaviour (`refund_fails_when_order_already_refunded`).
Arrange / Act / Assert visible, one logical assertion. Deterministic — inject clocks, seeds, IDs,
timezones; no real `sleep`, no `Date.now()`, no unseeded `random()`. Order-independent and parallel-safe.
Tested through the public interface, not private internals.

Cover in this order: irreversible/money paths → boundaries (0, 1, n, n+1, empty, null, max, negative,
duplicate, unicode) → error paths → concurrency and idempotency → regression → happy path.

Reach for **property-based tests** wherever an invariant exists — round-trip, ordering, idempotency,
commutativity. They find what nobody enumerated. Default to them for parsers, serialisers, money, dates.

## Mocking

Mock the edge, own the core. Mock the payment gateway; never mock your own domain service. Prefer a fake
over a mock, an ephemeral container over a fake, and a contract test against the real dependency for any
critical boundary.

## Forbidden

Changing an assertion or deleting a test to go green. `skip`/`xfail` without a linked issue and an owner.
Reporting the suite as passing without executing it and pasting the output.
