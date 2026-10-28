---
name: claude-api-ops
description: Run Claude API workloads in production with the right model tier, explicit stop_reason handling, safe retries, placed cache breakpoints, batch routing, measured token cost and a plan for model retirement. Use when shipping or tuning a Claude integration, diagnosing truncated or failed calls, cutting spend, or reacting to a deprecation. Triggers - which Claude model should I use, stop_reason max_tokens, 429 rate limit, prompt caching not hitting, use the batch API, Claude API cost, model deprecated.
---

# Claude API operations

The `claude-api` skill tells you how to call the API. This skill tells you what to decide once the
call is in production: which tier to pay for, which response to distrust, which failure to retry,
where to put a cache breakpoint, what to batch, how to prove the bill, and when to move off a model.
Every rule here exists because the failure is silent: a cut-off answer that looks finished, a cache
that never reads, a retired model id found by an outage.

## When to use / when not

- Use for production Messages API work: tier choice, truncation, retries, caching, batches, cost, migration.
- SDK syntax, parameter shapes, streaming helpers: use the built-in `claude-api` skill. Do not copy it here.
- New agent app scaffolding: `agent-sdk-dev:new-sdk-app`. MCP server errors: `plugin-dev:mcp-integration`.
- Routing subagents and your own session spend: [cost-conscious-orchestration](../cost-conscious-orchestration/SKILL.md).
- General measure-first discipline: the `performance-and-cost` rule. Timeouts, backoff and alerting: the `reliability-observability` rule. Idempotency: the `api-and-contracts` rule.
- Proving a cost number before a decision-maker sees it: `staff-validate`.

## Decision rules

1. **Branch on every `stop_reason`, with a default that fails loudly.** An unhandled value that falls through to "done" ships a partial answer as a complete one.
2. **Treat `max_tokens` and `model_context_window_exceeded` as truncated output.** Never parse, store or show the text as final. Raise the cap, continue the response, or shrink the input.
3. **Check `stop_reason` before you parse model JSON.** A length cutoff and a malformed answer need different fixes: the first needs a bigger cap or less output, the second needs a corrective retry.
4. **On `refusal`, read `stop_details` and do not retry the same request blindly.** The call returned HTTP 200, so status-code monitoring will not see it. A fallback model is an option the docs allow.
5. **On `pause_turn`, resend the assistant content to continue.** It comes from the server-tool loop only. A client `tool_use` never produces it.
6. **Loop on `tool_use`, stop on `end_turn`.** Return one `tool_result` per `tool_use_id`. Put a hard iteration cap around the loop anyway, because model-driven control is not a budget.
7. **Pick the tier by task, then prove it on your own eval.** High-volume, low-latency, simple jobs go to Haiku 5.5. Balanced default work goes to Sonnet 5.5. Agentic coding and knowledge work go to Opus 5.5. Demanding, long-horizon reasoning goes to Fable 5.1. Escalate only when the cheaper tier fails a measured criterion.
8. **Turn the effort dial before you change model.** Lower effort on easy turns, keep depth for hard ones. Passing the model default equals omitting it.
9. **Weigh the safety net.** A downstream human or automated check lets you run a cheaper tier. No check means the error cost sets the tier.
10. **Retry by error class.** Retry transient and rate-limit errors with capped exponential backoff and jitter. Never retry invalid-input or auth errors. Make the call idempotent before adding a retry.
11. **A 429 below your published limits means traffic grew too fast.** Ramp load gradually. Do not raise retries to cover a spike.
12. **Streaming does not cure every error.** It helps long outputs and timeouts. It does not shrink an oversized request or fix a bad key. Map each error to its cure before you change code.
13. **Cache the stable prefix, never the changing part.** Put the breakpoint on the last block whose prefix is identical across requests. A breakpoint on per-request content pays writes and never reads.
14. **Verify the cache from `usage`, not from the code.** Both cache counters at zero means nothing was cached. Check the model's minimum cacheable length first.
15. **Batch anything nobody is waiting for.** The price is 50% lower. Keep synchronous calls for blocking gates. Size batch windows against your SLA, not the typical finish time.
16. **Match batch results by `custom_id`, never by position.** Order is not guaranteed, and failed requests must be resubmitted individually.
17. **Count tokens to plan, bill from `usage`.** The count endpoint is an estimate. Actual usage is the ledger.
18. **Attribute cost per request class.** Log model, request label, and every usage counter per call. A single monthly total cannot be optimised.
19. **Keep beta features out of core logic.** Wrap them behind a flag with a GA fallback. Their behaviour and headers can change.
20. **Pin model ids and calendar the retirement.** A dateless id from the 4.6 generation on is itself a pinned snapshot. Watch the deprecation table, not release notes.

## Procedure

1. **Inventory call sites.** List each workload with its model id, latency need and blocking or not. Check: every call site has an owner and a tier reason.
2. **Write the stop handler once.** One shared function maps each `stop_reason` to continue, retry, escalate or fail. Check: a unit test feeds each of the seven values and a made-up eighth.
3. **Force a truncation.** Set a tiny `max_tokens` in a test and confirm the pipeline refuses to treat it as final.
4. **Build the retry table.** Columns: error class, retry yes/no, backoff, cap, idempotency key. Check: replay a 429 and an invalid-input error and see different behaviour.
5. **Place cache breakpoints.** Order the prompt stable first (tools, system, reference), volatile last. Check: send twice within the TTL and read `cache_read_input_tokens` on the second.
6. **Split sync from batch.** Move non-urgent jobs into a batch with meaningful `custom_id` values. Check: submit a small batch, force one failure, and confirm you can find and rerun it.
7. **Estimate before, measure after.** Use the count endpoint for a budget, then compare with logged `usage` over a stated window. Check: the two figures and their window sit side by side in your report.
8. **Run the tier trial.** Build the criteria, run the default tier on a sample, escalate only on failures. Check: a pass rate per tier, per segment, not one aggregate.
9. **Audit model ids.** List every id in code and config against the deprecation table. Check: no id sits in Deprecated or Retired, and each Legacy id has a migration date.
10. **Migrate behind a flag.** Shadow or canary the replacement on real traffic and compare eval scores, cost and stop-reason mix. Check: parameters the new version rejects are removed first.

## Anti-patterns

- Reading `content[0].text` and ignoring `stop_reason`.
- Raising `max_tokens` to the ceiling on every call and hoping.
- Retrying a validation failure with the identical request.
- A second, "smarter" tier for everything because one hard case failed.
- A cache marker on content that changes every request, then reporting savings that were never measured.
- Marking up to the breakpoint limit "just in case".
- Reading batch results as an ordered list.
- Quoting list price as cost, with caching and batch discounts ignored, or the reverse.
- Building core logic on a beta header.
- Keeping a hard-coded retiring model id until the error arrives.
- Sending `temperature`, `top_p` or `top_k` to a version that rejects them.

## Current platform facts (checked 2026-10-28)

- Stop reasons: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`, `model_context_window_exceeded`; refusal detail lives in `stop_details`. https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
- `pause_turn`: server-tool loop hit its default 10-iteration limit. Same URL as above.
- Output cap: 128K tokens synchronous on the current models; Batches can reach 300k with beta header `output-300k-2026-03-24`; each batched request needs `max_tokens` of at least 1. Same URL as above.
- Models (all 1M context, 128K output): `claude-fable-5-1` ($10/$50 per MTok), `claude-opus-5-5` ($4/$20), `claude-sonnet-5-5` ($2/$10), `claude-haiku-5-5` (from $0.10/$0.50). https://platform.claude.com/docs/en/models/overview
  Claude Code needs v2.1.293 or later for Haiku 5.5; older builds resolve the `haiku` alias to Haiku 4.5.
- Legacy but available: `claude-fable-5`, `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`. Same URL as above.
- Effort: `output_config.effort` with `low`, `medium`, `high`, `xhigh`, `max`. Default `high` on Fable 5.1 and Sonnet 5.5, `medium` on Opus 5.5 and Haiku 5.5. https://platform.claude.com/docs/en/build-with-claude/effort
- Deprecated: `claude-sonnet-4-5-20250929` retires 2026-11-30, replacement `claude-sonnet-5-5`. https://platform.claude.com/docs/en/about-claude/model-deprecations
- Sampling parameters `temperature`, `top_p`, `top_k` removed in API version `2026-10-21` (400 even at default). Same URL as above.
- Notice period: at least 60 days for publicly released models. Cloud-managed platforms set their own dates. Same URL as above.
- Caching: `cache_control` of `{type: ephemeral, ttl: 5m|1h}`; up to 4 explicit breakpoints; 20-block lookback; 1h write costs 2x base input. https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Cache reads: Opus 5.5 $0.20 vs $4 base; Sonnet 5.5 $0.10 vs $2. Same URL as above.
- Minimum cacheable prompt: 512 tokens on the 5.5 generation and Fable 5.1, 1,024 on Sonnet 5, 4,096 on Haiku 4.5. Shorter prompts skip caching silently. Same URL as above.
- Cache counters: `cache_read_input_tokens`, `cache_creation_input_tokens`; `input_tokens` counts only tokens after the last breakpoint. Same URL as above.
- Batches: `POST /v1/messages/batches`, `custom_id` 1-64 chars, up to 100,000 requests or 256 MB, expire after 24 hours, results kept 29 days at `results_url`, status `in_progress` then `ended`, counts in `request_counts`. https://platform.claude.com/docs/en/build-with-claude/batch-processing
- Token counting: `POST /v1/messages/count_tokens`, returns `input_tokens`, an estimate, free but rate limited. https://platform.claude.com/docs/en/build-with-claude/token-counting
- Tool overhead: definitions and tool blocks count as input tokens, plus a per-model system overhead (286 tokens on Opus 5.5 with `auto` or `none`). https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Rate-limit headers, error status mapping, `Retry-After` handling, exact `tool_choice` forcing semantics: confirm in docs.

## Exam-era vs current

- Older stop-reason lists name four values. Today there are seven. Answer exam items by the blueprint, then build with all seven.
- Exam items about Opus, Sonnet and Haiku 4.x name legacy models. Fable is a fourth tier now.
- Older cache tables show one minimum length for every model. It now varies by generation.
- Extended thinking with `budget_tokens` is the exam-era framing. Current models use adaptive thinking plus effort.
- Retirement dates in older material have moved. Read the live deprecation table.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-F | Agentic Architecture; Prompt Engineering & Structured Output | stop_reason loop, truncation vs malformed JSON, batch vs sync, `custom_id` handling |
| CCAR-P | Models, Prompting & Context; Evaluation & Optimization | tier choice, effort, caching, token and cost tradeoffs |
| CCAO-F | Product and Model Selection | tier fit, escalate on evidence, human check as safety net |
| CCDV-F | Applications and Integration; Model Selection and Optimization | API mechanics, error classes, caching, batch, token tracking, deprecations, beta risk |
