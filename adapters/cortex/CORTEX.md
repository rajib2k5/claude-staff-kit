# Cortex CLI adapter

This directory is the **adapter**, not the library. The canonical engineering standards live in
`~/.claude/` and are symlinked in here so a single edit reaches both harnesses.

## Why an adapter and not a copy

`cortex skill list` already discovers skills from `~/.claude/skills/` natively — verified: it resolved
every skill from that path and renders `staff-review` as `staff:review`, treating the leading segment as a
namespace. Duplicating the library into a second home would guarantee drift: a rule fixed in one copy stays
silently wrong in the other, and the divergence surfaces at the worst possible moment.

## Layout

| Path | Kind | Notes |
|---|---|---|
| `~/.cortex/rules` | symlink → `~/.claude/rules` | 18 standards files + `agent-models.md` |
| `~/.cortex/agents` | symlink → `~/.claude/agents` | 19 subagents, each with an explicit `model:` |
| `~/.cortex/skills` | symlink → `~/.claude/skills` | 21 `staff-*` / `data-*` workflows (plus `eck-*`) |
| `~/.cortex/contexts` | symlink → `~/.claude/contexts` | tier 0 / tier 1 role / tier 2 domain |
| `~/.cortex/memory` | symlink → `~/.claude/memory` | file-based global memory + `MEMORY.md` index |
| `~/.cortex/commands` | symlink → `~/.claude/commands` | slash-command dispatchers |
| `~/.cortex/bootstrap.sh` | script | registers the skill dir and seeds `cortex ctx` |

## The one thing that cannot be symlinked

Cortex's memory is **imperative, not file-based**. `cortex ctx` stores rules and memory in its own store
via `ctx rule add` / `ctx memory add` (with `-g` for global). There is no directory to link, so the store
must be **seeded through the CLI** — that is what `bootstrap.sh` does.

The `~/.cortex/memory` symlink is therefore the *human-readable* copy; `cortex ctx` is the store Cortex
actually reads at runtime. Keep them in sync by re-running the bootstrap after editing `~/.claude/memory/`.

## Usage

```bash
~/.cortex/bootstrap.sh --dry-run   # show what it would do
~/.cortex/bootstrap.sh             # register skills + seed global ctx rules
cortex skill list                  # verify staff:* and data:* resolve
cortex ctx rule list               # verify the seeded rules
```

## Deliberately not created

**No hand-written `config.json`.** That schema was never verified against the binary, and inventing one
risks the CLI failing to start or silently ignoring it. Configure Cortex through its own subcommands
instead — `cortex profile` for system prompts, `cortex mcp` for MCP servers, `cortex connections` for
Snowflake. If a config file is ever needed, generate it with the CLI, not by hand.
