# Channel A: documentation audit (2026-10-28)

Scope: primary docs only (code.claude.com, platform.claude.com). No code executed, no probes. Pages fetched 2026-10-28; platform pages carry no version stamp. Installed CLI 2.1.287 (env-pin.txt). Per-claim URL, quote and note: `channel-a.json`.

Totals: CONFIRMED 89, REFUTED 3, UNVERIFIABLE 14 (106 claims).

## Summary table

| ID | Verdict | Source page |
|---|---|---|
| S1 | UNVERIFIABLE | code.claude.com/docs/en/skills |
| S2 | REFUTED | code.claude.com/docs/en/model-config |
| S3 | UNVERIFIABLE | platform.claude.com/docs/en/about-claude/models/overview |
| S4 | UNVERIFIABLE | n/a |
| S5 | UNVERIFIABLE | n/a |
| S6 | UNVERIFIABLE | code.claude.com/docs/en/skills |
| P1 | CONFIRMED | code.claude.com/docs/en/model-config |
| P2 | CONFIRMED | code.claude.com/docs/en/permission-modes |
| P3 | CONFIRMED | code.claude.com/docs/en/headless |
| P4 | CONFIRMED | code.claude.com/docs/en/sub-agents |
| P5 | CONFIRMED | platform.claude.com/docs/en/api/migration-2026-10-21 |
| P6 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/structured-outputs |
| P7 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/compaction |
| P8 | CONFIRMED | platform.claude.com/docs/en/about-claude/model-deprecations |
| K-claude-agent-orchestration-1 | CONFIRMED | code.claude.com/docs/en/sub-agents |
| K-claude-agent-orchestration-2 | CONFIRMED | code.claude.com/docs/en/sub-agents |
| K-claude-agent-orchestration-3 | CONFIRMED | code.claude.com/docs/en/agent-sdk/subagents |
| K-claude-agent-orchestration-4 | CONFIRMED | code.claude.com/docs/en/sub-agents |
| K-claude-agent-orchestration-5 | CONFIRMED | code.claude.com/docs/en/agent-sdk/subagents |
| K-claude-agent-orchestration-6 | REFUTED | code.claude.com/docs/en/agent-sdk/permissions |
| K-claude-agent-orchestration-7 | CONFIRMED | code.claude.com/docs/en/agent-sdk/sessions |
| K-claude-agent-orchestration-8 | CONFIRMED | code.claude.com/docs/en/agent-sdk/sessions |
| K-claude-agent-orchestration-9 | CONFIRMED | code.claude.com/docs/en/agent-sdk/sessions |
| K-claude-agent-orchestration-10 | CONFIRMED | code.claude.com/docs/en/headless |
| K-claude-agent-orchestration-11 | CONFIRMED | code.claude.com/docs/en/agent-sdk/cost-tracking |
| K-claude-api-ops-1 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/handling-stop-reasons |
| K-claude-api-ops-2 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/handling-stop-reasons |
| K-claude-api-ops-3 | CONFIRMED | platform.claude.com/docs/en/about-claude/models/overview |
| K-claude-api-ops-4 | CONFIRMED | platform.claude.com/docs/en/about-claude/models/overview |
| K-claude-api-ops-5 | CONFIRMED | platform.claude.com/docs/en/about-claude/models/overview |
| K-claude-api-ops-6 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/effort |
| K-claude-api-ops-7 | CONFIRMED | platform.claude.com/docs/en/about-claude/model-deprecations |
| K-claude-api-ops-8 | CONFIRMED | platform.claude.com/docs/en/api/migration-2026-10-21 |
| K-claude-api-ops-9 | CONFIRMED | platform.claude.com/docs/en/about-claude/model-deprecations |
| K-claude-api-ops-10 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/prompt-caching |
| K-claude-api-ops-11 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/prompt-caching |
| K-claude-api-ops-12 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/prompt-caching |
| K-claude-api-ops-13 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/prompt-caching |
| K-claude-api-ops-14 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/batch-processing |
| K-claude-api-ops-15 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/token-counting |
| K-claude-api-ops-16 | CONFIRMED | platform.claude.com/docs/en/agents-and-tools/tool-use/overview |
| K-claude-api-ops-17 | UNVERIFIABLE | n/a |
| K-claude-code-config-1 | CONFIRMED | code.claude.com/docs/en/memory |
| K-claude-code-config-2 | CONFIRMED | code.claude.com/docs/en/memory |
| K-claude-code-config-3 | CONFIRMED | code.claude.com/docs/en/settings |
| K-claude-code-config-4 | CONFIRMED | code.claude.com/docs/en/permission-modes |
| K-claude-code-config-5 | CONFIRMED | code.claude.com/docs/en/permission-modes |
| K-claude-code-config-6 | CONFIRMED | code.claude.com/docs/en/permission-modes |
| K-claude-code-config-7 | CONFIRMED | code.claude.com/docs/en/agent-sdk/permissions |
| K-claude-code-config-8 | CONFIRMED | code.claude.com/docs/en/cli-reference |
| K-claude-code-config-9 | CONFIRMED | code.claude.com/docs/en/hooks |
| K-claude-code-config-10 | CONFIRMED | code.claude.com/docs/en/skills |
| K-claude-code-config-11 | CONFIRMED | code.claude.com/docs/en/headless |
| K-claude-code-config-12 | UNVERIFIABLE | code.claude.com/docs/en/cli-reference |
| K-claude-code-config-13 | CONFIRMED | code.claude.com/docs/en/headless |
| K-claude-context-management-1 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/context-editing |
| K-claude-context-management-2 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/context-editing |
| K-claude-context-management-3 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/context-editing |
| K-claude-context-management-4 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/context-editing |
| K-claude-context-management-5 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/compaction |
| K-claude-context-management-6 | CONFIRMED | platform.claude.com/docs/en/api/migration-2026-10-21 |
| K-claude-context-management-7 | UNVERIFIABLE | code.claude.com/docs/en/hooks |
| K-claude-context-management-8 | CONFIRMED | platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool |
| K-claude-context-management-9 | CONFIRMED | code.claude.com/docs/en/agent-sdk/cost-tracking |
| K-claude-context-management-10 | CONFIRMED | code.claude.com/docs/en/agent-sdk/sessions |
| K-claude-evals-1 | UNVERIFIABLE | n/a |
| K-claude-evals-2 | UNVERIFIABLE | n/a |
| K-claude-governance-1 | CONFIRMED | code.claude.com/docs/en/server-managed-settings |
| K-claude-governance-2 | CONFIRMED | code.claude.com/docs/en/server-managed-settings |
| K-claude-governance-3 | REFUTED | code.claude.com/docs/en/server-managed-settings |
| K-claude-governance-4 | CONFIRMED | code.claude.com/docs/en/monitoring-usage |
| K-claude-governance-5 | CONFIRMED | code.claude.com/docs/en/monitoring-usage |
| K-claude-governance-6 | CONFIRMED | code.claude.com/docs/en/monitoring-usage |
| K-claude-governance-7 | CONFIRMED | platform.claude.com/docs/en/manage-claude/usage-cost-api |
| K-claude-governance-8 | UNVERIFIABLE | n/a |
| K-claude-prompt-engineering-1 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/structured-outputs |
| K-claude-prompt-engineering-2 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/structured-outputs |
| K-claude-prompt-engineering-3 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/structured-outputs |
| K-claude-prompt-engineering-4 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/structured-outputs |
| K-claude-prompt-engineering-5 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/structured-outputs |
| K-claude-prompt-engineering-6 | CONFIRMED | platform.claude.com/docs/en/about-claude/models/overview |
| K-claude-prompt-engineering-7 | CONFIRMED | platform.claude.com/docs/en/about-claude/models/overview |
| K-claude-prompt-engineering-8 | CONFIRMED | platform.claude.com/docs/en/api/migration-2026-10-21 |
| K-claude-prompt-engineering-9 | CONFIRMED | platform.claude.com/docs/en/about-claude/model-deprecations |
| K-claude-prompt-engineering-10 | UNVERIFIABLE | n/a |
| K-claude-rag-and-citations-1 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/citations |
| K-claude-rag-and-citations-2 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/citations |
| K-claude-rag-and-citations-3 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/citations |
| K-claude-rag-and-citations-4 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/citations |
| K-claude-rag-and-citations-5 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/citations |
| K-claude-rag-and-citations-6 | CONFIRMED | platform.claude.com/docs/en/api/migration-2026-10-21 |
| K-claude-rag-and-citations-7 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/search-results |
| K-claude-rag-and-citations-8 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/search-results |
| K-claude-rag-and-citations-9 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/search-results |
| K-claude-solution-design-1 | UNVERIFIABLE | n/a |
| K-claude-solution-design-2 | UNVERIFIABLE | n/a |
| K-claude-tool-and-mcp-design-1 | CONFIRMED | platform.claude.com/docs/en/agents-and-tools/tool-use/overview |
| K-claude-tool-and-mcp-design-2 | CONFIRMED | platform.claude.com/docs/en/agents-and-tools/tool-use/overview |
| K-claude-tool-and-mcp-design-3 | CONFIRMED | platform.claude.com/docs/en/agents-and-tools/tool-use/overview |
| K-claude-tool-and-mcp-design-4 | CONFIRMED | platform.claude.com/docs/en/build-with-claude/handling-stop-reasons |
| K-claude-tool-and-mcp-design-5 | CONFIRMED | platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool |
| K-claude-tool-and-mcp-design-6 | CONFIRMED | platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool |
| K-claude-tool-and-mcp-design-7 | CONFIRMED | code.claude.com/docs/en/mcp |
| K-claude-tool-and-mcp-design-8 | CONFIRMED | code.claude.com/docs/en/mcp |
| K-claude-tool-and-mcp-design-9 | CONFIRMED | code.claude.com/docs/en/mcp |
| K-claude-tool-and-mcp-design-10 | CONFIRMED | platform.claude.com/docs/en/agents-and-tools/mcp-connector |

## REFUTED claims and corrections

- **S2** (https://code.claude.com/docs/en/model-config): Per docs: Opus 5.5 requires v2.1.280+, Sonnet 5.5 requires v2.1.284+ (both met by 2.1.287), but Haiku 5.5 requires v2.1.293+, above the installed 2.1.287. Docs also say --model is not validated up front ('a mistyped value produces There's an issue with the selected model on the first request'), so a runtime run may still exit 0 and the claude-haiku-9-9 falsifier fails only at request time.
- **K-claude-agent-orchestration-6** (https://code.claude.com/docs/en/agent-sdk/permissions): Correction: a subagent's OWN permissionMode value of bypassPermissions is never applied (v2.1.267+), but a subagent DOES run in bypassPermissions when the main conversation is in it (sub-agents: 'A subagent runs in this mode only when the main conversation does'). Other facts (async_launched default, agentId trailer, Explore/Plan one-shot) confirmed.
- **K-claude-governance-3** (https://code.claude.com/docs/en/server-managed-settings): Correction: MDM/OS policy and managed-settings.json alternatives and /status are on the page, but requiredMinimumVersion does NOT appear on server-managed-settings; it appears on the settings page ('Admin-side keys that also wait for a restart, such as requiredMinimumVersion') and managed-settings. Low materiality (doc location).

## Version-gated claims (relative to installed 2.1.287)

- **S2**: Haiku 5.5 needs v2.1.293+ (above installed). Opus 5.5 needs v2.1.280+ and Sonnet 5.5 needs v2.1.284+ (both met).
- **P2 / K-claude-code-config-5**: `claude -p` starts in Manual only on v2.1.302+, so the docs do not cover the -p default on 2.1.287. The `manual` alias needs v2.1.200+ (met). The interactive auto default needs v2.1.283+ (met).
- Met on 2.1.287: P1 Fable 5.1 (v2.1.257+), K-orch-3 concurrency var (v2.1.217+), K-orch-6 bypass exception (v2.1.267+), K-orch-10 `--permission-prompts` (v2.1.259+), K-orch-11 resume cost carry-over (v2.1.277+), K-config-3 repo-root local settings (v2.1.211+), K-config-11 full `--bare` limits (v2.1.286+).

## Notes for the gate

- **P4 probe design**: agent-sdk/subagents says the tool is `Agent` in tool_use blocks, but `Task` in the `system:init` tools list. The ledger's probe (init list contains Agent and not Task) is expected to fail even though the claim is true.
- **S2 / P1 falsifiers**: per model-config, `--model` is not validated up front. A bad ID fails on the first request. It is not rejected at argument parse.
- UNVERIFIABLE has two causes. One is local-file facts outside the charter (S3-S6, the S1 negative half). The other is a bullet that only defers ('confirm in docs') or is a meta-statement. One sub-fact is undocumented: K-config-12 says `stream-json` needs `--verbose`.
