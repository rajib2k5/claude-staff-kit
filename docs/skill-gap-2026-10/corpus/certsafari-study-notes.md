# CertSafari study material digest (four Anthropic certifications)

Source: 12 saved pages from certsafari.com (snapshot dated 2026-10-28), read from local cache only. Everything below is a summary in my own words. Quoted terms are exact identifiers (flag names, field names, API terms).

Certifications covered, in graph-node form:
- CCAR-F = Claude Certified Architect, Foundations (5 domains, 30 subdomains)
- CCAR-P = Claude Certified Architect, Professional (7 domains, 38 lessons)
- CCAO-F = Claude Certified Associate, Foundations (7 domains, 30 subdomains)
- CCDV-F = Claude Certified Developer, Foundations (8 domains, 25 subdomains)

## What was actually in the pages (read this first)

| Page type | What the file really holds | Usable depth |
|---|---|---|
| `*_learn.html` (lessons) | Only a lesson index: title, subdomain tag, read time, domain exam weight. The lesson bodies are not in the saved files. | Titles and weights only |
| `study-notes_*.html` | A public exam-guide synthesis in the Next.js payload: "Knowledge of / Skills in" statements (CCAR-F, full) or a subdomain list with a certificate blurb (the other three). The "private study notes" area the page advertises is empty. | Real for CCAR-F, thin for the others |
| `exam-experiences_*.html` | First page of pass/fail write-ups: result, score, self-tagged topics, free-text advice. | Real |

Counts are listed per cert below and again in the gap log at the end.

---

## CCAR-F (Claude Certified Architect, Foundations)

Content found: 30 lessons indexed (titles only), 1 study-notes page with full exam-guide statements for all 30 subdomains, 20 exam-taker reports (17 passed, 3 failed; the page offers a next page that was not saved).

Domain weights from the lesson index: D1 Agentic Architecture and Orchestration 27%, D2 Tool Design and MCP 18%, D3 Claude Code Configuration 20%, D4 Prompt Engineering and Structured Output 20%, D5 Context Management and Reliability 15%.

### Best practices taught

- **Agentic loop control** — drive the loop off the API stop signal: keep going while the model asks for a tool, stop when it ends its turn, and append each tool result to the history before the next call.
- **Model-driven vs scripted sequencing** — let the model choose the next tool from context; use fixed trees only where the order is genuinely fixed.
- **Hub-and-spoke orchestration** — one coordinator owns delegation, result merging, error handling and information flow, so everything stays observable.
- **Dynamic subagent selection** — the coordinator should route by query complexity instead of pushing every request through the full pipeline.
- **Partition research scope** — give each subagent a distinct subtopic or source type to avoid duplicated work, then loop: check synthesis for gaps, re-delegate narrowly, re-synthesise.
- **Explicit context passing** — subagents inherit nothing; put prior findings directly in their prompt and keep content separate from metadata (source, page, date) so attribution survives.
- **Parallel spawning** — launch independent subagents by emitting several task calls in one coordinator turn; the coordinator must be allowed to use the spawn tool.
- **Goals over procedures in coordinator prompts** — state the research goal and quality bar, not step-by-step instructions, so subagents can adapt.
- **Programmatic enforcement for hard rules** — use hooks and prerequisite gates (for example, no refund tool call until a verified customer lookup has returned); prompt instructions alone have a non-zero failure rate.
- **Hooks for normalisation** — post-tool hooks convert mixed formats (epoch times, ISO dates, numeric status codes) before the agent reasons over them; pre-call hooks block policy violations and divert to human escalation.
- **Structured human handoff** — an escalation summary should carry customer ID, root cause, amount and recommended action, because the human has no transcript.
- **Decomposition choice** — prompt chaining for predictable multi-aspect work; adaptive decomposition for open-ended investigation; split big reviews into per-file passes plus a cross-file integration pass.
- **Session management** — resume a named session when prior context is still valid; fork to compare approaches from a shared baseline; start fresh with a structured summary when tool results are stale; tell a resumed session which files changed.
- **Tool descriptions drive selection** — write purpose, inputs, outputs, edge cases and "use this instead of that" boundaries; rename or split overlapping tools; check the system prompt for keywords that bias tool choice.
- **Structured MCP errors** — return an error flag plus category (transient, validation, permission, business), a retryable boolean and a human explanation, so the agent can choose a recovery path.
- **Scoped tool sets** — give each agent only the 4 to 5 tools its role needs; add narrow cross-role tools for frequent needs; replace generic fetchers with validating ones.
- **tool_choice settings** — "any" guarantees a tool call rather than chat text; forcing a named tool makes a specific step run first, with later steps in follow-up turns.
- **MCP configuration scopes** — shared servers in the project `.mcp.json` with environment-variable expansion for secrets; personal or experimental servers in the user-level config; prefer community servers for standard integrations; expose catalogs as MCP resources.
- **Built-in tool fit** — Grep for content, Glob for paths, Read/Write for whole files, Edit for unique-anchor changes (fall back to Read plus Write when the anchor is not unique); build understanding incrementally from entry points.
- **CLAUDE.md layering** — user, project and directory levels; user-level rules are not shared with teammates; use imports and `.claude/rules/` to stay modular; use `/memory` to see what loaded.
- **Skills and commands** — project commands are shared via version control; skills can run in a forked context to keep verbose output out of the main session, restrict allowed tools, and prompt for arguments; skills are on-demand, CLAUDE.md is always-on.
- **Path-scoped rules** — glob-based rules load only when matching files are touched, and beat per-directory files when a convention spans many directories (for example all test files).
- **Plan mode vs direct execution** — plan for architectural or multi-file changes and migrations; execute directly for small, well-scoped fixes; use an exploration subagent to keep discovery noise out of the main context.
- **Iterative refinement** — two or three concrete input/output examples beat prose; write tests first and feed failures back; use an interview pattern to surface unconsidered design issues; batch interacting problems in one message, sequence independent ones.
- **Headless CI use** — non-interactive print mode with JSON output and a schema for machine-readable findings; give prior review findings on re-runs so only new issues are posted; supply existing tests and documented testing standards.
- **Explicit review criteria** — define what to report and what to skip by category and severity with code examples; disable noisy categories temporarily to protect developer trust.
- **Few-shot for ambiguity** — two to four examples that show why one action beat plausible alternatives generalise better than extra rules and help with format and varied document layouts.
- **Structured output via tool use** — a JSON schema on a tool gives syntactically valid output; make fields nullable when the source may lack them, and use an "other" value plus a detail string for extensible enums.
- **Validate-and-retry with feedback** — on retry, send the document, the failed extraction and the specific validation errors; track a detected-pattern field to analyse dismissed findings.
- **Batch API fit** — roughly half cost, up to 24 hours, no latency guarantee, correlation by custom ID; right for overnight or weekly work, wrong for blocking pre-merge checks; resubmit only failed items; tune prompts on a sample first; derive submission cadence from the SLA.
- **Independent review** — a second instance without the generator's reasoning catches more than self-review in the same session; add confidence-tagged verification passes to route reviews.
- **Context hygiene** — keep transactional facts (amounts, dates, IDs) in a persistent block outside summarised history; trim verbose tool output to relevant fields; put key findings first and use headers to offset the weak middle of long inputs.
- **Escalation rules** — escalate on explicit human request, policy gaps or silence, and no progress; ask for more identifiers when a lookup returns several matches; acknowledge frustration but resolve if the case is within scope.
- **Error propagation** — subagents recover locally from transient faults and pass up only unresolved errors with failure type, what was tried, partial results and alternatives; annotate coverage gaps in the final synthesis.
- **Large-codebase exploration** — delegate narrow questions to subagents, keep scratchpad files of findings, summarise between phases, export agent state to a manifest for crash recovery, and compact when context fills.
- **Human review calibration** — measure accuracy by document type and field, not in aggregate; sample high-confidence outputs at random to find new error patterns; calibrate field-level confidence on labelled data before cutting review.
- **Provenance in synthesis** — preserve claim-to-source mappings; show conflicting numbers with attribution instead of picking one; carry publication or collection dates so time differences are not read as contradictions; render each content type in a fitting format.

### Common traps

- Ending the loop by reading the model's prose for "done" signals, by checking whether any text came back, or by relying on an iteration cap as the main stop.
- Assuming subagents share the coordinator's history or memory between calls.
- Relying on a prompt to guarantee compliance for a financial or identity rule where a hook or gate is required.
- Vague or near-identical tool descriptions (the guide's example is two analyse-style tools that overlap), or a system prompt whose wording quietly steers tool choice.
- Uniform "failed" errors that hide whether to retry; the opposite failures of returning an empty success on error, or aborting the whole workflow on one failure.
- Treating a valid empty result as an access failure, or the reverse.
- Giving one agent a very large tool set (the guide contrasts 18 with 4 to 5), or letting a synthesis agent hold search tools.
- Believing a strict schema removes all errors: it removes syntax errors only, not wrong totals or misplaced values.
- Making fields required when the source may lack the data, which pushes the model to invent values.
- Retrying when the needed information is simply not in the source.
- "Be conservative" or "only high-confidence findings" as a precision fix; categorical criteria work better.
- Using batch for a blocking workflow, or expecting multi-turn tool calling inside one batch request.
- Self-review in the session that wrote the code, expecting it to question its own choices.
- Summaries that squash numbers, dates and customer expectations into vague prose.
- Sentiment or self-reported confidence as an escalation trigger; picking among several matching customers by heuristic.
- Quoting an overall accuracy figure (such as a high 90s percentage) that hides weak document types or fields.
- Resuming a session with stale tool output instead of starting fresh with a summary.
- Putting team-wide instructions in the user-level CLAUDE.md, so new teammates never receive them.

### Exam-taker reports

Sample: 20 reports on the first page (17 passed, 3 failed; scores 640 to 949 on a 1000 scale; one pass had no score). Page 2 not saved.
- **Scenario framing.** Several reports name the same scenario set: multi-agent research, developer productivity, Claude Code in CI, structured data extraction. Two reports said the real exam leaned heavily on only two or three themes (CI pipeline and document extraction).
- **Most-cited hard topics.** CI/CD with Claude Code (the most frequent), MCP, structured JSON output, built-in tools and codebase exploration, hooks and agent loops, session resumption, task decomposition, plan vs direct mode, and human-in-the-loop.
- **CLI flag gap.** Two reports, one from a failed attempt, say specific command-line flags appeared in scenario questions: `--bare`, `--system-prompt`, `--append-system-prompt`. Both recommend studying CLI flags and context passing explicitly.
- **Wording and close options.** The common complaint is that the real answers are closer together, more vaguely worded and sometimes contain contradictory-sounding terms, even though question stems were described as shorter. Advice: read the last line of the scenario, because it states what to optimise, and watch for two approaches that both work.
- **Relationship to the practice bank.** Mixed. Many say the real exam is close to or easier than the practice bank; others say the real exam is more nuanced and that a steady 80 to 90 percent on the bank does not guarantee a pass. One report lists identical questions appearing.
- **Failures.** All three failed reports mention exam difficulty and confusing option wording; two list CI/CD or MCP as weak areas.
- **Time.** Little time pressure reported; one tip is to flag long or hard items and return to them after the easy ones.
- **Prep length.** Two weeks is repeatedly called enough for someone with agent experience; one person with little hands-on use found it hard but passed.
- **Readiness bar (self-reported).** Aim for roughly 85 to 90 percent on mocks, with 300 or more questions attempted or near-full bank coverage; do domain-wise sets first, then full mocks.
- **How to practise.** For every wrong or lucky answer, name the concept and why each other option fails; avoid counting guesses made on probability alone.

### Resources mentioned

- CertSafari CCAR-F practice and lessons — https://certsafari.com/anthropic/claude-certified-architect-foundations (slug taken from the saved file names)
- Official Anthropic courses and exam-domain documentation (named generically by reports; no URL in the source)
- Anthropic Partner Academy (where the page says the exam is delivered; no URL in the source)
- Organisation-internal course, YouTube playlists (named only; no URL)

---

## CCAR-P (Claude Certified Architect, Professional)

Content found: 38 lessons indexed (titles only), 1 study-notes page with the subdomain list and a candidate profile (no knowledge/skills statements), 4 exam-taker reports (all passed). Note: the best-practice bullets below come from lesson titles and subdomain wording, so they state the topic and the direction of the advice, not detailed teaching.

Domain weights: D1 Solution Design and Architecture 17%, D2 Models, Prompting and Context 13%, D3 Integration 19%, D4 Evaluation, Testing and Optimization 16%, D5 Governance, Safety and Risk 14%, D6 Stakeholder Communication and Lifecycle 14%, D7 Developer Productivity 7%.

### Best practices taught

- **Business-first framing** — translate the business problem and value pillars (efficiency, productivity, cost, SLA) into the solution design before choosing patterns.
- **Pattern selection** — choose among workflow, agentic and augmented-LLM patterns, and among chaining, routing, parallelisation and orchestrator-workers, based on the task shape.
- **Multi-agent restraint** — decide when a split is justified, and brief subagents explicitly.
- **Model choice by trade-off** — start from a sensible tier and justify it by cost per task, latency and accuracy.
- **Reusable prompts** — system prompts and templates, few-shot and chain-of-thought where they help, plus prompt caching, modular layout and Agent Skills for reuse.
- **Context budgeting** — measure what counts against the window and manage token spend deliberately.
- **Avoid capability bloat** — trim tool sets; prefer progressive discovery (tool search) over loading every definition up front.
- **Authorisation analysis** — look for gaps in MCP-style discovery, client registration and scoped tokens.
- **Justify latency settings** — effort level, fast mode and streaming as explicit, defensible choices.
- **Fleet observability** — run-level telemetry and tagging, OpenTelemetry signals and traces, with privacy gates on content.
- **RAG design** — chunking, embeddings and contextual indexing; match retrieval (full context, embeddings, keyword, hybrid) to data shape and query pattern.
- **Integration choice** — pick between MCP, direct tools and agent-to-agent by need.
- **Evaluation discipline** — metrics across accuracy, latency, cost, safety and security; mixed-method datasets and graders; A/B tests against a baseline with segmented, versioned rollout.
- **Failure diagnosis** — separate hallucination, prompt fault, tool fault and model mismatch before changing anything.
- **Cost levers** — cheap wins first, then batching and budgets.
- **Safety layers** — input and output guardrails, human approval checkpoints, and compliance (HIPAA, business associate agreements, zero data retention) plus bias and honesty.
- **Stakeholder practice** — structured discovery, measurable requirements and acceptance tests, plain-language trade-offs, SLA and limit expectations, architecture documentation, and lifecycle phases from discovery to retirement.
- **Team tooling** — settings scopes, precedence and permission rules; the explore-plan-implement-commit loop; diagnosing what configuration actually loaded.

### Common traps

The saved pages contain no explicit "mistake" section for this cert. Reports and syllabus wording point to these likely traps (inferred, not stated as warnings):
- Over-engineering a multi-agent design where a workflow suffices.
- Loading every tool definition into context.
- Stating a configuration without justifying the accuracy-latency trade-off.
- Treating the exam as deep implementation when reports describe decision-making and communication emphasis.

### Exam-taker reports

Sample: 4 reports, all passes (scores 896 to 933 where given); too small for a trend, treat as anecdote.
- All four describe it as less technical than CCAR-F; two say CCAR-F was the harder exam.
- Emphasis reported: stakeholder and team communication, mapping a problem to an SDLC or lifecycle phase, general architecture patterns, authentication and authorisation, integration, and configuring tools for teams.
- Practice questions on the site were called harder and more technical than the real exam by two people; one still named the site the best study environment.
- One person liked having several multiple-choice items; one noted newly added content only a day before the exam.

### Resources mentioned

- CertSafari CCAR-P practice and lessons — https://certsafari.com/anthropic/claude-architect-professional
- Official Anthropic study guide (the page links to "the official study guide"; no URL in the source)

---

## CCAO-F (Claude Certified Associate, Foundations)

Content found: 30 lessons indexed (titles only), 1 study-notes page with the subdomain list and audience description, 15 exam-taker reports (14 passed, 1 failed).

Domain weights: D1 Prompting and Task Execution 14%, D2 Output Evaluation and Validation 21%, D3 Product and Model Selection 12%, D4 Workflow Integration and Solution Design 16%, D5 Configuration and Knowledge Management 12%, D6 Governance, Risk and Responsible Use 15%, D7 Troubleshooting and Optimization 10%. Audience: non-developer professionals who use Claude daily and build Projects.

### Best practices taught

- **Prompt anatomy** — give the brief, the reason, the source material and an example.
- **Decompose and order** — split complex requests into stages and hand off cleanly between them.
- **Iterate one change at a time** — diagnose, change one thing, retest.
- **Match prompting to task type** — analysis, research, drafting and brainstorming each want a different approach.
- **Evaluate outputs critically** — check accuracy and completeness; hunt for hallucinations, inconsistencies and bias.
- **Fact-check** — verify sources, claims and citations, and re-run to compare.
- **Know when a human must review** — high-stakes or unverifiable output needs human sign-off.
- **Tailor for the audience** — edit, adapt and compare versions; choose artifacts, inline or structured formats by need.
- **Pick the right surface** — chat, Research, Projects or artifacts by job.
- **Pick the right tier** — Haiku, Sonnet or Opus by cost, speed and quality; restart, summarise or persist when context runs long.
- **Delegate deliberately** — decide which workflow steps Claude handles and which stay human; explain value and limits honestly to stakeholders.
- **Project hygiene** — instructions with role, scope and conflict checks and testing; manage uploaded files and Drive or Gmail connectors; retire stale knowledge and archive old projects.
- **Responsible use** — identify unsuitable use cases, handle sensitive and regulated data carefully, follow organisational AI policy (enforced settings, escalation, audit records), and own accountability, disclosure and over-reliance risk.
- **Troubleshoot by layer** — prompt, knowledge, conversation, model or reasoning; adjust from feedback and optimise the workflow.

### Common traps

No explicit trap section on the saved pages. Syllabus and report signals:
- Trusting fluent output without verification (hallucination, bias).
- Letting a project run on out-of-date knowledge or conflicting instructions.
- Over-relying on Claude without disclosure or accountability.
- Answers that all look applicable, where only the most relevant fits; reports single out select-two and ordering questions.

### Exam-taker reports

Sample: 15 reports (14 passed, 1 failed; scores 703 to 950).
- **Difficulty** ranged from easy (daily Claude users) to demanding (people with little hands-on use). Hands-on use of Projects, artifacts and connectors was repeatedly cited as the difference.
- **Language and wording.** A non-native speaker described the scenarios as long and linguistically dense; several say the real wording is harder than the practice bank.
- **Question formats.** Multi-select and "put these steps in order" items were the hardest, with answer options that differ only in the last two positions; one report recommends reviewing any select-two or ordering item twice and practising task-decomposition sequences.
- **Time.** One report: a 60-question sitting took about three times longer than the practice session (roughly 30 vs 90 minutes with flagged review). One of the few concrete time-pressure data points across all certs; single sample.
- **Weak or heavy topics named:** memory and context, connectors, workflow integration, configuration and knowledge management, model choice, prompting, ethics and governance, task decomposition.
- **Failure case.** The failed report relied on generic third-party mock tests that felt easier than the real exam, and had no Claude usage at work.
- **Prep length.** Several passed after one to two weeks; one began on a Wednesday and passed by Friday with prior experience.
- **Readiness bar (self-reported).** About 50 percent bank coverage at 85 to 90 percent accuracy; one pass reported only about 14 percent coverage after taking the official courses.

### Resources mentioned

- CertSafari CCAO-F practice and lessons — https://certsafari.com/anthropic/claude-certified-associate-foundations
- Official Anthropic study guide and its eight modules with takeaway notes at module ends (named by a report; no URL in the source)
- Anthropic Skilljar prep courses (named; no URL in the source)
- Udemy mock tests (named; no URL)

---

## CCDV-F (Claude Certified Developer, Foundations)

Content found: 25 lessons indexed (titles only), 1 study-notes page with 25 subdomain descriptions and audience profile, 20 exam-taker reports (all passed; next page not saved).

Domain weights: D1 Agents and Workflows 15%, D2 Applications and Integration 33%, D3 Claude Code 3%, D4 Eval, Testing and Debugging 3%, D5 Model Selection and Optimization 17%, D6 Prompt and Context Engineering 11%, D7 Security and Safety 8%, D8 Tools and MCPs 11%.

### Best practices taught

- **Workflow vs agent** — know the decision criteria; manager and supervisor hierarchies and subagents improve execution when justified.
- **Ways to build agents** — the Agent SDK, custom loops and harnesses, and self-hosted vs Anthropic-hosted deployment; hooks for deterministic actions; patterns such as tool loops, subagents, memory and context management, and third-party frameworks.
- **Requirements to model choice** — translate functional and infrastructure needs into a model and platform decision; follow the model lifecycle (deprecation, retirement, migration) and watch for behaviour changes between releases.
- **Messages API fluency** — messages, tools, streaming, vision, thinking, caching, third-party hosting, realtime vs batch trade-offs; REST, JSON, async, version control and refactoring basics.
- **Application design** — instructions behave differently across surfaces (Claude Code, desktop, web app, API); schema design, session hygiene and plugin management.
- **Configuration management** — CLAUDE.md, `settings.json`, model-version pinning, prompt versioning and plugin dependencies.
- **Claude Code components** — rules, skills, commands, agents and agent memory; headless and streaming modes; the CLAUDE.md hierarchy.
- **Debugging** — identify the error type, pick the recovery strategy, use trace analysis, and isolate whether the fault is in the integration layer or the model output.
- **LLM fundamentals** — tokens, context windows, sampling and non-determinism; effort levels, fast mode, extended and adaptive thinking; zero-, single- and multi-shot prompting.
- **Cost and tokens** — track usage, model cost, and use prompt caching and cache checkpoints.
- **Context engineering** — prune tool output, compact, and isolate context through subagents to prevent drift and bloat.
- **Prompt engineering** — clarity, examples, system vs user placement, output constraints, iteration and input sanitisation.
- **Output handling** — structured outputs, response validation, defensive parsing, and scepticism toward confident answers.
- **Security** — prompt-injection and jailbreak defence, untrusted-input handling, data-leak and PII controls, least privilege, layered guardrails, hooks that block destructive actions, and key and secret management (storage, rotation, leak response).
- **Tools and MCP** — tool schemas and descriptions, error handling, client-side vs server-side tools and approval patterns, MCP resources, tools and prompts, stdio vs socket transport, and trade-offs among built-in tools, custom tools, skills and MCP.

### Common traps

No explicit trap list on the saved pages. Signals from the syllabus wording and reports:
- Assuming a confident answer is correct, or parsing output without defensive checks.
- Confusing where a fault lives (integration layer vs model output).
- Picking a newer model without checking behaviour changes between releases.
- Choosing the wrong extension mechanism (built-in vs custom tool vs skill vs MCP).
- Misreading qualifiers in questions: reports warn about phrases such as "is not", "is best" and "fits better".

### Exam-taker reports

Sample: 20 reports, all passes (scores 808 to 985); likely a success-biased sample. Page 2 not saved.
- **Difficulty vs the bank.** Nearly every report says the real exam was easier than the practice bank: shorter stems, high-level scenario decisions, and typically two obviously wrong options, sometimes three.
- **Question mix.** Several saw no multi-select questions at all. One reported 15-plus items where two options were close; another saw only 5 to 10 items on parameters or configuration. One noted no questions on specific permission rules or allow/deny hierarchies.
- **Topics named:** agent architecture, MCP, model selection, workflow vs agent selection, security, structured JSON output, batch vs streaming, hooks for validation, software engineering fundamentals, SDK retry defaults.
- **Readiness bars (self-reported).** Around 50 percent coverage at 75 percent or better accuracy was typical; others reported 49, 58 and 96 percent coverage; domain-by-domain sets at 75 percent or better were used by one person.
- **Prep route.** Official Anthropic courses first (Skilljar), then daily practice batches; one person disliked the intro courses and used Claude itself as a tutor.
- **Practice value.** Several credit the per-option explanations for learning concepts; one used a general chatbot to double-check practice explanations.
- **Time.** Little time pressure is mentioned; the practice site offers a timed mode.

### Resources mentioned

- CertSafari CCDV-F practice and lessons — https://certsafari.com/anthropic/claude-developer-foundations
- Anthropic Skilljar courses (for example intro and tools-and-MCP courses) and Anthropic Academy (named; no URL in the source)
- Anthropic Partner Academy, delivery point for the free non-proctored assessment per the page (no URL in the source)
- Anthropic official website and prep guide (named; no URL)

---

## Cross-cert best practices

- **Deterministic controls for hard rules** — put compliance, ordering and destructive-action limits in hooks, gates and permission rules, not in prompt wording (CCAR-F, CCDV-F, CCAR-P approval checkpoints).
- **Return structure, not vibes** — typed errors with retry guidance, schema-bound outputs, and structured handoffs make recovery and downstream use predictable (CCAR-F, CCDV-F).
- **Keep tool surfaces small and well described** — few, role-scoped tools with sharp descriptions beat large generic sets; load definitions on demand (CCAR-F, CCAR-P, CCDV-F).
- **Subagents are isolation, not shared memory** — pass what they need explicitly, return compact structured results, and use them to protect the main context (CCAR-F, CCAR-P, CCDV-F).
- **Treat context as a budget** — prune tool output, keep durable facts outside summaries, put key points first, and restart with a summary when history goes stale (CCAR-F, CCDV-F, CCAO-F).
- **Verify outputs independently** — a separate reviewer, fact-checks, validation with feedback, and human review where stakes are high; do not trust fluent or confident output (CCAR-F, CCAO-F, CCDV-F).
- **Measure by segment, not in aggregate** — check accuracy by document type or field and sample high-confidence output before reducing human review (CCAR-F, CCAR-P evaluation).
- **Match the mode to the latency need** — batch for non-blocking work, synchronous for blocking gates; justify effort, fast-mode and streaming choices (CCAR-F, CCAR-P, CCDV-F).
- **Choose the model tier by cost, speed and quality** — and re-check it as models change (CCAO-F, CCAR-P, CCDV-F).
- **Provenance and uncertainty travel with the data** — keep source, date and conflict annotations through every summarisation step (CCAR-F, CCAO-F fact-checking).
- **Iterate in single, diagnosable steps** — concrete examples and tests, one change at a time, and locate the fault layer (prompt, tools, model, integration) before fixing (CCAR-F, CCAO-F, CCAR-P, CCDV-F).
- **Layer configuration and keep it shared where teams need it** — user vs project scope, path-scoped rules, version-controlled commands, pinned model and prompt versions (CCAR-F, CCAR-P, CCDV-F).
- **Layer guardrails and least privilege** — input and output checks, secrets handled properly, approvals for risky steps, and regulated-data awareness (CCAR-P, CCDV-F, CCAO-F).
- **Study by reasoning, not memorising** — reports across all four certs say to learn why each distractor fails; real exams use closer options and long scenarios, so read the final line of the question and watch qualifiers (all four).

---

## Gap log (empty, gated or partial content)

- All four `*_learn.html` pages hold only a lesson index (titles, subdomain tags, read times, domain weights). Lesson bodies were not saved, so lesson-level teaching is not digested. Individual lesson URLs exist as `/anthropic/<cert-slug>/learn/<slug>` links but were not fetched (no browsing allowed).
- All four `study-notes_*.html` pages advertise "private study notes" with a revisit prompt; that area is empty (login-gated or user-owned). The only substance is the public exam-guide text in the page payload: full knowledge/skills statements for CCAR-F, subdomain lists and audience blurbs for the other three.
- CCAR-P exam-experiences has just 4 reports; CCAR-F and CCDV-F show a "Next page" link whose second page was not saved, so those samples are first pages only (20 each).
- No external resource URLs appear in the files beyond certsafari.com paths and links to individual reviewers' profiles (deliberately omitted). Skilljar, Anthropic Academy, Partner Academy, Udemy and YouTube are named without URLs.
- The Cloudflare challenge script is present on every page, but real content was still served; none of the 12 files was a challenge or login wall.
