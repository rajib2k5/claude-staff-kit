# skill: cost-conscious-orchestration

Location: live+repo. Lines: 159. Model ids named: claude-fable-5, claude-haiku-4-5-20251001, claude-opus-5, claude-sonnet-5.

Purpose: Routes work to the cheapest model that can do it correctly, delegates to subagents to protect the main context, and tracks every task on a todo list that is verified complete before the work is reported done. Use when planning multi-step work, dispatching any subagent, choosing a model, deciding whether to delegate, or when a session is long, context is filling, or token spend matters.

Sections:
- Cost-Conscious Orchestration
- 0. The budget this operates under — Claude Max, personal, monthly
- 1. Model routing — every subagent gets an explicit model
- Auto mode
- 2. Delegate to subagents — for cost *and* for context
- Writing a subagent prompt that does not waste tokens
- 3. A subagent's report is evidence, not verdict
- 4. Todo tasks — and verifying they are actually complete
- The completion sweep — mandatory before reporting done
- 5. Cheap habits that compound
