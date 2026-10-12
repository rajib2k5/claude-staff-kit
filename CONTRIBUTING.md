# Contributing to claude-staff-kit

This repository is the source of the `staff-kit` plugin and of the `~/.claude` engineering library. (This file is not loaded by Claude Code as context; a `CLAUDE.md` at a plugin root is rejected by `claude plugin validate --strict`.)
The file you want for global behaviour is `templates/global-CLAUDE.md`, not this one.

- Run `bash scripts/validate.sh` before every commit. It checks the manifests, every skill and agent
  frontmatter, shell syntax, the 121 hook tests, and `claude plugin validate --strict`.
- Every agent in `agents/` declares an explicit `model:`. Do not remove it. `adversarial-validator` stays on Opus.
- `rules/` and `contexts/` are referenced by skills and agents with `~/.claude/...` paths on purpose: the Cortex CLI
  reads `~/.claude/skills` directly. Plugin mode resolves those paths through the session-start hint in
  `hooks/evolv-skills-enforcer.js`. Keep both modes working.
- `scripts/install.sh` must never overwrite without `--force`, and `--force` must back up first. Test it against
  `--target` on a throwaway directory, never against the real `~/.claude`.
- Bump `version` in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and add a CHANGELOG entry.
