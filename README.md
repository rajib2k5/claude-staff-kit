# claude-staff-kit

Staff-level engineering standards for [Claude Code](https://code.claude.com), packaged as the `staff-kit` plugin and as a dotfiles library for `~/.claude`. Skills, agents, commands, rules, contexts, and a guard hook that stops irreversible operations. Built for Snowflake and dbt data platforms and for cost-disciplined multi-agent work.

The same files also serve the Snowflake Cortex CLI, which reads `~/.claude/skills` directly. That is why the kit supports two install modes.

## What is inside

| Layer | Count | What it does |
|---|---|---|
| **Rules** (`rules/`) | <!-- sync-index:rules-count -->20<!-- /sync-index:rules-count --> | The standards: engineering bar, adversarial validation (validation is mandatory; the method is routed by `skills/evidence-gated-validation/references/validation-router.md`; `adversarial-validation.md` is the contract for the adversarial method (rows 6–9, 12, 13)), testing, code review, security, SQL, dbt, Snowflake, data modelling, migrations, docs. `rules/README.md` is the index and states the conflict order. |
| **Contexts** (`contexts/`) | 6 | Tiered loading: tier 0 always (the four questions, irreversibility ladder T0 to T4), tier 1 per role, tier 2 per domain. |
| **Skills** (`skills/`) | <!-- sync-index:skills-count -->43<!-- /sync-index:skills-count --> | Engineering workflows (design, tdd, debug, review, ship, migrate, ...), data-platform workflows (quality, metric, dbt audit, Snowflake audit and tune, cost, ...) and Claude-platform skills: <!-- sync-index:skill-families -->13 `staff-*`, 8 `data-*` and 10 `claude-*` skills, plus `ai-spend`, `cost-conscious-orchestration`, `destructive-ops-guard`, `diagram-kit`, `evidence-gated-validation`, `graphify-refresh`, `heavy-job`, `learn-as-you-build`, `project-memory-compaction`, `real-run-screenshots`, `simple-english`, `snowflake-sql`.<!-- /sync-index:skill-families --> |
| **Agents** (`agents/`) | <!-- sync-index:agents-count -->23<!-- /sync-index:agents-count --> | Each declares an explicit `model:`. `adversarial-reviewer` is pinned to Opus and is never downgraded. Mechanical agents (explorer, docs writer, release manager, dependency auditor) run on Sonnet. |
| **Commands** (`commands/`) | <!-- sync-index:commands-count -->15<!-- /sync-index:commands-count --> | `/bootstrap` `/ship` `/validate` `/deep-review` `/design` `/rca` `/adr` `/dbt-audit` `/sf-audit` `/sf-tune` `/dq` `/standards`. Thin dispatchers onto the skills. |
| **Hooks** (`hooks/`) | 7 scripts | `evolv-destructive-guard.js` (PreToolUse: asks or denies before DROP, TRUNCATE, `rm -rf`, force-push, `terraform destroy`, `snowddl destroy`, `pkill -f`, stake changes, ... across every technology). `pre-publish-guard.js` (PreToolUse on git commit, tag, merge and push: denies a Claude co-author trailer, asks on home-directory paths, runs the licensed-data scanner in `hooks/lib/` when the repo has `.licensed-data.json`). `evolv-skills-enforcer.js` (SessionStart: loads the mandatory-skills policy; Stop: flags "verified" claims with no executed command). `subagent-model-guard.js` (PreToolUse on `Agent`: denies a launch without an explicit model and effort, and an `adversarial-reviewer`, including a plugin-namespaced one such as `staff-kit:adversarial-reviewer`, on anything but opus). `subagent-cost-ledger.js` (SubagentStop: one ledger line per subagent with tokens and API-equivalent USD; Stop: session total). `cost-statusline.js` (status line: context used, how far toward the auto-compact point, cost). `compact-journal.js` (PreCompact: verbatim fact journal of the human's own instructions, tasks and git state; SessionStart `compact`: re-injects it). |
| **Memory** (`memory/`) | 7 | Global facts for the file-based memory. Opt-in at install. |
| **Adapters** (`adapters/cortex/`) | 2 | How `~/.cortex` symlinks into the library, and the script that seeds `cortex ctx`. |

Full list with provenance, and everything deliberately left out: [docs/INVENTORY.md](docs/INVENTORY.md).

## The ideas the kit enforces

- **Validation outranks speed; the method is routed.** Every substantive change is validated; `skills/evidence-gated-validation/references/validation-router.md` picks the method by consequence, oracle, novelty and claim shape. Trivial edits, routine code under tests and prose (rows 1, 2, 10) stop at the gates — row 2 adds one hand mutant per new or changed test — or a Sonnet verifier, unless another row also applies; API-existence and unfamiliar-library claims go to dual-channel EGV; a quant research claim goes to a pre-registered holdout test. A number for a human decision, SQL on production data, a migration, security, new concurrency or timezone code, any "it's fixed" (rows 6–9, 12, 13): an Opus validator tries to break it, and every blocker it raises is reproduced before it is acted on.
- **Every subagent gets an explicit model.** Sonnet for lookups and mechanical work, Opus for synthesis and validation. The main thread on a personal Claude Max plan defends its allowance.
- **Nothing irreversible happens on inference.** The guard hook asks before anything in tier T3 or T4 of the ladder, and denies the catastrophic tier outright.
- **Verification language is reserved.** "Tests pass", "verified", "faster" are never written without a command executed in the session and its output.
- **Grain first.** Every data model states "one row per ___" before any SQL exists.

## Install

### Option A: plugin (Claude Code only)

```bash
claude plugin marketplace add rajib2k5/claude-staff-kit
claude plugin install staff-kit@claude-staff-kit
```

Skills are then invoked as `staff-kit:staff-ship`, commands as `/staff-kit:ship`, and the hooks run from the plugin directory. Skills and agents refer to the rules by `~/.claude/rules/...`; in plugin mode the session-start hook prints the plugin root so those references resolve. If you also installed the dotfiles (Option B), do not enable both, or the hooks run twice.

### Option B: dotfiles into `~/.claude` (Claude Code and Cortex CLI)

```bash
git clone https://github.com/rajib2k5/claude-staff-kit ~/dev/claude-staff-kit
cd ~/dev/claude-staff-kit
scripts/install.sh --dry-run          # see what would happen
scripts/install.sh                    # symlink skills, agents, commands, rules, contexts, hooks
python3 scripts/merge-settings.py --apply   # register the hooks in settings.json (backup first)
```

`install.sh` never overwrites an existing item unless you pass `--force`, and `--force` moves the old item to `~/.claude/backups/staff-kit-<timestamp>/` first. Add `--copy` for an independent copy instead of symlinks, `--with-memory` to seed the global memory, and `--with-claude-md` to install `templates/global-CLAUDE.md` as `~/.claude/CLAUDE.md`. Re-running is idempotent.

Then restart Claude Code and run `/standards`.

### Option C: copy by hand

Every top-level directory maps 1:1 onto `~/.claude/`. Copy what you want, then register the hooks (see `python3 scripts/merge-settings.py --print`).

### Cortex CLI

```bash
ln -s ~/.claude/skills ~/.cortex/skills      # and rules, agents, contexts, memory, commands
adapters/cortex/bootstrap.sh --dry-run
adapters/cortex/bootstrap.sh
```

See [adapters/cortex/CORTEX.md](adapters/cortex/CORTEX.md) for why the adapter symlinks instead of copying.

## Daily use

| Moment | Do this |
|---|---|
| New or unfamiliar repo | `/bootstrap` writes a project `CLAUDE.md` that references the rules and records only project facts. `/standards` prints the map. |
| Before building anything non-trivial | `/design` (constraints, non-goals, alternatives, failure modes, migration path). |
| A bug | `/rca` reproduces first, one hypothesis at a time. |
| A number, a migration, a "fixed", any claim | `/validate` classifies with the router, writes the route line, and dispatches the Opus adversarial validator only when routed. |
| Before saying done | `/ship` executes build, tests, lint, types, and reports what was skipped. |
| Data work | `/dq` hunts fan-out, freshness, and absence-vs-zero; `/dbt-audit`, `/sf-audit`, `/sf-tune` for the platform; `/ai-spend` reports AI spend per source with every dollar labelled billed, list or estimated. |

## Recommended companion plugins

The kit does not duplicate what the official marketplace already does well. [docs/RECOMMENDED_PLUGINS.md](docs/RECOMMENDED_PLUGINS.md) lists the plugins chosen for this profile (data platform, quant demos, plugin authoring, Claude Max budget) in two tiers, and `scripts/install-plugins.sh` installs a tier:

```bash
scripts/install-plugins.sh --dry-run
scripts/install-plugins.sh --tier install
```

How the kit compares with the marketplace, component by component, and which packaging practices it adopted: [docs/MARKETPLACE_COMPARISON.md](docs/MARKETPLACE_COMPARISON.md).

## Known limitations

- **Plugin mode and `~/.claude` paths.** Skills, agents, and commands refer to the rules as `~/.claude/rules/...` because the Cortex CLI and the dotfiles install need literal paths. In plugin mode the session-start hook tells Claude where the plugin root is, but subagents do not receive that hint. Dotfiles mode (Option B) has no such gap and is the primary mode.
- **The guard sees Claude Code tool calls only.** It inspects `Bash` commands, the paths written by `Write`, `Edit`, and `NotebookEdit`, `Artifact` deletes, and the SQL passed to any MCP tool whose name contains sql, query, snowflake, bigquery, postgres, mysql, or duckdb. SQL executed by another agent, such as Cortex Code after a prompt is routed to it, never reaches the hook. The `destructive-ops-guard` skill still governs the model's behaviour there, but without the hook as backstop.
- **Hooks need `node`.** If it is missing, the hook exits non-zero and Claude Code shows the error and continues; the guard fails open, visibly.
- **No evals yet.** The node hook tests and the scanner tests cover the hooks. Whether a skill triggers on the right prompt is not tested.

## Validate

```bash
bash scripts/validate.sh
```

Checks the manifests, every skill and agent frontmatter (agents must declare a model), shell syntax, the node hook tests, the licensed-data scanner tests, and `claude plugin validate --strict`. CI runs the same script.

## Layout

```
.claude-plugin/   plugin.json, marketplace.json
skills/           <!-- sync-index:skills-count -->43<!-- /sync-index:skills-count --> skills, one directory each with SKILL.md
agents/           <!-- sync-index:agents-count -->23<!-- /sync-index:agents-count --> agents (frontmatter: name, description, model)
commands/         <!-- sync-index:commands-count -->15<!-- /sync-index:commands-count --> slash commands
rules/            <!-- sync-index:rules-standards -->19<!-- /sync-index:rules-standards --> standards files plus README.md, the index
contexts/         tier0-always, tier1-role-*, tier2-domain-*
hooks/            hooks.json (plugin wiring), the hook scripts and their tests, lib/ (the licensed-data scanner, the model price table)
memory/           global memory seed (opt-in)
templates/        global-CLAUDE.md
adapters/cortex/  Cortex CLI adapter
scripts/          install.sh, merge-settings.py, install-plugins.sh, validate.sh
plugins/          extra plugins listed in the marketplace (snowflake-delivery)
docs/             INVENTORY, MARKETPLACE_COMPARISON, RECOMMENDED_PLUGINS, recommended-plugins.json
```

## Other plugins in this marketplace

- `snowflake-delivery` (`plugins/snowflake-delivery/`): hands-on-lab scaffolding with a teardown checker, semantic view and Cortex Agent authoring, SnowDDL review, an MCP server scaffold, and plugin releases that refuse a version regression. Install with `/plugin install snowflake-delivery@claude-staff-kit`.

## Related

- [rajib2k5/claude-market-watch](https://github.com/rajib2k5/claude-market-watch): live market data inside the session (function-hook mod; listed in this marketplace).
- [rajib2k5/evidence-gated-validation](https://github.com/rajib2k5/evidence-gated-validation): the standalone skill, identical to `skills/evidence-gated-validation`.

## License

MIT. See [LICENSE](LICENSE).
