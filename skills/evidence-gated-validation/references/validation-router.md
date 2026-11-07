# Validation router — pick the method before dispatching any validator

Read this before running any validator: a cheap re-measurer, a strongest-model attacker, or dual-channel
EGV. Blanket rules fail both ways: a strongest-model attack on a rename finds nothing; a documentation
channel cannot see a number (measured: a per-date metric claim came back UNRESOLVED by channel, Channel A
N/A by construction); a reviewer that only reads cannot tell a 0.0009 metric gap from noise. Strength comes
from decorrelated evidence sources, not from more model passes (arXiv:2506.07962). Route first, then run.

## Procedure

0. **Tier 0 deterministic gates run on everything, unconditionally**: build, types, lint, existing tests,
   `dbt compile`, `terraform plan`. Red at Tier 0 stops routing (arXiv:2402.09171, arXiv:2501.06972).
1. Answer four questions for the claim set:
   - **Consequence** — T0–T4 on the irreversibility ladder; does money move, data get destroyed, prod change?
   - **Oracle** — deterministic (tests, spec, reference implementation) · partial (an invariant or
     metamorphic relation holds) · statistical (a metric with sampling noise, no per-case truth) · none (prose).
   - **Novelty** — familiar library and pattern, or unfamiliar / version-sensitive / AI-generated and unreviewed.
   - **Claim shape** — behaviour · existence ("this kwarg exists") · number · "A beats B" · procedure
     ("the holdout was never touched") · prose.
2. Pick every row below that the change touches. Primaries are unioned, never subsetted; the strongest-model
   budget is one O pass per claim set regardless of how many rows are unioned. Oracle picks the primary,
   consequence picks the complement, novelty moves the row per step 4.
3. Run the primary to its stop condition. Add a complement only when its "when" holds
   (`complementary-methods.md`). Never add a second reviewer "to be safe": consensus filters out the
   disagreement signal (arXiv:2510.20963). One adversarial pass per claim set; a second only after fixes landed.
4. Escalation is a fixed map, not a ladder (rows are classes, not ordered tiers):
   - row 1 → 2 when the edit is AI-generated and unreviewed (one hand mutant per touched test);
   - row 2 → 3 only when the change introduces an unfamiliar or version-sensitive symbol; otherwise stay
     in row 2 and add the verifier;
   - rows 5–9 escalate by consequence only (add H when the number reaches a stake, spend or deletion);
   - rows 10 and 11 never escalate on novelty (a README is never `terraform plan`);
   - a primary that returns UNVERIFIABLE/UNRESOLVED escalates to the human (step 5), not to a bigger method; the one exception is a Channel-B probe that returns UNVERIFIABLE on an API-existence claim (a documentation lookup is the only remaining source).
   De-escalation is row 2 → 1 only, for a pure refactor under a green, mutant-checked suite. Never
   escalate past the consequence.
5. Only one evidence source exists for a material claim → **UNRESOLVED by construction**. Say so. A second
   model pass is not a substitute for the missing source.
6. Put the route line at the top of the report. A report without one is not done:
   `route: rows <n> | primary: <method> | complement: <methods|none> | not-run: <method> (why) | stop: met|not met`
7. Unchanged rules: a routed adversarial pass runs on the strongest model, never downgraded; every
   load-bearing probe has a falsifier (`runtime-audit.md` §5); reproduce a flagged blocker before acting on
   it; "tests pass" / "verified" need a command executed this session; T3+ never on inference; a stake,
   spend or deletion needs an explicit human; a scored holdout is never re-scored.

Cost units: `0` no model call · `S` one cheap-model pass · `O` one strongest-model pass · `EGV` two
independent passes (≤3 split depths) · `H` human sign-off · `cpu` local compute only.
Roles: **verifier** = cheap re-measurer of stated figures (read-only). **adversarial** = strongest-model
attacker that must execute, construct the failing input, or re-derive by a different route. Local agent
names for these roles live in the consumer's CLAUDE.md, not here.

## Decision table

| # | Use-case class | Primary | Complementary (only when its "when" holds) | Do NOT run | Stop condition | Cost |
|---|---|---|---|---|---|---|
| 1 | Trivial / mechanical edit (rename, typo, constant, format, comment) | Tier 0 gates; read the diff | none | verifier, adversarial, EGV | gates green; diff is one logical change | 0 |
| 2 | Routine code with tests, familiar libs (T0–T2) | Gates + one hand mutant per new/changed test must fail (`runtime-audit.md` §5) | verifier when the report states counts/timings; property-based tests for pure functions, derived from the spec | EGV; adversarial by reflex | suite green; every new test killed a mutant; verifier AGREE on each figure | 0–S |
| 3 | AI-generated or unfamiliar / low-usage / version-sensitive libraries; any API-existence claim | Dual-channel EGV Mode 1, env pinned, ledger scoped to material API/semantic claims | property-based probes inside Channel B; differential reimplementation when the contract is precise (`complementary-methods.md` §1) | adversarial as a substitute (reading cannot settle existence, arXiv:2406.10279) | every material claim ACCEPTED or UNRESOLVED escalated | EGV |
| 4 | ML / numerics *code* with no test oracle (training loop, loss, custom metric) | Channel B ML probes with falsifiers (`ml-validation.md` §1–6, 9) + metamorphic relations (§7) + differential reimplementation vs reference under the §8 tolerance table | Channel A → full EGV when a named algorithm or library semantics is claimed | adversarial reading the math; golden loss values; sign-flip/bootstrap (that is inference, not correctness) | probes CONFIRMED with non-zero `falsifier_rc`; reference within tolerance; leakage probes clean | S–EGV |
| 5 | **Quant research claim**: "A beats B" on per-period metrics; pre-registered holdout; proxy metric; autocorrelated periods; k candidates | Hash-frozen pre-registration (k, metric, window, block, α) → one-shot *fresh* holdout → block sign-flip / block bootstrap + Newey–West on the paired per-period difference, block from the measured ACF and above the block-count floor → family-wise or Holm correction over k; proxy caveat on every number (`complementary-methods.md` §4–5, 7) | differential reimplementation of the scorer (§1) + metamorphic null controls (§3: within-date shuffle ≈ 0, constant prediction rejected, candidate == benchmark → 0); EGV once per *pipeline* change (splits, embargo, leakage, official metric fn); verifier recomputes headline numbers from the saved per-period files; adversarial (O) on procedure claims only — holdout sealed, k honest, selection on the tuning split, proxy labelled, block measured (`complementary-methods.md` §7); if the number feeds a stake → row 6 | EGV on the value (Channel A N/A); adversarial as primary ("a different window" is not independence here); i.i.d. or too-short-block bootstrap; re-scoring a spent holdout; per-candidate EGV | corrected p, CI, block, block count, k, metric (proxy vs decision) reported; a fail is final; margin inside the CI or too few blocks ⇒ UNRESOLVED, next evidence = live periods (§6) | cpu + S + O (+H via row 6) |
| 6 | Number headed to a human decision (cost, capacity, savings, row count, stake size) | verifier (S) re-measures every stated figure **and** adversarial (O) re-derives by a different method/window and attacks the premise (window, units, absence-vs-zero, sample of one) | human sign-off when the decision is spend or stake (T4); research numbers run row 5 first | EGV (no API claim); a second O pass before fixes | every claim CONFIRMED/REFUTED/PARTIAL/UNVERIFIABLE with measured beside claimed; blockers reproduced | S + O (+H) |
| 7 | Production SQL / dbt, or a reported-on metric | Gates (compile, run, `dbt test` PK unique+not_null, grain, row counts) + adversarial (O) executing a different query, absence-vs-zero, date boundary | golden/replay on a frozen snapshot for incremental models; verifier on reported counts | EGV; property tests on SQL text | compiled and ran; grain held; counts re-derived agree within stated tolerance | O (+S) |
| 8 | Migration / backfill / irreversible op (T3–T4) | destructive-ops guard + prod-scale dry run + written, rehearsed rollback + adversarial (O) on the plan + human sign-off | golden before/after counts and checksums on a sample | EGV; cheap-model-only; anything on inference | dry run output pasted; rollback rehearsed; human yes in chat | O + H |
| 9 | Security-relevant change (authz, secrets, trust boundary, crypto) | SAST / dependency / secret gates + adversarial (O) constructing the exploit input | property-based tests on parsers; Channel A, version-pinned, for crypto/auth library semantics | verifier-only; golden tests as proof of safety | each attack path exploited (REFUTED) or blocked by an executed test | O (+S) |
| 10 | Documentation / prose / design doc | Gates (links resolve, code blocks run) + verifier on every number, path and command | claims inside the doc re-route to rows 2/5/6 | adversarial on style; EGV | every figure AGREE; every command run with exit status seen | 0–S |
| 11 | Infra / config (CI, Terraform, k8s, settings, hooks) | `validate` / `plan` / `--dry-run` + golden diff of the rendered plan | destroy/replace, IAM or network exposure → row 8/9; a hook is exercised once in a scratch session | EGV; adversarial on a config lint | plan lists only intended changes; apply after human yes when prod | 0 (+O+H via rows 8/9 when prod) |
| 12 | Bug reported as "fixed" | Reproduce first (RED), test fails before and passes after; mutant check of the new test | verifier re-runs the reproduction; adversarial (O) when T2+ or concurrency / retries / timezone / currency | EGV; a second O pass before fixes; any method before the failure is reproduced | RED→GREEN output pasted; new test kills the reverted fix | 0–S (+O) |
| 13 | Concurrency / transactions / retries / idempotency; timezone, date-boundary, currency arithmetic (new code, not a fix) | gates + adversarial (O) constructing the interleaving or boundary input | property tests on the boundary; row 12 when reported fixed | EGV; verifier-only | the constructed input is executed and blocked | O |

Tier 0 gates run on every row. Rows 1, 2, 10, 11 never consume a strongest-model pass on their own (row 11
reaches one only by re-routing to rows 8/9). Row 6 is the floor
for any number reaching a human decision. Dual-channel EGV runs only on rows 3 and 4 (row 4 when a named algorithm or
library semantics is claimed) and on row 5 pipeline claims once per pipeline change; row 9 uses Channel A alone. Adversarial
runs only on rows 6–9, 12, 13, and row 5 procedure claims.

## Methods — right tool / wrong tool

| Method | Right tool when | Wrong or wasteful when |
|---|---|---|
| Deterministic gates | Always, first, free | Treated as sufficient above T0 or with no oracle |
| Verifier re-measurement (S) | A report states figures others will copy; a command can be re-run | The figure's derivation is the question; a statistical claim (it re-runs the author's script and agrees with itself) |
| Adversarial attacker (O) | A number to a decision where an independent re-derivation exists; T3+; security; concurrency; "fixed"; test vacuity; **procedure** claims (holdout sealed, k honest) | Trivial edits, prose; a statistical claim on an autocorrelated series; as a substitute for a registry lookup; a second pass before fixes |
| Dual-channel EGV (A × B) | API existence, unfamiliar or version-sensitive libraries (arXiv:2406.14497), a named algorithm, ML pipeline correctness | A *value* (Channel A N/A by construction), a generalisation claim, prose, familiar code with a test oracle (arXiv:2411.02400; ~4 in 10 divergences are false alarms, arXiv:2510.09907) |
| Differential / N-version reimplementation from spec (Channel C, `complementary-methods.md` §1) | A metric, formula or scorer with a precise spec; written from the ledger, never from the candidate (arXiv:2502.13820) | Spec is ambiguous — both copies misread it the same way (arXiv:2606.20158); compares raw eigenvectors/labels instead of invariants (`ml-validation.md` §8) |
| Mutation check of the probe suite (§2) | One hand mutant per load-bearing probe (`runtime-audit.md` §5); full run on critical modules | Whole-repo runs on every change; no tests exist yet |
| Metamorphic relations (§3) | Partial oracle: permutation, scaling, within-date shuffle ≈ 0, constant prediction rejected (`ml-validation.md` §7) | Relation not necessary for the learner class (false REFUTED → PROBE_INVALID) |
| Property-based testing | Parsers, encoders, round-trips, algebraic laws; derived from the spec | Properties derived from the candidate; tautologies (arXiv:2407.03572) |
| Pre-registered holdout, one shot, multiplicity-corrected (§4) | Any "A beats B"; k named before scoring; `.done` marker after one use | Holdout already scored or peeked; k unrecorded; correction applied after looking |
| Block sign-flip / block bootstrap / Newey–West (§5) | Per-period paired differences with overlapping targets; block from the measured ACF; ≥ ~8 blocks | i.i.d. on an overlapping-target series (measured: over-rejects 4–8×); blocks shorter than the dependence; fewer blocks than the floor; a null built from unrelated pairs |
| Forward / live out-of-sample (§6) | The re-judge of a decision already taken; the only source the researcher cannot contaminate | The first gate (too slow, too few points); live metric differs from the tested one and nobody states the mapping |
| Golden / replay tests | Deterministic transforms with a frozen corpus: SQL snapshots, rendered plans, pickle byte-identity | ML training outputs; a golden produced by the code under test |
| Human sign-off | T4: spend, stake, deletion, key rotation, external comms; any UNRESOLVED material claim | As a replacement for an executed check; shown the generator's framing first (arXiv:2603.18740) |

## Worked route — quant research claim (tournament-style per-date metrics)

Claim set: "candidate C beats the deployed model on the per-date payout proxy over the holdout; change the
stake." Answers: consequence T1 for code, T4 for the stake (human only); oracle statistical; novelty low
(gradient-boosted trees, a pinned scoring library); shapes "A beats B" + number + procedure. Rows: **5**, then
**6** for the stake number; row 4 only if the scorer changed; row 3 only for the serialized `predict()` path
when the container API changes. Primary: hash-frozen pre-registration naming k · a *fresh* holdout (spent
windows carry a `.done` marker) · paired per-date `d` · block sign-flip with the block from the measured ACF
(one measured repo: lag-1 ACF 0.81, 13-date blocks understated the SE by 8–30%, so 26 paired / 52 levels) and
at least ~8 blocks · Newey–West for the sign · max-statistic or Holm over k · the proxy sentence on every
contribution-dependent number. Complements: Channel C scorer reimplementation vs the official library (rtol
1e-9, dtype stated) · null controls (within-date shuffle, constant prediction, candidate == benchmark) ·
verifier recompute from the saved per-date files · one O pass on procedure claims only — in one measured
round that pass turned a reported "p 0.013" into Holm-corrected 0.054 over 4 tests. Not run: EGV on the value;
whole-repo adversarial; i.i.d. or 13-date bootstrap; re-scoring a spent window. Stop: corrected p, CI, block,
block count, k, proxy label reported; a fail is final; inside the CI or under the block floor ⇒ UNRESOLVED,
wait for live. Cost: cpu + S + O + H. The assistant never stakes.
