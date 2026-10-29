# Changelog

All notable changes to staff-kit. Format follows Keep a Changelog; versions follow semver.

## [Unreleased]

### Added
- `snowflake-sql` skill: a stdlib-only Snowflake SQL API client (`sf.py`, with `test_sf.py`) that authenticates with a PAT, is read-only by default, and refuses destructive SQL without `--destructive`. Its `config.json` is per machine and gitignored; copy `config.example.json`. The kit now has 37 skills.
- `third-party/skills/graphify`: the graphify 0.9.93 skill (Apache-2.0, with its LICENSE and NOTICE). Not installed by `scripts/install.sh`.

### Changed
- `data-cost`, `data-snowflake-audit`, `data-snowflake-tune`, the `snowflake-architect` agent and the `/sf-audit` and `/sf-tune` commands now say to run queries through `snowflake-sql` when the Snowflake MCP server is unavailable.

### Fixed
- `learn-as-you-build`: a checkpoint no longer loses answered questions. The picks lived only in the widget's memory, and one `Send results` message at the end was the only thing sent, so a re-render or an app reload lost every answer. Now the session writes every item (ids R1, Q1, E1) to `.learning/milestones/NN-checkpoint.md` before it delivers the checkpoint, in every repo, with the answer key at the end and no grader's notes. In a git repo, `.learning/` goes into the exclude file at the path that `git rev-parse --git-path info/exclude` prints, which also works in a git worktree; the shared-repo rule for `LEARNING_LOG.md` uses the same path. The widget sends one `ANSWER` line, with the milestone and the attempt number, for each pick, skip, or Save of an explain-it-back answer; it turns each newline in a text into ` / `. The markdown format records each letter before it explains. The session records each answer in the file at once and judges right or wrong from the file's answer key. The first recorded pick or skip stands; a repeat leaves the row as it is and gets a one-line reply. `Send results` still starts grading: it fills rows that have no answer, a non-empty text in it replaces a saved explain-it-back text, and each text sits between `<<<E1` and `>>>`. A new session, a lost widget, or "resume the quiz" reuses the same items; an item whose answer a code change broke is marked `retired`. "Restart the quiz" keeps the old rows under `Earlier attempts` and starts a new attempt. `LEARNING_LOG.md` gains a Re-asks column, shows `in progress, N of M answered` for an open checkpoint, and is brought up to date from the file at set points, not on every answer. In `off` mode, the conversation is the record.

## [1.1.0] - 2026-10-28

### Added
- 10 `claude-*` skills that close gaps found by mapping the four Anthropic certification blueprints (CCAR-F, CCAR-P, CCAO-F, CCDV-F) against every installed skill: `claude-agent-orchestration`, `claude-context-management`, `claude-prompt-engineering`, `claude-evals`, `claude-api-ops`, `claude-rag-and-citations`, `claude-code-config`, `claude-tool-and-mcp-design`, `claude-governance`, `claude-solution-design`. Written for model generation 5 and later; every identifier is sourced to current docs.
- `docs/skill-gap-2026-10/`: the study that produced them (concept tags, coverage map, graphify graph, evidence-gated validation ledger and channel reports). Raw third-party text is not committed.
- `learn-as-you-build` skill: teaches the user the code while it is built. It builds one milestone, writes a walkthrough doc and concept notes, then runs a checkpoint of lessons, each followed by its own quiz question with every option explained, and 5 to 8 explain-it-back questions. Four modes (`full`, `lite`, `deferred`, `off`) with switch phrases and a per-project default let a user on a deadline bypass it. It uses an inline widget when the host has one and plain markdown otherwise.

### Changed
- `rules/agent-models.md`, `skills/cost-conscious-orchestration`: model table moved to the 5.5 generation (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-fable-5-1`, `claude-haiku-5-5`); notes that Claude Code needs v2.1.293+ for Haiku 5.5.

### Earlier (unreleased before 1.1.0)
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
