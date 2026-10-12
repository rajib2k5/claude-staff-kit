---
name: staff-design
description: Run a staff-level design process for a feature or subsystem — constraints, non-goals, two or three real alternatives, a recommendation, failure modes, and an incremental migration path. Use before building anything non-trivial. Triggers - design this, architecture for, how should we build, system design, technical design doc.
---

# Staff-level design

Produces a design someone can implement and a decision someone can defend later.

Read `~/.claude/rules/engineering-bar.md` and `api-and-contracts.md` first.

## Procedure

1. **Restate the problem and constraints** as you actually understand them. Name any constraint the
   request implies but did not state — scale, latency, consistency, budget, team size, deadline. Wrong
   assumptions caught here are free; caught in implementation they are a rewrite.
2. **Write the non-goals.** Explicitly. Most design arguments are scope arguments in disguise.
3. **Read the existing system** before proposing: its idioms, its seams, the decisions already made.
   Dispatch `codebase-explorer` (Sonnet) if the surface is wide.
4. **Dispatch `staff-engineer`** (Opus) to produce the options. Require 2–3 *genuinely different*
   approaches — one option plus two strawmen is not a design process.
5. For each option, force these to be stated: how it fails, what it forecloses, what it costs (with a
   unit), and which tier of the irreversibility ladder it lands on.
6. **Recommend one**, with the reason and with what would change your mind.
7. **Design the increments** — expand → migrate → contract. A design with no incremental path is not
   implementable, whatever its merits.
8. **Write the ADR** (see the `staff-adr` skill) so the rejected alternatives survive.

## Required in the output

The seam · failure modes enumerated (null, retried, concurrent, partial, malicious, 100× scale) · source
of truth and what may be stale · blast radius and rollback · the SLI that shows it working · order-of-
magnitude cost with a unit · the interface contract.

## Stop conditions

Say so plainly if the answer is **"do not build this"** or **"the existing thing is adequate"**. That is
a design outcome, not a failure to design. Also stop and ask if a constraint you assumed turns out to be
load-bearing and unverified.
