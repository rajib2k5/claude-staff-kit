# Recommended plugins from claude-plugins-official

Catalog snapshot: 2026-10-11, 315 entries. Machine-readable names: [`recommended-plugins.json`](recommended-plugins.json). `scripts/validate.sh` checks that file parses as JSON. It does not check the names against the catalog.

## Profile and ground rules

- Profile: senior data engineer and architect. Snowflake, dbt, SQL and Python. Quant finance demos in Python and TypeScript. Authors Claude Code plugins and mods in TypeScript. Uses the Snowflake Cortex CLI.
- Plan: personal Claude Max, monthly. Per-session token cost of a plugin matters.
- Token cost was not measured for any plugin below. The "adds to the session" column states what the catalog entry says the plugin ships. Hooks and MCP servers act on every session. Skills normally add only their description until used (general behaviour, not verified here).
- Install `session-report` first (Tier 1), then use it to compare a few sessions before and after each further install.
- Install command form: `claude plugin install <name>@claude-plugins-official`, which `scripts/install-plugins.sh` runs for a tier. The Tier 1 set was installed with it on 2026-10-12 (see the session notes in the commit). The in-session form `/plugin install <name>@claude-plugins-official` appears in the superpowers README.
- Component lists come from catalog descriptions. Where a description does not name the components, the cell says "unverified".

## Already installed

`superpowers`, `code-review`, `code-simplifier`, `commit-commands`, `context7`, `playwright`, `frontend-design`, `greptile`, `coderabbit`, `claude-md-management`, `claude-code-setup`, `agent-sdk-dev`, `artifact`, `explanatory-output-style`, `learning-output-style`.

`artifact` was installed from `claude-plugins-official` on 2026-01-29 (recorded in `~/.claude/plugins/installed_plugins.json`) and is no longer in the current catalog; the nearest current entry is `project-artifact`.

## Tier 1: install now

Revised 2026-10-12: `security-guidance` (standing per-turn model cost), `snowflake-cortex-code` (automatic routing can bypass the destructive-ops guard; see the caution below), `duckdb-skills`, `pyright-lsp` and `typescript-lsp` (their binaries are not installed on this machine: `duckdb`, `pyright-langserver` and `typescript-language-server` were all absent from `PATH` on 2026-10-12) moved to Tier 2. Install the binary, or decide on the behaviour change, first.

| Plugin | Why, for this profile | Adds to the session |
|---|---|---|
| `session-report` | It gives the per-session token, cache and subagent numbers a Max-plan user needs, and the kit has no measurement tool. | A report generator over the local transcripts in `~/.claude/projects`; the entry names no hook, MCP server or LSP (command names unverified). |
| `receipts` | It summarises what shipped and each project's share of usage, which is the input for a self-review. | A report generator over local transcripts that also runs read-only git; per the entry, counts and project names are sent to the model to write the report. |
| `snowflake-cortex-code` | You use the Cortex CLI, and this routes Snowflake prompts from Claude Code to it. | Slash commands (code review, task delegation) and skills (routing, run, setup) per the entry; Cortex Code must be installed (inferred, unverified). |
| `security-guidance` | It adds always-on security checks while editing, next to the on-demand `staff-security` skill. | Hooks per the entry: pattern warnings on edits, an LLM diff review on Stop, and an agentic commit reviewer. |
| `hookify` | It lets you add personal guard rules as markdown files without editing the kit's Node guard hook. | Hook-rule authoring from markdown files; the entry does not list components (unverified). |
| `plugin-dev` | You author Claude Code plugins, and the kit is one. | Seven skills for hooks, MCP integration, commands, agents and best practices per the entry; plugin creation and validation help may add commands or agents (unverified). |
| `duckdb-skills` | It queries local data files for the quant demos without loading them into Snowflake. | Skills per the entry: read any data file, attach and query DuckDB databases, search DuckDB docs and past session logs, manage extensions; the `duckdb` binary is probably required (the entry does not say). |
| `pyright-lsp` | It adds type checking and code navigation for the Python in the quant demos. | An LSP integration only; the `pyright` language server must be on `PATH` (unverified, the entry does not say). |
| `typescript-lsp` | It adds the same for the TypeScript in the plugins and mods you author. | An LSP integration only; `typescript-language-server` must be on `PATH` (unverified, the entry does not say). |

```bash
scripts/install-plugins.sh --tier install     # session-report receipts hookify plugin-dev
scripts/install-plugins.sh --tier evaluate    # the Tier 2 set, one decision at a time is better
```

### Cautions on Tier 1

- **`security-guidance` is not low cost.** Its entry says an LLM reviews the diff on Stop and an agentic commit reviewer runs. Both spend model tokens. Install it, run it for a few days, and read the cost in `session-report`. If it costs too much, `semgrep` (below) is the candidate to swap in. **TODO(unknown):** does the Stop review run on every turn, or only on turns that changed files?
- **`snowflake-cortex-code` and the destructive-ops guard.** The guard inspects tool calls made inside Claude Code. If routing hands a prompt to Cortex Code, the SQL that Cortex Code runs may never reach the guard. **TODO(unknown):** test with a throwaway table in a sandbox schema before relying on the guard for Snowflake. Also **TODO(unknown):** whether automatic routing pre-empts the kit's `data-snowflake-*` skills.
- **`receipts` sends project names.** Check your project folder names before the first run.
- **`pyright-lsp`, `typescript-lsp` and `duckdb-skills` need a local binary.** Install the binary first. Otherwise the plugin loads and does nothing useful (expected behaviour, unverified).

## Tier 2: evaluate

Install one at a time. Measure with `session-report` before keeping it. Same install form: `claude plugin install <name>@claude-plugins-official`.

| Plugin | Origin | Fit for this profile | Cost or dependency | Overlap with what you have |
|---|---|---|---|---|
| `altimate-code` | AltimateAI | dbt and Snowflake work with 100+ tools, including column-level lineage, dbt build, test and run, and FinOps. | Needs the separate `altimate-code` CLI and warehouse credentials (implied by the entry). **TODO(unknown):** do its model calls bill to your Claude plan or to another provider? | `data-dbt-audit`, `data-cost`, agent `dbt-engineer`. |
| `huggingface-skills` | `huggingface/skills` repo; no author in the entry | Useful only if you train or evaluate open models for the quant work. | Skills; may need a Hugging Face token for private repos (unverified). | A Hugging Face Hub MCP connector is already configured in the owner's session (2026-10-11). The plugin adds skills, not access. |
| `data-engineering` | `astronomer/agents` repo; no author in the entry | Warehouse exploration and pipeline authoring with Airflow. Fits only if you run Airflow. **TODO(unknown):** do you run Airflow? | Needs an Airflow environment (implied). Same repository as `astronomer-data-agents` and `data`. | `data-pipeline-debug`. |
| `astronomer-data-agents` | `astronomer/agents` repo; no author in the entry | Airflow DAG authoring, failure debugging, lineage, Airflow 2 to 3 migration, Astronomer deployments. | Needs Airflow, and an Astronomer account for the deployment features (implied, unverified). Install one of the three entries that share this repository, not several. **TODO(unknown):** what differs between them? | `data-pipeline-debug`, agent `pipeline-debugger`. |
| `skill-creator` | Anthropic | You author skills. It creates, improves and benchmarks them with evals, which closes the kit's roadmap gap. | Skills. Eval and benchmark runs repeat model calls, so spend grows with the number of runs (inferred from the description). | A `skill-creator` skill is already listed in the owner's session under `anthropic-skills`. **TODO(unknown):** is it the same code? |
| `pr-review-toolkit` | Anthropic | Adds two lenses the kit lacks: type design and comment accuracy. Type design matters for TypeScript. | Several review agents per run, so cost scales with agent count (unmeasured). | `code-review`, `coderabbit`, `greptile`, `code-simplifier` (all installed) and agent `principal-code-reviewer`. Run only the two new lenses. |
| `remember` | `Digital-Process-Tools/claude-remember` repo; no author in the entry | Cross-session memory kept as tiered daily logs. | It compresses conversations with model calls and stores session summaries on disk. | Overlaps your existing file-based memory. Two memory systems will disagree. Lean no unless it replaces the current one. |
| `project-artifact` | Anthropic | A living status page for long projects, driven by a per-project config. Each refresh re-gathers state and reports only the change. | Each refresh costs tokens and republishes the same claude.ai artifact. | The installed `artifact` publishes pages. This adds the per-project config and the refresh flow. |
| `playground` | Anthropic | Single-file HTML explorers with controls and live preview, for exploring demo parameters. Templates include a data explorer. | Skills with templates; low standing cost (unmeasured). | `frontend-design` covers visual quality, not interactive explorers. |
| `mcp-server-dev` | Anthropic | You build tools and mods in TypeScript. This teaches MCP server design, auth and deployment (remote HTTP, MCPB, local). | Skills only per the entry. | `plugin-dev` covers MCP integration inside plugins. This covers building the server. |
| `exa` | `exa-labs/exa-mcp-server` repo (author: Exa) | The pick between Exa and Tavily. See below. | An MCP server, so its tool definitions load into the session (size unmeasured). An Exa account or API key is probably needed (unverified). | Built-in WebSearch and WebFetch cover ordinary lookups. |
| `bigdata-com` | Bigdata-com repo (author: RavenPack) | Financial research and analytics through the Bigdata MCP. Fits quant demos that need real filings or news. | The entry does not state an account requirement. **TODO(unknown):** account, pricing and data-licence terms. | None in the catalog. |
| `linq-alpha` | `linq-lab/linq-alpha-plugin` repo (author: LinqAlpha) | Fundamentals, estimates, transcripts, filings and market data. | The entry states that it requires a LinqAlpha account. It has an opt-in default-source preference that changes which source Claude picks; you can remove it. | None in the catalog. |

For `bigdata-com` and `linq-alpha`: skip both if your demos use public or synthetic data. **TODO(unknown):** can vendor data appear in a public demo under either licence?

### Exa over Tavily

Pick `exa`. Its entry lists web search, deep research, people and company research and academic papers, and its repository is an MCP server, so the tools run inside the session. Tavily's repository is `tavily-ai/skills`, and its entry describes building applications on Tavily's APIs. That is a developer-integration task, not session research. Both probably need an API key (unverified). Exa carries a cost Tavily may not: an MCP server loads tool definitions every session. If `session-report` shows those definitions as a large share of start-of-session tokens, switch to Tavily or drop web research to the built-in tools.

## Additional candidates

Found by keyword search of the catalog. Not on your list.

| Plugin | Origin | Why it fits | Cost or dependency |
|---|---|---|---|
| `codspeed` | `CodSpeedHQ/codspeed` repo (author: CodSpeed) | It gives Claude benchmark results, flamegraphs and comparisons through an MCP server. That matches the kit's `staff-perf` rule: measure, change one thing, re-measure. It fits Python and TypeScript demos. | An MCP server. Results come from CodSpeed, so an account is probable (unverified). |
| `semgrep` | `semgrep/mcp-marketplace` repo; no author in the entry | A rule-based static analyser needs no model call for the scan itself (general knowledge about Semgrep, not from the entry). It is the swap candidate if `security-guidance` costs too much. | An MCP server. The Semgrep CLI or account requirement is unverified. **TODO(unknown):** how the plugin triggers scans. |
| `claude-security` | Anthropic | An on-demand deep scan at an effort tier you choose. Every finding is challenged before it is reported. Use it before releasing a plugin or a demo that handles external input. | Expected to be token-heavy because findings are challenged and patches are verified by a panel of agents (inferred from the description). Start at the lowest tier. |

Considered and not added:

- `serena`: an MCP server that overlaps `pyright-lsp` and `typescript-lsp`.
- `deepeval`, `mlflow`: evaluate LLM applications on their own platforms, not plugins.
- `pydantic-ai`: fits only if you build with Pydantic AI. **TODO(unknown):** do you?
- `feature-dev`, `mattpocock-skills`: overlap superpowers and the kit's `staff-*` skills.
- `ralph-loop`: repeats one task until done, so token use is open-ended (inferred from the description).
- `desktop-commander`: already available as an MCP server in the owner's session.

## Not recommended

| Plugin | Reason |
|---|---|
| `databricks` | Skills for Databricks tooling. Your platform is Snowflake. |
| `bigquery-data-analytics` | Targets BigQuery. No BigQuery workload in the profile. |
| AWS, GCP and Azure database plugins: `databases-on-aws`, `aws-data-analytics`, `alloydb`, `alloydb-omni`, `cloud-sql-mysql`, `cloud-sql-postgresql`, `cloud-sql-sqlserver`, `spanner`, `firestore-native`, `dataproc`, `data-agent-kit`, `azure-sql-developer`, `azure-cosmos-db-assistant` | Each binds the session to one cloud's managed service. None matches Snowflake, dbt or the local Python and TypeScript work. |
| CRM and sales plugins: `apollo`, `apollo-skills`, `hubspot-sales`, `monday-crm`, `zoominfo`, `lusha`, `hunter`, `clay`, `leadfeeder`, `vibe-prospecting`, `activecampaign` | Prospecting and CRM tools. No use in this profile. |
