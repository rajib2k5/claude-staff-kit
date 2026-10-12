# Changelog

All notable changes to staff-kit. Format follows Keep a Changelog; versions follow semver.

## [Unreleased]

### Added
- `third-party/`: vendored `threejs` 1.0.0, `cert-safari-quiz` 0.1.0, `evolv-taste-pilot` 0.1.0 plugins and the `code-mods-essentials` skill, with provenance in `third-party/README.md`. The three plugins are listed in the marketplace. The `staff-kit` plugin itself is unchanged.

## [1.0.0] - 2026-10-11

### Added
- First packaged release of the `~/.claude` engineering library as a Claude Code plugin and as a dotfiles install.
- 25 skills: 13 `staff-*` engineering workflows, 8 `data-*` data-platform workflows, `cost-conscious-orchestration`, `destructive-ops-guard`, `evidence-gated-validation`, `simple-english`.
- 19 agents, each with an explicit `model:` (adversarial validator pinned to Opus).
- 12 slash commands (`/bootstrap`, `/ship`, `/validate`, `/deep-review`, `/design`, `/rca`, `/adr`, `/dbt-audit`, `/sf-audit`, `/sf-tune`, `/dq`, `/standards`).
- 19 rule files and the tiered contexts (tier 0 always, tier 1 per role, tier 2 per domain).
- Hooks: PreToolUse destructive-ops guard (121 unit tests), SessionStart and Stop skills enforcer. `hooks/hooks.json` wires them for plugin mode.
- Skills enforcer Stop branch no longer warns on its own policy text (it quotes "tests pass"), and exits quietly when `stop_hook_active` is set. Regression tests in `hooks/evolv-skills-enforcer.test.js`.
- Plugin mode: the skills enforcer now prints the kit root when `CLAUDE_PLUGIN_ROOT` is set, so `~/.claude/rules/...` references in skills and agents resolve under the plugin.
- `scripts/install.sh` (link or copy into `~/.claude`, never overwrites without `--force`, backs up first), `scripts/merge-settings.py` (idempotent hook registration with backup), `scripts/install-plugins.sh` (curated marketplace plugins), `scripts/validate.sh` (manifests, frontmatter, hook tests).
- Cortex CLI adapter (`adapters/cortex/`): symlink layout and the bootstrap script that seeds `cortex ctx`.
- Global memory seed (`memory/`) and the global `CLAUDE.md` template (`templates/global-CLAUDE.md`), both opt-in at install.
- Docs: component inventory with what was excluded and why, marketplace comparison, recommended plugins.
