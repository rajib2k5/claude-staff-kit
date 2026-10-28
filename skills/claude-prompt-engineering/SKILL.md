---
name: claude-prompt-engineering
description: Design Claude prompts that hold up in production — structure, explicit criteria, few-shot examples, multi-pass review, and structured output with validation, retry and defensive parsing. Use when writing or fixing a system prompt, a review or extraction prompt, a prompt template, or any code that parses model output. Triggers - write a prompt, fix this prompt, reduce false positives, few-shot examples, structured output, JSON schema output, validate and retry, parse model output.
---

# Claude prompt engineering

Most bad output traces to an under-specified prompt, not to the model. This skill adds the judgement
for the choices that decide quality: what goes where in a prompt, how to state criteria so precision
rises, when to split one call into several, and which structured-output mechanism to use. It also covers
how to consume the output without trusting it. It targets Claude generation 5 and later.

## When to use / when not

Use it to write, review or debug a prompt, a prompt template, or the code that turns model output into data.

Use a neighbour instead when the question is:
- an SDK call, parameter or model id lookup: `claude-api`
- whether a prompt change helped, or building an eval set: [`claude-evals`](../claude-evals/SKILL.md)
- hooks that enforce a rule in code: `plugin-dev:hook-development`
- tool descriptions and MCP errors: `plugin-dev:mcp-integration`
- a new agent app: `agent-sdk-dev:new-sdk-app`
- model routing and subagent cost: `cost-conscious-orchestration`
- validating a claim or number you are about to report: `staff-validate`

## Decision rules

1. **Separate fixed instructions from variable input.** Use a template with named placeholders and wrap
   each input in descriptive XML-style tags. Reason: the model can tell instruction from data, the fixed
   part stays reusable and cacheable, and untrusted text is easier to fence.
2. **Order the prompt: role and context, task, constraints, output spec.** Put long documents before the
   question and restate the task at the end. Reason: key points at the edges of a long input are used
   more reliably than the middle.
3. **State the goal, the audience and the quality bar.** Name who reads the output and what they do with
   it. Give the reason behind each constraint. Reason: a stated purpose lets the model resolve cases the
   rules did not foresee.
4. **Replace vague instructions with explicit flag-only-when criteria.** "Be conservative" and "only
   report if confident" do not change behaviour. List each category, the condition that triggers it, a
   severity definition, and what to skip. Reason: model confidence is not calibrated, so a confidence
   cut-off does not raise precision; concrete conditions do.
5. **Teach boundaries with 2-4 labelled examples.** Include accept and reject cases and at least one
   ambiguous case with the reasoning. Vary the surface form. Say they are illustrative. Reason: examples
   fix format and the accept/reject line, but a single or uniform example gets copied.
6. **Use a numbered list when order matters.** One action per step, the condition before the command.
   Reason: prose hides sequence.
7. **Chain only when stages depend on each other or you need to inspect the middle.** Generate, review and
   refine as separate calls, each logged. Keep one call when the stages are trivial. Reason: a chain gives
   a loggable intermediate and a place to attach checks. It also adds latency and cost.
8. **Split a large review into per-file passes plus an integration pass.** The integration pass gets the
   per-file findings and the shared data flow, and reconciles conflicts. Reason: one pass over many files
   dilutes attention and gives uneven depth; per-file findings can contradict each other.
9. **Ground long-document work by quoting first.** Ask for verbatim passages, then the analysis that
   cites them. Check each quote against the source with a string match in code. Reason: it cuts
   fabrication and makes unsupported claims detectable.
10. **Review with an independent instance.** Give the reviewer the artifact and the criteria, not the
    generator's reasoning. Reason: a reviewer who sees the reasoning inherits its mistakes.
11. **Pick the structured-output mechanism by need.**
    - *Schema-constrained output* when the response itself is the data and you control the call.
    - *Tool-forced output* (a tool whose input schema is the result) when it is one step in a tool loop,
      or when you must force a specific named tool first. Add strict tool use to keep inputs on schema.
    - *Validate-and-retry* when the rule cannot be expressed in a schema (cross-field, ranges, business
      rules), or the platform lacks constrained decoding. Layer it on top of the other two.
    Reason: constrained decoding fixes syntax, not meaning.
12. **Design schemas so the model is allowed to say "not there".** Make fields nullable when the source
    may lack them. Add an `other` enum value plus a detail string, and an `unclear` value. Add self-check
    fields (calculated total next to stated total) and a `detected_pattern` field. Reason: a required field
    with no honest answer invites invention.
13. **Retry with specifics, and only when retry can help.** Send the source, the failed output and a message
    naming the field and the rule it broke. Cap attempts. Do not retry when the source lacks the value:
    return null or escalate. Reason: a bare "try again" repeats the error; a retry cannot create absent data.
14. **Parse defensively.** Check `stop_reason` before reading content. Treat a refusal or a `max_tokens`
    stop as a failure to handle. Parse inside a try block, validate against the schema in code, and treat
    the result as untrusted input before it reaches SQL, shell or a template. Reason: constrained output
    can still be truncated or refused, and model text can carry injected content.
15. **Fix clarity, not sampling.** Do not reach for temperature, top_p or top_k to stabilise output. Use
    `output_config.effort` for reasoning depth. Reason: those parameters are gone on current API versions,
    and non-determinism is a design input, so the checks must tolerate it.
16. **Put hard rules in code.** Ordering, permissions and irreversible-action limits belong in hooks,
    gates and validators. Reason: prompt wording has a non-zero failure rate.

## Procedure

1. Write the success condition and three real inputs, one of them a known failure. Check: you can say what
   a pass looks like per input.
2. Draft with the template in rules 1-3. Check: instructions and data are in separate tagged blocks.
3. Replace each vague phrase with a condition, a severity and a skip rule (rule 4). Check: a reader could
   mark an output right or wrong without asking you.
4. Add 2-4 examples (rule 5). Check: re-run the failing input and one input unlike any example.
5. Choose the output mechanism (rule 11) and write the schema (rule 12). Check: a record with the field
   missing from the source returns null, not an invented value.
6. Wrap the call in the parsing and retry code (rules 13-14). Check: force a truncation and a refusal in a
   test; both end in handled failures.
7. Change one thing per iteration and re-run the same inputs. Check: you can name the line that fixed it.
8. Hand the prompt to `claude-evals` before any prompt or model change ships.

## Anti-patterns

- A vague instruction as a quality control ("high quality", "be careful", "only if confident").
- One huge prompt that generates, reviews and formats in one pass, with no inspectable middle.
- A single example that the model copies, or examples that all share one surface form.
- Self-review in the same context as a substitute for an independent reviewer.
- Retrying on the same bad input with no error detail, or retrying where the data is missing.
- Parsing with a regex over free text when a schema or forced tool was available.
- Reading content without checking `stop_reason`.
- Adding a required field the source may not contain.
- Swapping to a bigger model before ruling out an under-specified prompt.
- Relying on temperature 0 for repeatable output.
- Using prompt wording to enforce a rule that a hook or validator can enforce.

## Current platform facts (checked 2026-10-28)

- **Structured outputs are generally available.** JSON output goes in `output_config.format` with type
  `json_schema`. Decoding is constrained, so output is valid and schema-conformant. Strict tool use
  (`strict: true`) is the sibling feature, and the two can be combined.
  https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- **Schema limits:** objects need `additionalProperties: false`. Recursive schemas, numeric and
  string-length constraints, external `$ref`, and `minItems` beyond 0 or 1 are unsupported. Move those
  checks into your validator. Same page.
- **Failure cases:** a `stop_reason` of `refusal`, or truncation at max tokens, can return output that
  does not match the schema. Structured outputs are incompatible with citations (HTTP 400) and with
  message prefilling. Same page.
- **SDK helpers:** `client.messages.parse` with `output_format` (Pydantic), and `zodOutputFormat()` (Zod).
  Same page.
- **Deprecated:** the old `output_format` request parameter and the `structured-outputs-2025-11-13` beta
  header. Use `output_config.format`; no header is needed. Same page.
- **Models:** current lineup is `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`,
  `claude-haiku-5-5`. All list 1M context, 128K max output and adaptive thinking.
  https://platform.claude.com/docs/en/models/overview
- **Effort:** set with `output_config.effort`. Levels named: `low`, `medium`, `high`, `xhigh`, `max`
  (confirm per-model availability in docs). Thinking is adaptive; manual `budget_tokens` is not accepted
  on later models. https://platform.claude.com/docs/en/build-with-claude/effort
- **Sampling parameters:** `temperature`, `top_p` and `top_k` were removed in API version `2026-10-21`
  and return 400 even at the default. https://platform.claude.com/docs/en/about-claude/model-deprecations
- **Deprecation:** the Sonnet 4.5 snapshot retires 2026-11-30; the replacement named is
  `claude-sonnet-5-5`. Same deprecations page.
- `tool_choice` modes, the Message Batches API and the Claude Code JSON-schema flag are not in the
  checked set: confirm in docs.

## Exam-era vs current

- Exam items on schema output often describe tool use as the only route. Today, `output_config.format`
  is the direct route and tool use is the right one for tool loops. Answer by the blueprint (tool-forced
  extraction, nullable fields, `other` plus detail); build with the current parameter.
- Items that tune temperature for consistency are stale. Answer by the blueprint: clarity and examples fix
  inconsistency. Build without sampling parameters.
- Items naming 4.x-era Opus, Sonnet and Haiku name legacy models, and a fourth top tier now exists.
  Pick a tier by your eval, not by an exam default.
- Extended thinking with a token budget is replaced by effort plus adaptive thinking.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-F | Prompt Engineering & Structured Output (20%) | explicit criteria, few-shot, schema output, nullable and `other` fields, validate-retry, multi-pass review |
| CCAR-F | Agentic Architecture & Orchestration (27%) | prompt chain vs adaptive decomposition, per-file plus integration pass |
| CCAR-P | Claude Models, Prompting & Context Engineering | system prompts, templates, zero/few-shot, modular prompts |
| CCAO-F | Prompting and Task Execution; Troubleshooting | structured steps, audience and tone, iteration, diagnosing weak prompts |
| CCDV-F | Prompt and Context Engineering | clear instructions, examples, output constraints, defensive parsing |
