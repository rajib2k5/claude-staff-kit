---
name: claude-agent-orchestration
description: Decide how many Claude calls a task needs and who does what - single call, workflow or agent, with a coordinator, scoped subagents, an error and escalation policy, human gates and SDK session handling. Use when designing or reviewing a multi-step or multi-agent Claude system, or when subagent results are wrong, duplicated or lost. Triggers - workflow or agent, coordinator and subagents, hub and spoke, fan out in parallel, when to escalate to a human, resume or fork a session, subagent error handling.
---

# Claude agent orchestration

This skill adds one judgement: **use the least orchestration that meets the need, then make every
hand-off explicit.** Most failures come from too much structure (a multi-agent design where a workflow
would do) or from invisible structure (a subagent that was never told what the coordinator knew).

Scope: who does what. What each party sees and remembers belongs to
[`claude-context-management`](../claude-context-management/SKILL.md). Read both for long-running systems.

## When to use / when not

Use for: single call vs workflow vs agent; coordinator and subagent design; fan-out; error and escalation
policy; human-in-the-loop gates; Agent SDK session and permission design. Do not use for:
- Raw API calls, tool schemas, streaming, batch: use `claude-api`. New SDK app: `agent-sdk-dev:new-sdk-app`.
- Writing hooks or MCP servers: use `plugin-dev:hook-development`, `plugin-dev:mcp-integration`.
- Picking the cheapest model per task in this session: use `cost-conscious-orchestration`.
- Proving the finished design works: use `staff-validate` or `evidence-gated-validation`.
- General system design: use `staff-design`, then return here for agent seams.

## Decision rules

1. **Climb the ladder one rung at a time: single call, workflow, agent.** Move up only when a measured
   failure at the lower rung demands it. Each rung adds cost, latency and ways to fail.
2. **Use a workflow when the steps are known before the run. Use an agent when the steps depend on what
   the run finds.** Fixed order is cheaper and auditable. Open-ended work needs model-chosen steps.
3. **Name the workflow shape.** Chain: ordered dependent steps. Routing: classify, then specialise.
   Sectioning: predefined independent parts in parallel. Voting: one identical task repeated, majority
   wins. Orchestrator-workers: subtasks decided at runtime. Sectioning and voting differ.
4. **Drive the agent loop off the stop signal.** Continue while the model requests a tool, stop when it ends
   its turn, append every tool result to history. Never parse prose for "done". A turn cap is a safety
   net, not the exit condition.
5. **Split into subagents only to buy something specific:** a clean context, a narrower tool set, true
   parallelism, or a reviewer that has not seen the author's reasoning. Without one of these, keep one agent.
6. **Use hub-and-spoke by default.** The coordinator decomposes, routes, aggregates, applies the error
   policy and owns observability. Workers do their task and report an outcome. This keeps one place to
   look when something breaks.
7. **Keep nesting shallow.** Subagents may spawn subagents, but depth multiplies cost and hides failures.
   Allow it only with a written reason, and cap depth and concurrency.
8. **Pass context explicitly.** A subagent starts fresh and returns only its final message. Put the
   findings, constraints and ids it needs inside its prompt. Keep content apart from metadata (source,
   date, location) so attribution survives aggregation.
9. **Brief by goal and quality bar, not by procedure.** State the objective, scope, what done looks like,
   what to exclude, and the output shape. A rigid step list stops the worker adapting to what it finds.
10. **Fan out only independent work, and spawn it in one response.** Sequential spawns lose parallelism.
    Dependent work waits for inputs. Give each worker a distinct slice so results do not duplicate.
11. **Scope each agent's tools to its role.** A handful of relevant tools beats a large generic set. Keep
    search tools away from a synthesis agent. Excess tools and permissions are the main source of drift.
12. **Enforce hard rules in code.** Prerequisites, spend limits and policy blocks belong in hooks and
    gates. A prompt instruction has a non-zero miss rate. Use a post-tool hook to normalise results before
    the model reasons over them.
13. **Recover locally, escalate what is unresolved.** A worker retries transient faults itself. It reports
    upward only the final outcome with: failure type, what was tried, partial results, alternatives.
14. **Distinguish three outcomes.** Access failure (retryable, say so), valid empty answer (success), and
    partial result with a known blocker (annotate the coverage gap). Never turn an error into an empty
    success. Never abort the whole run for one failed branch.
15. **Escalate on policy, not on feeling.** Escalate on: explicit human request (honour it at once), a case
    the policy does not cover, a capability the agent lacks, no progress. Do not use sentiment, stated
    confidence or step count as triggers. On several matches, ask for another identifier.
16. **Route human review by measured risk.** Review the segments where measured accuracy is low and any
    input with internally contradictory values. Sample high-confidence output at random to find new
    error patterns. Gate irreversible actions regardless of confidence.
17. **Make the handoff record self-contained.** A human with no transcript must act from it alone (fields below).
18. **Choose resume, fork or fresh deliberately.** Resume when prior context is still valid. Fork to try
    alternatives from a shared baseline. Start fresh with a summary when tool results are stale. Sessions
    keep the conversation, not the files, so checkpoint files if you need rollback.
19. **Fail fast when unattended.** A headless agent gets a fixed tool allowlist and no interactive prompts.
    Anything unlisted is denied, not queued for a person who is not there.

## Procedure

1. **Write the task and the failure that justifies more structure.** Check: you can state what a single call
   got wrong, with an example.
2. **Pick the rung and shape** with rules 1 to 3. Check: you can say why the next rung down is not enough.
3. **List the parties.** For each: goal, inputs it must be handed, tools, permissions, output shape. Check:
   no party relies on something only another party knows.
4. **Write the coordinator contract:** decomposition, routing, merge, retry owner, escalation triggers,
   stop condition, budget. Check: every failure class in rules 13 to 15 has a named owner.
5. **Define the handoff record.** Minimum fields: case or customer id, root cause or finding, amounts and
   dates, what was tried, current state, recommended action, and the reason for escalation. Check: hand it
   to someone who has not seen the run and ask what they would do next.
6. **Put hard rules in hooks and gates.** Check: try to violate each rule with a crafted request. The
   hook must block it.
7. **Set limits:** turn cap, budget, depth, concurrency, tool allowlist. Check: a task built to loop stops
   with a recognisable error result.
8. **Test unhappy paths:** one worker times out, one returns empty, one returns contradictions. Check: the
   final output names the gap, and the run neither crashes nor invents.
9. **Decide session policy:** persist or memory-only, resume or fork, where file checkpoints live. Check:
   kill a run mid-way, resume it, compare files and conversation.

## Anti-patterns

- A multi-agent design for a task a chain or one call handles.
- Assuming subagents share the coordinator's history or see earlier workers' output.
- Ending the loop on prose or on an iteration cap alone.
- Prompt-only enforcement of an identity, payment or ordering rule.
- One generic "failed" error that hides whether to retry. Also the opposite: swallowing the error.
- Escalating on mood, self-reported confidence or step count.
- Treating resume as a rollback. It restores talk, not files.
- Summing cost across resumed sessions. Read the latest result.

## Current platform facts (checked 2026-10-28)

- Spawning tool is named `Agent`. It was renamed from `Task` in v2.1.63. Old `Task(...)` still works as an
  alias. The model sees `Agent`, but the `system:init` tools list still names it `Task`. Match both
  when parsing streams. https://code.claude.com/docs/en/sub-agents
- `Agent(agent_type)` in `tools` restricts spawnable types, and applies only to an agent run as the main
  thread with `claude --agent`. https://code.claude.com/docs/en/sub-agents
- Depth 3 and 20 concurrent by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`,
  `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). https://code.claude.com/docs/en/sub-agents
- Subagent files are Markdown with YAML frontmatter; the body is the system prompt. Only `name` and
  `description` are required. Others include `tools`, `disallowedTools`, `model` (`sonnet`, `opus`, `haiku`,
  `fable`, a full id or `inherit`), `permissionMode`, `maxTurns`, `hooks`, `isolation`. Built-ins: `Explore`,
  `Plan`, `general-purpose`. Each starts with fresh context; only its final message returns.
  https://code.claude.com/docs/en/sub-agents
- Agent SDK: define subagents with the `agents` option on `query()` (`AgentDefinition`: `description` and
  `prompt` required). Include `Agent` in `allowedTools`. Subagent messages carry `parent_tool_use_id`.
  Without a `subagent_type`, `general-purpose` is used. Cap fan-out with the two env vars plus
  `maxBudgetUsd` / `max_budget_usd`. https://code.claude.com/docs/en/agent-sdk/subagents
- A subagent spawned by the main agent runs in the background by default (result status `async_launched`).
  A completed subagent's result text includes `agentId`. Continue it with `SendMessage(to: agentId)`; the
  Agent tool has no `resume` parameter. `Explore` and `Plan` are one-shot and return no `agentId`.
- A subagent's own `bypassPermissions` setting is ignored (v2.1.267+), but a subagent still runs in
  `bypassPermissions` when the main conversation does. Gate the parent's mode, not only the subagent's.
  https://code.claude.com/docs/en/agent-sdk/subagents
- Session resume: capture `session_id` from the result message, pass it as `resume`. `continue` picks the
  most recent session. `forkSession` / `fork_session` branches history under a new id. Sessions persist the
  conversation, not the filesystem, under `~/.claude/projects/<encoded-cwd>/*.jsonl`. Forked agents' edits
  are real and shared. https://code.claude.com/docs/en/agent-sdk/sessions
- Enumerate sessions: `listSessions()` / `list_sessions()`. Read one transcript: `getSessionMessages()` /
  `get_session_messages()` (TS / Python). https://code.claude.com/docs/en/agent-sdk/sessions
- File checkpointing snapshots and reverts files the agent changed; its API: confirm in docs. `persistSession`
  is named for memory-only throwaway sessions; scope (exam material says TypeScript-only) and Python
  equivalent: confirm in docs. https://code.claude.com/docs/en/agent-sdk/sessions
- `AskUserQuestion` always goes through the `canUseTool` callback, is denied in `dontAsk` mode, and is
  removed when `--permission-prompts none` is used. https://code.claude.com/docs/en/agent-sdk/permissions
- Cost: `total_cost_usd` is a client-side estimate that includes subagents and, on resume, earlier spend.
  `modelUsage` includes subagents; `usage` counts only the main loop.
  https://code.claude.com/docs/en/agent-sdk/cost-tracking

## Exam-era vs current

- Older material says subagents cannot spawn subagents, and calls the tool `Task`. Today it is `Agent`,
  with capped nesting.
- Background-by-default subagents and fork subagents (v2.1.302) are recent. `Agent(fork)`: confirm in docs.
- Resumed-session cost totals restarted at zero before v2.1.277.
- Answer exam items by the blueprint (hub-and-spoke, explicit context passing). Build by the current docs.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-F | Agentic Architecture and Orchestration (27%) | Loop control, hub-and-spoke, context passing, parallel spawn, hooks, chains vs adaptive decomposition, sessions |
| CCAR-F | Context Management and Reliability (15%) | Escalation rules, structured error propagation, review routing |
| CCAR-F | Tool Design and MCP (18%) | Scoped tool sets per agent |
| CCAR-P | Solution Design and Architecture | Workflow vs agent vs augmented LLM, multi-agent orchestration |
| CCAR-P | Integration; Governance | Capability bloat, least privilege, human-in-the-loop |
| CCAO-F | Output Evaluation and Validation | When human review is required |
| CCDV-F | Agents and Workflows | Workflow vs agent, supervisors, Agent SDK, sessions, hooks, headless permissions |
