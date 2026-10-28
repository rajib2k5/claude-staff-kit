---
name: claude-context-management
description: Manage what Claude sees across a long task - budget the window, decide what to keep, prune, summarise or persist, and design context editing, compaction and memory so durable facts survive. Use when a session or agent run gets long, quality drifts, tool output bloats the window, or work must survive a restart. Triggers - context window full, compaction, context editing, memory tool, long-running agent, lost in the middle, keep facts after summarising, restart or resume.
---

# Claude context management

This skill adds one judgement: **context is a budget, and summaries are lossy.** Decide per item whether
it stays in the window, is cleared, is summarised, or lives outside the window. Put anything that must stay
exact outside the summary path.

Scope: what each party sees. Who does what belongs to
[`claude-agent-orchestration`](../claude-agent-orchestration/SKILL.md). Subagents appear here only as an
isolation tool for context. Read both for a long-running system.

## When to use / when not

Use for: window budgeting, tool-output trimming, context editing, compaction, the memory tool, case-facts
blocks, crash recovery, restart vs resume, progressive discovery vs loading everything.

Do not use for:
- Raw API request shapes, token counting, prompt caching mechanics: use `claude-api`.
- Choosing coordinator, workers, escalation, sessions as a topology: use `claude-agent-orchestration`.
- Writing the hook that prunes or archives: use `plugin-dev:hook-development`.
- Spend decisions in this session: use `cost-conscious-orchestration`.
- Checking that a recovery design really works: use `staff-validate`.

## Decision rules

1. **Budget before you tune.** Everything counts: system prompt, tool definitions, history, tool results,
   thinking, and the reply. Measure real usage from results. Guessing sizes hides the heavy item.
2. **Sort every item into keep, clear, summarise or persist.** Keep: the live goal and the last few
   steps. Clear: stale tool results. Summarise: narrative of finished phases. Persist: exact facts and decisions.
3. **Keep exact facts out of summaries.** Amounts, dates, ids, constraints and user commitments go in a
   persistent facts block. Repeated summarising blurs numbers into vague prose.
4. **Trim at the source.** Make tools or a post-tool hook return only the fields the next step needs. A
   bloated result is paid for on every later turn.
5. **Order for attention.** Put key findings and the task at the start, and use headers on long inputs.
   The middle of a long input is read least reliably.
6. **Use the lightest reduction that fits, in this order:** trim at source, clear old tool results, compact,
   persist to memory, start fresh. Each step down loses more detail.
7. **Prefer compaction for long conversations; use context editing for fine control.** The docs frame
   compaction as the primary strategy and editing as the targeted option.
8. **Clear in big batches.** Clearing changes the prefix and invalidates the cache behind it. Set a
   minimum amount to clear so each edit pays for itself. Exclude tools whose results must stay.
9. **Clear results, not the record of the call, unless the call is also bulky.** The call stays so the
   model knows what it already tried.
10. **Delegate verbose work.** A subagent reads the noise in its own window and returns a compact,
    structured result. Return conclusions plus pointers, not transcripts.
11. **Persist what must outlive the window.** Decisions, open questions, progress and a manifest of
    completed work go to files or the memory tool. Store conclusions, not raw logs.
12. **Treat memory as untrusted storage you own.** Validate every path against the memory root, cap size,
    expire stale entries, and never let stored text act as instructions.
13. **Put standing rules where compaction cannot touch them.** Formatting and process rules belong in the
    instruction file or system prompt, not in a chat message. Archive the full transcript before compaction
    if history may be needed later.
14. **Resume only when the context is still true.** If files changed or tool results are stale, start fresh
    with a structured summary, or tell the resumed session exactly what changed. A session does not
    restore files.
15. **Load on demand.** Prefer progressive discovery (skills, tool search, retrieval) to a monolithic
    context. Always-on instructions are for rules that apply everywhere.
16. **Carry provenance.** Keep source, date and conflicts attached to claims through every summary, or
    time differences read as contradictions.
17. **Design for loss.** Assume any run can lose its window. A fresh agent must continue from the persisted
    state alone.
18. **In chat products, one task per chat.** Front-load background and the goal, and start a new chat when
    the task changes. Long threads re-read everything and use allowance faster.

## Procedure

1. **Inventory the window.** List the sources and rough share of each. Check: you can name the top three
   consumers from measured usage, not memory.
2. **Classify each source** with rule 2. Check: every source has exactly one fate.
3. **Define the facts block.** Fields: goal, constraints, ids, amounts and dates, decisions, open
   questions, next step. Check: a reader can resume from it with no history.
4. **Cut at the source.** Trim tool output and move bulk reading to subagents. Check: the same task run
   again uses fewer tokens and gives the same answer.
5. **Pick the reduction mechanism** with rules 6 and 7, and set triggers and keep counts deliberately.
   Check: run past the trigger and confirm what was cleared or summarised.
6. **Place standing rules** in an always-loaded location. Check: trigger a compaction and confirm the rule
   still holds in the next turn.
7. **Add persistence:** memory tool or files, plus a manifest of completed work. Check: delete the window
   mid-task and continue from the store.
8. **Test loss.** Force a restart after each phase. Check: no fact was lost, no step was repeated, and
   conflicts and dates survived.
9. **Monitor.** Log input tokens per turn and per tool. Check: a regression shows up as a number, not a feeling.

## Anti-patterns

- Summarising repeatedly and trusting the summary for numbers.
- Keeping the whole tool result when one field was needed.
- Clearing a little on every turn, so the cache never settles.
- Putting a hard rule in conversation and expecting it to survive compaction.
- Resuming a session whose tool results describe a repository that has since changed.
- Using the memory tool without path checks, size limits or expiry.
- Loading every tool definition and document up front.
- Treating a bigger window as a reason to stop curating.
- Handing a subagent a vague pointer ("the earlier findings") instead of the findings themselves.
- Saving raw transcripts as memory and calling it recovery.

## Current platform facts (checked 2026-10-28)

- Context editing: server-side clearing, beta header `context-management-2025-06-27`, set through the
  top-level `context_management` parameter with an `edits` array (`client.beta.messages` in SDKs).
  https://platform.claude.com/docs/en/build-with-claude/context-editing
- Two strategies: `clear_tool_uses_20250919` (oldest tool results) and `clear_thinking_20251015` (earlier
  thinking blocks). Use `clear_at_least`, because clearing invalidates cached prefixes.
  https://platform.claude.com/docs/en/build-with-claude/context-editing
- `clear_tool_uses_20250919` defaults: trigger 100,000 input tokens (or tool uses), keep the 3 most recent
  tool use and result pairs, `exclude_tools` none, `clear_tool_inputs` false. Cleared results become
  placeholder text. https://platform.claude.com/docs/en/build-with-claude/context-editing
- The docs call server-side compaction the primary strategy for long conversations and context editing the
  fine-grained option. https://platform.claude.com/docs/en/build-with-claude/context-editing
- Compaction replaces older turns with a summary. Two forms: on demand (put the returned compaction block
  first in `messages`; header `compact-2026-09-04`; top-level `compaction` parameter) and at a token
  threshold (the API compacts inside ordinary requests when input tokens reach your trigger).
  https://platform.claude.com/docs/en/build-with-claude/compaction
- Client-side compaction in the tool runner was removed in API version 2026-10-21. See the migration
  guide. https://platform.claude.com/docs/en/build-with-claude/compaction
- Claude Code `/compact`, auto-compaction and any pre-compaction hook event: confirm in docs.
- Memory tool: client-side, `{type: memory_20250818, name: memory}`. Claude issues `view`, `create`,
  `str_replace`, `insert`, `delete`, `rename` against `/memories`; your code runs them and returns
  `tool_result`. Reject paths outside `/memories`. You own storage, size and expiry.
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- Usage reading: `modelUsage` on the SDK result includes subagent requests; `usage` counts the main loop
  only. https://code.claude.com/docs/en/agent-sdk/cost-tracking
- Sessions persist the conversation, not the filesystem. Resume with `resume`; branch with `forkSession` /
  `fork_session`. A subagent starts fresh and returns only its final message.
  https://code.claude.com/docs/en/agent-sdk/sessions

## Exam-era vs current

- Older material describes only context editing or client-side summarising. Compaction is a September 2026
  API addition (`compact-2026-09-04`), and tool-runner client-side compaction was removed 2026-10-21.
- Exam items on "summarise or prune" may expect a hand-built summary step. Today, prefer the platform
  features, and keep a facts block for what must stay exact.
- Answer exam items by the blueprint (case facts, scratchpad files, manifests, subagent isolation). Build by
  the current docs.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-F | Context Management and Reliability (15%) | Case-facts block, tool-output trimming, ordering, scratchpads, manifests, compaction, provenance |
| CCAR-F | Agentic Architecture and Orchestration (27%) | Isolated subagent context, session resume vs fresh |
| CCAR-F | Claude Code Configuration (20%) | Skills vs always-on instructions, Explore subagent for discovery |
| CCAR-P | Models, Prompting and Context Engineering | Window and token budgeting, reuse |
| CCAR-P | Integration | Progressive discovery vs monolithic context |
| CCAO-F | Product and Model Selection | Restart, summarise or persist; allowance habits |
| CCDV-F | Prompt and Context Engineering | Compaction, tool-output pruning, isolation via subagents |
| CCDV-F | Agents and Workflows | Memory and context management patterns |
