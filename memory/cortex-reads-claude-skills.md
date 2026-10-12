---
name: cortex-reads-claude-skills
description: Snowflake's Cortex CLI auto-discovers skills from ~/.claude/skills, so that directory is the canonical authoring location for both harnesses.
metadata:
  type: reference
---

The `cortex` binary (`~/.local/bin/cortex`, Snowflake Cortex CLI) **auto-discovers skills from
`~/.claude/skills/`**. Verified with `cortex skill list`, which resolved every `eck-*` skill from that
path and rendered `eck-ac-coverage` as `eck:ac-coverage` — the leading `-` segment becomes a namespace
separator.

Consequences that matter:

- A skill authored once in `~/.claude/skills/<name>/SKILL.md` is visible to **both** Claude Code and
  Cortex. No copying required.
- Cortex's memory is **not** a directory of files — it is an imperative store (`cortex ctx memory add`,
  `cortex ctx rule add`, with a `--global` flag). It cannot be symlinked; it must be seeded via the CLI.
- `cortex skill add <path>` persists an additional skill directory. `cortex profile` handles system
  prompts, `cortex mcp` handles MCP servers.

**Why this matters:** it is the reason `~/.cortex` holds symlinks and a bootstrap script rather than a
second copy of the library. See [[standards-library-layout]].

**How to apply:** author skills, rules and agents in `~/.claude`. Re-run `~/.cortex/bootstrap.sh` after
adding rules or contexts so Cortex's `ctx` store stays in sync. Do not hand-write a `~/.cortex/config.json` —
that schema was never verified; use the `cortex` subcommands instead.
