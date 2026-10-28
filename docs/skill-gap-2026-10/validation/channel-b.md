# Channel B: runtime audit (Claude Code 2.1.287)

Run 2026-10-28, Claude Code 2.1.287 on macOS (Darwin 27.0.0, arm64). Evidence is from executed probes only. No docs, no web.

## Harness facts that shape every verdict

- **The real API could not be reached.** Each `claude -p` to api.anthropic.com returned `Failed to authenticate: OAuth session expired and could not be refreshed` (rc=1). This happened with the inherited desktop env and with a sanitized `env -i` env. No `ANTHROPIC_API_KEY` exists.
- **Corrected probes ran the real CLI against a local mock Messages API.** The mock is `egv-b/mock_api.py` on 127.0.0.1:18765, used with a dummy key. It records every request the CLI sends and returns scripted text or tool calls. So it shows CLI-side behaviour: what is sent, how tools run, how output is validated, and permissions and hooks. It never shows model or server behaviour. Each such probe is marked as corrected in `channel-b.json`.
- **Budget:** exactly 20 `claude -p` invocations (#1 to #3 real API, #4 to #20 mock). The log is in `egv-b/calls.log`. One invocation (#15) was wasted: `--disallowedTools` is variadic and swallowed the prompt.
- **Binary evidence:** strings and code context were read from `/Users/rajibbahar/.local/share/claude/versions/2.1.287`. A fabricated control token returns 0 hits.
- **falsifier_rc:** 1 means the pass assertion tripped on the falsifier input, which is the required result. None means no discriminating falsifier was possible.
- **Verdict rule:** CONFIRMED needs every sub-claim that can be checked here to pass. Untested peripheral parts (history, Linux-only paths, guidance) are named in `note`. If a load-bearing sub-claim is untested, the verdict is UNVERIFIABLE. If any sub-claim is contradicted, the verdict is REFUTED.

## Counts

| Verdict | Count |
|---|---|
| CONFIRMED | 22 |
| REFUTED | 4 |
| UNVERIFIABLE | 80 |
| PROBE_INVALID | 0 |
| **Total** | 106 |

## Summary table

| ID | Verdict | rc | falsifier_rc | Key observation |
|---|---|---|---|---|
| S1 | CONFIRMED | 0 | 1 | init skills containing 'probe': ['probe-dir']; request body counts: probe-dir=2, probe-loose=0, PROBE_LOOSE_BODY=0; request listing line: '- probe-dir |
| S2 | UNVERIFIABLE | 1 | 1 | real API: claude-haiku-5-5 rc=1 stdout 'Failed to authenticate: OAuth session expired and could not be refreshed'; stderr '"claude-haiku-5-5" isn't de |
| S3 | CONFIRMED | 0 | 1 | repo+live agent-models.md: '30:- latest Opus: `claude-opus-5`' '31:- latest Sonnet: `claude-sonnet-5`'; repo+live SKILL.md: '67:latest Opus `claude-op |
| S4 | REFUTED | 0 | 1 | DIFF agents/snowflake-architect.md (repo 2026-10-12, live 2026-10-19); commands/sf-audit.md (10-12/10-19); commands/sf-tune.md (10-12/10-19); hooks/ev |
| S5 | REFUTED | 0 | 1 | grep: '112:  `scripts/sf_deploy.py`). A destructive statement follows...' with line 111 'DQ accelerator: only BRONZE, SILVER, APP, ML, CONFIG; ... dep |
| S6 | CONFIRMED | 0 | 1 | 793 /Users/rajibbahar/.claude/skills/graphify/SKILL.md (python splitlines also 793) |
| P1 | UNVERIFIABLE | 0 | None | init model 'claude-fable-5-1'; stderr only 'Warning: no stdin data received in 3s' (no unrecognized_model); request model 'claude-fable-5-1', output_c |
| P2 | CONFIRMED | 0 | 1 | help: '--permission-mode <mode> ... (choices: "acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan")'; code: 'function Tg(e){return  |
| P3 | CONFIRMED | 0 | 1 | rc=0 is_error False subtype success structured_output {'city': 'Paris', 'count': 3} result '{"city":"Paris","count":3}' -> validates. Request tools in |
| P4 | REFUTED | 0 | 1 | INIT tools: Agent False, Task True -> pre-registered assertion False. Model-facing tools in the captured /v1/messages body: Agent True, Task False. (S |
| P5 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| P6 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| P7 | UNVERIFIABLE | None | None | anthropic-beta: claude-code-20250219,interleaved-thinking-2025-05-14,...,context-management-2025-06-27,...; body context_management {"edits": [{"type" |
| P8 | UNVERIFIABLE | None | None | A retirement date in the future cannot be observed. Binary contains 'claude-sonnet-4-5-20250929' (10 occurrences). |
| K-claude-agent-orchestration-1 | CONFIRMED | 0 | 1 | p4: init has 'Task' not 'Agent'; request has 'Agent' not 'Task'. alias2 (--disallowedTools Task): request Agent False, Task False; init Agent False, T |
| K-claude-agent-orchestration-2 | UNVERIFIABLE | None | None | No probe run. |
| K-claude-agent-orchestration-3 | CONFIRMED | 0 | 1 | depth: 'var n=3;var _="tengu_hazel_trellis";function Pv(){let o=a.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH;if(o!==void 0)return o;... r(_,n)'; concurrency |
| K-claude-agent-orchestration-4 | CONFIRMED | 0 | 1 | init agents with 'probe': ['probe-agent'] (probe-nodesc absent); built-ins in init: 'Explore','general-purpose','Plan'; code allowlist includes "tools |
| K-claude-agent-orchestration-5 | UNVERIFIABLE | 0 | None | SDK 0.1.23: ClaudeAgentOptions.agents True, allowed_tools True, max_budget_usd True; AgentDefinition fields: description required, prompt required, to |
| K-claude-agent-orchestration-6 | REFUTED | 0 | 1 | sub: tool_use_result {isAsync:true, status:'async_launched', agentId:'aa45850405b99b3cb'}; subagent_stats requested unset 1, started_in_background 1.  |
| K-claude-agent-orchestration-7 | UNVERIFIABLE | 0 | None | help: '-c, --continue  Continue the most recent conversation', '--fork-session  When resuming, create a new session ID', '-r, --resume [value]'; resul |
| K-claude-agent-orchestration-8 | UNVERIFIABLE | None | None | binary: listSessions=11, getSessionMessages=2, list_sessions=7, get_session_messages=0; Python SDK 0.1.23: list_sessions False, get_session_messages F |
| K-claude-agent-orchestration-9 | UNVERIFIABLE | None | None | binary: persistSession=20, enableFileCheckpointing=4, rewindFiles=21, code 'sessionStore cannot be used with persistSession: false'; Python SDK 0.1.23 |
| K-claude-agent-orchestration-10 | UNVERIFIABLE | 0 | None | p4: init AskUserQuestion False, request AskUserQuestion False; help: '--permission-prompts <target> ... "none" (nobody: anything that would prompt is  |
| K-claude-agent-orchestration-11 | CONFIRMED | 0 | 1 | result usage.input_tokens 200; modelUsage {'claude-sonnet-5-5': (200 in, $0.0006), 'claude-haiku-4-5-20251001': (7000 in, $0.0105)}; total_cost_usd 0. |
| K-claude-api-ops-1 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. B |
| K-claude-api-ops-2 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-3 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. ' |
| K-claude-api-ops-4 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| K-claude-api-ops-5 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. A |
| K-claude-api-ops-6 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| K-claude-api-ops-7 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. B |
| K-claude-api-ops-8 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| K-claude-api-ops-9 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-10 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-11 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-12 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-13 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-14 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-15 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-16 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-api-ops-17 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. T |
| K-claude-code-config-1 | CONFIRMED | 0 | 1 | cfg: PARENT 1, PROJ 1, IMP1 1, IMP2 1, IMP3 1, IMP4 1, IMP5 0, IMP6 0, SUB 0; order PARENT(90892) < PROJ(91098) < IMP1 < IMP4; ag: AGENTS 1, AGPARENT_ |
| K-claude-code-config-2 | CONFIRMED | 0 | 1 | PROJ 1, DOTCLAUDE 1, LOCAL 1; request contains 'Contents of /Users/rajibbahar/.claude/CLAUDE.md' (1); binary '/etc/claude-code' 7 occurrences |
| K-claude-code-config-3 | UNVERIFIABLE | 0 | 1 | cfg: init model claude-opus-5-5 (local wins); ag (project only, sonnet-5-5): init model claude-sonnet-5-5 |
| K-claude-code-config-4 | CONFIRMED | 0 | 1 | default/manual/acceptEdits/auto/dontAsk/plan/bypassPermissions: all '2.1.287 (Claude Code)' rc=0; code 'var KF=["acceptEdits","auto","bypassPermission |
| K-claude-code-config-5 | UNVERIFIABLE | 0 | 1 | p2: init permissionMode 'default', Bash touch denied ('needs approval'); cfg (project defaultMode bypassPermissions): init permissionMode 'default'; a |
| K-claude-code-config-6 | UNVERIFIABLE | 0 | 1 | egv-p2 created (rc 0); egv-p2-deny absent; tool_result 'Permission to use Bash with command touch /tmp/claude-502/egv-p2-deny has been denied.'; binar |
| K-claude-code-config-7 | UNVERIFIABLE | 0 | None | `--permission-mode plan --version` rc=0; ag init permissionMode 'plan'; 'ExitPlanMode' 30 occurrences; '/plan' NOT in -p init slash_commands |
| K-claude-code-config-8 | CONFIRMED | 0 | 1 | help lists '--allowedTools, --allowed-tools <tools...>', '--disallowedTools, --disallowed-tools <tools...>', '--tools <tools...>'; alias2 removed Agen |
| K-claude-code-config-9 | CONFIRMED | 0 | 1 | hook input keys ['cwd','effort','hook_event_name','permission_mode','prompt_id','session_id','tool_input','tool_name','tool_use_id','transcript_path'] |
| K-claude-code-config-10 | CONFIRMED | 0 | 1 | allowlist 'var M=["name","description","model","allowed-tools","argument-hint","arguments","disable-model-invocation","user-invocable",...,"paths","ho |
| K-claude-code-config-11 | CONFIRMED | 0 | 1 | help: '-p, --print', '--bare ... Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)', '-- |
| K-claude-code-config-12 | CONFIRMED | 1 | 1 | help: '(choices: "text", "json", "stream-json")'; sjnoverbose rc=1 'Error: When using --print, --output-format=stream-json requires --verbose'; p2 jso |
| K-claude-code-config-13 | CONFIRMED | 0 | 1 | structured_output {'city':'Paris','count':3} |
| K-claude-context-management-1 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| K-claude-context-management-2 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. B |
| K-claude-context-management-3 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-context-management-4 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-context-management-5 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. ' |
| K-claude-context-management-6 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-context-management-7 | UNVERIFIABLE | None | None | help '--autocompact <auto/tokens>  Auto-compact window size (auto, or 100k–1M tokens)'; slash_commands includes 'compact'; PreCompact 40, PostCompact  |
| K-claude-context-management-8 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. ' |
| K-claude-context-management-9 | CONFIRMED | 0 | 1 | usage.input_tokens 200 (main only); modelUsage includes claude-haiku-4-5-20251001 7000 in |
| K-claude-context-management-10 | UNVERIFIABLE | 0 | None | subagent first request nmsg=1 (fresh); main received only final 'SUBDONE'; help has --resume/--fork-session |
| K-claude-evals-1 | UNVERIFIABLE | None | None | No runtime surface. Checking whether the skill asserts identifiers would need reading skills/claude-*/, which Channel B's charter forbids. |
| K-claude-evals-2 | UNVERIFIABLE | None | None | No runtime surface. Checking whether the skill asserts identifiers would need reading skills/claude-*/, which Channel B's charter forbids. |
| K-claude-governance-1 | UNVERIFIABLE | None | None | Cloud console; not observable from the CLI. Binary has managed-settings strings (managed-settings.json 49). |
| K-claude-governance-2 | UNVERIFIABLE | None | None | allowedMcpServers 64, deniedMcpServers 51, managed-mcp.json 30 |
| K-claude-governance-3 | UNVERIFIABLE | None | None | managed-settings.json 49, requiredMinimumVersion 9, com.anthropic.claudecode 2; '/status' not in -p slash_commands |
| K-claude-governance-4 | CONFIRMED | 0 | 1 | cfg: non-JSON stdout lines 0, stderr 0 bytes, no 'claude_code.' strings -> project-level telemetry vars ignored |
| K-claude-governance-5 | UNVERIFIABLE | None | None | string literals in that window: 'console','none','otlp','prometheus','grpc','http/json','http/protobuf' |
| K-claude-governance-6 | CONFIRMED | 0 | 1 | console export names: claude_code.session.count (4), claude_code.cost.usage (2), claude_code.token.usage (2); code 'xt=60000' with 'let r=a.OTEL_METRI |
| K-claude-governance-7 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-governance-8 | UNVERIFIABLE | None | None | Defers to docs; no assertion to test. |
| K-claude-prompt-engineering-1 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| K-claude-prompt-engineering-2 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-prompt-engineering-3 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-prompt-engineering-4 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-prompt-engineering-5 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. ' |
| K-claude-prompt-engineering-6 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| K-claude-prompt-engineering-7 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. - |
| K-claude-prompt-engineering-8 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| K-claude-prompt-engineering-9 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-prompt-engineering-10 | UNVERIFIABLE | None | None | Defers to docs. The Claude Code JSON-schema flag does exist (--json-schema, see P3). |
| K-claude-rag-and-citations-1 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-rag-and-citations-2 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-rag-and-citations-3 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-rag-and-citations-4 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-rag-and-citations-5 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-rag-and-citations-6 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-rag-and-citations-7 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-rag-and-citations-8 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. ' |
| K-claude-rag-and-citations-9 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-solution-design-1 | UNVERIFIABLE | None | None | No runtime surface. Checking whether the skill asserts identifiers would need reading skills/claude-*/, which Channel B's charter forbids. |
| K-claude-solution-design-2 | UNVERIFIABLE | None | None | No runtime surface. Checking whether the skill asserts identifiers would need reading skills/claude-*/, which Channel B's charter forbids. |
| K-claude-tool-and-mcp-design-1 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-tool-and-mcp-design-2 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-tool-and-mcp-design-3 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. |
| K-claude-tool-and-mcp-design-4 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. B |
| K-claude-tool-and-mcp-design-5 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. ' |
| K-claude-tool-and-mcp-design-6 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. C |
| K-claude-tool-and-mcp-design-7 | CONFIRMED | 0 | 1 | mcp get: egv-stdio-notype 'Type: stdio'; egv-http 'Type: http'; egv-ws listed; egv-url-notype 'No MCP server named "egv-url-notype"' (rejected); fake  |
| K-claude-tool-and-mcp-design-8 | UNVERIFIABLE | 0 | None | '-s, --scope <scope>  Configuration scope (local, user, or project) (default: "local")'; .mcp.json entries 'Status: ⏸ Pending approval (run `claude` t |
| K-claude-tool-and-mcp-design-9 | UNVERIFIABLE | 0 | None | '-t, --transport <transport>  Transport type (stdio, sse, http). Defaults to stdio if not specified.' (no deprecation note); '-H, --header <header...> |
| K-claude-tool-and-mcp-design-10 | UNVERIFIABLE | None | None | UNVERIFIABLE by construction: Messages-API / server behaviour; no API key, and the CLI's OAuth session is expired, so no real API call was possible. ' |

## REFUTED claims: what was observed

### S4

- **Probe:** AS WRITTEN -> PROBE_INVALID (the ledger never names the 6 pairs). CORRECTED: diff -rq every repo item in rules/ agents/ commands/ contexts/ hooks/ memory/ skills/ against ~/.claude/<same path>; for each differing pair compare `git log -1 --format=%cs` with the newest live mtime.
- **Observed:** DIFF agents/snowflake-architect.md (repo 2026-10-12, live 2026-10-19); commands/sf-audit.md (10-12/10-19); commands/sf-tune.md (10-12/10-19); hooks/evolv-skills-enforcer.js (repo 2026-10-12, 180 lines; LIVE 2026-10-03, 137 lines); memory/MEMORY.md (10-12/10-19); skills/data-cost, data-snowflake-audit, data-snowflake-tune (10-12/10-19). Also MISSING-LIVE: hooks/evolv-skills-enforcer.test.js, hooks/hooks.json, 10 new skills/claude-*.
- **Falsifier:** diff -q repo skills/staff-tdd vs live (falsifier_rc=1)
- **Why refuted:** 8 pairs differ, not 6, and in one (hooks/evolv-skills-enforcer.js) the LIVE copy is OLDER. If the intended 6 were the snowflake-architect, sf-audit, sf-tune and 3 data-* skills, those 6 do differ with live newer. Falsifier staff-tdd: no difference (rc 0) as required. [falsifier_rc=1: the pass assertion tripped on the falsifier input; the raw falsifier command itself exited 0.]

### S5

- **Probe:** AS WRITTEN: grep -n sf_deploy ~/.claude/skills/snowflake-sql/SKILL.md; test -e scripts/sf_deploy.py in that dir. CORRECTED (premise): read the hit's context; find /Users/rajibbahar/dev -maxdepth 5 -name sf_deploy.py
- **Observed:** grep: '112:  `scripts/sf_deploy.py`). A destructive statement follows...' with line 111 'DQ accelerator: only BRONZE, SILVER, APP, ML, CONFIG; ... deploy only through its'; test -e (skill dir) rc=1; find: /Users/rajibbahar/dev/evolv-dq-ai-accelerator/scripts/sf_deploy.py
- **Falsifier:** test -e SKILL.md in the skill dir (falsifier_rc=1)
- **Why refuted:** Pre-registered probe 'passes' but tests the wrong directory. The skill references the DQ accelerator project's own `scripts/sf_deploy.py` ('deploy only through its ...'), and that file exists. Not a dangling reference. [falsifier_rc=1: the pass assertion tripped on the falsifier input; the raw falsifier command itself exited 0.]

### P4

- **Probe:** AS WRITTEN (init event parsed from mock run): `claude -p --output-format stream-json --verbose "List the exact names of the tools you can call, comma separated"`; assert 'Agent' in init.tools and 'Task' not in init.tools
- **Observed:** INIT tools: Agent False, Task True -> pre-registered assertion False. Model-facing tools in the captured /v1/messages body: Agent True, Task False. (Same split in the real-API auth-failed run: init tools start ['Task','Bash',...].)
- **Falsifier:** assertion on synthetic ['Bash','Task','Read'] (falsifier_rc=1)
- **Why refuted:** Pre-registered probe fails: the SDK/stream init event names the tool 'Task'. The model is sent 'Agent'. So 'named Agent, not Task' is true only for the model-facing name; stream consumers see 'Task'. Env CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL=true added (no effect on this assertion). [harness] Real API unreachable: every `claude -p` to api.anthropic.com returned 'Failed to authenticate: OAuth session expired and could not be refreshed' (rc=1, inherited env and sanitized env alike). Corrected probes therefore run the real 2.1.287 CLI against a local mock Messages API (scratchpad egv-b/mock_api.py, ANTHROPIC_BASE_URL=http://127.0.0.1:18765, dummy key). The mock shows CLI-side behaviour only, never model or server behaviour.

### K-claude-agent-orchestration-6

- **Probe:** mock run 'sub' (Agent call, run_in_background unset) and 'sub2' (foreground general-purpose + Explore); captured Agent tool input_schema
- **Observed:** sub: tool_use_result {isAsync:true, status:'async_launched', agentId:'aa45850405b99b3cb'}; subagent_stats requested unset 1, started_in_background 1. sub2 general-purpose result text: '...SUBDONE\nagentId: ab60ff2e5dc19f97d (use SendMessage with to: 'ab60ff2e5dc19f97d', summary: ...) to continue this agent)'; Explore result text: '...The report follows:\n  SUBDONE' (no agentId). Agent schema props: ['description','prompt','subagent_type','model','run_in_background','isolation'] (no 'resume').
- **Falsifier:** sub2 foreground (run_in_background:false): requested foreground 2, started_in_background 0 -> the 'background' assertion trips (falsifier_rc=1)
- **Why refuted:** Background default, async_launched, agentId in a completed result, and Explore with no agentId are all observed. REFUTED part: in 2.1.287 the agentId is continued with SendMessage(to: agentId); the Agent tool has no `resume` parameter. The bypassPermissions sub-claim was not tested. SDK session-level resume not tested. [harness] Real API unreachable: every `claude -p` to api.anthropic.com returned 'Failed to authenticate: OAuth session expired and could not be refreshed' (rc=1, inherited env and sanitized env alike). Corrected probes therefore run the real 2.1.287 CLI against a local mock Messages API (scratchpad egv-b/mock_api.py, ANTHROPIC_BASE_URL=http://127.0.0.1:18765, dummy key). The mock shows CLI-side behaviour only, never model or server behaviour.

## Where this machine differs from claims that sound like they come from docs

- `claude-haiku-5-5` is not in the 2.1.287 model catalog. It gets the same `unrecognized_model` warning as the fabricated `claude-haiku-9-9`. The binary contains 0 occurrences of the id. The `haiku` alias resolves to `claude-haiku-4-5-20251001`. The catalog does know opus-5-5, sonnet-5-5 and fable-5-1.
- The CLI catalog gives `claude-fable-5-1` `maxOutputTokens` 64000 and sends `max_tokens` 64000. Opus-5-5 and sonnet-5-5 get 128000. Claims K-api-ops-4 and K-pe-6 say 128K for all models.
- The stream/SDK init event names the subagent tool `Task`. The model is sent `Agent`, and `--disallowedTools Task` removes `Agent`.
- Subagent continuation uses `SendMessage(to: agentId)`. The Agent tool has no `resume` parameter.
- `--max-turns` is missing from `claude --help`, but the CLI accepts and enforces it. `default` is missing from the help choices, but the CLI accepts it as a mode (`manual` maps to `default`).
- `-p` already starts in default/manual mode on 2.1.287, so the claim that this begins in v2.1.302 cannot be checked here.
- `--json-schema` is implemented by a client-side `StructuredOutput` tool, not by `output_config.format`.
- Default `output_config.effort` sent by the CLI: medium for opus-5-5 and sonnet-5-5, high for fable-5-1. This is the CLI default, not proof of the API default.
- Requests carry `anthropic-version: 2023-06-01`. The string `2026-10-21` does not occur in the binary.
- `claude plugin validate` does not warn about a 600-line SKILL.md or an unknown frontmatter key.

## Not verified, and why

- Every Messages-API, pricing, Admin-API, console and future-date claim is UNVERIFIABLE by construction: no key, and OAuth is expired.
- Model-id acceptance by the API (S2, P1) is undecidable. The CLI passes any id through, so the CLI-level falsifier cannot trip.
- Agent SDK claims could only be checked against an installed Python SDK that is stale (0.1.23). Missing names there do not refute anything.
