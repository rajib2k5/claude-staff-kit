---
name: claude-solution-design
description: Turn a business problem into a Claude solution — frame the need, agree scope, pick the product surface and base pattern, place the integration points, brief stakeholders and plan pilot-to-maintenance rollout. Use when someone brings a request that names a tool or a solution before the outcome is clear, or asks which Claude product to use. Triggers - which Claude product should we use, workflow or agent, scope this AI project, solution architecture for Claude, pilot plan for an AI tool, explain this design to stakeholders.
---

# Claude solution design

Adds the judgement that comes before any build: what outcome is wanted, whether Claude is the right tool,
which surface and pattern are the smallest that work, and how the work lands with the people who use it.
Most failed AI projects solved a stated request, not the underlying need. Settle the need and the scope
first. Choose technology last.

## When to use / when not

Use for: a new business request, a "which product" question, a pattern choice, a pilot plan, a stakeholder
briefing, a rollout and maintenance plan.

Do not use for:
- Engineering design of a feature inside an existing system. Use [`staff-design`](../staff-design/SKILL.md).
  This skill runs first and hands it a scoped, surface-chosen brief.
- Multi-agent topology, handoffs and loop control. Use `claude-agent-orchestration`.
- Measuring quality and designing test sets. Use `claude-evals`.
- Data classes, human oversight and admin controls. Use `claude-governance`.
- SDK syntax, parameters and model ids. Use `claude-api`. Starting an SDK project: `agent-sdk-dev:new-sdk-app`.
- Recording the decision. Use [`staff-adr`](../staff-adr/SKILL.md).
- Model routing inside a session. Use [`cost-conscious-orchestration`](../cost-conscious-orchestration/SKILL.md).

## Decision rules

1. **Ask for the outcome before the solution.** "Build a chatbot" is a solution. "Cut first-response time on
   billing questions" is an outcome. Reason: a solution-shaped request hides the metric that decides success.
2. **Write scope and non-goals, and get them agreed in writing.** Include the rows and columns of any
   comparison or report. Reason: merging scattered answers before the shape is agreed produces rework.
3. **Check that Claude fits.** Good fit: language-heavy, judgement-light, tolerant of review. Poor fit:
   exact arithmetic, hard real-time, decisions with no human owner. Say "do not use Claude" when true.
4. **Pick the surface by who runs it and how often.** One person, ad hoc, no code: the Claude apps, with
   Projects for stable context and Research for multi-source questions. A product feature or batch process:
   the API. Software work in a repository: Claude Code. A custom agent embedded in your own product: the
   Agent SDK. Reason: each surface carries different setup, control and governance cost.
5. **Start at the simplest pattern.** Augmented LLM (one call with tools or retrieval) first. A fixed
   workflow when the steps are known. An agent only when the path cannot be known in advance. Reason: each
   step up buys flexibility and costs predictability, latency and spend.
6. **Prefer a fixed chain for known steps and adaptive decomposition for open-ended ones.** Reason:
   predictable work should be predictable.
7. **Decompose until each part has one testable output.** Name the input, the output and the check for
   each part. Reason: a part you cannot test cannot be improved.
8. **Settle capability, speed and budget before recommending a model.** Ask what quality floor is needed,
   what latency users tolerate, and what cost per task is affordable. Choose the smallest tier that meets
   the floor, and re-check as models change. Reason: the discovery answers decide the tier, not preference.
9. **Choose the integration mechanism by the caller.** MCP when an agent needs reusable tool access across
   clients. Direct API or CLI when the system is known and fixed. Agent-to-agent only when a separate
   agent owns a distinct capability. Reason: each extra hop adds auth, failure and audit surface.
10. **Match retrieval to the data.** Pick chunking and indexing for the document shape and the query
    pattern. Load context on demand rather than all at once. Reason: stale or oversized context gives
    confident wrong answers.
11. **Design the full loop: input, processing, output, feedback.** Include who reviews, how errors return,
    and where corrections are stored. Reason: a design with no feedback path cannot improve.
12. **Split human and AI responsibility explicitly.** State what changes, what stays human, and where
    review remains. Reason: unclear ownership is the main source of resistance and of unreviewed errors.
13. **Trace every figure that will leave the building to its source.** For web or research output, open the
    cited page. Reason: fluent summaries carry wrong numbers.
14. **Collect specific failing cases before changing a pilot.** Vague feedback ("it is bad") gets a request
    for examples, not a prompt edit. Reason: one change at a time needs a diagnosable failure.
15. **Persist durable knowledge outside the conversation.** Let a long chat condense itself only when the
    work is disposable. Write decisions and facts to a file, project or store. Reason: summarising loses detail.
16. **Pitch to the audience's concern.** Finance: cost per task and the ceiling. Security: data path and
    permissions. Engineering: interfaces and failure modes. Sceptics: a side-by-side on their own cases
    plus the review step. Reason: one pitch for all audiences convinces none.

## Procedure

1. **Frame.** Interview the requester. Restate the outcome, the users, the current process and the metric.
   Check: the requester confirms the restatement, and ambiguities are listed as questions.
2. **Scope.** Write goals, non-goals, constraints (latency, budget, data class, deadline) and the decision
   owner. Check: sign-off recorded.
3. **Test fit.** Run twenty real examples through the chat app by hand. Check: a failure list exists.
4. **Choose surface and pattern.** Apply rules 4 to 6. Check: one sentence per rejected option.
5. **Draw the architecture.** Show input, processing, output, feedback, tools, data stores and review
   points. Check: every arrow has an owner and a failure behaviour.
6. **Hand off.** Route design detail to `staff-design`, topology to `claude-agent-orchestration`, controls
   to `claude-governance`, and test plans to `claude-evals`. Check: each receives the scoped brief.
7. **Pilot.** Small group, bounded scope, a baseline measured before launch. Check: success criteria were
   written before the pilot began.
8. **Measure.** Compare against the baseline on the agreed metric, by segment. Triage complaints into
   specific cases. Check: each change maps to a failing case.
9. **Expand.** Widen users or scope in stages, with a go/no-go per stage. Check: the previous stage held.
10. **Maintain.** Assign an owner. Schedule model, prompt and policy reviews. Record retirement and
    migration plans. Check: the owner can name the next review date.
11. **Communicate throughout.** Publish what changed, what is still human, and where review remains.
    Check: users can answer those three questions unaided.

## Anti-patterns

- Building what was asked without asking why.
- An agent where a three-step chain would do.
- Picking the largest model tier by default, or the smallest to save money, without a floor.
- A pilot with no baseline, so no result can be shown.
- Rewriting the prompt in response to "users do not like it".
- Announcing "AI will handle it" without saying who reviews.
- Sharing one deck with finance, security and engineers.
- Keeping decisions only in a long chat that will condense.
- Treating an exploratory research summary as decision-grade without source checks and team refinement.
- A design with no owner after launch.

## Current platform facts (checked 2026-10-28)

The brief for this skill contains no verified platform facts, so this skill states no identifiers.
- Claude app features (Projects, project knowledge, Research mode, Artifacts): confirm in docs.
- API features, model tiers and model ids: confirm in docs, or use `claude-api`. Do not copy ids from
  this skill, from older designs or from exam material.
- Agent SDK and Claude Code capabilities and flags: confirm in docs.
- Plan, retention and eligibility details: confirm in docs.
- Retirement and migration timelines for models on the direct API: confirm in docs, then state the dates
  to stakeholders as dates, not as "soon".

## Exam-era vs current

- Exam items describe Haiku, Sonnet and Opus as tiers by use case. Reason by tier characteristics for the
  exam. Pick the current model for a build from the docs, and re-check the choice on each release.
- Exam items name claude.ai features such as Projects and Research. Their names, limits and plan
  availability change. Confirm in docs before promising a feature to a stakeholder.
- Answer exam items by the blueprint and build by current docs.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-P | Solution Design & Architecture | Problem to solution, end-to-end architecture, pattern choice, decomposition, business-value alignment |
| CCAR-P | Integration | Integration mechanism choice, retrieval fit, accuracy versus latency, progressive context |
| CCAR-P | Stakeholder Communication & Lifecycle | Discovery, trade-off communication, SLAs, documentation, lifecycle phases |
| CCAO-F | Product and Model Selection | Feature choice, model tier by cost, speed and quality, context persistence |
| CCAO-F | Workflow Integration and Solution Design | Requirements analysis, workflow augmentation, stakeholder messaging, limits |
| CCAO-F | Governance, Risk, and Responsible Use | Use-case suitability |
| CCDV-F | Applications and Integration | Requirements from business need, life cycle, realtime versus batch |
| CCAR-F | Agentic Architecture & Orchestration | Workflow versus agent as a design choice; detail in `claude-agent-orchestration` |
