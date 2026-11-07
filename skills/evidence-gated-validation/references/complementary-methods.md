# Complementary validation methods — recipes

Companion to `validation-router.md`. The router picks the row; this file says how to
run each method the row names as a complement (or, for row 5, as the primary), what
its falsifier is, and what to record. Every method here is an evidence *source*, not
a reviewer: it decorrelates from a model pass because it consults different evidence
(execution, a second derivation, a held-out window, the live market). A second model
pass does not (README, "Why two channels"). Record every run in the
`runtime-audit.md` §6 format; a load-bearing run without a non-zero `falsifier_rc`
is PROBE_INVALID.

Contents: 1 differential reimplementation · 2 mutation score of probes ·
3 metamorphic relations (general + quant-research set) · 4 pre-registered holdout ·
5 inference on autocorrelated per-period series (block sign-flip, block bootstrap,
Newey–West, multiplicity) · 6 forward / live out-of-sample · 7 verdict and hand-off.

## 1. Differential reimplementation from spec (Channel C)

**When.** A metric, formula, scorer or transform with a precise written spec, and a
candidate implementation whose *value* no documentation channel can see. Rows 3, 4, 5
of the router.

**Recipe.**
1. Write the spec into the claims ledger as formulas and edge rules (ties, NaN,
   dtype, ddof, ranking direction). The ledger, not the candidate, is the input.
2. A separate context that has **not read the candidate** writes `c_metric.py` from
   the ledger only (tests derived from a candidate adhere to it even when told not
   to: arXiv:2502.13820). Prefer a different library path (numpy where the candidate
   uses pandas; a closed form where the candidate iterates).
3. Run both on identical inputs in float64; state the dtype of every input.
4. Compare under the `ml-validation.md` §8 tolerance table: same algorithm rtol
   1e-12; different algorithm rtol 1e-7; float32 inputs 1.3e-6. Compare invariants,
   never raw eigenvectors or label integers (§8 trap 1).
5. Include the pathological inputs: all-equal predictions, a single row, NaN target,
   duplicate ids, a permuted row order.

**Falsifier.** Mutate the candidate once (swap `ddof`, flip ranking direction,
drop the clip) → the comparison must fail at the stated tolerance. Record the
mutant diff and its rc.

**Caveat.** Two copies of one misread spec agree with each other; N-version
independence is overstated by 3.7× even for coding agents (arXiv:2606.20158). Report
"dual-confirmed vs reimplementation", never "independently proven". When the spec is
ambiguous, the ambiguity is a Channel A claim: resolve it from the primary source
first.

## 2. Mutation score of the probe suite

**When.** Any row whose primary rests on tests or probes (2, 4, 12); whole-module runs
only on critical modules.

**Recipe.** Per load-bearing probe, one hand mutant that must fail
(`runtime-audit.md` §5; the clamp demonstration there shows a complete-looking suite
letting a boundary mutant survive). For a critical module, a full run with mutmut /
cosmic-ray / StrykerJS / cargo-mutants / PIT; report killed ÷ (total − equivalent)
and the list of survivors. Mind the CPython `__pycache__` collision trap (§5): run
with `python3 -B` or a fresh `PYTHONPYCACHEPREFIX`.

**Falsifier.** The run itself is the falsifier for the suite. Its own check: a
deliberately vacuous test (no assertion) must appear among the survivors' causes,
and the score must drop when it is added.

**Wrong tool.** A whole-repo run on every change; a suite that does not exist yet
(write the probes first).

## 3. Metamorphic relations

**When.** A partial oracle exists: the output is unknown but a relation between two
runs is necessary for the class of code under test. Rows 4 and 5. The general ML
battery, with its measured validity classes, is `ml-validation.md` §7 — read it
first; a relation asserted outside its class gives a false REFUTED, which is
PROBE_INVALID, not evidence.

**Quant-research set** (per-period rank metrics such as per-date correlation,
feature-neutral correlation, contribution to a meta-model; each relation is necessary
for a rank-based, per-period metric unless the exception says otherwise):

| Relation | Transform | Expected | Falsifier (mutate the scorer) |
|---|---|---|---|
| Within-date shuffle | permute predictions **within** each date | metric ≈ 0 within its noise floor (report the floor: SD of the shuffled metric over ≥ 200 permutations) | shuffle across dates instead → metric no longer ≈ 0 when dates differ in level |
| Monotone-transform invariance | replace predictions by `exp(p)`, `rank(p)`, `p**3` (strictly increasing) | metric unchanged to 1e-12 (rank metric); *not* necessary for a correlation on raw values — declare which | apply a non-monotone map → metric changes |
| Candidate == benchmark | score the benchmark against itself; or a model against a meta-model that contains it | contribution ≈ 0 (self-contribution), paired difference exactly 0 | drop the neutralisation step → contribution no longer 0 |
| Sign flip | `−p` | correlation-type metric negated exactly; a clipped payout is *not* symmetric — declare | remove the sign handling → metric not negated |
| Date shift by one | align predictions to date `t+1` targets | metric drops toward the shuffle floor; if it does not, the target leaks across dates or the join is on the wrong key | none needed — this one is a leak detector; record the before/after |
| Constant prediction | all-equal vector | the pipeline rejects it (or metric NaN with an explicit error); never a silent 0 | remove the guard → silent number |
| Duplicate-row | duplicate every row within a date | rank metric unchanged (ties handled); a count-weighted metric changes — declare | — |

Noise floor rule: "≈ 0" means |metric| < 3 × SD of the within-date-shuffle
distribution; state the SD and the permutation count.

## 4. Pre-registered holdout with a one-shot test

**When.** Any "A beats B" or "this number generalises" claim (router row 5), and
before any selection step touches the holdout.

**Recipe.**
1. Write `preregistration.md` **before any holdout command runs**, containing: the
   candidate list and `k` (the number of comparisons, not of survivors); the metric
   and whether it is a proxy for the decision metric; the holdout window as an
   explicit, frozen date list; the block length and how it was chosen (§5); α,
   sidedness, correction method; the exact scoring command.
2. `sha256sum preregistration.md > preregistration.sha256`. The scorer refuses to
   run when the hash does not match. Amendments are new, dated files that keep the
   old hash; they never overwrite.
3. Score once. The scorer — not a human — appends every spec it scored to
   `<window>.done`. A window with a `.done` entry is spent: re-scoring it, with
   any candidate, is a protocol violation, and a number from a spent window is
   labelled `spent` in the route line.
4. Selection (hyper-parameters, feature sets, ensembling weights) uses only the
   tuning split; the holdout sees the final candidates and nothing else.

**Falsifier.** Edit one byte of `preregistration.md` → the scorer must exit
non-zero. Score a window twice → the second run must refuse on the `.done` entry.

**Wrong tool.** A holdout already peeked at; `k` recorded after seeing results; a
correction chosen after looking.

## 5. Inference on autocorrelated per-period series

**When.** Paired per-period differences `d_t = metric_t(A) − metric_t(B)` on the same
periods and the same target, where targets overlap periods (a 60-day target scored
weekly) so `d` is autocorrelated. Router row 5. Not for code correctness (that is
§1–3 and `ml-validation.md`): this decides whether a *difference* is distinguishable
from noise.

**Block length — measured, never assumed.**
1. Compute the ACF of `d` to lag 3 × (horizon ÷ period spacing).
2. Sweep the block-bootstrap SE of `mean(d)` at block = 1, 13, 26, 52 (or the
   equivalents for the period spacing). Take the smallest block at which doubling
   changes the SE by < 10%. Report the sweep.
3. Defaults when the sweep is unavailable: 2 × horizon-in-periods for paired
   differences, 4 × for level statistics. One measured research repo with a 60-day
   target on weekly dates found lag-1 ACF 0.81 on levels, ACF +0.29 at lag 26 on
   paired differences, and 13-period blocks understating the SE by 8–30%; its
   defaults are 26 (paired) and 52 (levels).
4. **Block count floor.** A one-sided sign-flip test over `nb` blocks cannot return
   a p below 2^−nb: 4 blocks → 0.0625, 5 → 0.031, 7 → 0.0078. Measured below: with
   5 blocks the null rejection rate was 0.015 and power at a true NW t ≈ 4 was 0.26;
   with 4 blocks power was 0. Fewer than ~8 blocks ⇒ the test cannot settle the
   claim: report UNRESOLVED by construction and use §6. Do not shorten the block
   to buy blocks — that is the i.i.d. error in disguise (block = 1 below).

**Test.** One-sided block sign-flip on `D` of shape (k, T), one row per candidate,
the same sign pattern applied to every row so that the max over rows is the
family-wise statistic (White 2000 Reality Check; Romano & Wolf 2005 — verify
citation). Exact enumeration when `nb ≤ 13` (2^13 = 8192 patterns), else ≥ 10,000
draws. Secondary, for the sign: Newey–West t with lag = block (Newey & West 1987 —
verify citation); both must agree in sign. Block-bootstrap percentile CI of
`mean(d)` for the report (moving-block bootstrap, Künsch 1989 — verify citation).

**Multiplicity.** `k` is the pre-registered comparison count. Primary: the
family-wise p from the max statistic. Cross-check: Holm (1979 — verify citation)
over the per-candidate p. For Sharpe-like level statistics use the Deflated Sharpe
haircut (Bailey & López de Prado 2014 — verify citation) and the Harvey, Liu & Zhu
2016 t-threshold (verify citation). Report raw and corrected p side by side.

**Recipe (numpy only).**

```python
import numpy as np

def block_signflip(D, block, n=10000, seed=0):
    """One-sided test of mean(d) > 0 per row of D (k, T); p_fw uses the max over rows."""
    D = np.atleast_2d(np.asarray(D, dtype=np.float64)); k, T = D.shape
    nb = int(np.ceil(T / block))
    if nb <= 13:                                   # exact enumeration
        m = np.arange(2 ** nb)
        signs = 1.0 - 2.0 * ((m[:, None] >> np.arange(nb)) & 1)
    else:
        signs = np.random.default_rng(seed).choice([-1.0, 1.0], size=(n, nb))
    s = np.repeat(signs, block, axis=1)[:, :T]     # one sign per block
    obs = D.mean(axis=1); null = (s @ D.T) / T; n_eff = null.shape[0]
    p_each = (1 + (null >= obs[None, :]).sum(0)) / (n_eff + 1)
    sd = null.std(0); sd = np.where(sd == 0, 1.0, sd)
    z, null_z = obs / sd, null / sd
    p_fw = (1 + (null_z.max(1)[:, None] >= z[None, :]).sum(0)) / (n_eff + 1)
    return obs, p_each, p_fw

def nw_t(d, lag):
    d = np.asarray(d, dtype=np.float64); T = d.size; e = d - d.mean()
    lrv = (e @ e) / T
    for L in range(1, lag + 1):
        lrv += 2.0 * (1.0 - L / (lag + 1.0)) * (e[L:] @ e[:-L]) / T
    return d.mean() / np.sqrt(lrv / T)

def block_bootstrap_ci(d, block, n=10000, seed=0, alpha=0.05):
    d = np.asarray(d, dtype=np.float64); T = d.size; nb = int(np.ceil(T / block))
    rng = np.random.default_rng(seed)
    starts = rng.integers(0, T - block + 1, size=(n, nb))
    idx = (starts[:, :, None] + np.arange(block)).reshape(n, -1)[:, :T]
    return np.quantile(d[idx].mean(1), [alpha / 2, 1 - alpha / 2])
```

**Mandatory falsifiers — all three, or the run is PROBE_INVALID.** `ρ` is the
measured lag-1 ACF of the real `d`, `T` the holdout length, `block` the chosen block.
(a) `D = x − x` → `obs = 0`, `p_each = p_fw = 1`.
(b) Calibration: 200 synthetic AR(1) null series at `ρ`, `T`, `block` → rejection
rate at α = 0.05 inside [0.02, 0.09] (binomial 95% band at n = 200). Repeat at
`block = 1`: the rate must leave the band upward. Twenty seeds cannot do this:
P(0 of 20 reject | null) = 0.95^20 = 0.36.
(c) Power: the same AR(1) plus a constant shift `4 / ((1 − ρ) √T)` (a long-run
t of 4) → rejection in ≥ 90% of 200 replicates.

Measured on this recipe (numpy 2.4.6, seed 12345, 200 replicates each; the script
is the code block above plus an AR(1) generator):

```
rho=0.81 T=260 block=26   (a) obs=[0.] p_each=[1.] p_fw=[1.]
                          (b) block=26 null rejection 0.090 (18/200) in band
                              block=1  null rejection 0.380 (76/200) OUT (over-rejects)
                          (c) shift=1.306 power 0.985 (197/200); mean NW t 5.15
  other seeds, block=26:  0.045 · 0.080 · 0.055
rho=0.81 T=520 block=26   (b) 0.085 in band; block=1 0.280 OUT   (c) power 1.000
rho=0.81 T=520 block=52   (b) 0.080 in band; block=1 0.280 OUT   (c) power 0.995
rho=0.81 T=260 block=52   (b) 0.015 OUT (5 blocks, min p 0.031)   (c) power 0.255
rho=0.81 T=104 block=26   (b) 0.000 OUT (4 blocks, min p 0.0625)  (c) power 0.000
rho=0.30 T=260 block=13   (b) 0.085 in band; block=1 0.175 OUT   (c) power 0.995
NW t at a true t of 4.0, rho=0.81 T=260, by lag: 26→5.14 39→5.28 52→5.46 78→5.86
```

Read-outs: block = 1 over-rejects 4–8× at every setting, which is why i.i.d.
inference on an overlapping-target series is on the router's "do not run" list;
the block-count floor is real (rows 4 and 5); Newey–West overstated t by 1.1–1.9
at ρ = 0.81 and T = 260 at every lag, so it is the sign check, never the p.

## 6. Forward / live out-of-sample

**When.** The re-judge of a decision already taken, and the only evidence source the
researcher cannot contaminate. Never the first gate: too slow, too few points.

**Recipe.** Before the first live period, write the mapping from the tested metric
to the live metric (name, formula, clipping, payout multipliers) into the
pre-registration; if the live metric differs from the tested one and no mapping is
written, every live number is labelled `proxy`. Then accumulate live periods and,
when the block-count floor of §5 is met on the live series, run §5 on it. Until
then the claim stays UNRESOLVED; a stake, allocation or promotion made before that
is a decision made under UNRESOLVED and the report says so.

**Falsifier.** The live scoring pipeline, fed the pre-registered candidate's stored
predictions for a past live period, must reproduce the platform's published score
within the stated tolerance; otherwise the mapping is wrong and live numbers are not
evidence for the tested claim.

## 7. Verdict and hand-off for quant claims

Report, for every "A beats B" claim: point estimate, block and how chosen, block
count, `k`, raw p, corrected p, block-bootstrap CI, NW t, metric and whether it is
a proxy for the decision metric. Proxy caveat on every number: state the decision
metric and the tested metric; a claim proven on a proxy is labelled `proxy` in the
route line and cannot by itself move a stake. (Example of the mapping that must be
written: a tournament that pays `stake × clip(a·corr + b·contribution, lo, hi)` while
the research scored unclipped contribution against an offline proxy — re-verify the
live formula against the platform's current rules before relying on it.)

A pre-registered fail is final. A margin inside the CI ⇒ UNRESOLVED; the next
evidence is §6. Promotion needs corrected p < α **and** the forward check. The stake
or allocation amount is a router row-6 claim: verifier recompute, one adversarial
pass on the *procedure* claims (holdout sealed, `k` honest, selection used the
tuning split only, proxy labelled, block measured) — not on the value — and the
owner decides and executes. The assistant never stakes.
