# Official-docs best practices (retrieved 2026-10-28)

Source: primary Anthropic docs only (code.claude.com, platform.claude.com). Every bullet is a paraphrase of what the cited page said on the retrieval date. Items marked "not verified" were not on a fetched page. Companion file: `derived/docs_feature_map.json`.

## Claude Code config

- Keep each CLAUDE.md under about 200 lines and write instructions concrete enough to verify; move part-of-codebase guidance into `.claude/rules/` files with `paths` frontmatter or into skills. [memory](https://code.claude.com/docs/en/memory)
- Treat CLAUDE.md as context, not enforcement: use a PreToolUse hook when an action must be blocked regardless of what Claude decides. [memory](https://code.claude.com/docs/en/memory)
- Put personal per-project preferences in `CLAUDE.local.md` (gitignored) and team policy in the committed `./CLAUDE.md` or `./.claude/CLAUDE.md`; user-wide prefs go in `~/.claude/CLAUDE.md`. [memory](https://code.claude.com/docs/en/memory)
- Use settings scopes deliberately: `.claude/settings.json` for the team, `.claude/settings.local.json` for personal overrides, `~/.claude/settings.json` for you everywhere, managed for policy. Precedence high to low: managed, command line (`--settings`), local, shared project, user; permission lists merge. [settings](https://code.claude.com/docs/en/settings)
- Run `/status` to see which settings sources loaded and `claude doctor` for rejected entries. [settings](https://code.claude.com/docs/en/settings)
- Pick the narrowest permission mode that fits: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk` (CI, deny instead of prompt), `bypassPermissions` only in isolated containers. [permission-modes](https://code.claude.com/docs/en/permission-modes)
- Write permission rules knowing deny is checked first, then ask, then allow, and a narrower allow cannot carve an exception out of a deny. [permissions](https://code.claude.com/docs/en/permissions)
- Lock down org policy with `permissions.disableBypassPermissionsMode` and `permissions.disableAutoMode` set to `disable` in managed settings. [permission-modes](https://code.claude.com/docs/en/permission-modes)

### Gotchas
- `auto` and `bypassPermissions` as `permissions.defaultMode` do not take effect from project or local settings; put them in user or managed settings or pass `--permission-mode`. [settings](https://code.claude.com/docs/en/settings)
- Since v2.1.302, `claude -p` and Agent SDK runs with no mode set start in Manual and deny calls needing approval; interactive sessions default to `auto` on v2.1.283+. [permission-modes](https://code.claude.com/docs/en/permission-modes)
- `allowedTools` does not restrict other tools and has no effect under `bypassPermissions`; to hide a tool use a bare-name deny or `--tools`. [permissions](https://code.claude.com/docs/en/permissions)
- A PreToolUse `allow` does not override deny or ask rules, but an exit-2 block beats allow rules. [permissions](https://code.claude.com/docs/en/permissions)
- Imports (`@path`) do not reduce context cost; they load with the importing file (max four hops). [memory](https://code.claude.com/docs/en/memory)

## Hooks

- Choose the handler type to match the job: `command`, `http`, `mcp_tool`, `prompt`, or `agent` (experimental). [hooks](https://code.claude.com/docs/en/hooks)
- Define hooks at three levels (event, matcher group, handler); a matcher of only letters, digits, `_`, `-`, spaces, `,` and `|` is an exact-name list, anything else is an unanchored JS regex. [hooks](https://code.claude.com/docs/en/hooks)
- To gate a tool call, return JSON under `hookSpecificOutput` with `hookEventName: "PreToolUse"` and a `permissionDecision` of `allow`, `deny`, `ask` or `defer`, plus `permissionDecisionReason`. [hooks](https://code.claude.com/docs/en/hooks)
- To adjust arguments instead of blocking, return `updatedInput` directly under `hookSpecificOutput`. [hooks](https://code.claude.com/docs/en/hooks)
- Use exit code 2 for a hard block (stderr becomes the reason); exit 0 with JSON for structured decisions; any other code is a non-blocking error. [hooks](https://code.claude.com/docs/en/hooks)
- For Stop hooks the blocking form is top-level `decision: "block"` with `reason`; `last_assistant_message` is supplied so you need not parse the transcript. [hooks](https://code.claude.com/docs/en/hooks)
- Place hooks in settings files, a plugin's `hooks/hooks.json`, or skill/subagent frontmatter depending on desired lifetime. [hooks](https://code.claude.com/docs/en/hooks)

### Gotchas
- `PostToolUse` cannot block: the tool already ran. [hooks](https://code.claude.com/docs/en/hooks)
- A hook `allow` still lets matching deny/ask rules win, and in plan mode it cannot approve edits. [permissions](https://code.claude.com/docs/en/permissions)
- Hook output text (`additionalContext`, `systemMessage`) is capped at 10,000 characters; `suppressOutput` has no effect. [hooks](https://code.claude.com/docs/en/hooks)
- Whether the older top-level approve/block form for PreToolUse is deprecated: not verified.

## Skills and plugins

- One skill = a directory with `SKILL.md`; `description` (plus `when_to_use`) drives auto-loading, so lead with the key use case (listing text is cut at 1,536 characters). [skills](https://code.claude.com/docs/en/skills)
- Keep `SKILL.md` under 500 lines and push reference material to sibling files Claude reads on demand. [skills](https://code.claude.com/docs/en/skills)
- Use `disable-model-invocation: true` for side-effect workflows only the user should trigger; `user-invocable: false` for background knowledge. [skills](https://code.claude.com/docs/en/skills)
- `allowed-tools` pre-approves tools for the skill's turn; it is not a restriction (use `disallowed-tools`). [skills](https://code.claude.com/docs/en/skills)
- Use `context: fork` (with `agent`) to run a skill in a subagent. [skills](https://code.claude.com/docs/en/skills)
- Package reusable setups as a plugin (`.claude-plugin/plugin.json`; marketplace via `.claude-plugin/marketplace.json`); test locally with `--plugin-dir`. [plugins](https://code.claude.com/docs/en/plugins)
- Check a plugin's context cost before installing: its skill/agent descriptions sit in context every turn. [plugins](https://code.claude.com/docs/en/plugins)

### Gotchas
- Commands in `.claude/commands/` are merged into skills; a skill wins over a same-named command. [skills](https://code.claude.com/docs/en/skills)
- Precedence on name clash: enterprise over personal over project; plugin skills are namespaced `/plugin:skill`. [skills](https://code.claude.com/docs/en/skills)
- Outside Claude Code, uploads with frontmatter keys beyond `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` fail. [skills](https://code.claude.com/docs/en/skills)
- Cloud sessions do not load local-settings plugins. [plugins](https://code.claude.com/docs/en/plugins)

## Subagents

- Write a specific `description` so Claude delegates correctly; only `name` and `description` are required. [sub-agents](https://code.claude.com/docs/en/sub-agents)
- Restrict `tools` (allowlist) or `disallowedTools` (applied first) to the least needed; pick `model` per task (`sonnet`, `opus`, `haiku`, `fable`, full ID or `inherit`). [sub-agents](https://code.claude.com/docs/en/sub-agents)
- Remember the subagent starts with fresh context: put paths, errors and decisions in the Agent tool prompt. [agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents)
- Only the final message returns to the parent, which keeps test logs out of the main context. [sub-agents](https://code.claude.com/docs/en/sub-agents)
- Bound fan-out with `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (default 3), `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20) and `maxBudgetUsd` / `max_budget_usd`. [agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents)
- Detect delegation by `tool_use` blocks named `Agent` (match `Task` too) and by `parent_tool_use_id` on inner messages. [agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents)

### Gotchas
- The spawning tool was renamed Task to Agent in v2.1.63; `Task(...)` still works as an alias. [sub-agents](https://code.claude.com/docs/en/sub-agents)
- Subagents can spawn subagents (depth 3 by default) only if `Agent` is in their tools. [sub-agents](https://code.claude.com/docs/en/sub-agents)
- Plan mode in the parent holds for subagents; `bypassPermissions` is never applied to a subagent (v2.1.267+). [agent-sdk/permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- Explore and Plan are one-shot and return no `agentId`, so they cannot be resumed. [agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents)

## MCP (Claude Code and API)

- Prefer `http` transport for remote servers; `sse` is deprecated; `stdio` for local processes. [mcp](https://code.claude.com/docs/en/mcp)
- Share team servers through a committed `.mcp.json` (`mcpServers` key, explicit `type`); use `--scope user` or `local` for personal ones. [mcp](https://code.claude.com/docs/en/mcp)
- Keep secrets out of the file with `${VAR}` / `${VAR:-default}` expansion. [mcp](https://code.claude.com/docs/en/mcp)
- For non-OAuth auth use `--header` or `headersHelper` (10 s timeout, runs on every connection); for OAuth use `/mcp` or `claude mcp login`. [mcp](https://code.claude.com/docs/en/mcp)
- Reference tools as `mcp__<server>__<tool>` in permission rules, subagent `tools` and hook matchers. [mcp](https://code.claude.com/docs/en/mcp)
- Rely on MCP tool search (on by default; `ENABLE_TOOL_SEARCH=false` disables) to avoid loading every definition. [mcp](https://code.claude.com/docs/en/mcp)
- On the API, use the MCP connector (`mcp_servers` + `mcp_toolset`, beta header `mcp-client-2025-11-20`) for remote HTTP servers; allowlist or denylist tools in the toolset. [mcp-connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)

### Gotchas
- An entry with `url` but no `type` is rejected; no `type` means stdio. [mcp](https://code.claude.com/docs/en/mcp)
- Same server in several scopes: highest precedence wins (local, project, user, plugin, claude.ai connectors); fields are not merged. [mcp](https://code.claude.com/docs/en/mcp)
- The API connector supports tool calls only, needs a publicly reachable HTTP server, cannot reach local stdio servers, and is not ZDR eligible. [mcp-connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- Output over 25,000 tokens hits the default limit (`MAX_MCP_OUTPUT_TOKENS` raises it); a warning shows at 10,000. [mcp](https://code.claude.com/docs/en/mcp)

## Agent SDK

- Treat the SDK as the same agent loop, tools, hooks, permissions and sessions as Claude Code, exposed in Python and TypeScript. [agent-sdk/overview](https://code.claude.com/docs/en/agent-sdk/overview)
- Capture `session_id` from the result message; continue with `resume`, take the latest with `continue` / `continue_conversation`, branch with `forkSession` / `fork_session`. [agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- For multi-turn chat in one process use `ClaudeSDKClient` (Python) or `continue: true` (TypeScript). [agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- Enumerate sessions with `listSessions()` / `list_sessions()` and read them with `getSessionMessages()` / `get_session_messages()`. [agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- Use hooks for checks that must run on every call: the evaluation order is hooks, deny rules, ask rules, permission mode, allow rules, then `canUseTool`. [agent-sdk/permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- For a locked-down agent pair `allowedTools` with `permissionMode: "dontAsk"`; use `disallowedTools` (not `allowedTools`) to block under `bypassPermissions`. [agent-sdk/permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- Read cost from the result message: `total_cost_usd` and `modelUsage` include subagents, `usage` does not; treat all as estimates and use the Usage and Cost API for billing. [agent-sdk/cost-tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking)

### Gotchas
- Auto-approved calls never reach `canUseTool`; a bare tool name in `allowedTools` shadows the callback. [agent-sdk/permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- A single-shot `query()` raises after yielding an error result (e.g. `error_max_budget_usd`); catch it. [agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- Per-step `output_tokens` is a placeholder; dedupe per-step usage by message id for parallel tool calls. [agent-sdk/cost-tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking)
- Sessions persist conversation, not files; forked agents' file edits are real. [agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- Python SDK `AgentDefinition` lacks `autoCompactWindow` and `omitClaudeMd`. [agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents)

## Headless / CLI

- Use `claude -p` with `--output-format json` (fields `result`, `session_id`, `total_cost_usd`) for scripts; `stream-json` needs `--verbose`. [headless](https://code.claude.com/docs/en/headless)
- Add `--bare` in CI for reproducible runs (skips hooks, skills, plugins, MCP, memory, CLAUDE.md; needs `ANTHROPIC_API_KEY`). [headless](https://code.claude.com/docs/en/headless)
- Get schema-validated output with `--json-schema` and read `structured_output`; check the field exists first. [headless](https://code.claude.com/docs/en/headless)
- Bound unattended runs with `--max-turns`, `--max-budget-usd` and a permission mode such as `dontAsk` plus `--allowedTools`. [cli-reference](https://code.claude.com/docs/en/cli-reference)
- Use `--permission-prompts none` (v2.1.259+) when nobody can answer prompts. [headless](https://code.claude.com/docs/en/headless)
- Capture `session_id` and resume with `--resume <id>`, or use `--continue`. [headless](https://code.claude.com/docs/en/headless)
- Fail CI by inspecting `plugin_errors` and `mcp_server_errors` in the `system/init` event. [headless](https://code.claude.com/docs/en/headless)

### Gotchas
- `--max-turns`, `--max-budget-usd`, `--json-schema` and `--no-session-persistence` are print-mode only. [cli-reference](https://code.claude.com/docs/en/cli-reference)
- Without `--bare`, a `-p` run executes the project's hooks and `.mcp.json` servers even in an untrusted folder. [headless](https://code.claude.com/docs/en/headless)
- An invalid `--mcp-config` entry is skipped without failing the run. [headless](https://code.claude.com/docs/en/headless)
- SIGTERM exits 143 and leaves the in-flight turn unrecorded; send SIGINT to end the turn. [headless](https://code.claude.com/docs/en/headless)

## Messages API tool use

- Distinguish client tools (your code runs them: `stop_reason: tool_use`, you return `tool_result` with the same `tool_use_id`) from server tools (Anthropic runs them). [tool-use/overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- Write good `description` fields and use `strict: true` for schema-exact inputs. [tool-use/overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- Steer tool use through the system prompt before reaching for `tool_choice`; use `disable_parallel_tool_use: true` under `auto` for one call per turn. [tool-use/overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- Always branch on `stop_reason`: `tool_use` run tools, `pause_turn` resend to continue, `max_tokens` raise or continue, `refusal` read `stop_details`. [handling-stop-reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)
- Use tool search with `defer_loading: true` when you have 10+ tools or over 10k tokens of definitions; keep the 3-5 hottest tools non-deferred. [tool-search-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- Prefer the SDK tool runner over a hand-written loop. [tool-use/overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)

### Gotchas
- Send every tool definition (including deferred ones) on every request; at least one tool must be non-deferred or the API returns 400. [tool-search-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- Never return a `tool_result` for a `srvtoolu_` server-tool id. [tool-search-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- `tool_choice` values `any` and `tool` carry more system-prompt overhead than `auto`/`none`; their exact semantics were not on the fetched page: not verified. [tool-use/overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- A deferred tool cannot also carry `cache_control` (400). [tool-search-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)

## Structured outputs

- Use `output_config.format` with `type: "json_schema"` for guaranteed-valid JSON; no beta header is needed. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Prefer SDK helpers (`client.messages.parse`, Pydantic, `zodOutputFormat()`), which transform and validate the schema. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Set `additionalProperties: false` on every object and stay inside the supported subset. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Combine with strict tool use (`strict: true`) in one request when needed. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Check `stop_reason` before parsing: `refusal` and `max_tokens` can leave output that does not match. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- In Claude Code use `--json-schema` and read `structured_output`. [headless](https://code.claude.com/docs/en/headless)

### Gotchas
- `output_format` is deprecated (moved to `output_config.format`); using it needs the `structured-outputs-2025-11-13` header else 400. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Not supported: recursive schemas, `minimum`/`maximum`, string length limits, external `$ref`, `minItems` beyond 0 or 1. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Incompatible with citations (400) and message prefilling. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Never put PHI in schema names, enums, consts or patterns: schemas are cached separately. [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

## Prompt caching, batches, token counting

- Start with automatic caching (one top-level `cache_control`); use explicit breakpoints (max 4) for fine control. [prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Put the breakpoint on the last block whose prefix is identical across requests; never on content that changes each call (timestamps). [prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Verify hits via `cache_read_input_tokens` and `cache_creation_input_tokens`; `input_tokens` is only the uncached tail. [prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Use the 1-hour TTL (`ttl: "1h"`, 2x write price) when gaps between requests exceed 5 minutes, and for batches. [prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Use the Message Batches API (50% discount) for non-urgent bulk work; match results by `custom_id`. [batch-processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- Count tokens before sending with `/v1/messages/count_tokens` to manage limits, cost and routing. [token-counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)

### Gotchas
- Minimum cacheable length varies (512 on the 5.5/Fable models; 1,024; 2,048; 4,096) and shorter prompts silently skip caching. [prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- With 4 explicit breakpoints, adding a top-level one returns 400; lookback is 20 blocks. [prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Batch results are unordered; limits are 100,000 requests or 256 MB; results kept 29 days; cache hits best-effort. [batch-processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- Token counts are estimates, free but rate limited. [token-counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)

## Context management

- Prefer server-side compaction for long conversations; docs call it the primary strategy. [context-editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)
- Choose on-demand compaction (beta `compact-2026-09-04`, top-level `compaction`) when you control timing, or threshold compaction when the API should trigger it. [compaction](https://platform.claude.com/docs/en/build-with-claude/compaction)
- Use context editing (`context_management.edits`, beta `context-management-2025-06-27`) for fine-grained clearing: `clear_tool_uses_20250919`, `clear_thinking_20251015`. [context-editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)
- Tune `clear_tool_uses_20250919` with `trigger` (default 100,000 input tokens), `keep` (default 3), `exclude_tools` and `clear_at_least`. [context-editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)
- Use the client-side memory tool (`memory_20250818`) to persist notes under `/memories` between sessions. [memory-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- Set `keep` explicitly for thinking clearing if you run across model tiers; the default varies by model class. [context-editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)

### Gotchas
- Clearing tool results invalidates the cached prefix; size `clear_at_least` accordingly. [context-editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)
- Memory tool handlers must reject paths outside `/memories`. [memory-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- Threshold compaction runs inside the triggering request and cannot run in the background; on Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5 re-inserted turns must drop thinking. [compaction](https://platform.claude.com/docs/en/build-with-claude/compaction)
- Client-side compaction in the tool runner was removed in API version 2026-10-21. [migration-2026-10-21](https://platform.claude.com/docs/en/api/migration-2026-10-21)

## Citations and search results

- Enable citations with `citations: {enabled: true}` on documents; it must be on for all or none in a request. [citations](https://platform.claude.com/docs/en/build-with-claude/citations)
- Expect `char_location`, `page_location` or `content_block_location` citations depending on document type. [citations](https://platform.claude.com/docs/en/build-with-claude/citations)
- Use `search_result` blocks (`source`, `title`, `content`, optional `citations`) in RAG so Claude cites your own content; no beta header. [search-results](https://platform.claude.com/docs/en/build-with-claude/search-results)
- Cache the source documents (`cache_control` on top-level document blocks), not the citation blocks. [citations](https://platform.claude.com/docs/en/build-with-claude/citations)
- `cited_text` is free of output-token cost. [citations](https://platform.claude.com/docs/en/build-with-claude/citations)

### Gotchas
- Citations plus `output_config.format` returns 400. [citations](https://platform.claude.com/docs/en/build-with-claude/citations)
- Only text citations; image citations are not supported. [citations](https://platform.claude.com/docs/en/build-with-claude/citations)
- API version 2026-10-21: non-empty `citations` on user-message text blocks (including inside `search_result`) returns 400, and `document` blocks directly in assistant messages return 400. [migration-2026-10-21](https://platform.claude.com/docs/en/api/migration-2026-10-21)

## Models and deprecations

- Current Claude API IDs per the models overview: `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`; all 1M context, 128K output, adaptive thinking. [models/overview](https://platform.claude.com/docs/en/models/overview)
- Start with Opus 5.5 for most workloads, Fable 5.1 for the hardest reasoning/agentic work, Sonnet 5.5 for speed/intelligence balance, Haiku 5.5 for high-volume low-latency tasks. [models/overview](https://platform.claude.com/docs/en/models/overview)
- Legacy-but-available: `claude-fable-5`, `claude-opus-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-opus-4-5-20251101`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. [models/overview](https://platform.claude.com/docs/en/models/overview)
- Query capabilities programmatically via the Models API (`max_input_tokens`, `capabilities`). [models/overview](https://platform.claude.com/docs/en/models/overview)
- Control reasoning depth with `output_config.effort` rather than manual thinking budgets. [effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- Audit deprecated-model use via Console Usage export, and migrate before retirement (at least 60 days notice is promised). [model-deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- Claude Code accepts aliases `sonnet`, `opus`, `haiku`, `fable` or full names, and `--fallback-model` chains. [cli-reference](https://code.claude.com/docs/en/cli-reference)

### Gotchas
- `claude-sonnet-4-5-20250929` is Deprecated and retires 2026-11-30 (replacement `claude-sonnet-5-5`). [model-deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- `claude-haiku-4-5-20251001` is Active with earliest retirement 2026-10-15 (passed; no deprecation notice in the table yet); `claude-opus-4-5-20251101` earliest 2026-11-24. [model-deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- `temperature`, `top_p`, `top_k` return 400 under API version 2026-10-21; Claude 4.7 and later already reject non-default values. [model-deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- Manual `thinking: {type: "enabled", budget_tokens}` is deprecated on Opus 4.6/Sonnet 4.6 and not accepted on later models. [models/overview](https://platform.claude.com/docs/en/models/overview)
- Bedrock and Google-managed platforms set their own retirement dates and IDs. [model-deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)

## Admin and enterprise

- Use server-managed settings (Teams/Enterprise; Owner role) to push policy without MDM; clients fetch at startup and hourly. [server-managed-settings](https://code.claude.com/docs/en/server-managed-settings)
- Use endpoint-managed settings (`managed-settings.json`, MDM) where devices are managed; both sit at the top of precedence. [settings](https://code.claude.com/docs/en/settings)
- Control MCP centrally with `allowedMcpServers` / `deniedMcpServers` (server-managed) or `managed-mcp.json` (file). [server-managed-settings](https://code.claude.com/docs/en/server-managed-settings)
- Enable OTel with `CLAUDE_CODE_ENABLE_TELEMETRY=1`, choose `OTEL_METRICS_EXPORTER` / `OTEL_LOGS_EXPORTER`, and set `OTEL_EXPORTER_OTLP_PROTOCOL` (no default). [monitoring-usage](https://code.claude.com/docs/en/monitoring-usage)
- Deliver telemetry settings through managed settings so developers cannot redirect them; prompt text stays off unless `OTEL_LOG_USER_PROMPTS=1`. [monitoring-usage](https://code.claude.com/docs/en/monitoring-usage)
- For API spend use `GET /v1/organizations/usage_report/messages` and `/v1/organizations/cost_report` with an Admin API key. [usage-cost-api](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)
- Per-user Claude Code cost: Claude Code Analytics API; Enterprise (claude.ai) cost: Analytics API. [usage-cost-api](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)

### Gotchas
- Cost endpoint excludes Priority Tier; read it from the usage endpoint by `service_tier`. [usage-cost-api](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)
- The Admin API is unavailable to individual accounts and rejects workspace-scoped keys. [usage-cost-api](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)
- Repo-level `.claude/settings.json` cannot set telemetry exporter variables. [monitoring-usage](https://code.claude.com/docs/en/monitoring-usage)
- Cached server-managed settings persist on clients until the next successful fetch after you clear them. [server-managed-settings](https://code.claude.com/docs/en/server-managed-settings)
- Claude Code usage dashboard, Projects, Project knowledge, Research mode, few-shot prompting, prompt templates: not verified (pages not fetched).
