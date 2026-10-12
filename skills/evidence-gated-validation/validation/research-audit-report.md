# Evidence-gated validation report — the research corpus behind this skill

target:        the load-bearing research findings the skill's design rests on, as
               asserted in SKILL.md / README.md / references/*.md (state immediately
               before the repairs listed below)
environment:   live web (Channel A full-text fetches, 2026-08-30); Python 3.12.3 +
               ollama qwen3.6:35b locally (Channel B)
mode:          dual-subagent (Mode 1) — two concurrently-launched independent
               agents, neither able to read the other's output file
ledger:        validation/research-audit-ledger.md (frozen before either channel
               ran; 15 literature claims scoped A, 2 empirical claims scoped B)
channels:      validation/research-audit-channel-a.md,
               validation/research-audit-channel-b.md
scoping note:  literature findings are docs-decidable by nature, so R1–R15 are
               single-channel (A) with scoping declared in the frozen ledger; RB2
               (arithmetic recomputation) and RB1 (local replication) are the
               probe-decidable siblings. Single-channel acceptance here is weaker
               than the skill's dual-confirmed standard and is labeled as such.

## Verdict: 15 of 17 claims ACCEPTED (single-channel-scoped); 1 REJECTED
## (R12 as previously worded — repaired); 1 empirical prediction NOT REPRODUCED
## (RB1 — reported, no corpus change required)

## Gate results

| ID | Claim (abbreviated) | A | B | Gate |
|----|--------------------|---|---|------|
| R1 | Spracklen: 19.7% package hallucination, 43%/39% repeatability split | CONF | N/A | ACCEPTED |
| R2 | CoVe: factored ≥ joint; "might hallucinate similarly"; 17%→70% isolation | CONF | N/A | ACCEPTED (nits below) |
| R3 | Kim: ~60% agreement when both err; correlation rises with capability | CONF | N/A | ACCEPTED |
| R4 | Kohli: 9 judges ≈ 2.18 effective votes; per-family selection no cure | CONF | N/A | ACCEPTED (scoping repaired) |
| R5 | KTH replication: 429 vs 115.36 (z≈29.2); voting still 387→131 | CONF | N/A | ACCEPTED |
| R6 | Nogueira: 0.43–0.44 of predicted gain; <0.3 same-model | CONF | N/A | ACCEPTED |
| R7 | Huang: intrinsic self-correction degrades; oracle-label dependence | CONF | N/A | ACCEPTED |
| R8 | Olausson: 33.3%→52.6% with human feedback; 32/80 vs 7/80; 0/80 uncertainty | CONF | N/A | ACCEPTED |
| R9 | Meta TestGen-LLM: filter-cascade quote (exact); 75/57/25; 73% | CONF | N/A | ACCEPTED (scoping note) |
| R10 | Google migrations: build+tests+validators gate; ~87% committed unchanged | CONF | N/A | ACCEPTED (nuance repaired) |
| R11 | EvalPlus 19.3–28.9: unit adjudicated = RELATIVE percent, range faithful | CONF | N/A | ACCEPTED ("up to" repaired) |
| R12 | Framing collapse 16.2–93.5pp; redaction "restores in all affected cases" | **REF** | N/A | **REJECTED as worded → repaired** |
| R13 | Consensus debate ≤ single agent by ~15 points | CONF | N/A | ACCEPTED (conservative end; table gaps run 22–45) |
| R14 | Recchia: 0.71 vs 0.75; research inflates confidence | CONF | N/A | ACCEPTED |
| R15 | Agentic PBT: 984 reports, ~56% genuine, ~$5.56/report | CONF | N/A | ACCEPTED (CI note added) |
| RB1 | local LLM misses the canonical softmax bug ≥1/N; mechanical probe 2/2 | N/A | **REF** | **REJECTED as written** — see below |
| RB2 | derived arithmetic consistent (3.72×; 2.96; 0.758; 93.85%) | N/A | CONF | ACCEPTED |

## The one literature refutation — R12 (repaired)

The corpus said framing removal "restores" detection. The paper (arXiv:2603.18740)
supports full restoration only in its interactive study (12/12); in the
autonomous-agent study the combined interventions reach 16/17, metadata redaction
ALONE only 11/16, and one vulnerability (CVE-2025-66416) was undetected under every
framing. Channel A fairly noted a counter-reading (the never-detected CVE was
arguably never bias-affected; the study ran no neutral baseline, so this is
undecidable from the paper). Adjudication: the flat wording overstated regardless
of reading — all three citation sites now state the split numbers explicitly.

## The empirical negative result — RB1 (reported, not buried)

The ledger predicted a local LLM would miss the worked-example softmax-into-
CrossEntropyLoss bug in at least one of N runs. Measured: qwen3.6:35b identified
the bug in **10/10 independent runs** (verbatim transcripts in channel-b.md).
The mechanical half held exactly as claimed: the overfit-8 probe flagged the bug
deterministically 2/2 (buggy floors 1.4612/1.46122 vs correct 1.8e-4/2.3e-4).

What this does and does not mean: it does NOT refute the self-review literature
(R7/R8 stand, verified against full texts) — it shows a 2026-era strong model
reliably catches a *canonical, heavily-documented* bug. The literature's force is
on non-canonical, novel, and semantic errors, and on self-review of a model's OWN
freshly-generated output (authorship bias), neither of which this small-n probe
exercised. It is also a ledger-design lesson recorded honestly: the claim's
compound falsifier was poorly constructed (a conjunction that could not fire
cleanly), and the prediction itself was wrong. No skill text claimed an LLM would
miss this bug, so no corpus repair was required.

## Repairs applied to the corpus (this commit)

1. R12 wording at SKILL.md step 3, README, docs-audit.md §1 → explicit 12/12 and
   16/17 restoration figures.
2. "up to 19.3–28.9%" at SKILL.md anti-gaming, README, runtime-audit.md §5 (the
   corpus had dropped the paper's "up-to"; the range is an envelope of per-k
   maxima — no single highlighted model reaches the floor).
3. Kohli n_eff scoped: ~2.2–2.5 across three datasets (2.18 was the strongest).
4. Google migrations: repair loop is optional, not unconditional.
5. False-alarm rate: CI 42–70% noted alongside the ~56% point estimate.

## Secondary findings recorded without corpus changes

- R2: the paper's word is "might" (not "may") hallucinate similarly; and on
  Wikidata the two-step variant (0.36) edges factored (0.32) — factored ≥ joint
  holds everywhere, but factored is not uniformly the best CoVe variant.
- R9: 75/57/25 is the Reels+Stories evaluation; 73% acceptance is the test-a-thons
  — different populations.
- R10 self-describes as an experience report, not a controlled study.
- R13: our ~15-point figure is the paper's own conservative headline.
- EvalPlus paper-internal wrinkle: its "up-to 19.3% (pass@1)" is not its own
  strict maximum (InCoder models show 20.5–21.0%).

## Not validated

- R1–R15 carry single-channel (documentation) acceptance only — no runtime
  channel can decide a literature claim; RB2's arithmetic recomputation is the
  only probe-side cross-check.
- RB1's n=10 on one model is directional, not a study.
- Unrefereed preprints remain unrefereed (R4, R5, R6, R12 among them); venue
  labels were already stripped where unverifiable.
