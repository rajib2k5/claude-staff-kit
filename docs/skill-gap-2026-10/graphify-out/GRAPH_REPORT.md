# Graph Report - skill-gap-2026-10  (2026-10-28)

## Corpus Check
- 11 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 957 nodes · 2128 edges · 31 communities (26 shown, 5 thin omitted)
- Extraction: 71% EXTRACTED · 29% INFERRED · 0% AMBIGUOUS · INFERRED: 608 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- claude-agent-orchestration
- claude-api-ops
- claude-governance
- CCAR-F: Prompt Engineering & Structured 
- claude-context-management
- claude-evals
- CCAR-F: Claude Code Configuration & Work
- CCAR-F: Agentic Architecture & Orchestra
- CCAR-F: Tool Design & MCP Integration
- claude-tool-and-mcp-design
- claude-solution-design
- CCAR-P: Claude Models, Prompting & Conte
- CCDV-F: Claude Code
- claude-prompt-engineering
- CCAR-P: D2 Claude Models, Prompting & Co
- claude-code-config
- CCAR-P: Integration
- CCDV-F: Prompt and Context Engineering
- CCAR-F: D3 Claude Code Configuration & W
- Community 14
- Community 13
- CCAR-P: Evaluation, Testing & Optimizati
- CCAR-F: D4 Prompt Engineering & Structur
- CCAR-P: Solution Design & Architecture
- CCAR-P: D3 Integration
- CCAR-P: Stakeholder Communication & Life
- Community 9
- Community 6
- Community 5
- Community 5
- CCAR-P: D5 Governance, Safety & Risk Man

## God Nodes (most connected - your core abstractions)
1. `builtin-skill: claude-api` - 46 edges
2. `PROPOSED skill: claude-agent-orchestration` - 43 edges
3. `PROPOSED skill: claude-prompt-engineering` - 41 edges
4. `CCDV-F: Applications and Integration` - 38 edges
5. `PROPOSED skill: claude-governance` - 35 edges
6. `PROPOSED skill: claude-api-ops` - 32 edges
7. `CCDV-F: Prompt and Context Engineering` - 31 edges
8. `CCDV-F: Security and Safety` - 31 edges
9. `CCAO-F: Governance, Risk, and Responsible Use` - 29 edges
10. `CCDV-F: Agents and Workflows` - 29 edges

## Surprising Connections (you probably didn't know these)
- `permission modes` --semantically_similar_to--> `skill: eck-sandbox`  [INFERRED] [semantically similar]
  derived/concepts-architect.jsonl → derived/skill_catalog.json
- `source freshness` --semantically_similar_to--> `skill: data-quality`  [INFERRED] [semantically similar]
  derived/concepts-associate-developer.jsonl → derived/skill_catalog.json
- `local versus shared settings` --semantically_similar_to--> `plugin-skill: plugin-dev:plugin-settings`  [INFERRED] [semantically similar]
  derived/concepts-associate-developer.jsonl → derived/skill_catalog.json
- `hub-and-spoke coordination` --semantically_similar_to--> `plugin-skill: 6.4.1:subagent-driven-development`  [INFERRED] [semantically similar]
  derived/concepts-architect.jsonl → derived/skill_catalog.json
- `centralized error policy` --semantically_similar_to--> `agent: sre-reliability`  [INFERRED] [semantically similar]
  derived/concepts-architect.jsonl → derived/skill_catalog.json

## Communities (31 total, 5 thin omitted)

### Community 0 - "claude-agent-orchestration"
Cohesion: 0.06
Nodes (36): builtin-skill: workflow-authoring, CCAR-F: D1 Agentic Architecture & Orchestration, CCAR-F: D5 Context Management & Reliability, CCAR-P: D1 Solution Design & Architecture, CCDV-F: Agents and Workflows, Agent SDK getSessionMessages, Agent SDK listSessions, Agent SDK session resume (+28 more)

### Community 1 - "claude-api-ops"
Cohesion: 0.06
Nodes (29): agent: adversarial-validator, builtin-skill: claude-api, CCDV-F, CCAO-F: Product and Model Selection, CCDV-F: Eval, Testing, and Debugging, CCDV-F: Model Selection and Optimization, Anthropic SDKs, Claude models (+21 more)

### Community 2 - "claude-governance"
Cohesion: 0.06
Nodes (18): agent: security-auditor, CCAO-F: Governance, Risk, and Responsible Use, CCDV-F: Security and Safety, Claude for Work, Code execution tool, Enterprise plan, HIPAA-ready API organization, Incognito chats (+10 more)

### Community 3 - "CCAR-F: Prompt Engineering & Structured "
Cohesion: 0.06
Nodes (15): CCAR-F: Prompt Engineering & Structured Output, CCDV-F: Applications and Integration, adaptive thinking, Claude API: 429 errors, Claude API: rate limits, custom_id, effort levels, Extended thinking (+7 more)

### Community 4 - "claude-context-management"
Cohesion: 0.06
Nodes (23): CCAO-F, CCAO-F: Configuration and Knowledge Management, CCAO-F: Troubleshooting and Optimization, CCAR-P: D6 Stakeholder Communication & Lifecycle Management, Automatic context management, Citations API, Connectors, Gmail (+15 more)

### Community 5 - "claude-evals"
Cohesion: 0.05
Nodes (17): CCAO-F: Output Evaluation and Validation, CCAR-P: D4 Evaluation, Testing & Optimization, CCAR-P: Governance, Safety & Risk Management, cache_control, Claude Opus 4.8, effort parameter, Usage and Cost Admin API, Web search (+9 more)

### Community 6 - "CCAR-F: Claude Code Configuration & Work"
Cohesion: 0.06
Nodes (13): CCAR-F: Claude Code Configuration & Workflows, CCAR-F: Context Management & Reliability, allowed-tools, argument-hint, .claude/commands/, .claude/rules/, .claude/skills/, /compact (+5 more)

### Community 7 - "CCAR-F: Agentic Architecture & Orchestra"
Cohesion: 0.07
Nodes (20): CCAR-F: Agentic Architecture & Orchestration, AgentDefinition, allowedTools, Claude Agent SDK, Claude Agent SDK hooks, Claude Agent SDK: plugins option, Claude API, Claude Code plugins (+12 more)

### Community 8 - "CCAR-F: Tool Design & MCP Integration"
Cohesion: 0.09
Nodes (18): CCAR-F: Tool Design & MCP Integration, Bash, ~/.claude.json, Edit, function calling, Glob, Grep, --json-schema (+10 more)

### Community 9 - "claude-tool-and-mcp-design"
Cohesion: 0.09
Nodes (21): agent: codebase-explorer, CCAR-F: D2 Tool Design & MCP Integration, CCAR-P: D7 Developer Productivity & Operational Enablement, CCDV-F: Tools and MCPs, Claude Agent SDK: built-in tools, Claude Agent SDK: custom tools, Claude Code Glob tool, Claude Code usage dashboard (+13 more)

### Community 10 - "claude-solution-design"
Cohesion: 0.07
Nodes (12): agent: docs-writer, builtin-skill: artifact-design, CCAO-F: Workflow Integration and Solution Design, Artifacts, Research, Research mode, plugin-skill: 64e3e0b88be8:artifact, plugin-skill: 7.0.0:brainstorming (+4 more)

### Community 11 - "CCAR-P: Claude Models, Prompting & Conte"
Cohesion: 0.10
Nodes (10): CCAR-P: Claude Models, Prompting & Context Engineering, CCAR-P: Developer Productivity & Operational Enablement, Agent Skills, auto mode, claude.ai, Claude Code, CLAUDE.md, plugins (+2 more)

### Community 12 - "CCDV-F: Claude Code"
Cohesion: 0.18
Nodes (14): builtin-skill: fewer-permission-prompts, builtin-skill: update-config, CCDV-F: Claude Code, Claude Agent SDK: allowed_tools, Claude Agent SDK: canUseTool, Claude Agent SDK: permission_mode, Claude Code hooks, Claude Code: permissions.deny (+6 more)

### Community 13 - "claude-prompt-engineering"
Cohesion: 0.15
Nodes (3): CCAO-F: Prompting and Task Execution, PROPOSED skill: claude-prompt-engineering, skill: simple-english

### Community 14 - "CCAR-P: D2 Claude Models, Prompting & Co"
Cohesion: 0.16
Nodes (8): CCAR-P: D2 Claude Models, Prompting & Context Engineering, clear_tool_uses_20250919, Context editing, context_management, Memory tool, prompt templates, plugin-skill: plugin-dev:command-development, plugin-skill: productivity:memory-management

### Community 15 - "claude-code-config"
Cohesion: 0.18
Nodes (10): Claude Code permission modes, claude -p, dontAsk mode, modelUsage, Skills frontmatter: allowed-tools, total_cost_usd, plugin-skill: receipts:receipts, PROPOSED skill: claude-code-config (+2 more)

### Community 17 - "CCDV-F: Prompt and Context Engineering"
Cohesion: 0.14
Nodes (3): CCDV-F: Prompt and Context Engineering, Messages API: stop_reason, structured outputs

### Community 18 - "CCAR-F: D3 Claude Code Configuration & W"
Cohesion: 0.18
Nodes (10): CCAR-F, CCAR-F: D3 Claude Code Configuration & Workflows, ~/.claude/CLAUDE.md, Claude Code plan mode, plugin-skill: 1.0.0:claude-md-improver, plugin-skill: 6.4.1:test-driven-development, skill: eck-design, skill: staff-bootstrap (+2 more)

### Community 19 - "Community 14"
Cohesion: 0.24
Nodes (8): bypassPermissions, Claude Code hooks: matcher, Claude Code hooks: PreToolUse, permissionDecision, updatedInput, plugin-skill: hookify:writing-rules, plugin-skill: plugin-dev:hook-development, skill: code-mods-essentials

### Community 20 - "Community 13"
Cohesion: 0.23
Nodes (4): builtin-skill: init, Claude Agent SDK: hooks (PreCompact), Compaction, subagents

### Community 22 - "CCAR-F: D4 Prompt Engineering & Structur"
Cohesion: 0.26
Nodes (5): CCAR-F: D4 Prompt Engineering & Structured Output, few-shot prompting, structured outputs JSON schema, rule: code-review, skill: staff-review

### Community 24 - "CCAR-P: D3 Integration"
Cohesion: 0.24
Nodes (5): CCAR-P: D3 Integration, Skills frontmatter: disable-model-invocation, tool_reference blocks, Tool search tool, plugin-skill: plugin-dev:skill-development

### Community 26 - "Community 9"
Cohesion: 0.31
Nodes (4): Claude Agent SDK: subagents, Claude Code auto-compaction, rule: context-discipline, skill: eck-fresh-context

### Community 27 - "Community 6"
Cohesion: 0.47
Nodes (3): agent: sre-reliability, Claude Haiku 4.5, Server-side fallback

### Community 28 - "Community 5"
Cohesion: 0.60
Nodes (3): CLAUDE_CODE_ENABLE_TELEMETRY, OpenTelemetry exporters, OTEL_METRICS_EXPORTER

### Community 29 - "Community 5"
Cohesion: 0.60
Nodes (3): AskUserQuestion tool, plugin-skill: 6.4.1:brainstorming, skill: eck-spec

## Knowledge Gaps
- **14 isolated node(s):** `plugin-skill: 6.4.1:subagent-driven-development`, `skill: eck-design`, `plugin-skill: receipts:receipts`, `plugin-skill: productivity:memory-management`, `plugin-skill: 6.4.1:systematic-debugging` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 168 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CCAR-F` connect `CCAR-F: D3 Claude Code Configuration & W` to `claude-agent-orchestration`, `CCAR-F: Prompt Engineering & Structured `, `CCAR-F: Claude Code Configuration & Work`, `CCAR-F: Agentic Architecture & Orchestra`, `CCAR-F: Tool Design & MCP Integration`, `claude-tool-and-mcp-design`, `CCAR-F: D4 Prompt Engineering & Structur`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Are the 46 inferred relationships involving `builtin-skill: claude-api` (e.g. with `agentic loop mechanics` and `batch expiry window`) actually correct?**
  _`builtin-skill: claude-api` has 46 INFERRED edges - model-reasoned connections that need verification._
- **What connects `plugin-skill: 6.4.1:subagent-driven-development`, `skill: eck-design`, `plugin-skill: receipts:receipts` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `claude-agent-orchestration` be split into smaller, more focused modules?**
  _Cohesion score 0.05570611261668172 - nodes in this community are weakly interconnected._
- **Why does `CCAR-P` connect `CCAR-P: D5 Governance, Safety & Risk Man` to `claude-agent-orchestration`, `claude-context-management`, `claude-evals`, `claude-tool-and-mcp-design`, `CCAR-P: Claude Models, Prompting & Conte`, `CCAR-P: D2 Claude Models, Prompting & Co`, `CCAR-P: Integration`, `CCAR-P: Evaluation, Testing & Optimizati`, `CCAR-P: Solution Design & Architecture`, `CCAR-P: D3 Integration`, `CCAR-P: Stakeholder Communication & Life`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **Are the 43 inferred relationships involving `PROPOSED skill: claude-agent-orchestration` (e.g. with `agent framework comparison` and `automatic denial of unlisted tools`) actually correct?**
  _`PROPOSED skill: claude-agent-orchestration` has 43 INFERRED edges - model-reasoned connections that need verification._
- **Should `claude-api-ops` be split into smaller, more focused modules?**
  _Cohesion score 0.05964912280701754 - nodes in this community are weakly interconnected._