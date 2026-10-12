---
name: staff-bootstrap
description: Install the global engineering standards into a new or existing project — writes a project CLAUDE.md that inherits the rules library, sets up the agent roster, quality gates, and CI checks. Use when starting a new project, or when an existing repo has no standards wiring. Triggers - new project, bootstrap project, set up standards, wire up rules, onboard repo to standards.
---

# Bootstrap a project onto the global standards

Installs the shared standards into a project so every session in it inherits the same bar, without
copying the rules (which would fork them).

## Step 1 — detect, do not assume

Establish before writing anything:

- Language(s) and package manager (from manifests, not from file extensions alone).
- Test runner and the **exact command** to run the suite.
- Lint/format/type-check commands.
- Whether it is a data project: `dbt_project.yml`, `profiles.yml`, warehouse connection, orchestrator.
- CI system in use, and whether it currently gates anything.
- Existing `CLAUDE.md` / `AGENTS.md` — **read it; never overwrite it.** Merge additively.

Report what you found before proceeding. A bootstrap based on a wrong stack guess is worse than none.

## Step 2 — write the project `CLAUDE.md`

Reference the global library rather than duplicating it. Only project-specific facts go in the project
file:

```markdown
# <Project> — engineering instructions

Inherits the global standards in `~/.claude/rules/`. Read `~/.claude/rules/README.md` for the index
and the conflict-priority order. Nothing below repeats those rules; it records what is specific here.

## Commands that must work
- Install: `<cmd>`
- Test:    `<cmd>`          # the full suite, the one CI runs
- Lint:    `<cmd>`
- Types:   `<cmd>`
- Build:   `<cmd>`
- Run:     `<cmd>`

## Stack facts
<language, framework, database, warehouse, orchestrator, deploy target — as detected>

## Domain invariants
<the things that are true here and are not derivable from the code: what a "customer" is,
which table is the system of record, what must never be deleted, which env is production>

## This project's gates
See `~/.claude/rules/definition-of-done.md`. Deviations from those thresholds, with reasons:
<none, or list them>
```

## Step 3 — data projects only

If dbt is present, additionally record: the layer prefixes actually in use, the target/profile names, the
production manifest location for slim CI, the warehouses per workload, and any model that is known to
violate the layering (so it is not treated as the example to copy).

## Step 4 — verify, do not claim

Run each command you wrote into `CLAUDE.md`. A `CLAUDE.md` containing a test command that does not work
is the most common and most annoying bootstrap defect. **Paste the output.** If a command fails, record
it as broken rather than silently fixing the doc to match.

## Step 5 — report

What was detected, what was written, which commands were verified working, which failed, and what you
deliberately left alone in an existing config.
