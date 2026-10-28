# Exam concepts: Claude Certified Associate and Developer Foundations

Own-words concept map derived from 70 practice questions (35 per certification). Question numbers are the `idx` values in `derived/concepts-associate-developer.jsonl`. Domain names come from the CertSafari overview pages; which domain each question sits in is a judgement call by the tagger.

## claude-certified-associate-foundations — Prompting and Task Execution

- **Ordered step lists** — When sequence matters, express the instructions as numbered steps so the order cannot be misread. (features: none; questions: idx 0)
- **Staged task guidance** — A persuasive or multi-part deliverable is better served by naming each component and its role than by a vague open request. (features: none; questions: idx 1)
- **Task decomposition signals** — Split a request into stages when it bundles different deliverables for different readers or when later parts depend on earlier facts being right. (features: none; questions: idx 3)
- **Targeted follow-up refinement** — A follow-up should change exactly the weak dimension (such as reading level) and explicitly keep the strong one (such as accuracy). (features: none; questions: idx 4)
- **Underspecified prompt root cause** — Inconsistent classification usually comes from a prompt that omits categories, format and decision rules; sampling settings do not fix that. (features: none; questions: idx 31)

## claude-certified-associate-foundations — Output Evaluation and Validation

- **Written acceptance criteria** — Without recorded requirements, repeated revision rounds can reintroduce old defects unnoticed. (features: none; questions: idx 2)
- **Relevance versus accuracy** — An answer can be fully correct yet fail to address the question asked; the two tests are independent. (features: none; questions: idx 5)
- **Quotation verification** — A verbatim quote is only validated by finding those exact words in the named document. (features: none; questions: idx 6)
- **Citation verification against sources** — Cited figures must be traced to their source pages before publication, since a citation alone is not proof. (features: Web search; questions: idx 8)

## claude-certified-associate-foundations — Workflow Integration and Solution Design

- **Scope agreement before synthesis** — Fix the items and criteria of a comparison first; merging unreconciled answers just carries their gaps forward. (features: none; questions: idx 7)
- **Need versus solution framing** — Use Claude to restate solution-shaped requests as desired outcomes and flag where the outcome is unclear. (features: none; questions: idx 16)
- **Change communication and responsibility split** — When rolling out AI drafting, spell out the changes, each person's retained duties, and the remaining review checkpoints. (features: none; questions: idx 18)
- **AI-assisted research planning** — Let Claude draft the plan and questions, run research with citations, then verify against originals. (features: Research mode; questions: idx 19)
- **Evidence for sceptical stakeholders** — Persuade with measured pilot results and a clear rationale for retained human review, not benchmark scores. (features: none; questions: idx 20)

## claude-certified-associate-foundations — Governance, Risk, and Responsible Use

- **Reporting problematic responses** — Use the in-product rating control to flag a faulty answer; a chat note stays inside the conversation. (features: Thumbs-down feedback; questions: idx 9)
- **Shared project data exposure** — Everything uploaded to shared project knowledge is reachable by anyone who can open the project, so exclude sensitive files. (features: Projects, Project knowledge, Enterprise plan; questions: idx 24)
- **Human oversight of irreversible actions** — Letting an agent send messages or alter production data without approval is the central responsible-use concern. (features: none; questions: idx 25)
- **Owner-level privacy controls** — Workspace owners can disable response ratings organisation-wide. (features: Team plan admin settings, Response ratings; questions: idx 26)
- **Regulated data and private modes** — Incognito chats limit training use but do not waive policy rules for regulated data. (features: Incognito chats; questions: idx 27)
- **AI policy compliance check** — Look up what the firm's policy demands for that kind of deliverable before sending client work. (features: none; questions: idx 28)
- **Consequential decisions stay human** — Keep admission-style decisions with staff and use Claude for drafting communications only. (features: none; questions: idx 29)
- **Privacy-preserving workflow order** — Check consent and policy, minimise personal data, run and review the summary, and document what was removed. (features: Claude for Work; questions: idx 30)

## claude-certified-associate-foundations — Product and Model Selection

- **Research mode and artifacts** — Multi-source briefings suit Research mode with citations, and editable team deliverables suit artifacts. (features: Research mode, Artifacts; questions: idx 11)
- **Model tier selection by workload** — Use the fastest tier for bulk simple jobs and the deepest tier for hard analysis, accepting higher quota use. (features: Model tiers; questions: idx 12, 13)
- **Define quality, then trial the default** — Write down what good means, test on the default tier, and escalate only if the sample falls short. (features: Model tiers; questions: idx 14)
- **Review safety net drives tier choice** — A workload with no human check must carry its own quality, so it warrants more care in tier choice. (features: Model tiers; questions: idx 15)

## claude-certified-associate-foundations — Configuration and Knowledge Management

- **Automatic context management** — For disposable work nearing the conversation limit, letting the system condense history is fine. (features: Automatic context management; questions: idx 10)
- **Knowledge versus instructions placement** — Reference documents belong in project knowledge; behavioural rules belong in project instructions. (features: Projects, Project knowledge, Project instructions; questions: idx 21)
- **Shared project maintenance** — After swapping a source in a shared project, tell members that earlier answers may be stale. (features: Projects, Team plan; questions: idx 22)
- **Live connectors versus static uploads** — Connect frequently changing sources; upload content that never changes. (features: Google Drive connector, Project knowledge; questions: idx 23)

## claude-certified-associate-foundations — Troubleshooting and Optimization

- **Gather concrete failing examples** — Vague complaints become actionable only when testers supply specific cases of what was missed. (features: none; questions: idx 17, 34)
- **Allowance efficiency habits** — Decide needs first, front-load context in one opening message, follow up in-thread, start fresh chats for unrelated tasks. (features: none; questions: idx 32)
- **Disable unused connectors** — Switch off tools the current task does not need to keep routine work lean. (features: Connectors; questions: idx 33)

## claude-developer-foundations — Agents and Workflows

- **Agent framework comparison** — Strands, LangGraph and Pydantic AI differ in provider support, observability and how they model control flow. (features: Strands Agents SDK, LangGraph, Pydantic AI, OpenTelemetry; questions: idx 2)
- **Parallelization by voting** — Running one identical task several times and taking the majority verdict is voting, distinct from sectioning into different subtasks. (features: none; questions: idx 3)
- **Session resume** — Save the session id from the initial system message and supply it through the resume setting to continue with prior context. (features: Claude Agent SDK query(), resume option, sessions; questions: idx 7)
- **Built-in shell tool** — The Bash tool covers terminal work including git, so version-control automation needs no custom tool. (features: Claude Agent SDK Bash tool; questions: idx 8)
- **Stateless sessions** — For throwaway one-shot calls, disable persistence keeping the session memory-only so no file is saved and it cannot be resumed; this option exists only in TypeScript. (features: Claude Agent SDK persistSession; questions: idx 9)
- **Subagent nesting control** — Nesting depth has a configurable cap, and omitting the spawning tool from a subagent stops it creating children. (features: Claude Code subagents, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, disallowedTools; questions: idx 26)

## claude-developer-foundations — Applications and Integration

- **Beta versus GA readiness** — Beta capabilities can change or disappear, so critical production logic should not rest on them. (features: Feature availability (Beta/GA); questions: idx 6)
- **Batch API operating limits** — Batches have size caps, a processing deadline after which work expires, and a finite result retention period. (features: Message Batches API; questions: idx 11)
- **Plugin packaging** — A plugin directory can ship a team's skills, subagent, hooks and server definitions together for projects to load by path. (features: Claude Code plugins, Agent SDK plugins option, Skills, Hooks, MCP server definitions; questions: idx 13)
- **Acceleration limits** — A sharp traffic jump can produce 429 errors even under published limits; ramp up gradually. (features: Claude API rate limits, 429 errors; questions: idx 15)
- **Thinking block streaming events** — A thinking block ends with a signature event used to verify block integrity before it closes. (features: Extended thinking, Messages API streaming; questions: idx 18)

## claude-developer-foundations — Claude Code

- **Resumed session model fallback** — If the model a session used is retired, resumption defers to the usual order for choosing a model rather than erroring. (features: Claude Code --resume, Model retirement; questions: idx 10)
- **Permission rule merging** — Permission rules merge across settings scopes, so a project-level deny cannot be removed by a local allow. (features: settings.json, settings.local.json, permissions.deny; questions: idx 12)

## claude-developer-foundations — Eval, Testing, and Debugging

- **Error code classification** — Request-size, authentication and conflict errors are not fixed by streaming or raising the output cap; each needs its own remedy. (features: Messages API errors, Files API, Streaming; questions: idx 16)

## claude-developer-foundations — Model Selection and Optimization

- **Cheap model for high-volume steps** — Assign a smaller, faster model to a frequent simple step by running it in its own subagent. (features: Claude Agent SDK subagents, Subagent model override; questions: idx 4)
- **Model tier selection** — Pick the model that balances speed and intelligence for broad coding and agentic work rather than the top-capability tier. (features: Claude Opus 5.5, Claude Sonnet 5.5; questions: idx 14)
- **Pre-send token counting** — Use the token counting call to size a prompt before submitting it against a budget. (features: Token counting API; questions: idx 17)
- **Autoregressive generation** — Output is built by repeatedly guessing one more token given the prompt and all text produced so far. (features: none; questions: idx 19)
- **Prompt caching breakpoints** — Mark a stable repeated prefix with an ephemeral cache marker so later requests read it cheaply. (features: Prompt caching cache_control; questions: idx 20)

## claude-developer-foundations — Prompt and Context Engineering

- **Subagent context isolation** — Delegating exploration to a subagent holds intermediate reads in a separate context and hands back only a summary. (features: Claude Agent SDK subagents, AgentDefinition; questions: idx 0, 21)
- **Compaction-safe context** — Archive the full transcript with a pre-compaction hook and keep must-survive rules in CLAUDE.md. (features: PreCompact hook, CLAUDE.md, Compaction; questions: idx 1)
- **Server-side context management** — Compaction summarises older turns and context editing clears stale tool results automatically. (features: Compaction, Context editing; questions: idx 5)
- **Prompt clarity testing** — Have a low-context reader follow the prompt literally; their confusion predicts the model's. (features: none; questions: idx 22)
- **Defensive JSON parsing** — On a decode failure, check the stop reason; a length cutoff means the output is incomplete, not malformed. (features: Messages API stop_reason; questions: idx 23)
- **XML document tagging** — Wrap each source in tagged blocks with metadata so facts are attributed to the right document. (features: none; questions: idx 25)

## claude-developer-foundations — Security and Safety

- **PII minimisation** — Redact or mask personal data before sending to vendors, send only needed fields, and apply the same care to internal logs. (features: none; questions: idx 27)
- **Multi-tenant agent safeguards** — Scope tool access per authenticated tenant, screen tool results for injected instructions, and re-check authorization server-side before sensitive actions. (features: none; questions: idx 28)
- **HIPAA feature eligibility** — The API rejects features not eligible for HIPAA-ready organizations; remove them and use eligible ones. (features: Code execution tool, HIPAA-ready API organization, Zero Data Retention; questions: idx 29)
- **Hook decision precedence and scopes** — Conflicting hook verdicts resolve with deny strongest; local settings are not shared, and managed policy is admin-controlled. (features: Claude Code hooks, settings.local.json, Managed policy settings; questions: idx 30)
- **Hook matcher patterns** — Matchers containing regex characters are evaluated as regular expressions, letting one entry cover several tools. (features: Claude Code hooks matcher; questions: idx 31)
- **Unattended permission posture** — For CI agents, combine a fixed allowlist with a deny-unlisted permission mode so nothing waits for approval. (features: allowed_tools, permission_mode, canUseTool; questions: idx 32)

## claude-developer-foundations — Tools and MCPs

- **Tool error feedback loop** — Return an error result naming the missing argument, enforce schemas strictly, and sharpen the tool description. (features: Tool use is_error, Tool use strict; questions: idx 24)
- **Custom tool for internal API** — Wrap a proprietary REST gateway as a custom tool hosted by an MCP server running inside the same process. (features: Claude Agent SDK custom tools, createSdkMcpServer; questions: idx 33)
- **Built-in tools first** — For simple file, shell and search tasks, rely on the SDK's shipped tools instead of building custom ones. (features: Claude Agent SDK built-in tools; questions: idx 34)

## Cross-cutting themes

- **Verify before you trust or publish** — Associate questions repeatedly demand source checking, exact-quote lookup and concrete failing examples rather than acting on confident-sounding output.
- **Isolate context deliberately** — Both exams reward knowing where context lives: project knowledge versus instructions, subagent contexts, compaction, and CLAUDE.md persistence.
- **Match capability to workload** — Model tier, subagent model override, and feature choice should follow volume, difficulty and the presence of downstream review.
- **Humans stay accountable for irreversible or consequential steps** — Oversight, backend authorization re-checks, and keeping decisions with staff recur across governance and security items.
- **Least privilege and explicit allowlists** — Tool scoping per tenant, fixed tool sets in CI, hook controls and managed settings all express deny-by-default thinking.
- **Know the precise operational numbers and defaults** — Batch limits, nesting depth, cache lifetimes and rate-limit behaviour are tested as facts, not just concepts.
- **Handle failure signals explicitly** — Stop reasons, error codes, tool error results and acceleration limits each need a distinct, correct response.
- **Configuration scope and precedence matter** — Settings scopes, permission merging, plugin packaging and resumed-session model fallback test understanding of where config lives.
- **Prompt structure beats prompt tweaking** — Numbered steps, explicit categories, XML tags and clarity checks fix root causes that sampling changes cannot.
