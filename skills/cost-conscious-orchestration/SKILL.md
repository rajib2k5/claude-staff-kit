---
name: cost-conscious-orchestration
description: Routes work to the cheapest model that can do it correctly, delegates to subagents to protect the main context, and tracks every task on a todo list that is verified complete before the work is reported done. Use when planning multi-step work, dispatching any subagent, choosing a model, deciding whether to delegate, or when a session is long, context is filling, or token spend matters.
license: MIT
---

# Cost-Conscious Orchestration

Three levers, applied together: **route to the cheapest sufficient model**, **delegate to
subagents so the main thread stays clean**, and **track every task to verified completion**.
Cost and correctness are the same discipline here — an under-powered model on a hard task is
not a saving, it is a bad change bought at a discount.

This skill implements `~/.claude/rules/agent-models.md` and `~/.claude/rules/context-discipline.md`.
Where this file and those rules disagree, the rules win.

## 0. The budget this operates under — Claude Max, personal, monthly

The user is on a **personal Claude Max monthly plan**. Capacity is a shared, rolling allowance
across this and every other session — not a per-task budget. Exhausting it stops *all* work,
including work that matters more than whatever spent it. Treat headroom as a resource to be
defended, not consumed.

**Opus is the dominant cost term.** A wide Opus fan-out is the single fastest way to burn the
allowance; the same work routed Sonnet-first with Opus reserved for validation typically costs a
small fraction of it.

Operating rules:

- **Default to Sonnet.** Escalate to Opus deliberately, per the routing table below — not "to be
  safe". "When ambiguous, use Opus" applies to *genuinely* ambiguous complex work, not to routine
  tasks that merely look important.
- **Do not ask permission for spend.** The user has ruled: only DESTRUCTIVE operations warrant a
  confirmation prompt. For a large or Opus-heavy wave, state the rough cost, pause ~30 seconds so
  the user can interject if they want to, then proceed. Never block work waiting on a cost answer.
- **Still fan out deliberately.** Wide Opus waves remain the fastest way to burn the allowance, so
  route Sonnet-first and escalate per the table — the discipline is in the routing, not in asking.
- **Prefer one good agent over many mediocre ones.** Parallelism costs linearly; it is worth it
  for genuinely independent work and wasteful for work one agent could do in sequence.
- **Reuse before regenerating.** Cached/previous results, an existing artifact, a template already
  verified — always cheaper than a fresh generation.
- **Verify the pattern before replicating it.** One verified template then a mechanical fan-out
  beats 30 agents each solving the same problem from scratch.
- **Stop early on satisfied goals.** Do not add polish passes, extra validation rounds, or
  "while I'm here" improvements that were not asked for. Scope creep is spend.
- **Surface spend honestly.** Report measured token usage when a wave completes, and flag when a
  request implies an unusually large spend *before* starting it, so the user can decide.
- If the allowance looks strained, say so plainly and propose the cheaper path — a narrower scope,
  Sonnet routing, or deferring non-essential work — rather than silently continuing.

The one exception that is never traded away: **adversarial validation stays on Opus.** A cheap
validator produces false confidence, which costs more than it saves.

## 1. Model routing — every subagent gets an explicit model

Never let a subagent inherit the session model silently. Pass `model:` on every dispatch.

| Task complexity | Model | Typical work |
|---|---|---|
| **Very simple** — lookup, transcription, single-fact | `sonnet` | Find a symbol, read one file and report, list files matching a pattern, count objects, copy values between files |
| **Simple / moderate** — mechanical, bounded, verifiable | `sonnet` | Multi-file find/replace, scaffold from a template, write tests against a stated oracle, inventory a directory, summarise a known doc |
| **Complex** — synthesis, tradeoffs, whole-system context | `opus` | Design a change across modules, root-cause an unknown failure, concurrency/transaction reasoning, schema or API migration, cost/capacity modelling, anything where a plausible-but-wrong answer is expensive |
| **Adversarial validation** — always | `opus`, never downgraded | Breaking a claim, checking a number destined for a human, auditing a migration, verifying "it's fixed" |

Model ids in this environment: prefer the aliases `sonnet` / `opus` / `haiku` / `fable` — they
track the current generation without edits. Canonical ids when a pin is genuinely required:
latest Opus `claude-opus-5`, latest Sonnet `claude-sonnet-5`, latest Fable `claude-fable-5`,
Haiku `claude-haiku-4-5-20251001`. **Use version 5 or higher.** Model ids are not guessable and
roll forward — confirm from `/model` or the session banner before pinning, and never silently
fall back to a weaker model for validation; say the intended model was unavailable instead.

**When it is ambiguous, use Opus.** A mis-routed simple task costs tokens. A mis-routed complex
task costs a bad change, and the bad change is found later by someone with no context.

### Auto mode

Where the harness offers automatic model selection, prefer it for the main thread — it picks
per-turn and avoids paying Opus rates for conversational turns. Auto mode does **not** relieve
you of routing subagents explicitly: a subagent launched without `model:` is the failure this
skill exists to prevent. Set the session default with `/model` (auto) and keep passing `model:`
on every `Agent`/`Task` dispatch.

## 2. Delegate to subagents — for cost *and* for context

Delegate when the work is **read-many, report-little**. The subagent burns its own context
window and returns only the conclusion, which is the single biggest lever on a long session.

**Delegate:**
- Sweeping many files or directories to answer one question
- Inventory and mapping tasks across a repo
- Anything whose *output* is a paragraph but whose *input* is thousands of lines
- Independent work that can run in parallel
- Adversarial validation (always a separate agent — self-review is not validation)

**Do not delegate:**
- A single-fact lookup in a file you already know — the dispatch costs more than the read
- Work that needs the conversation's full context to be judged correctly
- A task you cannot specify precisely enough to verify the result

**Launch independent subagents in one message** so they run in parallel. Mixing models across
concurrent agents (Sonnet for lookups, Opus for the analysis) is the intended pattern, not a
compromise.

### Writing a subagent prompt that does not waste tokens

1. State the deliverable and its exact shape first — what you want back, in what structure.
2. Name the files/paths to start from. Un-anchored agents explore, and exploring is the cost.
3. Set explicit limits: "read only files you change", "run the test command at most twice",
   "do not re-explore the codebase".
4. Forbid scope creep explicitly — no refactors, no dependency additions, no unrelated fixes.
5. Require the agent to report what it **executed**, with output, not what it believes.

## 3. A subagent's report is evidence, not verdict

Explorers miss files. Summarisers drop the caveat that mattered. Validators produce false
positives. **Confirm any flagged blocker empirically before acting on it** — a throwaway
round-trip, a real build. Do not relay a subagent's report as verified fact; say what was
checked and how. See `~/.claude/rules/adversarial-validation.md`.

## 4. Todo tasks — and verifying they are actually complete

Any work with more than ~3 steps, or any work dispatched to subagents, is tracked on a todo
list from the start. The list is the contract between intent and delivery.

Rules:
- **One task per deliverable**, phrased as an outcome ("hub lists the 12 new demos"), not an
  activity ("work on hub").
- Exactly **one task in progress** at a time. Mark it complete the moment it is done — never
  batch completions at the end, which is where silently-dropped work hides.
- A task moves to complete **only when its verification has been executed in this session**.
  Not "the code is written" — the command was run and the output was seen.
- If a task cannot be completed, it stays incomplete and a new task is added describing the
  blocker. Never mark something complete because it is mostly done.

### The completion sweep — mandatory before reporting done

Before saying the work is finished, re-read the todo list top to bottom and, for each item, name
the evidence:

| Task | Verified how | Result |
|---|---|---|
| *(outcome)* | *(command executed this session)* | *(output seen)* |

Anything without executed evidence is reported as **not verified**, explicitly. Anything skipped
is named as skipped, with the reason. See `~/.claude/rules/definition-of-done.md`.

Forbidden without a command executed in this session: "tests pass", "the build is green",
"verified", "confirmed working", "faster".

## 5. Cheap habits that compound

- Search before reading; read the hit and its surroundings, not the whole file.
- Never re-read a file you just edited to confirm the edit — the edit tool errors on failure.
- Never re-derive a fact already established in the session; cite the earlier measurement.
- Prefer one batched tool call over five sequential ones where the calls are independent.
- Put throwaway scripts and intermediate output in the scratchpad directory, not the project.
- When a long task is mostly mechanical, template it once, verify the template, then fan out —
  verifying the pattern before 30 copies of it is the cheapest correctness you will ever buy.
