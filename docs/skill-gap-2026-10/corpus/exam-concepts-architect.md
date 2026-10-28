# Exam concepts: Architect certifications (own-words synthesis)

Derived from local practice-question tagging. All text is paraphrased; no source wording reproduced.

## claude-certified-architect-foundations — D1 Agentic Architecture & Orchestration

- **hub-and-spoke coordination** — A central coordinator owns routing and shared policy while workers stay narrow, which keeps behavior consistent. (features: Agent SDK subagents; questions: idx 0)
- **centralized error policy** — Fault-handling and observability rules live in one coordinating place instead of being reimplemented per worker. (features: Agent SDK subagents; questions: idx 0)
- **agentic loop mechanics** — A client-side loop calls the model, runs requested tools and feeds results back until the model stops asking. (features: Messages API tool use; stop_reason; questions: idx 1)
- **tool_result message pairing** — Each tool result is returned in a user turn tied by id to the request that produced it. (features: Messages API tool use; stop_reason; questions: idx 1)
- **stop_reason handling** — Loop control must branch on each possible stop reason, not just the common ones. (features: stop_reason; max_tokens; questions: idx 2)
- **truncated output detection** — A token-limit stop yields partial output and must not be treated as completion. (features: stop_reason; max_tokens; questions: idx 2)
- **explicit context passing to subagents** — Subagents start fresh, so the coordinator must put needed findings directly in their prompts. (features: Agent SDK subagents; questions: idx 3)
- **subagent context isolation** — Each subagent has its own context window and sees nothing from siblings or the parent unless told. (features: Agent SDK subagents; questions: idx 3)
- **goal-over-procedure subagent prompts** — Briefs that state objective and quality bar outperform rigid step lists when judgment is needed. (features: Agent SDK subagents; questions: idx 4)
- **subagent task briefing** — A delegation prompt should carry goal, constraints and expected output form. (features: Agent SDK subagents; questions: idx 4)
- **deterministic hook enforcement** — Hooks give code-level guarantees that prompts alone cannot, such as blocking or correcting calls. (features: Claude Code hooks: PreToolUse; permissionDecision; updatedInput; questions: idx 5)
- **PreToolUse input rewriting** — A pre-call hook can allow a call while replacing arguments with trusted values. (features: Claude Code hooks: PreToolUse; permissionDecision; updatedInput; questions: idx 5)
- **session resume limits** — Resuming restores the transcript, not the state of files on disk. (features: Agent SDK session resume; file checkpointing; questions: idx 7)
- **file checkpointing** — A separate feature snapshots file state so earlier versions can be restored. (features: Agent SDK session resume; file checkpointing; questions: idx 7)
- **SDK session management** — The Agent SDK exposes functions to list stored sessions and read their messages. (features: Agent SDK listSessions; Agent SDK getSessionMessages; questions: idx 9)
- **session persistence APIs** — Sessions are stored on disk and can be enumerated and read programmatically. (features: Agent SDK listSessions; Agent SDK getSessionMessages; questions: idx 9)

## claude-certified-architect-foundations — D2 Tool Design & MCP Integration

- **tool_choice modes** — The tool_choice setting selects auto, any, a named tool, or none, controlling whether tool calls are forced. (features: tool_choice; tool_choice: tool; tool_choice: auto; questions: idx 10)
- **forced first tool call** — Force one tool on the opening turn, then return to automatic choice. (features: tool_choice; tool_choice: tool; tool_choice: auto; questions: idx 10)
- **tool granularity** — Tools should do one coherent job so selection and behavior are predictable. (features: none; questions: idx 11)
- **single-purpose tools** — Splitting overloaded tools removes ambiguity about which behavior will run. (features: none; questions: idx 11)
- **MCP project-scope config** — A repo-level MCP config lets a whole team share server setup. (features: .mcp.json; MCP HTTP server auth headers; questions: idx 12)
- **environment variable expansion** — Config references env vars so secrets stay out of version control. (features: .mcp.json; MCP HTTP server auth headers; questions: idx 12)
- **built-in tool selection** — Know which built-in tool (pattern match, content search, read) fits the exact need. (features: Claude Code Glob tool; questions: idx 13)
- **Glob versus Grep distinction** — Pattern-on-filename tools differ from content-search tools; match the tool to the question. (features: Claude Code Glob tool; questions: idx 13)
- **tool description quality** — Descriptions and schemas must state valid inputs and semantics, or the model guesses. (features: none; questions: idx 15)
- **input schema documentation** — Schemas should enumerate valid fields and whether partial input is allowed. (features: none; questions: idx 15)

## claude-certified-architect-foundations — D3 Claude Code Configuration & Workflows

- **plan mode exploration** — Read-only planning lets Claude compare options before committing to changes. (features: Claude Code plan mode; questions: idx 17)
- **design option comparison** — Weigh competing architectures on cost and risk before choosing. (features: Claude Code plan mode; questions: idx 17)
- **headless CLI structured output** — Print mode with a JSON schema yields predictable output for automation. (features: claude -p; --output-format json; --json-schema; questions: idx 18)
- **CI integration of Claude** — Claude can run unattended inside pipelines and gate build steps. (features: claude -p; --output-format json; --json-schema; questions: idx 18)
- **headless CLI JSON metadata** — The JSON result already carries cost and per-model usage fields. (features: claude -p; --output-format json; total_cost_usd; modelUsage; questions: idx 19)
- **cost tracking from CLI** — Per-run spend is available in CLI output for finance reporting. (features: claude -p; --output-format json; total_cost_usd; modelUsage; questions: idx 19)
- **skill tool restrictions** — Skill tool allow-lists grant permission but do not by themselves remove other tools. (features: Skills frontmatter: allowed-tools; disallowedTools; questions: idx 20)
- **permission versus availability** — Pre-approving a tool is different from removing it from the callable set. (features: Skills frontmatter: allowed-tools; disallowedTools; questions: idx 20)
- **test-first iteration** — Writing tests before implementation shortens correction loops. (features: Claude Code; questions: idx 21)
- **correction cycle reduction** — Front-loaded verification lowers rework after implementation. (features: Claude Code; questions: idx 21)
- **interview-driven specification** — Letting the model ask structured questions uncovers requirements the user did not think of. (features: AskUserQuestion tool; questions: idx 22)
- **requirements elicitation** — Unknown-domain work benefits from surfacing hidden requirements early. (features: AskUserQuestion tool; questions: idx 22)
- **CLAUDE.md scope hierarchy** — Memory files load from user, project and directory levels; only repo-level ones reach teammates. (features: CLAUDE.md; ~/.claude/CLAUDE.md; questions: idx 23)
- **team convention sharing** — Shared rules must live in version-controlled files to reach every clone. (features: CLAUDE.md; ~/.claude/CLAUDE.md; questions: idx 23)

## claude-certified-architect-foundations — D4 Prompt Engineering & Structured Output

- **multi-pass code review** — Large reviews are split into focused passes to keep attention sharp. (features: none; questions: idx 8, 24)
- **attention dilution** — Stuffing too much material into one pass degrades depth and specificity of findings. (features: none; questions: idx 8)
- **cross-file integration pass** — A joint pass over interdependent files resolves conflicts that per-file passes create. (features: none; questions: idx 24)
- **tool_choice modes** — The tool_choice setting selects auto, any, a named tool, or none, controlling whether tool calls are forced. (features: tool_choice; tool_choice: tool; questions: idx 25)
- **schema-enforced extraction** — Structured output is guaranteed through forced tool use or schema constraints. (features: tool_choice; tool_choice: tool; questions: idx 25)
- **explicit review criteria** — Concrete, testable flag conditions beat vague instructions. (features: none; questions: idx 26)
- **false-positive reduction** — Precision rises when criteria and examples define what not to flag. (features: few-shot prompting; questions: idx 26, 28)
- **validation-retry loops** — On validation failure, retry with the source, prior output and the specific error. (features: structured outputs JSON schema; questions: idx 27)
- **targeted retry feedback** — Retry prompts that name the exact defect succeed more often than generic retries. (features: structured outputs JSON schema; questions: idx 27)
- **few-shot examples** — Labeled examples show boundary cases and calibrate model judgment. (features: few-shot prompting; questions: idx 28)

## claude-certified-architect-foundations — D5 Context Management & Reliability

- **structured escalation handoff** — Handoffs carry required fields (who, cause, next action) so a reader without history can proceed. (features: none; questions: idx 6)
- **human handoff context** — A receiver with no history needs the situation summarized completely. (features: none; questions: idx 6)
- **partial-failure handling** — Partial results plus a named blocker deserve follow-up, unlike total failure. (features: Agent SDK subagents; questions: idx 14)
- **structured error propagation** — Errors travel upward with type and context so the coordinator can decide what to do. (features: Agent SDK subagents; questions: idx 14, 16, 33)
- **subagent local recovery** — Transient faults are retried inside the worker; only final outcomes surface. (features: Agent SDK subagents; questions: idx 16)
- **escalation criteria** — Escalate on policy gaps, capability limits or explicit requests, not on task size. (features: none; questions: idx 29, 34)
- **policy-driven autonomy** — An agent may act alone when documented policy covers every needed step. (features: none; questions: idx 29)
- **segment-level accuracy review** — Aggregate accuracy hides weak slices; review policy should target them. (features: none; questions: idx 30)
- **human review routing** — Route to people based on risk signals rather than model confidence alone. (features: none; questions: idx 30, 31)
- **conflicting source detection** — Contradictory values inside a source should be surfaced, not silently resolved. (features: none; questions: idx 31)
- **claim provenance via citations** — Citations link each claim to exact source ranges for verifiable provenance. (features: Citations API; questions: idx 32)
- **citations versus manual bibliography** — Built-in citations give verifiable claim-level links; plain lists do not. (features: Citations API; questions: idx 32)
- **error type distinction** — Access failures, empty valid results and logic errors need different handling. (features: Agent SDK subagents; questions: idx 33)
- **explicit human request handling** — A configured rule to honor a request for a person overrides attempting resolution first. (features: none; questions: idx 34)

## claude-architect-professional — D1 Solution Design & Architecture

- **orchestrator-workers vs sectioning** — Runtime-discovered subtasks need an orchestrator; fixed independent parts suit sectioning. (features: Agent SDK subagents; Agent tool; questions: idx 2, 3, 6)
- **workflow pattern selection** — Choose among workflow patterns by whether subtasks are predictable. (features: none; questions: idx 2, 6)
- **specialist subagent decomposition** — Split broad work into subagents with their own tool sets and focus. (features: Agent SDK subagents; Agent tool; questions: idx 3)

## claude-architect-professional — D2 Claude Models, Prompting & Context Engineering

- **context editing** — Automatic removal of stale tool results as context grows. (features: Context editing; Memory tool; clear_tool_uses_20250919; context_management; Compaction; questions: idx 1, 9, 17)
- **cross-session memory** — A memory tool persists facts across separate sessions. (features: Context editing; Memory tool; Compaction; questions: idx 1, 17)
- **prompt templates and placeholders** — Templates with variables keep instructions stable and trackable. (features: prompt templates; questions: idx 8)
- **prompt reuse** — Stable instruction text is separated from changing input for consistency. (features: prompt templates; questions: idx 8)
- **tool result clearing config** — Trigger threshold, retained count and excluded tools configure clearing. (features: Context editing; clear_tool_uses_20250919; context_management; questions: idx 9)
- **prompt chaining** — Sequential calls where each output feeds the next step. (features: none; questions: idx 10)
- **inspectable intermediate steps** — Separate calls let you log and examine intermediate results. (features: none; questions: idx 10)
- **server-side compaction** — Older turns are summarized automatically near the context limit. (features: Compaction; Context editing; Memory tool; questions: idx 17)
- **model-capability mismatch evidence** — Persistent reasoning errors after prompt work point to needing a stronger model. (features: Claude Haiku 4.5; Claude Opus 4.8; questions: idx 21)
- **model selection trade-offs** — Weigh capability, speed and cost when choosing a model. (features: Claude Haiku 4.5; Claude Opus 4.8; questions: idx 21)
- **quote-first grounding** — Extract verbatim quotes first, then reason, to cut fabricated references. (features: none; questions: idx 22)
- **hallucination reduction** — Grounding techniques lower invented citations in long documents. (features: none; questions: idx 22)
- **prompt caching for static context** — Reusable prefixes (system prompt, tools, reference docs) are cached to cut cost and latency. (features: Prompt caching; cache_control; questions: idx 29)
- **cost-latency tuning** — Adjust settings that trade intelligence for lower cost and delay. (features: Prompt caching; cache_control; questions: idx 29)

## claude-architect-professional — D3 Integration

- **search result content blocks** — Retrieval tools can return structured result blocks that enable citation-quality attribution. (features: Search results content blocks; Citations API; questions: idx 0, 12)
- **RAG citation grounding** — Answers over private corpora cite the specific passages they used. (features: Search results content blocks; Citations API; questions: idx 0, 12)
- **latency and availability SLA design** — Protecting an SLA means picking faster models and resilience features deliberately. (features: Server-side fallback; Claude Haiku 4.5; questions: idx 4)
- **model fallback** — A backup model can be tried automatically when a request fails or is refused. (features: Server-side fallback; Claude Haiku 4.5; questions: idx 4)
- **custom tool search** — A custom search tool can implement discovery such as embeddings and return tool references. (features: Tool search tool; tool_reference blocks; questions: idx 11)
- **progressive tool discovery** — Loading tools on demand avoids bloating context with every definition. (features: Tool search tool; tool_reference blocks; questions: idx 11)
- **RAG chunking strategy** — Chunk on semantic boundaries with overlap to avoid split-answer misses. (features: none; questions: idx 13)
- **retrieval failure diagnosis** — Identify the specific cause, such as split sentences, behind missed retrievals. (features: none; questions: idx 13)
- **capability surface reduction** — Limit what the agent can trigger on its own to lower risk. (features: Skills frontmatter: disable-model-invocation; questions: idx 14)
- **skill invocation control** — Frontmatter can bar automatic model invocation of a skill. (features: Skills frontmatter: disable-model-invocation; questions: idx 14)
- **least-privilege skills** — Only expose what the agent genuinely needs to trigger autonomously. (features: Skills frontmatter: disable-model-invocation; questions: idx 14)
- **Claude Code telemetry export** — Telemetry needs both enablement and a chosen exporter. (features: CLAUDE_CODE_ENABLE_TELEMETRY; OpenTelemetry exporters; OTEL_METRICS_EXPORTER; questions: idx 16)
- **observability setup defaults** — Telemetry pipelines have defaults that can silently export nothing. (features: CLAUDE_CODE_ENABLE_TELEMETRY; OpenTelemetry exporters; OTEL_METRICS_EXPORTER; questions: idx 16)
- **hook-based approval enforcement** — A hook can require approval for a tool even when broader permissions allow it. (features: Claude Code hooks: PreToolUse; permissionDecision; bypassPermissions; allowedTools; questions: idx 23)
- **permission modes** — Permission modes govern what runs without prompting and interact with allow rules. (features: Claude Code hooks: PreToolUse; permissionDecision; bypassPermissions; allowedTools; questions: idx 23)

## claude-architect-professional — D4 Evaluation, Testing & Optimization

- **prompt caching for static context** — Reusable prefixes (system prompt, tools, reference docs) are cached to cut cost and latency. (features: Prompt caching; questions: idx 5)
- **cost and latency efficiency** — Reuse and caching reduce repeated processing without slowing turns. (features: Prompt caching; questions: idx 5)
- **SMART success criteria** — Success criteria should be specific, measurable, achievable, relevant and time-bound. (features: none; questions: idx 15)
- **evaluation design** — Evals need clear metrics, adequate samples and sound datasets. (features: none; questions: idx 15, 20)
- **measurable quality targets** — Quality goals should be quantified against a rubric and sample. (features: none; questions: idx 15)
- **effort parameter tuning** — Effort trades depth for token cost and latency within one model. (features: effort parameter; Claude Opus 4.8; questions: idx 18, 30)
- **cost-latency tuning** — Adjust settings that trade intelligence for lower cost and delay. (features: effort parameter; questions: idx 18)
- **realistic success criteria** — Targets must be achievable and grounded in task reality. (features: none; questions: idx 19)
- **feasible performance targets** — Targets should reflect what current models can realistically achieve. (features: none; questions: idx 19)
- **held-out test set** — Final claims need data the tuning process never saw. (features: none; questions: idx 20)
- **overfitting to dev set** — Repeated tuning on one dataset inflates apparent performance. (features: none; questions: idx 20)
- **cost attribution monitoring** — Admin usage APIs break spend down by workspace and model. (features: Usage and Cost Admin API; questions: idx 28)
- **spend growth diagnosis** — Find which workspace and model drive a cost increase. (features: Usage and Cost Admin API; questions: idx 28)
- **model selection trade-offs** — Weigh capability, speed and cost when choosing a model. (features: effort parameter; Claude Opus 4.8; questions: idx 30)

## claude-architect-professional — D5 Governance, Safety & Risk Management

- **prompt injection hardening** — Treat tool-returned content as data, encode it, and screen it. (features: system prompt policy; JSON-encoded tool results; questions: idx 7)
- **untrusted tool output** — Text from tools such as email can carry hostile instructions. (features: system prompt policy; JSON-encoded tool results; questions: idx 7)
- **bias and fairness evaluation** — Paired-scenario tests and documentation expose unequal treatment. (features: none; questions: idx 24)
- **transparency controls** — Users can see and contest the factors that shaped an output. (features: none; questions: idx 24)

## claude-architect-professional — D6 Stakeholder Communication & Lifecycle Management

- **discovery session criteria** — Early discovery establishes needs, latency targets and budget. (features: none; questions: idx 25)
- **model selection trade-offs** — Weigh capability, speed and cost when choosing a model. (features: none; questions: idx 25)
- **compliance-driven requirements mapping** — Regulatory or audit needs are translated into specific platform capabilities. (features: Citations API; questions: idx 26)
- **RAG citation grounding** — Answers over private corpora cite the specific passages they used. (features: Citations API; questions: idx 26)
- **model deprecation planning** — Retirement notices set migration deadlines that vary by hosting platform. (features: model deprecations; questions: idx 27)
- **stakeholder expectation setting** — Communicate actual deadlines and impacts accurately to stakeholders. (features: model deprecations; questions: idx 27)

## claude-architect-professional — D7 Developer Productivity & Operational Enablement

- **Claude Code enterprise rollout** — Rollouts pair a plan type with admin controls and usage visibility. (features: Claude for Teams; Claude for Enterprise; server-managed settings; Claude Code usage dashboard; questions: idx 31)
- **server-managed settings** — Admin-console-delivered settings cover both desktop and browser sessions with no device management. (features: Claude for Teams; Claude for Enterprise; server-managed settings; Claude Code usage dashboard; questions: idx 31)
- **CI permission modes** — Unattended runs need a mode that denies anything not pre-approved. (features: Claude Code permission modes; dontAsk mode; claude -p; questions: idx 32)
- **unattended pipeline safety** — Pipelines without humans need default-deny permission behavior. (features: Claude Code permission modes; dontAsk mode; claude -p; questions: idx 32)
- **autocompact thrashing recovery** — Repeated refill after compaction means inputs are too large; chunk or delegate. (features: Claude Code auto-compaction; subagents; questions: idx 33)
- **context size management** — Keep single reads small so context stays workable. (features: Claude Code auto-compaction; subagents; questions: idx 33)
- **MCP server debugging** — Reconnect then inspect debug logs when a connected server exposes nothing. (features: /mcp; claude --debug mcp; questions: idx 34)
- **systematic failure diagnosis** — Work from status checks to debug logs rather than guessing. (features: /mcp; claude --debug mcp; questions: idx 34)

## Cross-cutting themes

- Deterministic enforcement (hooks, permission modes, forced tool choice) is preferred over prompt-only instructions for anything safety- or correctness-critical.
- Context is a budget: clearing stale tool results, compaction, memory, chunked reads and subagent delegation all manage it.
- Subagents are isolated; anything they need must be passed explicitly, and their failures must be reported with type and context.
- Explicit, measurable criteria and labeled examples beat vague instructions, in prompts and in evaluation targets.
- Structured output is obtained by schema or forced tool use, with validation-retry feedback naming the specific error.
- Human review and escalation are triggered by specific risk signals (ambiguity, contradiction, explicit request), not by size or confidence alone.
- Citations and search-result blocks give claim-level provenance for compliance-sensitive answers.
- Cost and latency levers (prompt caching, effort, model choice, fallback) are weighed before changing architecture.
- Configuration scope matters: repo-level versus user-level files decide what teammates actually receive.
- Evaluation hygiene (held-out data, realistic targets, cost attribution) underpins any claim that a design works.
