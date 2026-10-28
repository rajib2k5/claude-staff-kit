# Official Claude certification exam guides (digest)

Source: four official exam guides (PDF, version 1.0, effective July 2026) hosted on everpath-course-content.s3-accelerate.amazonaws.com and linked from the Anthropic Academy (anthropic.skilljar.com). Cited by title: "Claude Certified Architect - Foundations Exam Guide", "Claude Certified Architect - Professional Exam Guide", "Claude Certified Associate - Foundations Exam Guide", "Claude Certified Developer - Foundations Exam Guide". Everything below is paraphrased. Structured task list: `derived/official_tasks.jsonl`.

Facts common to all four guides: delivered by Pearson VUE (online proctored or test center) after registering through the Anthropic Partner Academy; multiple-choice and multiple-response items that state how many answers to pick; 120-minute limit; scaled passing score 720 on a 100-1,000 scale; credential valid 12 months; result is pass/fail plus a scaled score, with per-domain percent-correct shown for information only (not used to decide pass/fail); renewal is a free non-proctored assessment if done on time, otherwise a full retake; retake waits of 14, 30 and 90 days after the first three failures, maximum four attempts per rolling 12 months; cancel or reschedule up to 24 hours ahead; exam content is covered by an NDA.

## claude-certified-architect-foundations

- Exam code CCAR-F. 60 items, 120 minutes, pass 720/1000, fee $125 USD. Structure: 4 scenarios drawn at random from a bank of 6.
- Audience: solution architects building production applications with Claude. Typical candidate has 6+ months hands-on with the Claude API, Agent SDK, Claude Code and MCP. Tests tradeoff judgment across Claude Code, the Agent SDK, the Claude API and MCP.

| # | Domain | Weight |
|---|---|---|
| 1 | Agentic Architecture & Orchestration | 27% |
| 2 | Tool Design & MCP Integration | 18% |
| 3 | Claude Code Configuration & Workflows | 20% |
| 4 | Prompt Engineering & Structured Output | 20% |
| 5 | Context Management & Reliability | 15% |

Task statements: 30 in total (7 + 5 + 6 + 6 + 6), each listing knowledge and skills.

Scenarios (6 in bank; 4 appear):
1. Customer support resolution agent (Agent SDK, custom MCP tools such as customer lookup, order lookup, refund, human escalation; 80% first-contact resolution target).
2. Code generation with Claude Code (slash commands, CLAUDE.md, plan mode vs direct execution).
3. Multi-agent research system (coordinator plus search, document-analysis, synthesis and report subagents).
4. Developer productivity agent (built-in tools plus MCP servers, exploring unfamiliar codebases).
5. Claude Code in CI/CD (automated review, test generation, PR feedback, low false positives).
6. Structured data extraction (JSON-schema validation, edge cases, downstream integration).

Out of scope (explicit list): fine-tuning or training; API authentication, billing and account management; language/framework implementation detail; deploying or hosting MCP servers; Claude internals, Constitutional AI, RLHF; embeddings and vector databases; computer use; vision; streaming/SSE; rate limits, quotas, pricing calculations; OAuth and key rotation; specific cloud provider setups (AWS, GCP, Azure); benchmarking and model comparison; prompt caching internals (only awareness); token counting and tokenization.

Prep resources: the guide prints no external URLs for study material. It gives seven prep themes (build an Agent SDK agent; configure Claude Code on a real project; design and test MCP tools; build an extraction pipeline; practice few-shot and review prompting; practice context patterns; practice escalation and human-in-the-loop) and four hands-on exercises (multi-tool agent with escalation; team Claude Code configuration; extraction pipeline with batch and review routing; multi-agent research pipeline with provenance). It also includes 3 worked sample questions per scenario area and an appendix of in-scope technologies. Support contact: certifications-support@anthropic.com for name corrections, Pearson VUE support for everything else.

## claude-architect-professional

- Exam code CCAR-P. 63 items, 120 minutes, pass 720/1000, fee $175 USD. No scenario structure stated.
- Audience: mid- to senior solution architects, AI/ML engineers, technical leads and senior software engineers. Recommended (not required): 3+ years in systems architecture or platform engineering, 6+ months with Claude or comparable LLM systems in production, end-to-end delivery experience. Explicitly not for entry-level developers, casual users or pure prompt writers.
- Stated skills: translate business problems to solutions, pick models/architectures/API patterns, prompt and context strategy, integrate with enterprise systems, evaluation and observability, security/compliance/governance, stakeholder communication.

| # | Domain | Weight |
|---|---|---|
| 1 | Solution Design & Architecture | 17% |
| 2 | Claude Models, Prompting & Context Engineering | 13% |
| 3 | Integration | 19% |
| 4 | Evaluation, Testing & Optimization | 16% |
| 5 | Governance, Safety & Risk Management | 14% |
| 6 | Stakeholder Communication & Lifecycle Management | 14% |
| 7 | Developer Productivity & Operational Enablement | 7% |

Task list: 38 bullet objectives across the 7 domains (no numbered task statements; no per-objective weights).

Scenarios: none listed. Out-of-scope topics: none listed (only the audience exclusions above).

Prep resources: no names or URLs printed. Advice is generic: self-assess against the blueprint, read official docs on the Claude API, models, prompt engineering, MCP and Skills, build and operate one end-to-end solution including RAG, evaluation and observability, practice architectural decisions, and use the three sample questions (least privilege for agent tools; prompt caching with static prefix ordering; stale retrieval index after a document refresh).

## claude-certified-associate-foundations

- Exam code CCAO-F. 60 items, 120 minutes, pass 720/1000, fee $99 USD. No scenario structure stated.
- Audience: business professionals who use Claude as a productivity tool and build Claude Projects (operations, marketing, project management, education, communications, consultants). Limited to moderate technical depth; no software or API experience needed. Not for developers who build against APIs or design agentic systems; Associates escalate technical work to Architects and Developers.

| # | Domain | Weight |
|---|---|---|
| 1 | Prompting and Task Execution | 14% |
| 2 | Output Evaluation and Validation | 21% |
| 3 | Product and Model Selection | 12% |
| 4 | Workflow Integration and Solution Design | 16% |
| 5 | Configuration and Knowledge Management | 12% |
| 6 | Governance, Risk, and Responsible Use | 15% |
| 7 | Troubleshooting and Optimization | 10% |

Task list: 30 bullet objectives across 7 domains. Scenarios and out-of-scope lists: none given.

Prep resources: no names or URLs. Suggests official documentation and help articles on Projects, Artifacts, Memory, Skills and Code Execution; practice prompt structuring and decomposition; build a Project with instructions and knowledge; practice responsible-use judgment; three sample questions (verify a cited subsection, pick a fast low-cost model for volume, anonymize regulated data before upload).

## claude-developer-foundations

- Exam code CCDV-F. 53 items, 120 minutes, pass 720/1000, fee $125 USD. No scenario structure stated.
- Audience: AI/ML engineers, technical leads and senior software engineers with 1-5 years of software experience and 6+ months with Claude or similar LLM systems; proficient in Python and/or TypeScript, REST and CLI. Not for non-technical users or prompt-only roles.
- This is the only guide that publishes per-skill weights inside each domain (listed in the table).

| # | Domain | Weight | Skills (share of whole exam) |
|---|---|---|---|
| 1 | Agents and Workflows | 14.7% | Agent Architecture 4.5; Agent Construction 5.3; Agent Patterns and Frameworks 4.9 |
| 2 | Applications and Integration | 33.1% | Understanding Requirements 3.4; Systems Life Cycle 2.8; Claude API Mechanics 6.8; Software Engineering Foundations 7.4; Claude Application Design 8.6; Configuration Management 4.1 |
| 3 | Claude Code | 3.1% | Claude Code Operation 3.1 |
| 4 | Eval, Testing, and Debugging | 2.6% | Debugging and Error Handling 2.6 |
| 5 | Model Selection and Optimization | 16.8% | LLM Fundamentals 5.2; Technical Fundamentals 6.1; Model Selection and Tradeoffs 2.7; Cost and Token Management 2.8 |
| 6 | Prompt and Context Engineering | 11.0% | Context Engineering 3.8; Prompt Engineering 4.6; Output Handling 2.6 |
| 7 | Security and Safety | 8.1% | AI Application Security 3.2; Guardrails and Safe Deployment 2.3; Claude Hooks 1.0; Identity, Secrets, and Key Management 1.6 |
| 8 | Tools and MCPs | 10.6% | Tool Implementation 4.4; MCP Server Development 2.1; Agentic Customization 4.1 |

Task list: 25 skills (one JSONL row per domain skill or skill group; domain weights sum to 100.0%). Scenarios and out-of-scope lists: none given.

Prep resources: no names or URLs. Suggests official docs for the API, models, prompt engineering, Claude Code, Skills and MCP; build and run one Claude application that uses the API, a tool, prompt/context engineering and basic security and evaluation; three sample questions (Message Batches for overnight jobs; prompt-injection mitigation by isolating untrusted content with hooks/guardrails; MCP server for a reusable internal REST service).

## Differences between the four certs

- Architect Foundations is the most Claude-Code-and-Agent-SDK specific: it tests concrete mechanisms (stop-reason loop control, Task tool and allowedTools, hooks, .mcp.json scoping, rules path-scoping, skill frontmatter, -p with JSON schema output, --resume and fork_session). The other three stay at a more conceptual level.
- Architect Foundations is the only guide with a scenario format (4 of 6 scenarios) and the only one with an explicit out-of-scope list, which excludes computer use, vision, streaming, pricing, OAuth, cloud providers and prompt-caching internals.
- Architect Professional shifts to enterprise architecture: RAG design, retrieval strategy, authn/authz gaps, observability at scale, A/B testing and eval datasets, compliance (GDPR, HIPAA, FedRAMP), ethics, and 14% on stakeholder communication and lifecycle. It is the only cert that weights business value alignment and discovery.
- Architect Professional has the highest fee ($175) and one more item than Foundations (63) but gives only bullet objectives, no knowledge/skill breakdown.
- Associate Foundations is non-technical: Projects, Artifacts, Research, connectors (Google Drive, Gmail), Memory, model-tier selection, and its biggest domain (21%) is output evaluation and fact-checking. It is the cheapest ($99) and explicitly routes technical work upward.
- Developer Foundations weights application building heaviest: Applications and Integration is 33.1%, with Claude API mechanics (messages, streaming, vision, thinking, caching, batch), software engineering basics and configuration management; it has the fewest items (53). Streaming and vision are in scope here but excluded from Architect Foundations.
- Developer Foundations is the only cert that names third-party agent frameworks (Strands, LangGraph, PydanticAI), MCP server authoring (stdio/sockets), managed (Anthropic-hosted) agents, secrets and key management, and model-version pinning and release breaking changes.
- Claude Code is lightly weighted for Developers (3.1%) and Professional (7% for developer productivity), against 20% on Architect Foundations; eval/debugging is only 2.6% for Developers but a full 16% domain for Architect Professional.
- Governance and responsible use appears in different shapes: operational human-review calibration in Architect Foundations (stratified sampling, confidence routing), compliance and ethics in Professional, data-sensitivity judgment in Associate, and prompt-injection, guardrail and secrets handling in Developer.
