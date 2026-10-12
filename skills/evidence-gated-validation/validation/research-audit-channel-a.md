# Research-corpus audit — Channel A (documentation / full-text)

Scope: claims R1–R15 of `research-audit-ledger.md`. Method: each paper's full text
fetched live (abstract page for metadata; `arxiv.org/html/<id>v<n>` or
`ar5iv.labs.arxiv.org/html/<id>` for body; one NeurIPS camera-ready PDF read
directly). No code executed, no probes run, no Channel B material consulted.

Verdict rule applied: CONFIRMED only if every numeric and quoted component matches
within stated rounding.

**Reliability note on transcription.** Body text arrives via a summarizing fetch
layer. Where a verdict turned on a table value I either (a) corroborated across two
independent fetches, or (b) read the primary PDF directly. R11 was decided from the
PDF. Two fetches of EvalPlus Table 3 returned *mutually inconsistent* numbers, which
is why the PDF read was necessary; treat single-pass table transcriptions elsewhere
as medium confidence and flagged as such below.

---

## Summary

| ID | Verdict |
|----|---------|
| R1 | CONFIRMED |
| R2 | CONFIRMED (quote-wording nit) |
| R3 | CONFIRMED |
| R4 | CONFIRMED |
| R5 | CONFIRMED |
| R6 | CONFIRMED |
| R7 | CONFIRMED |
| R8 | CONFIRMED |
| R9 | CONFIRMED |
| R10 | CONFIRMED |
| R11 | CONFIRMED — unit adjudicated as **relative percent**, not percentage points |
| R12 | **REFUTED** (restoration component) |
| R13 | CONFIRMED (with a paper-internal inconsistency noted) |
| R14 | CONFIRMED |
| R15 | CONFIRMED |

14 CONFIRMED, 1 REFUTED, 0 UNVERIFIABLE.

---

## R1 — Spracklen et al., package hallucinations

**Verdict: CONFIRMED**
**Sources:** https://arxiv.org/abs/2406.10279 · https://arxiv.org/html/2406.10279v3

Abstract (v3):

> "Using 16 popular LLMs for code generation and two unique prompt datasets, we
> generate 576,000 code samples in two programming languages that we analyze for
> package hallucinations."

> "the average percentage of hallucinated packages is at least 5.2% for commercial
> models and 21.7% for open-source models, including a staggering 205,474 unique
> examples of hallucinated package names"

Body, §5.1 (Prevalence of Package Hallucinations, RQ1):

> "These 30 tests generated a total of 2.23 million packages in response to our
> prompts, of which 440,445 (19.7%) were determined to be hallucinations"

Body, §5.3 (Model Behaviors, RQ3 — Frequency of Repeated Hallucinations):

> "43% of hallucinated packages were repeated in all 10 queries, while 39% did not
> repeat at all across the 10 queries."

> "58% of the time, a hallucinated package is repeated more than once in 10
> iterations, which shows that a majority of hallucinations are not simply random
> errors, but a repeatable phenomenon"

**Note.** Every component matches: 16 LLMs, 576k samples, 19.7%, 205,474, ≥5.2% /
21.7%, 43% / 39%. One precision point worth recording — the 19.7% denominator is
2.23 million *package references extracted from* the 576,000 code samples, not the
samples themselves. The ledger's phrasing ("19.7% of generated packages") is
correct; a reader who took it as 19.7% of samples would be wrong.

---

## R2 — CoVe (Chain-of-Verification)

**Verdict: CONFIRMED** (one quote-wording nit, non-material)
**Sources:** https://arxiv.org/abs/2309.11495 · https://arxiv.org/html/2309.11495v2

Body, §3.3 (Execute Verifications), motivating the move away from the joint variant:

> "A potential disadvantage of the joint method is that because the verification
> questions must condition on the baseline response in the LLM context, and the
> method is joint, the verification answers have to condition on the initial
> response as well."

> "This may increase the likelihood of repetition, another known issue of modern
> LLMs, which means the verification questions might hallucinate similarly to the
> original baseline response, which defeats the purpose."

Body, §4.3 (Results):

> "only ∼17% of the Llama few-shot baseline answer entities are correct in
> list-based questions. However, when querying each individual entity via a
> verification question, we find ∼70% are correctly answered."

Factored vs joint across the reported comparisons (single-pass table transcription,
medium confidence; direction corroborated by the §3.3 argument and the paper's
stated conclusion):

| Dataset | joint | factored |
|---|---|---|
| Wikidata (Prec.) | 0.29 | 0.32 |
| Wiki-Category (Prec.) | 0.15 | 0.22 |
| MultiSpanQA (F1) | 0.46 | 0.48 |
| Biographies (FactScore) | 60.8 | 63.7 |

Factored ≥ joint on all four. Claim holds.

**Nit.** The ledger renders the quote as the joint variant "may hallucinate
similarly to the original baseline response". The paper's actual wording is
"**might** hallucinate", and the grammatical subject is "the verification
questions", not the variant. The proposition asserted is the paper's own and sits in
the paragraph criticising joint verification, so this is a transcription slip, not a
misattribution. If the corpus presents it inside quotation marks, change "may" to
"might".

**Also worth recording:** on Wikidata the *two-step* variant (0.36) beats factored
(0.32). The ledger's claim is only "factored ≥ joint", which survives — but the
corpus should not be read as saying factored is uniformly the best CoVe variant.

---

## R3 — Kim et al., correlated errors (ICML 2025)

**Verdict: CONFIRMED**
**Source:** https://arxiv.org/abs/2506.07962

Abstract, verbatim:

> "We conduct a large-scale empirical evaluation on over 350 LLMs overall, using two
> popular leaderboards and a resume-screening task. We find substantial correlation
> in model errors -- on one leaderboard dataset, models agree 60% of the time when
> both models err."

> "Crucially, however, larger and more accurate models have highly correlated
> errors, even with distinct architectures and providers."

Comments field: "Accepted to ICML 2025".

**Note.** Both components — the ~60% agreement-when-both-err on *one leaderboard
dataset*, and the capability trend running toward *more* correlation — match the
ledger. The ledger says "even across distinct providers"; the paper says "even with
distinct architectures and providers", i.e. slightly stronger than claimed.

---

## R4 — Kohli, judge-panel effective independence (unrefereed)

**Verdict: CONFIRMED**
**Sources:** https://arxiv.org/abs/2605.29800 · https://arxiv.org/html/2605.29800v1

Title: *Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation
Panels* (Guneet Kohli, submitted 28 May 2026). No venue in the comments field —
**unrefereed preprint**, as the ledger states.

Abstract:

> "Testing a panel of 9 frontier LLMs from 7 model families on three natural
> language inference datasets (each with 100 human annotations per item), we find
> that the 9 judges effectively provide only about 2 independent votes' worth of
> information. Roughly three-quarters of the panel's nominal independence is lost
> because the models make the same mistakes on the same items."

Body, Table 2 / §4.1:

> "The 9-judge panel yields neff=2.18 with 95% bootstrap CI [2.07,2.31]"

Body, §5.3:

> "When restricted to one judge per family (7 judges, selecting the best in each),
> neff _decreases_ to 1.93"

**Note.** 2.18, CI [2.07, 2.31], and the one-per-family fall to 1.93 all match. The
2.18 figure is the MNLI panel; the paper reports higher n_eff on the other two
datasets (SNLI 2.35 [2.21, 2.51], AlphaNLI 2.48 [2.32, 2.69]). If the corpus cites
2.18 as *the* result rather than as the MNLI result, it is quoting the
strongest-sounding of three. Worth a qualifier.

---

## R5 — KTH N-version replication (unrefereed)

**Verdict: CONFIRMED**
**Sources:** https://arxiv.org/abs/2606.20158 · https://arxiv.org/html/2606.20158v1

Title: *N-Version Programming with Coding Agents* (Ron, Baudry, Monperrus,
submitted 18 Jun 2026). No venue field — **unrefereed preprint**, as stated.

Body:

> "the experiment produces 429 coincident-failure cases where the independence model
> predicts only 115.36 (z=29.20)"

> "Across five agent systems, 23 models, and three target languages, our design
> space comprises 69 [harness, model, language] triples."

> "when all (48 choose 3)=17,296 3-Version units are evaluated, the mean failure
> count drops from 387.44 for single versions to 130.99 for triples, and 11,844
> triples exhibit zero observed failures."

**Note.** All components match: 429 vs 115.36, z = 29.20, 5 harnesses / 23 models /
3 languages, 387.44 → 130.99. Precision point: 69 [harness, model, language] triples
were designed; 48 implementations passed acceptance screening and are the ones
actually evaluated. The abstract's "48 agent-generated implementations" and the
ledger's "5 harnesses / 23 models / 3 languages" describe the design space and the
surviving set respectively — both true, not in conflict.

---

## R6 — Nogueira et al., failure independence in LLM code (unrefereed)

**Verdict: CONFIRMED**
**Source:** https://arxiv.org/abs/2607.02808

Title: *A Systematic Methodology for Evaluating Failure Independence in
LLM-Generated Code* (Nogueira, Pattabiraman, Vieira, Campos, submitted 2 Jul 2026).
No venue field — **unrefereed preprint**, as stated.

Abstract reports: 224 problems, twelve models, five programming languages, three
prompting strategies; implementations "still fail on matching test cases more
frequently than would occur under true independence"; and:

> "The three- and five-version ensembles achieved only 0.43 and 0.44 of the
> theoretical reliability gain respectively, with performance dropping below 0.3
> when using single-model ensembles."

**Note.** 0.43 / 0.44 and the sub-0.3 same-model penalty both match. Ledger says
"~0.43–0.44"; the paper gives them as two discrete values (3-version 0.43,
5-version 0.44), not a range — cosmetic.

---

## R7 — Huang et al., LLMs cannot self-correct reasoning yet (ICLR 2024)

**Verdict: CONFIRMED**
**Sources:** https://arxiv.org/abs/2310.01798 · https://ar5iv.labs.arxiv.org/html/2310.01798

(`arxiv.org/html/2310.01798v3` returns HTTP 404; ar5iv served the body.)

Abstract:

> "our research indicates that LLMs struggle to self-correct their responses without
> external feedback, and at times, their performance even degrades after
> self-correction."

GSM8K, standard prompting vs self-correction rounds:

- GPT-4: Standard 95.5 → round 1 91.5 → round 2 89.0
- GPT-3.5-Turbo: Standard 75.9 → round 1 75.1 → round 2 74.7

Oracle dependence:

> "improvements in these studies result from using oracle labels to guide the
> self-correction process, and the improvements vanish when oracle labels are not
> available."

Debate vs self-consistency at matched response counts (Table 7, "Results of
multi-agent debate and self-consistency"):

| Method | # responses | GSM8K |
|---|---|---|
| Standard Prompting | 1 | 76.7 |
| Self-Consistency | 3 | 82.5 |
| Multi-Agent Debate (round 1) | 6 | 83.2 |
| Self-Consistency | 6 | 85.3 |
| Multi-Agent Debate (round 2) | 9 | 83.0 |
| Self-Consistency | 9 | 88.2 |

**Note.** All three components hold. GPT-4 GSM8K falls 95.5 → 89.0 across two
self-correction rounds (degradation from standard prompting, as claimed); prior
positive results are attributed to oracle labels; and debate loses to
self-consistency at both matched budgets (6: 83.2 vs 85.3; 9: 83.0 vs 88.2).

---

## R8 — Olausson et al., self-repair (ICLR 2024)

**Verdict: CONFIRMED**
**Sources:** https://arxiv.org/abs/2306.09896 · https://ar5iv.labs.arxiv.org/html/2306.09896

> "the overall success rate is increased by 1.58× when we replace GPT-4's own
> feedback with that of our human participants" — from 33.3% to 52.6%

> "GPT-4's feedback is much more likely to be inaccurate (32/80 vs. 7/80 for the
> human feedback)."

> "Our human participants sometimes express uncertainty (7/80); GPT-4 never does
> (0/80)."

**Note.** All three match exactly. Sanity check on the ledger's arithmetic:
52.6 / 33.3 = 1.579, consistent with the paper's stated 1.58×.

---

## R9 — Meta TestGen-LLM (FSE 2024)

**Verdict: CONFIRMED**
**Source:** https://arxiv.org/abs/2402.09171

Abstract, verbatim — the ledger's quoted span is **exact**, not merely
near-verbatim:

> "TestGen-LLM verifies that its generated test classes successfully clear a set of
> filters that assure measurable improvement over the original test suite, thereby
> eliminating problems due to LLM hallucination."

> "In an evaluation on Reels and Stories products for Instagram, 75% of
> TestGen-LLM's test cases built correctly, 57% passed reliably, and 25% increased
> coverage. During Meta's Instagram and Facebook test-a-thons, it improved 11.5% of
> all classes to which it was applied, with 73% of its recommendations being
> accepted for production deployment by Meta software engineers."

Venue confirmed: FSE 24.

**Note.** Funnel (75 / 57 / 25) and the 73% acceptance rate match. Scoping caveat
for the corpus: the 75/57/25 funnel is specifically the Instagram Reels and Stories
evaluation, while 73% acceptance is from the Instagram *and* Facebook test-a-thons —
two different populations, not one pipeline.

---

## R10 — Google internal code migrations (ICSE-SEIP 2025)

**Verdict: CONFIRMED**
**Sources:** https://arxiv.org/abs/2501.06972 · https://arxiv.org/html/2501.06972v1

Body, §IV-2 (Code migration flow):

> "We validate the resulting changes automatically. The validations are configurable
> and often depend on the migration. The two most common validations are building
> the changed files and running their unit tests. Each of the failed validation
> steps can optionally run an ML-powered 'repair'."

> "For each of the build/test failures that we encounter, we prompt the model with
> the changed files, the build/test error and a prompt that requests a fix."

Body, §V (JUnit3 to JUnit4 migration):

> "At the end of the migration ∼87% of the code generated by AI ended up committed
> without any change."

**Note.** Gate structure and the ~87% figure both match, and the 87% is correctly
attributed to the JUnit3→JUnit4 migration. Two qualifiers the corpus should carry:
the repair loop is described as *optional* ("can optionally run"), not unconditional;
and the paper self-describes as an experience report, not a study — "It is not a
research study, in the sense that we do not carry out comparisons against other
approaches" (abstract). It is evidence of industrial practice, not a controlled
result.

---

## R11 — EvalPlus: unit adjudication (NeurIPS 2023)

**Verdict: CONFIRMED.** The unit is **relative percent**, not percentage points.
SKILL.md's wording is faithful on unit and range; it drops the paper's "up-to"
quantifier, which is a real but separate fidelity defect.

**Sources:** https://arxiv.org/abs/2305.01210 ·
https://proceedings.neurips.cc/paper_files/paper/2023/file/43e9d647ccd3e4b7b5baab53f0368686-Paper-Conference.pdf
(NeurIPS camera-ready PDF, read directly — pages 1, 6, 7)

### The deciding sentence (camera-ready, p.6, "Evaluation of LLMs")

> "Notably, the performance drop is significant with up-to 23.1% (pass@1⋆) / 19.3%
> (pass@1) / 24.9% (pass@10) / 28.9% (pass@100) reduction over the evaluated models.
> Such performance decrease is not only seen in popular open-source LLMs, such as
> the widely used CodeGen-16B [46] (18.5% reduction) as well as the emerging
> CODELLAMA-34B [54] (17.6% reduction) and StarCoder [13] (14.1% reduction), but
> also observed in state-of-the-art commercial ChatGPT (12.6% reduction) and GPT-4
> (13.1% reduction) models."

Abstract (camera-ready, p.1):

> "reducing the pass@k by up-to 19.3-28.9%"

### Adjudication — two independent proofs that the unit is relative

**Proof 1 — the per-model figures reproduce exactly under relative computation and
not at all under absolute.** Using Table 3 (p.7) pass@1⋆ base vs +extra:

| Model | base | +extra | absolute drop (pp) | relative drop | paper says |
|---|---|---|---|---|---|
| CodeGen-16B | 32.9 | 26.8 | 6.1 | 6.1/32.9 = **18.5%** | 18.5% ✓ |
| CodeLlama-34B | 51.8 | 42.7 | 9.1 | 9.1/51.8 = **17.6%** | 17.6% ✓ |
| StarCoder-15B | 34.1 | 29.3 | 4.8 | 4.8/34.1 = **14.1%** | 14.1% ✓ |

Three for three on the relative reading, to the decimal. The absolute drops
(6.1, 9.1, 4.8 pp) bear no resemblance to the quoted 18.5 / 17.6 / 14.1.

**Proof 2 — a 19.3-point absolute drop does not exist anywhere in Table 3.** The
largest absolute pass@1 gap in the whole table is CodeLlama-34B, 52.0 → 43.1 = 8.9
percentage points. The largest absolute pass@1⋆ gap is GPT-4, 88.4 → 76.2 = 12.2
percentage points. Neither approaches 19.3, so "19.3" cannot be percentage points.
Correspondingly for the top of the range: no pass@100 row drops 28.9 points.

The headline range is therefore the **maximum relative reduction across models, taken
separately at each k**: 23.1% at pass@1⋆, 19.3% at pass@1, 24.9% at pass@10, 28.9%
at pass@100. Corroborating the pass@1⋆ end, InCoder-6.7B (15.9 → 12.2) gives
3.7/15.9 = 23.3%, matching the quoted 23.1% to rounding.

The paper never uses "percentage point" or "absolute" in connection with these
figures.

### Fidelity of the skill's wording

Three sites in the corpus:

- `SKILL.md:273` — "an 80× test expansion of HumanEval cut pass rates 19.3–28.9% (arXiv:2305.01210)"
- `README.md:50` — "an 80× test expansion cut HumanEval pass rates 19.3–28.9%"
- `references/runtime-audit.md:245` — "expanding HumanEval's tests 80× cut measured pass@k by 19.3–28.9%"

**Unit: faithful.** All three write "%", and "cut X by 19.3%" reads as a relative
reduction in ordinary usage — the same reading the paper intends. There is no
percentage-point error in the corpus.

**Range: faithful.** 19.3–28.9 are the paper's own numbers.

**Quantifier: NOT faithful.** All three drop "up-to". The paper's 19.3–28.9 is the
envelope of *per-k maxima across models*; the corpus presents it as the effect
size. The typical model is well below it — the paper's own named examples run 12.6%
(ChatGPT), 13.1% (GPT-4), 14.1% (StarCoder), 17.6% (CodeLlama-34B), 18.5%
(CodeGen-16B), i.e. **not one of the five models the paper singles out reaches even
the 19.3% bottom of the quoted range.** The corpus overstates a ceiling as a range.

Recommended repair (restores the paper's meaning at no cost in force): "cut pass
rates by **up to** 19.3–28.9%".

**Verdict rationale.** The ledger's falsifier for R11 is "paper's unit/range differs
from the skill's usage". Unit does not differ; range does not differ. So CONFIRMED.
The "up-to" omission is flagged as a documentation defect for the caller to fix — it
is a fidelity problem, not a unit/range mismatch. This was previously noted at
`self-validation-channel-a.md:353` ("Skill drops 'up-to'; otherwise exact"), so it is
a known, twice-independently-found issue that has not yet been repaired.

### Minor paper-internal wrinkle (does not affect the verdict)

"up-to 19.3% (pass@1)" is not the strict maximum relative pass@1 reduction in
Table 3: InCoder-1.3B (10.0 → 7.9) is 21.0% and InCoder-6.7B (15.6 → 12.4) is 20.5%.
Both exceed 19.3%. The authors may have computed the "up-to" over a subset or from
unrounded values. This is EvalPlus's inconsistency, not the corpus's, and it does not
bear on the unit question.

---

## R12 — Contextual bias in LLM-assisted security code review (unrefereed)

**Verdict: REFUTED** — the numeric range is exactly right; the **restoration
component is materially stronger than what the paper reports.**

**Sources:** https://arxiv.org/abs/2603.18740 · https://arxiv.org/html/2603.18740v1

Title: *Measuring and Exploiting Contextual Bias in LLM-Assisted Security Code
Review* (Mitropoulos, Alexopoulos, Alexopoulos, Spinellis, submitted 19 Mar 2026).
No venue field — **unrefereed preprint**, as stated.

### Component 1 — the 16.2–93.5 range: CONFIRMED, and the unit is percentage points

> "GPT-4o-mini shows the largest effect, with detection falling from 240/247 (97.2%)
> under neutral framing to 9/247 (3.6%) under strong bug-free framing, a 93.5pp
> decline"

Per-model declines under strong bug-free framing (Table 2):

| Model | decline |
|---|---|
| GPT-4o-mini | −93.5pp |
| Claude 3.5 Haiku | −59.9pp |
| DeepSeek V3 | −42.9pp |
| Gemini 2.0 Flash | −16.2pp |

The paper writes "pp" throughout, so the ledger's "percentage points" is correct.
16.2 is the floor (Gemini 2.0 Flash), 93.5 the ceiling (GPT-4o-mini). Note the
93.5pp figure is internally consistent: 97.2% − 3.6% = 93.6, matching to rounding.

### Component 2 — "restored detection in all affected cases": REFUTED

The claim is true for one of the paper's two studies and **not** for the other.

Study 2, **Case 1** (interactive assistant, Copilot) — supports the claim:

> "For all 12 bias-confirmed cases, instructing Copilot to ignore PR metadata and
> analyze only the code diff restores correct detection."

Study 2, **Case 2** (autonomous agent, Claude Code) — does not:

> "Redacting the PR description (Debiased-1) recovers 11 of 16 missed detections
> (68.75%). Adding instructions to ignore commit metadata (Debiased-2) raises
> detection to 94% (16/17)."

> "One vulnerability (CVE-2025-66416) evades detection under all conditions, which
> we attribute to the fact that the vulnerability only affects very specific
> non-standard deployment configurations."

Two things are wrong with the ledger's phrasing:

1. **The headline restoration figure is 94%, not 100%.** The paper's own reported
   outcome for the agent case is 16/17.
2. **Redaction alone is not sufficient.** Redacting PR metadata by itself recovered
   only 11 of 16 (68.75%). The instruction component was load-bearing. The ledger
   conjoins them ("redacting PR metadata + instructing diff-only analysis"), which is
   the Debiased-2 condition, so this part is defensible — but any corpus text that
   credits metadata redaction alone would be wrong.

### The counter-reading, stated fairly — caller should adjudicate

There is a reading on which the claim survives: if CVE-2025-66416 was never detected
under *any* framing, it was never a bias-*affected* case, and restoration would then
be complete across all genuinely affected cases (12/12 in Case 1, 16/16 in Case 2).
The paper's own explanation of the miss — an obscure vulnerability affecting
"non-standard deployment configurations" — points that way.

**I could not resolve this from the text, and I want to be explicit about why.**
Study 2 Case 2 has no neutral baseline condition; the four conditions are Biased-1,
Biased-2, Debiased-1, Debiased-2. So the paper provides no measurement of whether the
agent would have caught CVE-2025-66416 absent adversarial framing. Table 6 shows the
CVE with results across B-1/B-2/D-1/D-2 only.

I have called this REFUTED because the verdict rule requires every component to
match, and the paper's reported restoration is 94% while the ledger asserts "all".
That is a defensible-but-contestable call resting on a definitional question the
paper does not answer. **This is the one claim in R1–R15 where I would want the
caller to make the final decision rather than take mine.** The minimal repair that
makes the claim unambiguously true regardless of how the definitional question falls:
"…restored detection in every case the framing had suppressed (12/12 for the
interactive assistant, 16/17 overall for the autonomous agent, the residual being a
vulnerability undetected under all conditions)."

---

## R13 — When and Why Does Multi-Agent Debate Fail

**Verdict: CONFIRMED** (with a paper-internal inconsistency noted)
**Sources:** https://arxiv.org/abs/2510.20963 · https://arxiv.org/html/2510.20963v2

Title: *When and Why Does Multi-Agent Debate Fail and Does It Really Underperform?*
(Chen, Niu, Cheng, Han, Sugiyama; v1 23 Oct 2025, v2 14 Jul 2026).

**Mechanism component.** Abstract: both debate designs suffer "debate hacking";
competitive debates devolve into strategic misrepresentation, while consensus-seeking
versions eliminate valuable disagreement prematurely. Formalised in Proposition 2.6
(Pitfalls of consensus-seeking debate): "the consensus process discards information
about Y" when I(Y;M|X₀) > I(Y;Φ∩(M)|X₀) — i.e. consensus filters out precisely the
disagreement that carries the truth-distinguishing signal. Matches the ledger's
mechanism claim.

**~15-point component.** The paper states:

> "In contrast, CopMAD will lead to up to 15 percentage points performance decrease
> compared to single-agent methods."

This matches the ledger's "~15 points below a single-agent baseline".

**Note — the paper undersells its own tables.** Table 1's competitive-debate gaps are
consistently *larger* than the 15pp summary figure:

| Task (GPT4o-mini + Llama3.1-70B) | CopMAD | single-agent | gap |
|---|---|---|---|
| Math Problem | 65.97 | 89.96 | ~24 |
| Fact Verification | 63.11 | 85.15 | ~22 |
| Answerability | 42.93 | 69.98 | ~27 |

and with DeepSeek-R1: "When pairing GPT4o-mini with DeepSeek-R1, CopMAD drops to
24.89 Avg F2, showing severe debate hacking" against a ~74–85 single-agent baseline.

So the ledger's ~15 figure is the paper's own stated number and is CONFIRMED, but it
is the *conservative* end. The corpus is not overstating here; if anything it
understates. Table values are single-pass transcriptions (medium confidence); the
15pp sentence was returned consistently and is the load-bearing item.

---

## R14 — Recchia et al., confirmation bias / scalable oversight

**Verdict: CONFIRMED**
**Sources:** https://arxiv.org/abs/2507.19486 · https://arxiv.org/html/2507.19486v1

Title: *Confirmation bias: A challenge for scalable oversight*.

Study 1, §3.3 Results (Table 2, hypothesis H3):

> "Actual participant accuracy after interacting with the LLM (0.71, 95% CI
> 0.68–0.74) was lower than the accuracy of the LLM alone (0.75)"

Study 2, §4.4 Discussion:

> "when participants conducted independent online research after receiving the
> consultant's answer, they ended up being even more confident in the consultant's
> position—even when that position was incorrect"

**Note.** 0.71, CI [0.68, 0.74], and the model's 0.75 all match, as does the
grew-more-confident-when-wrong finding. The paper adds that this held "even when
provided substantial financial incentives for accuracy (Wave 2)" — stronger than the
ledger claims.

---

## R15 — Agentic property-based testing

**Verdict: CONFIRMED**
**Sources:** https://arxiv.org/abs/2510.09907 · https://arxiv.org/html/2510.09907v1

Title: *Agentic Property-Based Testing: Finding Bugs Across the Python Ecosystem*
(Maaz, DeVoe, Hatfield-Dodds, Carlini; submitted 10 Oct 2025).

> "The agent generated 984 bug reports, discovering issues in 786 modules (84.2%)"

> "56.0% (95% CI: 42.2%, 69.8%) of reports were determined to be valid bugs, and
> 32.0% (95% CI: 19.1%, 44.9%) were valid and worth reporting."

> "with a cost of $5.56/bug report, and extrapolating from our manual grading that
> 56% of these are valid bugs, our agent can find bugs for $9.93/valid bug."

Coverage: 100 Python packages.

**Note.** All four components match: 984 reports, 100 packages, ~56% genuine, ~32%
worth reporting, $5.56 per report. Precision point the corpus should carry — the
56% / 32% figures have very wide confidence intervals (42.2–69.8% and 19.1–44.9%
respectively), because they come from a manual review of a sample rather than all
984 reports. Citing "56%" as a point estimate without the interval overstates the
precision of the finding.

---

## What I could not do

- `arxiv.org/html/2310.01798v3` (R7) returns HTTP 404; I used
  `ar5iv.labs.arxiv.org/html/2310.01798` instead. Body text obtained, claim decided.
- The NeurIPS EvalPlus PDF does not parse through the fetch layer (returns raw
  object streams). I read the downloaded PDF directly with the file reader instead,
  which is how R11 was decided from primary source.
- R12's residual question — whether CVE-2025-66416 was detectable under neutral
  framing — is not answerable from the paper, because Study 2 Case 2 does not run a
  neutral condition. Resolving it would require contacting the authors or
  re-running the experiment, neither of which is Channel A work.

## Standing caveats for the corpus

Five of the fifteen cited works are **unrefereed preprints**: R4 (2605.29800),
R5 (2606.20158), R6 (2607.02808), R12 (2603.18740), and R15 (2510.09907 has no venue
field). The ledger correctly marks four of these as unrefereed; R15 is not so marked
but likewise shows no venue. Claims resting on them are single-group,
un-peer-reviewed results — several very recent — and none has an independent
replication I located. That does not make them wrong; it does mean the corpus should
not present them with the same weight as the ICLR/ICML/FSE/NeurIPS papers.
