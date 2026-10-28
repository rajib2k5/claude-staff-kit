---
name: claude-tool-and-mcp-design
description: Design tools and MCP servers that Claude selects and calls correctly — granularity, names and descriptions, input schemas, typed error results, tool_choice, tool-set size and MCP server structure and scope. Use when Claude picks the wrong tool, passes bad arguments, loops on errors, or when building or configuring an MCP server. Triggers - tool description, Claude calls the wrong tool, tool schema design, MCP server design, tool_choice, structured tool errors, too many tools.
---

# Designing tools Claude calls well

The judgement this skill adds: a tool is an interface whose only reader is a model. The name, the
description and the schema are the whole documentation. When Claude misuses a tool, fix the interface
before touching the prompt. When a tool fails, return a result the model can act on.

## When to use / when not

- Use to design, split, rename or document a tool; to shape error results; to choose `tool_choice`; to
  decide what an MCP server exposes and where its config lives.
- For the loop, streaming and stop-reason handling in code, use `claude-api` or `agent-sdk-dev:new-sdk-app`.
- For wiring an MCP server into a plugin (`.mcp.json`, plugin layout), use `plugin-dev:mcp-integration`.
- For where config and permission rules belong, use `claude-code-config`.
- For error codes, versioning and compatibility of the interface itself, apply the `api-and-contracts` rule
  in `~/.claude/rules/`. A tool schema is a contract with the same rules.
- To check that a tool really behaves as described, use `evidence-gated-validation`.

## Decision rules

1. **Start with built-in tools.** If the job is files, shell and search, a custom tool adds surface and
   cost without capability. Add a custom tool only for a system the built-ins cannot reach.
2. **One tool, one purpose.** A tool with a `mode` or `action` argument that switches behaviour hides
   decisions from the model. Split it into focused tools so the choice happens at selection time.
3. **Do not over-split.** Merge tools that are always called together, and return what the next step needs.
   Chatty chains of tiny tools raise turns, cost and error chances.
4. **The name states the action and the object.** Pick `search_orders`, not `query` or `helper`. Two tools
   with overlapping names or overlapping descriptions cause mis-selection. Rename or merge them.
5. **The description is the interface.** State what it does, when to use it, when **not** to use it
   (name the sibling tool instead), what each input means, and what comes back. Add an example for the
   awkward input. A misused tool is a documentation gap first.
6. **The schema carries the rules the description cannot enforce.** Use required fields, enums, formats,
   bounds and per-field descriptions. Use `strict: true` so inputs always match the schema.
7. **Make "unknown" representable.** Mark a field nullable or add an `other` or `unknown` enum value.
   A required field with no honest value invites fabrication.
8. **Return typed, actionable errors.** An error result states the category (transient, validation,
   business rule, permission), whether retrying can help, and what to change. Keep detail model-readable.
   Set the error flag on the result (confirm field in docs) so the model knows the call failed.
9. **Separate failure from emptiness.** "No matching rows" is a valid result. "Could not reach the
   database" is an error. If both look the same, the model reports "none found" on an outage.
10. **Enforce invariants outside the model.** A missing argument is fixed by the schema and the error
    message, not a prompt reminder. A business rule such as a refund limit goes in a hook or inside the tool code.
11. **Keep the tool set small and scoped per agent.** Give each agent only the tools for its role. Selection
    accuracy falls as the set grows, and every definition costs input tokens.
12. **Load definitions on demand when the set is large.** Use tool search with `defer_loading` instead of
    sending every definition. Keep at least one non-deferred tool.
13. **Choose `tool_choice` by what must happen.** `auto` when answering without a tool is acceptable.
    `any` when some tool must be called. `tool` with a name when one specific tool must run, such as a
    structured-output extraction step. `none` to forbid calls. Semantics of `any` and `tool`: confirm in docs.
14. **Trim tool output.** Return the fields the next decision needs, not the raw payload. Large results
    crowd out context and bury the key fact.
15. **Pick the MCP primitive by who controls it.** Tools are model-invoked actions. Resources are
    application-selected read-only content, good for catalogs and documents. Prompts are user-selected
    templates. Do not make a tool out of static content that a resource can expose.
16. **Choose transport and scope on purpose.** Remote service: `http`. Local process: `stdio`. Share the
    server through project scope; keep personal servers in user or local scope.
17. **Never commit secrets.** Reference them with `${VAR}` in the shared config. Each person sets the value
    in their environment. Prefer OAuth for remote servers.
18. **Debug a silent server in order.** Reconnect, then read the debug log, then check the config shape.
    Zero tools usually means the server failed to start or the entry is malformed.

## Procedure

1. **List the jobs** the tool set must do, one line each. Check: each job maps to exactly one tool.
2. **Check built-ins first** (rule 1). Check: you can name what a built-in cannot do.
3. **Draft name, description and schema** per rules 4 to 7. Check: a colleague given only the description
   picks the right tool and fills the arguments for three sample requests.
4. **Define the error taxonomy** (rules 8 and 9). Check: for each tool, list one transient, one validation and
   one permission failure; each returns a distinct, actionable result.
5. **Run a selection test.** Send realistic requests, including near-miss ones, and record which tool is chosen.
   Check: wrong picks drive description edits, not prompt edits. Re-run after each single change.
6. **Set the scope**: tools per agent, `tool_choice` per step, deferred loading if large. Check: no agent
   sees a tool its role does not use.
7. **For an MCP server**, choose primitives, transport and scope (rules 15 to 17). Check: from a fresh clone
   with only the env var set, the server connects and lists its tools.
8. **Add the guardrails**: hooks or permission rules for the hard limits. Check: trigger the forbidden call and see it refused.

## Anti-patterns

- A generic `execute(action, payload)` tool. The model cannot tell what it can do.
- Describing the tool in one line and then explaining the rules in the system prompt.
- Returning "Error" or a stack trace. The model cannot tell retry from stop.
- Returning an empty list when access failed. It reads as a valid empty result.
- Five overlapping search tools with near-identical descriptions.
- Fifty tools loaded into every agent "just in case".
- Forcing `tool_choice` on every turn, so the model can never ask a question or finish.
- Fixing a missing argument by adding "always include X" to the prompt.
- Wrapping a tool around static reference text that a resource would serve.
- Hard-coding a token in `.mcp.json`, or relying on `--scope` guesses instead of choosing one.
- Writing a custom tool for plain file or shell work that built-ins already cover.

## Current platform facts (checked 2026-10-28)

- A custom tool is `name`, `description`, `input_schema`; `strict: true` guarantees schema-valid inputs. Calls
  arrive as `tool_use` blocks and you reply with `tool_result` carrying the matching `tool_use_id`.
  Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- `tool_choice` values listed: `auto` (default), `any`, `tool`, `none`. `auto` accepts `disable_parallel_tool_use: true`.
  Source: same page. Exact semantics of `any` and `tool`, and their interaction with thinking: confirm in docs.
- Tool definitions count as input tokens, plus a per-model tool-use system prompt overhead. Same page.
- `stop_reason` values: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`,
  `model_context_window_exceeded`. Loop on `tool_use`. Source: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
- Tool search: `tool_search_tool_regex_20251119` and `tool_search_tool_bm25_20251119`. Mark hidden tools
  `defer_loading: true`; at least one tool must stay non-deferred or the request returns 400. Results are
  `tool_reference` blocks. Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
- The error flag on a tool result (commonly `is_error`): confirm in docs. JSON-encoding of results: confirm in docs.
- `.mcp.json` uses the key `mcpServers`. Entry fields: `type` (`http`, `stdio`, `sse`, `ws`), `url`, `headers`,
  `command`, `args`, `env`, `timeout`, `oauth`, `headersHelper`. No `type` means stdio; `url` without `type` is rejected.
  `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`, `url` and `headers`.
  Source: https://code.claude.com/docs/en/mcp
- Scopes: local (default), project (`.mcp.json`, needs approval), user. Precedence: local, project, user,
  plugin, claude.ai connectors; no field merging. Set with `claude mcp add --scope` and `--transport`. Same page.
- `sse` is deprecated in favour of `http`. Auth routes: `--header`, OAuth via `/mcp` or `claude mcp login`,
  `headersHelper`. Tool names follow `mcp__<server>__<tool>`. Same page.
- MCP connector in the Messages API: beta header `mcp-client-2025-11-20`; config is `mcp_servers` plus an
  `mcp_toolset` entry in `tools`. Remote HTTP servers only; no local stdio.
  Source: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector
- The tools, resources and prompts primitives and in-process servers: confirm in docs.

## Exam-era vs current

- Older material puts `allowed_tools` inside `mcp_servers`. That `mcp-client-2025-04-04` shape is deprecated.
- Older stop-reason lists stop at four values. Handle `pause_turn`, `refusal` and
  `model_context_window_exceeded` too.
- `sse` transport appears in older answers as normal. Prefer `http` today.
- Large tool sets once meant "trim the list". Tool search with `defer_loading` is now an option.
- Answer exam items by the blueprint. Build by the current docs.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-F | Tool Design & MCP Integration | Descriptions and boundaries, structured errors, scoped tool sets, `tool_choice`, MCP scope and secrets, built-in tool choice |
| CCAR-F | Prompt Engineering & Structured Output | Schema-enforced output via tools, nullable fields, enum escape values |
| CCAR-F | Agentic Architecture & Orchestration | Intercepting and normalizing tool calls and results |
| CCAR-P | Integration | Capability bloat, choosing an integration mechanism |
| CCDV-F | Tools and MCPs | Tool implementation, MCP server design, built-in vs custom vs skill vs MCP |
