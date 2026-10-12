# Global memory index

One line per memory. Loaded via `~/.claude/CLAUDE.md`. Memory content lives in the individual files —
never in this index.

Per-**project** memory is separate and lives under `~/.claude/projects/<project-slug>/memory/`. This
directory is for facts that are true in **every** project.

- [Standards library layout](standards-library-layout.md) — where rules, agents, skills, contexts and commands live, and what reads them.
- [Cortex CLI reads Claude skills](cortex-reads-claude-skills.md) — why the library is canonical in `~/.claude` and adapted in `~/.cortex`.
- [Subagent model routing](subagent-model-routing.md) — every subagent gets an explicit model; validation never downgraded.
- [Adversarial validation mandate](adversarial-validation-mandate.md) — when validation is compulsory and why it outranks speed.
- [Validators produce false positives](validator-false-positives.md) — two real cases; reproduce every blocker before acting.
- [Report measured, not estimated](report-measured-not-estimated.md) — reserved verification language and the window rule.
