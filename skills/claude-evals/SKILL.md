---
name: claude-evals
description: Evaluate the output of Claude-based systems — measurable success criteria, eval sets, code, model and human graders, regression evals on prompt or model change, fact-checking, and independent reviewer passes. Use when you must know whether a prompt, model or pipeline is good enough, whether a change made it better or worse, or whether an output can be trusted. Triggers - build an eval, is this prompt better, compare models, LLM as judge, regression test a prompt, fact check this output, hallucination check.
---

# Claude evals

An eval turns "it looks fine" into a measured claim about LLM output. This skill adds the judgement for
the choices that make an eval honest: what counts as success, which cases to include, which grader to
trust for which question, and how to compare two versions without fooling yourself. It is about
evaluating model output, not code. It targets Claude generation 5 and later.

## When to use / when not

Use it to define quality, build a test set, pick a grader, gate a prompt or model change, or check a
specific output against its sources.

Use a neighbour instead when the question is:
- adversarial validation of a claim, number or fix you are about to report: [`staff-validate`](../staff-validate/SKILL.md)
- whether AI-written code or an ML implementation is correct: [`evidence-gated-validation`](../evidence-gated-validation/SKILL.md)
- writing or repairing the prompt under test: [`claude-prompt-engineering`](../claude-prompt-engineering/SKILL.md)
- SDK calls, batch mechanics, model ids: `claude-api`
- model routing and cost: `cost-conscious-orchestration`
- test-first work on application code: `staff-tdd`

Do not restate their procedures here. Call them at the points marked below.

## Decision rules

1. **Define quality before you build anything.** Write each criterion so a stranger could score an output:
   specific, measurable, achievable, relevant, with a number and a population. Reason: "good summaries"
   cannot fail, so it cannot be tested.
2. **Set targets from a baseline, not from hope.** Measure the current system or a human on the same set
   first. Reason: an unreachable target gets quietly dropped, and a target below the baseline passes
   everything.
3. **Score separate dimensions separately.** Keep relevance (it answers the question asked), accuracy
   (the facts are right), faithfulness (supported by the given source), format, latency, cost and safety
   as distinct columns. Reason: a fluent, relevant answer can be wrong, and one blended score hides which.
4. **Build the set from real failures first.** Collect concrete failing inputs from logs and user reports,
   then add edge cases, missing-data cases, out-of-scope inputs and adversarial inputs. Add synthetic cases
   only to fill gaps you can name. Reason: invented cases test what you imagined, not what breaks.
5. **Hold out a test split and do not tune on it.** Iterate on a dev split; read the test split once per
   candidate. Retire and replace a test case once its content leaks into a prompt or example. Reason:
   prompts overfit to the cases they are tuned on, and the score stops predicting production.
6. **Label with provenance.** Every case carries an expected answer or a rubric, who wrote it, and which
   source it came from. Have two people label a sample and measure their agreement. Reason: if humans
   disagree, no grader can be "correct".
7. **Pick the cheapest grader that can answer the question.**
   - *Code grader:* exact match, schema, regex, arithmetic, quote-in-source, tool-call correctness.
   - *Model grader:* open-ended qualities such as tone, completeness, faithfulness to a source.
   - *Human grader:* calibration, high-stakes calls, ambiguous standards.
   Reason: deterministic graders are free and repeatable; use judgement only where rules cannot reach.
8. **Know each grader's failure mode and test the grader.**
   - Code: brittle matching rejects valid paraphrase, and format checks pass wrong content.
   - Model: favours longer answers, the first option, and its own style; drifts on vague rubrics; varies
     run to run.
   - Human: tires, shifts standards, and anchors on the model's answer.
   Run every grader on known-good and known-bad outputs before trusting it. Reason: a broken grader makes
   every later number meaningless.
9. **Constrain model graders.** One criterion per call. Give a scale with an anchored example at each
   level. Ask for the reasoning, then a discrete verdict in a schema. Randomise or swap order in pairwise
   tests. Use a grader other than the generator, on a tier no weaker than it. Calibrate against human
   labels and report agreement. Reason: each step removes a known bias.
10. **Report by segment, with n.** Break results out by input type, field and difficulty, and show the
    count behind each. Label a small sample as small. Reason: an aggregate hides a failing category.
11. **Run a regression eval on every change** to prompt, model, tools, retrieval or schema. Run baseline
    and candidate on the same cases, same grader, same settings, changing one thing. Compare per case, and
    list the cases that got worse, not only the mean. Reason: a better average can ship a new failure class.
12. **Measure the noise floor.** Run the unchanged baseline several times and note the spread in the score.
    Treat a delta inside that spread as no change. Reason: model output and model graders vary between runs.
13. **Re-run on every model change; never assume carry-over.** Pin model and prompt versions in the eval
    record. Reason: behaviour changes between releases, and a prompt tuned on one model can regress on the next.
14. **Verify output against the source, not against the model.** Check quotes by string match, citations by
    resolving them and reading the cited text, and figures by recomputing. Compare claims with logs or
    records. Reason: fabricated attribution reads as well as real attribution.
15. **Review with an independent pass.** A fresh instance gets the output, the source and the criteria,
    never the generator's reasoning. Have it tag confidence to route items to a human. When a reviewer
    raises a blocker, confirm it yourself before acting (see `staff-validate`). Reason: reviewers also
    produce false positives.
16. **Set human review by stakes and measured error.** Keep review on high-stakes classes. Sample
    high-confidence output at random. Cut review only after field-level accuracy holds on labelled data.
    Reason: confidence scores are the thing most likely to be wrong in a new way.
17. **Locate the fault layer before fixing.** Trace to prompt, retrieval, tool, model or integration. Rule
    out an under-specified prompt first. Claim a model mismatch only with failing cases that a clearer
    prompt did not fix. Reason: swapping models for a prompt bug wastes spend and hides the bug.
18. **Validate a cheaper tier on a sample of your own workload** before moving traffic. Reason: public
    benchmarks do not predict your inputs.

## Procedure

1. Write criteria per rules 1-3 and the pass thresholds. Check: each criterion has a number and a population.
2. Collect 20 or more real failing and typical inputs. Check: the log source and date range are recorded
   (the count is a starting point; size by the spread you see in rule 12).
3. Label them (rule 6) and split dev from test. Check: agreement on a double-labelled sample is recorded.
4. Choose graders (rule 7) and test each on known-good and known-bad outputs (rule 8). Check: the grader
   fails the bad ones.
5. Run the baseline three or more times. Check: the spread is written down (rule 12).
6. Run the candidate, change one thing. Check: per-case diff and per-segment table, with n.
7. Verify a random sample of passes by hand against sources (rule 14). Check: the grader's false-pass rate.
8. Decide, and record the versions, set, grader and date next to the result.
9. Re-run on each later prompt, model, tool or retrieval change.

## Anti-patterns

- Declaring success from a few handpicked examples.
- Tuning the prompt on the same cases you report.
- One blended "quality" score.
- An LLM judge from the same context as the generator, or with a vague rubric.
- A model grader never compared with human labels.
- Reporting a mean with no segment breakdown, no n and no noise estimate.
- Treating "no failing rows" as "no failures"; the eval may not cover the failing input class.
- Sampling confidence-sorted output only from the low end.
- Trusting a citation because it is well formed.
- Assuming a prompt that worked on an earlier model still works.
- Moving to a cheaper model because a benchmark said so.

## Current platform facts (checked 2026-10-28)

No platform identifiers were retrieved for this skill's brief, so none are asserted here.
- Model ids, snapshot pinning and deprecation dates: confirm in docs. The lineup checked for
  `claude-prompt-engineering` is the starting point.
- Structured output for grader verdicts: see that skill's facts and confirm in docs.
- Batch processing for large grading runs, prompt caching for a fixed rubric, and sampling-parameter
  support on your target model: confirm in docs.
- Any built-in eval tooling in Claude Code or the API: confirm in docs.

## Exam-era vs current

- The exam frames model choice around 4.x-era tiers. The lineup has moved on; choose and re-check tiers by
  your own eval results.
- Exam items may assume low temperature makes a grader stable. Confirm in docs which sampling controls the
  target model accepts, and measure grader noise (rule 12) instead of assuming it.
- Items on human-in-the-loop and fact-checking are conceptual and still hold. Answer by the blueprint;
  build with the rules above.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-P | Evaluation, Testing & Optimization | metrics, eval datasets, A/B and regression, fault diagnosis, monitoring inputs |
| CCAR-P | Governance, Safety & Risk Management | human-in-the-loop validation |
| CCAO-F | Output Evaluation and Validation | accuracy and completeness, hallucination and bias checks, fact-checking, when to add review |
| CCAR-F | Prompt Engineering & Structured Output | validate-retry with self-check fields, independent and multi-pass review |
| CCDV-F | Eval, Testing, and Debugging; Prompt and Context Engineering | fault-layer isolation, response validation, skepticism toward confident output |
