# Rule: API and Interface Design

## Contract first

Design the interface before the implementation. The contract is the expensive, hard-to-change part —
implementations get rewritten, published interfaces live for years.

Every operation states: inputs and their validity, outputs, error cases with codes, whether it is
**idempotent**, whether it is **safe** (no side effects), latency expectation, and rate limit.

Model **resources and state transitions**, not internal functions. An API that mirrors your service's
private call graph leaks your architecture and locks you out of changing it.

## Compatibility

Additive changes only, on anything published:

- **Safe:** new optional field, new endpoint, new enum value *if clients are documented to tolerate
  unknowns*, relaxing a validation.
- **Breaking:** removing or renaming a field, changing a type, making an optional field required,
  tightening validation, changing an error code, changing default behaviour, changing pagination
  semantics.

Breaking changes require a new version, a deprecation window with a stated end date, and telemetry on
old-version usage so you know when it is actually safe to remove. Announce, then measure, then remove.

**Be conservative in what you send, liberal in what you accept.** Ignore unknown fields on input; do
not depend on field order; never rely on an undocumented behaviour of a dependency.

## Errors

Machine-readable and stable: a `code` clients can branch on, a `message` for humans, a `request_id`
for support, and — where safe — which field was at fault. Never leak stack traces, SQL, internal
hostnames, or dependency errors to a caller.

Distinguish clearly: **client error** (4xx, do not retry), **transient server error** (503/429, retry
with backoff, honour `Retry-After`), **permanent server error** (500, do not retry, alert).

## Idempotency and concurrency

- Every mutating operation that a client may retry accepts an **idempotency key**, and repeats return
  the original result rather than performing the action twice. Without this, a network timeout on a
  payment becomes a double charge.
- Use optimistic concurrency (`ETag`/`If-Match`, or a version column) for updates. Last-write-wins
  loses data silently.
- Document `at-least-once` vs `exactly-once` honestly. Almost nothing is exactly-once; say
  at-least-once and make consumers idempotent.

## Pagination, filtering, limits

- **Cursor-based pagination** for anything that can change under the reader; offset pagination skips
  and duplicates rows on concurrent writes.
- Every collection endpoint has a **default and maximum page size**. An unbounded list endpoint is a
  denial-of-service waiting for its first large tenant.
- Rate limits are documented, returned in headers, and enforced per-tenant — not globally, or one
  tenant starves the rest.

## Data in the interface

- Timestamps: RFC 3339, UTC, with offset. Always.
- Money: integer minor units plus an explicit currency code. Never a float.
- Enums as strings, not ordinals — ordinals break when someone inserts a value.
- IDs opaque to the client. Never expose a sequential primary key that leaks volume or allows
  enumeration.
- Nullable means something. Distinguish "absent" from "explicitly null" in `PATCH` semantics, and
  document which you use.

## Events and async interfaces

Same rigour: a schema in a registry, versioned, additive-only, with a documented compatibility mode.
Events carry an ID, a type, a timestamp, a version, and a correlation ID. Consumers are idempotent by
key because delivery is at-least-once. Define the ordering guarantee (per-partition, usually) and the
retention window. A poison-message path and a dead-letter queue are part of the design, not an
afterthought.

## Internal interfaces deserve most of this too

Module and package boundaries inside a codebase are contracts with a shorter deprecation cycle, not
an absence of one. Keep the public surface minimal — everything exported is something you have
promised. Depend on interfaces you own; wrap third-party types at the boundary so a vendor change is
a one-file change.
