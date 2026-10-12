---
description: Print the engineering standards library index — rules, agents, skills, and how they compose
---

Show the user a compact map of the global engineering library. Read `~/.claude/rules/README.md` for the
authoritative index, then present:

1. **Rules** (`~/.claude/rules/`) — the standards layer, with the conflict-priority order. Flag
   `adversarial-validation.md` as the highest-tier rule.
2. **Agents** (`~/.claude/agents/`) — the roster with each one's declared model. Note that every agent has
   an explicit `model:` and that adversarial validation is never downgraded from Opus.
3. **Skills** (`~/.claude/skills/staff-*`, `data-*`) — the invocable workflows, grouped engineering vs data
   platform.
4. **Commands** (`~/.claude/commands/`) — this set.

Do not paste file contents. One line each, and finish with the two entry points a new project needs:
`/bootstrap` to wire a repo up, `/ship` before claiming anything is done.
