---
description: Wire this project onto the global engineering standards (detect stack, write project CLAUDE.md, verify commands)
argument-hint: [optional notes about the project]
---

Invoke the `staff-bootstrap` skill for this repository.

Extra context from the user (may be empty): $ARGUMENTS

Requirements:
- **Detect** the stack from manifests; do not guess from file extensions.
- **Never overwrite** an existing `CLAUDE.md` / `AGENTS.md` — read it and merge additively.
- Reference `~/.claude/rules/` rather than copying rules into the project. Copying forks them.
- **Execute every command** you write into the project file and paste the output. A `CLAUDE.md` with a
  broken test command is the most common bootstrap defect.
- Report what was detected, what was written, what you verified working, and what you left alone.
