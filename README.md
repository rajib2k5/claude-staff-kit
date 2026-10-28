# claude-staff-kit

Staff-level engineering standards for [Claude Code](https://code.claude.com), packaged as the `staff-kit` plugin and as a dotfiles library for `~/.claude`. Skills, agents, commands, rules, contexts, and a guard hook that stops irreversible operations. Built for Snowflake and dbt data platforms and for cost-disciplined multi-agent work.

The same files also serve the Snowflake Cortex CLI, which reads `~/.claude/skills` directly. That is why the kit supports two install modes.

## What is inside

| Layer | Count | What it does |
|---|---|---|
| **Rules** (`rules/`) | 19 | The standards: engineering bar, adversarial validation (highest tier), testing, code review, security, SQL, dbt, Snowflake, data modelling, migrations, docs. `rules/README.md` is the index and states the conflict order. |
| **Contexts** (`contexts/`) | 6 | Tiered loading: tier 0 always (the four questions, irreversibility ladder T0 to T4), tier 1 per role, tier 2 per domain. |
| **Skills** (`skills/`) | 26 | 13 `staff-*` workflows (design, tdd, debug, review, ship, migrate, ...), 8 `data-*` workflows (quality, metric, dbt audit, Snowflake audit and tune, cost, ...), plus `cost-conscious-orchestration`, `destructive-ops-guard`, `evidence-gated-validation`, `simple-english`, `learn-as-you-build`. |
| **Agents** (`agents/`) | 19 | Each declares an explicit `model:`. `adversarial-validator` is pinned to Opus and is never downgraded. Mechanical agents (explorer, docs writer, release manager, dependency auditor) run on Sonnet. |
| **Commands** (`commands/`) | 12 | `/bootstrap` `/ship` `/validate` `/deep-review` `/design` `/rca` `/adr` `/dbt-audit` `/sf-audit` `/sf-tune` `/dq` `/standards`. Thin dispatchers onto the skills. |
| **Hooks** (`hooks/`) | 2 scripts | `evolv-destructive-guard.js` (PreToolUse: asks or denies before DROP, TRUNCATE, `rm -rf`, force-push, `terraform destroy`, ... across every technology; 121 unit tests). `evolv-skills-enforcer.js` (SessionStart: loads the mandatory-skills policy; Stop: flags "verified" claims with no executed command). |
| **Memory** (`memory/`) | 7 | Global facts for the file-based memory. Opt-in at install. |
| **Adapters** (`adapters/cortex/`) | 2 | How `~/.cortex` symlinks into the library, and the script that seeds `cortex ctx`. |

Full list with provenance, and everything deliberately left out: [docs/INVENTORY.md](docs/INVENTORY.md).

## The ideas the kit enforces

- **Adversarial validation outranks speed.** Any number for a human decision, any SQL on production data, any migration, any "it's fixed": an Opus validator tries to break it, and every blocker it raises is reproduced before it is acted on.
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

Every top-level directory maps 1:1 onto `~/.claude/`. Copy what you want, then register the two hooks (see `python3 scripts/merge-settings.py --print`).

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
| A number, a migration, a "fixed" | `/validate` dispatches the Opus adversarial validator. |
| Before saying done | `/ship` executes build, tests, lint, types, and reports what was skipped. |
| Data work | `/dq` hunts fan-out, freshness, and absence-vs-zero; `/dbt-audit`, `/sf-audit`, `/sf-tune` for the platform. |

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
- **No evals yet.** The 121 tests cover the guard hook. Whether a skill triggers on the right prompt is not tested.

## Validate

```bash
bash scripts/validate.sh
```

Checks the manifests, every skill and agent frontmatter (agents must declare a model), shell syntax, the 121 hook tests, and `claude plugin validate --strict`. CI runs the same script.

## Layout

```
.claude-plugin/   plugin.json, marketplace.json
skills/           37 skills, one directory each with SKILL.md
agents/           19 agents (frontmatter: name, description, model)
commands/         12 slash commands
rules/            18 standards files plus README.md, the index
contexts/         tier0-always, tier1-role-*, tier2-domain-*
hooks/            hooks.json (plugin wiring), the two hook scripts, the guard's tests
memory/           global memory seed (opt-in)
templates/        global-CLAUDE.md
adapters/cortex/  Cortex CLI adapter
scripts/          install.sh, merge-settings.py, install-plugins.sh, validate.sh
docs/             INVENTORY, MARKETPLACE_COMPARISON, RECOMMENDED_PLUGINS, recommended-plugins.json
```

## Related

- [rajib2k5/claude-market-watch](https://github.com/rajib2k5/claude-market-watch): live market data inside the session (function-hook mod; listed in this marketplace).
- [rajib2k5/evidence-gated-validation](https://github.com/rajib2k5/evidence-gated-validation): the standalone skill, identical to `skills/evidence-gated-validation`.

## License

MIT. See [LICENSE](LICENSE).
