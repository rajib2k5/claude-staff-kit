---
name: standards-library-layout
description: Where the global engineering standards live in ~/.claude and which tool reads each directory.
metadata:
  type: project
---

The global engineering standards are a single canonical library under `~/.claude`, referenced (never
copied) by individual projects:

- `rules/` — 18 standards files. `rules/README.md` is the index and states the conflict-priority order.
  `adversarial-validation.md` is the highest-tier rule.
- `agents/` — 19 subagents, each declaring an explicit `model:` in frontmatter.
- `skills/staff-*` and `skills/data-*` — 21 invocable workflows in directory form with `SKILL.md`.
- `commands/` — 12 slash-command dispatchers (`/bootstrap`, `/ship`, `/validate`, `/deep-review`,
  `/design`, `/rca`, `/adr`, `/dbt-audit`, `/sf-audit`, `/sf-tune`, `/dq`, `/standards`).
- `contexts/` — tiered context files (tier 0 always, tier 1 per role, tier 2 per domain).
- `memory/` — this directory, indexed by `MEMORY.md`.
- `~/.cortex/` — adapter for the Snowflake Cortex CLI; symlinks into this library rather than duplicating it.

**Why:** duplicating standards into each project or each harness home guarantees drift — a rule gets
fixed in one copy and silently stays wrong in the others, and the divergence is discovered at the worst
possible time.

**How to apply:** when a project needs the standards, run `/bootstrap`, which writes a project
`CLAUDE.md` that *references* `~/.claude/rules/` and records only project-specific facts (commands,
stack, domain invariants). Never copy rule files into a project. See [[cortex-reads-claude-skills]].
