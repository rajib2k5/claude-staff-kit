# quant-rigor: design of `quant_stats.py` and `prereg.py`

Status: implemented 2026-11-16 in `scripts/quant_stats.py` and `scripts/prereg.py`; tests in
`tests/`. The adversarial review of the implementation changed four things, recorded in
section 7; where this text and section 7 differ, section 7 and the code win. Every number in section 6 was
computed in this session (Python 3.12.3, numpy 2.4.6, scipy and mpmath used only to check),
and the two paper examples were read from the authors' PDFs (davidhbailey.com/dhbpapers/
`sharpe-frontier.pdf` p.10, `deflated-sharpe.pdf` p.10), rendered as page images.

Files to create:

```
plugins/quant-rigor/scripts/quant_stats.py   stdlib + numpy; no scipy, no pandas
plugins/quant-rigor/scripts/prereg.py        stdlib CLI; imports quant_stats (so numpy) only in `score`
plugins/quant-rigor/tests/test_quant_stats.py, tests/test_prereg.py
```

## 1. Where it comes from, and what the copies disagree on

Base: `algo-strategies/python/qas/metrics.py` + `qas/stats.py`. They are the best-tested copies:
paper-value tests (`test_metrics.py`), the three mandatory falsifiers as tests (`test_stats.py`,
19 tests), an independent Channel C reimplementation, and the exact sign-flip p convention fixed
after a real bug (2026-11-07). Input checking follows `strategy-card/stats.py`: it raises.

The excess-kurtosis bug: **none of the five Sharpe copies has it.** All five use Pearson
(non-excess) kurtosis, from biased moments: `algo-strategies moments()` (m4/m2^2),
`strategy-card moments()`, and `ivf`/`quant-3d` (`scipy.stats.kurtosis(fisher=False, bias=True)`).
The risk is a future port. `pandas.Series.kurt()` and the default `scipy.stats.kurtosis` both
return EXCESS kurtosis, with a bias correction. Section 2.3 adds a structural guard against it.

Disagreements found. Each one is decided here:

| # | Topic | Copies | Decision |
|---|---|---|---|
| D1 | E[max SR] at N = 1 | algo raises; strategy-card, ivf, quant-3d return `mean_sr` | return `mean_sr`: one trial means no selection, so DSR = PSR(mean_sr) |
| D2 | bad input | algo, ivf, quant-3d return NaN; strategy-card raises | raise `ValueError`. A NaN PSR is read as "not significant", which is a silent failure |
| D3 | Euler-Mascheroni | ivf, quant-3d `0.5772156649` (10 dp) | `0.5772156649015329`. The effect is 2.4e-14 on SR0 (measured): a NIT, not a bug |
| D4 | DSR variance V | paper: cross-trial variance; ivf: max(cross-trial, (1+SR²/2)/T); strategy-card: ddof = 1 | the caller passes `var_sr`. The helper `trial_sharpe_variance` uses ddof = 1 and says the paper does not fix ddof |
| D5 | Holm with NaN | ivf **drops NaN and shrinks m** (anti-conservative); algo `holm([.01,nan,.03])` → `[.03, 1, .06]` (silent); earnings-vol refuses NaN, None counts as 1 | refuse NaN/out-of-range values. "Not tested yet" goes through `k` (pad with p = 1) |
| D6 | exact sign-flip p | §5 recipe `(1+#)/(2^nb+1)`; algo `#/2^nb` with the identity included and a tie tolerance | algo. The recipe form counts the identity twice. Without a tolerance, rounding can drop the identity and give p < 2^-nb |
| D7 | exact-mode cut-off | recipe nb ≤ 13; algo ≤ 16 | 16 (65,536 patterns × k rows; measured fast in algo) |
| D8 | DM long-run variance | ivf rectangular (DM 1995) with a Bartlett fallback, or Bartlett; arima only h = 1 (γ0) | Bartlett/Newey-West at h-1 lags is the default (never negative). Rectangular is opt-in and **raises** when LRV ≤ 0 (no silent fallback). Section 6.4 shows rectangular LRV < 0 on a 16-value series at h = 3 |
| D9 | purge boundary | trading-control-center keeps `t1 == test_start` (`<=`); algo strict `<` | strict: train needs `t1 < T0 - gap` |
| D10 | DSR null mean | all copies: mean_sr = 0 | keep 0 as the default. It is the paper's null |

## 2. `quant_stats.py` conventions (module docstring states them all)

- **Units:** every SR that goes into PSR, E[max SR] or DSR is **per period**, never annualised.
  `annualise(sr, periods_per_year) = sr*sqrt(ppy)` exists only for display. The trial-SR variance
  converts as `V_pp = V_ann / ppy`.
- **Returns** are per-period *excess* returns. The caller subtracts rf. The module has no rf argument,
  because an rf argument invites mixing annual rf with daily returns.
- **Dispersion:** SR uses `std(ddof=1)`. Skew is `m3/m2^1.5` and kurtosis is `m4/m2^2`, both biased
  moment estimators with `m_k = mean((x-mean)^k)`. This is the estimator Bailey & López de Prado
  use. **Kurtosis is Pearson (normal = 3).**
- **Arrays:** `np.asarray(x, dtype=np.float64)`, 1-D, finite. Otherwise `ValueError`, and the message
  names the argument. Scalars must be finite floats.
- **Normal:** `statistics.NormalDist()`: `.cdf`, `.inv_cdf`. **Student t:** section 2.6. No scipy.
- **Errors:** `ValueError` on invalid input. Functions never return NaN for invalid input.

### 2.1 Sharpe
```python
def sharpe(returns) -> float                       # mean / std(ddof=1); len >= 2; std > 0
def annualise(sr: float, periods_per_year: float) -> float      # sr * sqrt(ppy), ppy > 0
def annualised_sharpe(returns, periods_per_year: float) -> float
```

### 2.2 Moments
```python
def moments(x) -> tuple[float, float]              # (skew, kurtosis_pearson), biased; len >= 2, m2 > 0
```

### 2.3 PSR. Bailey & López de Prado (2012), *J. Risk* 15(2), eq. (11)
```python
def psr(sr: float, sr_star: float, n: int, skew: float, kurtosis: float) -> float
def psr_from_returns(returns, sr_star: float = 0.0) -> float
```
`PSR = Φ( (sr - sr_star) * sqrt(n-1) / sqrt(1 - skew*sr + (kurtosis-1)/4 * sr²) )`.
Requires n ≥ 2 and a positive radicand.

**Guard (new): raise if `kurtosis < 1 + skew²`.** Pearson's inequality makes that impossible for
Pearson kurtosis. So an excess kurtosis from near-normal data (≈ 0) is refused rather than silently
used. The message reads "kurtosis must be Pearson (normal = 3), got X; did you pass excess
kurtosis?". The guard does not catch heavy-tailed excess values (excess 7 passes). That case is the
job of the paper-value tests.

### 2.4 E[max SR] and DSR. Bailey, Borwein, López de Prado & Zhu (2014) *Notices AMS* 61(5); Bailey & López de Prado (2014) *JPM* 40(5), eq. (2) and p.10
```python
EULER_GAMMA = 0.5772156649015329
def expected_max_sharpe(n_trials: int, var_sr: float, mean_sr: float = 0.0) -> float
def trial_sharpe_variance(trial_sharpes, periods_per_year: float = 1.0) -> float  # ddof=1, per period
def dsr(sr: float, n: int, skew: float, kurtosis: float, n_trials: int, var_sr: float) -> float
```
`E[max] = mean_sr + sqrt(var_sr)*((1-γ) Φ⁻¹(1-1/N) + γ Φ⁻¹(1-1/(N e)))`. N = 1 returns mean_sr
(D1). N must be an `int` ≥ 1, and var_sr ≥ 0. `dsr = psr(sr, expected_max_sharpe(n_trials, var_sr), n, skew, kurtosis)`.
The docstring says that N is the number of *independent* trials. Passing the raw count of correlated
trials overstates SR0, which is the conservative side (ivf note).

### 2.5 Holm (1979), *Scand. J. Statist.* 6(2)
```python
def holm(pvalues, k: int | None = None) -> np.ndarray     # same order as input
```
Sort ascending (stable). `adj_(i) = max_{j≤i} min(1, (m-j+1) p_(j))`, with m = k if given, else
len(p). `k < len(p)` raises. Members of the family with no p yet count as p = 1. Padding cannot
change the given adjusted values except through m, and m only makes them larger, which is
conservative. Empty input returns an empty array. NaN, < 0 or > 1 raise (D5).

### 2.6 Diebold-Mariano (1995) *JBES* 13(3) with HLN (1997) *IJF* 13(2) eq. (9)
```python
def autocovariances(d, max_lag: int) -> np.ndarray      # γ_j = Σ_{t>j} e_t e_{t-j} / n, e = d - mean
def long_run_variance(d, lags: int, kernel: str = "bartlett") -> float
def dm_test(d, h: int, *, kernel: str = "bartlett", alternative: str = "two-sided") -> DMResult
def student_t_sf(t: float, df: float) -> float          # P(T > t)
```
- `d_t = L_a,t − L_b,t` (the caller orients it). n ≥ 3 and h ≥ 1 are required. If h ≥ n, raise.
- Lags = h−1. Bartlett weights are `w_j = 1 − j/h` (Newey-West at L = h−1, `1−j/(L+1)`).
  Rectangular weights are `w_j = 1`. `LRV = γ0 + 2 Σ_{j=1}^{h−1} w_j γ_j`. If LRV ≤ 0, raise
  (for Bartlett that happens only for a constant d).
- `DM = mean(d)/sqrt(LRV/n)` and `S = DM * sqrt((n + 1 − 2h + h(h−1)/n)/n)`, compared with
  t(n−1). HLN derived the factor for the rectangular estimator. Applying it with Bartlett follows
  the ivf convention, and the docstring says so.
- Two-sided p = `2*student_t_sf(|S|, n−1)`. For "greater" (E[d] > 0, so B is better), p =
  `student_t_sf(S, n−1)`. For "less", p = `student_t_sf(−S, n−1)`.
- `DMResult(n, h, mean_d, lrv, dm, stat_hln, df, p_value, kernel, alternative)` is a frozen dataclass.
- The docstring warns that statsmodels' DM uses `max(h−1, ceil(n^{1/3}))` lags by default (ivf ADR O6).

**Student t without scipy. Decision: use the exact t, not the normal.** At n = 16 the normal p is
0.0203 and the t p is 0.0349 (section 6.4). The gap is large enough to flip a 5 % decision. The
exact form: two-sided `p(t,ν) = I_x(ν/2, 1/2)` with `x = ν/(ν+t²)`, and `y = 1−x = t²/(ν+t²)`
**computed directly**. That is required: `1 − x` rounds to 0 for t ≲ 1e-8 and returns p = 1.0
exactly (measured). Then `student_t_sf(t) = p/2` if t ≥ 0 else `1 − p/2`.

`_betainc(a, b, x, y)` is the regularised incomplete beta (Numerical Recipes 3e §6.4, `betacf`
with modified Lentz). `ln_front = lgamma(a+b) − lgamma(a) − lgamma(b) + a·log(x) + b·log(y)`.
If `x < (a+1)/(a+b+2)`, return `exp(ln_front)·cf(a,b,x)/a`. Otherwise return
`1 − exp(ln_front)·cf(b,a,y)/b`. The edges: `x ≤ 0` gives 0, and `y ≤ 0` gives 1.
`cf`: `qab=a+b, qap=a+1, qam=a−1, c=1, d=1−qab·x/qap`, then FPMIN=1e-300 clamps,
`d=1/d, h=d`. For m = 1..300: the even step uses `aa = m(b−m)x/((qam+2m)(a+2m))`, and the odd
step uses `aa = −(a+m)(qab+m)x/((a+2m)(qap+2m))`. Each step does `d=1+aa·d`, `c=1+aa/c`,
clamps, `d=1/d`, `h*=d·c`. Stop when `|d·c − 1| < 1e-15` after the odd step. With no convergence,
raise `ArithmeticError` (never return a partial value). t = ±inf gives p = 0. NaN raises.
Measured against scipy over ν ∈ {1, …, 999}, t ∈ [0, 1e4]: relative error ≤ 8.1e-14. At
ν = 1e5 it is ≤ 4.8e-11, from lgamma cancellation. The one larger gap (3.1e-9 at ν = 1,
t = 1e-8) is **scipy's** error: the exact Cauchy value `1 − (2/π)atan(1e-8) = 0.9999999936338023`
equals ours.

### 2.7 Purged splits. López de Prado (2018) *AFML* ch. 7 (§7.4.1 purge, §7.4.2 embargo)
```python
@dataclass(frozen=True)
class Split: train: np.ndarray; test: np.ndarray        # int64 positions, ascending
def purged_walk_forward(t0, t1, n_folds: int, *, min_train: int, gap: float = 0) -> list[Split]
def purged_kfold(t0, t1, n_folds: int, *, embargo: float = 0) -> list[Split]
def check_no_leakage(t0, t1, splits, *, gap=0, embargo=0, mode: str) -> None   # raises AssertionError
```
- `t0[i] ≤ t1[i]` is the label interval of event i, on one numeric clock (bar index or int ns). t0
  must be non-decreasing. gap and embargo are in the same clock units and ≥ 0. Every check raises
  `ValueError`.
- The fold edges use **integer arithmetic only** (the algo `0.70*90 = 62.999…` lesson):
  `e_j = s + (j·(n−s))//n_folds`, with s = min_train (walk-forward) or 0 (k-fold). Test fold j is
  positions `[e_j, e_{j+1})`. If `n_folds > n − s`, raise (no empty test folds).
- **Walk-forward, expanding:** with T0 = t0[e_j], `train = {i < e_j : t1[i] < T0 − gap}`. In
  walk-forward the training data only precedes the test fold, so AFML's *post*-test embargo does
  nothing. `gap` is the pre-test embargo the user's repos use: algo-strategies h bars,
  trading-control-center max(1 day, max_hold). A fold whose train set is empty is returned anyway
  and the docstring warns about it. The caller decides.
- **k-fold (AFML 7.4):** with T0 = min t0 and T1 = max t1 over the test fold,
  `train = {i ∉ test : t1[i] < T0 or t0[i] > T1 + embargo}`.
- `check_no_leakage` is the invariant the tests call on every split. For every train i and test j,
  `[t0_i, t1_i] ∩ [t0_j, t1_j] = ∅`. In walk-forward mode, also `t1_i < min t0_test − gap`. In
  k-fold mode, also no train i with `T1 < t0_i ≤ T1 + embargo`. The test folds must partition
  `[s, n)`.

### 2.8 Inference on autocorrelated series (from `qas/stats.py`, conventions D6 and D7)
```python
MIN_BLOCKS = 8; MAX_EXACT_BLOCKS = 16
def block_signflip(D, block: int, *, draws: int = 10_000, seed: int) -> SignFlipResult
def nw_t(d, lag: int) -> float                      # the sign check, never the p
def min_p(T: int, block: int) -> float              # 2**-ceil(T/block)
def resolvable(T: int, block: int) -> bool          # ceil(T/block) >= MIN_BLOCKS
```
`SignFlipResult(obs, p_each, p_fw, nb, exact, draws_used)`. D has shape (k, T) and is oriented so
that d > 0 favours the candidate. The test is one-sided, H1: mean > 0.
- The block sums `B = add.reduceat(D, arange(0,T,block), axis=1)`, and the last block holds the
  remainder.
- In exact mode (nb ≤ 16) all 2^nb patterns run. Pattern m flips block b iff bit b of m is set.
  `p = #(Δ ≥ −tol)/2^nb`, and the identity counts, so p ≥ 2^−nb.
- In Monte Carlo mode, `rng = np.random.default_rng(seed)` and flips = `rng.random((draws, nb)) < 0.5`,
  generated in row chunks of ≤ 2^20 cells so that the result does not depend on the chunk size.
  `p = (1 + #)/(draws + 1)`.
- `Δ = (−2/T)·(flips @ B.T)`, the change of the mean, is exactly 0 for the identity. The tie
  tolerance is `4(block+nb+1)·eps·Σ|D_row|/T`, which is algo's `_tie_tol`.
- `p_fw` is the max over rows of the studentised null (`z = obs/sd(null)`), with the same pattern
  for all rows (White 2000; Romano & Wolf 2005).
- `seed` is keyword-only with no default. Generator streams are not guaranteed across numpy
  versions (NEP 19), so a test pins the MC p for one seed and fails loudly if the stream changes.

## 3. Mutants: one per public function, each must be killed by a named test

| Function | Mutant (realistic bug) | Killing test and expected value |
|---|---|---|
| `sharpe` | `std(ddof=0)` | r=[.01,.02,−.01,.03,0] → 0.6324555320336758 (mutant 0.70711) |
| `annualise` / `annualised_sharpe` | `* ppy` instead of `* sqrt(ppy)` | same r, ppy=252 → 10.039920318408905 |
| `moments` | sample-adjusted (bias=False) estimators | x=[1,2,3,4,10] → (1.1384199576606167, 2.788); mutant (1.69706, 6.152) |
| `psr` | excess kurtosis in the radicand (`(k−1)/4` → `(k−4)/4`) | paper n=24, skew −2.448, kurt 10.164 → 0.9133610838609328 (mutant 0.91997); kurt=3 with sr=.5, n=50 → 0.9995162857748761 |
| `psr` (second) | `sqrt(n)` instead of `sqrt(n−1)` | sr=.5, n=50, skew 0, kurt 3 → 0.99951629 (mutant 0.99957094); assert rel 1e-12 |
| `psr_from_returns` | passes annualised SR | strategy-card-style test: annualised 2.5 put in gives |DSR − 0.9004| > 0.05 |
| `expected_max_sharpe` | `γ·Φ⁻¹(1−1/N)` and `(1−γ)·Φ⁻¹(1−1/(Ne))` swapped | V=1, N=2 → 0.5197553442805939; N=1000 → 3.255121513652723 |
| `trial_sharpe_variance` | ddof=0, or no /ppy conversion | [1,2,3] annual, ppy=4 → var 1/4 = 0.25 |
| `dsr` | uses sr_star=0 (it is then PSR) | paper example → 0.9003968344493904, not ≈ 1 |
| `holm` | no running max (not monotone) | [.01,.04,.03,.005] → [.03,.06,.06,.02] (mutant gives .04 at index 1) |
| `holm` (second) | no cap at 1 | [.4,.45,.9] → [1,1,1]; `k=5` with [.01] → [.05] |
| `autocovariances` / `long_run_variance` | divisor n−j or n−1 instead of n | DM table h=1: LRV 0.35371093750000004 |
| `dm_test` | HLN factor omitted | DM table h=2, p 0.012563111021035477 (mutant 0.0068936) |
| `student_t_sf` | `x` passed and `1−x` recomputed inside | t=1e-8, ν=1 → two-sided 0.9999999936338023 (mutant returns 1.0) |
| `purged_walk_forward` | `t1 <= T0 − gap` (off by one) | section 6.6 fold 0, gap 0 → train [0,1] (mutant [0,1,2]) |
| `purged_kfold` | embargo ignored | section 6.6 fold 2, embargo 1 → train [0,1,9] (mutant [0,1,8,9]) |
| `check_no_leakage` | the interval-intersection test uses `<` where `≤` belongs | feed a hand-made leaking split with `t1_i == t0_j` → must raise |
| `block_signflip` | recipe p `(1+#)/(2^nb+1)` in exact mode | d=[3,−1,2,1], block 1 → p = 3/16 exactly (mutant 4/17) |
| `nw_t` | weights `1−L/lag` instead of `1−L/(lag+1)` | d=[1,2,3,4], lag 1 → 4.0 exactly (volbt hand value) |
| `resolvable` / `min_p` | `floor` instead of `ceil` | T=12, block 5 → nb 3, min_p 0.125 (mutant nb 2) |

Every test runs once against the real code and once against its mutant, through a fixture that
monkeypatches the mutant in. Each test must be **observed to fail** on its mutant before it is
committed (rules/testing.md RED step).

## 4. `prereg.py`: seal once, score once

Implements complementary-methods §4–5. It is stdlib only. `score` imports `quant_stats` from the
same `scripts/` folder by path (`importlib.util.spec_from_file_location`, never `sys.path`, so a
`quant_stats.py` in the working directory cannot be loaded in its place).

```
python3 -P prereg.py seal  --plan PLAN.json --data FILE [--data FILE ...] --dir DIR
python3 -P prereg.py score --id ID --dir DIR
python3 -P prereg.py verify --id ID --dir DIR       # read-only: hashes and state, computes nothing
```

### 4.1 Plan (`PLAN.json`, written by a human, checked strictly: unknown or missing key raises)
```json
{"schema": "quant-rigor/prereg-plan/1", "id": "2026-11-20-har-vs-naive",
 "hypothesis": "HAR beats the naive forecast on QLIKE",
 "metric": {"name": "QLIKE", "is_proxy": true, "decision_metric": "PnL of the vol-targeted book"},
 "candidates": ["har", "har_j"], "k": 7,
 "orientation": "d = metric(benchmark) - metric(candidate); d > 0 favours the candidate",
 "alpha": 0.05, "sidedness": "greater", "correction": "holm",
 "test": {"name": "block_signflip", "block": 21, "block_rationale": "sweep 2026-11-18: SE stable at 21->42 (<10%)",
          "draws": 10000, "seed": 20261120},
 "holdout": {"start": "2024-01-02", "end": "2025-12-31", "n_periods": 501},
 "amends": null}
```
Rules: `k ≥ len(candidates)`, where k is all comparisons tried and not only the survivors. The
missing k − len members count as p = 1 in Holm (§2.5). `metric.is_proxy` is required, and it needs
`decision_metric` when true. `correction` ∈ {holm, maxstat}. Both values are always reported, and
the decision uses the declared one. `sidedness` is `greater` only in v1. `alpha` is in (0, 0.5].
`amends`, when set, is the `sealed_sha256` of an earlier record. An amendment is a new id and
never an overwrite. Dates are ISO strings, so the canonical JSON is well defined (ivf lesson).

### 4.2 Data file
UTF-8 CSV, `\n` line ends, header `date,<cand_1>,…`, one row per holdout period. The values are
the paired differences d already oriented. The candidate columns must equal `candidates` in
order. Dates must be strictly increasing, the first and last must equal `holdout.start`/`end`,
the row count must equal `n_periods`, and every value must be finite. Each file is hashed
byte-for-byte. The seal records only hashes. It never parses the values, so sealing does not
look at the result.

### 4.3 Sealed record and ledger (all in `--dir`)
- `ID.sealed.json` is canonical JSON (`sort_keys=True, separators=(",",":"), ensure_ascii=False`,
  UTF-8, trailing `\n`). It holds `{schema, id, plan, plan_sha256, data:[{path, sha256, bytes}],
  scorer:{prereg_sha256, quant_stats_sha256}, python, numpy (null if absent), sealed_at_utc}`.
  `plan_sha256` is the SHA-256 of the canonical JSON of `plan`. `path` is relative to `--dir`. A
  path that resolves outside `--dir` is refused.
- `ID.sealed.sha256` holds one `sha256sum` line for `ID.sealed.json`. Its digest is the
  `sealed_sha256` that amendments name.
- `spent.jsonl` is append-only. A `{"event":"spent", id, sealed_sha256, start, end, at}` line is
  written and fsynced **before** the result is computed, so a crash mid-score still spends the
  window (volbt lesson). A `{"event":"result", id, result_sha256, at}` line follows.
- `ID.result.json` is created with `O_CREAT|O_EXCL` and holds `{id, sealed_sha256, rows:[{candidate, obs_mean, p_raw,
  p_holm, nw_t, sign_agree}], p_fw_maxstat, nb, exact, min_p, resolvable, decision:{candidate:
  REJECT|NOT_REJECTED|UNRESOLVED}, correction, k, numpy, python, scored_at_utc}`.
  `sign_agree` means the NW t (lag = block) has the same sign as obs_mean. If the signs disagree,
  the row is UNRESOLVED.
  If `resolvable` is false (fewer than 8 blocks), every decision is UNRESOLVED whatever the p. The
  run then exits 0, because the outcome is a valid finding.

Writes go to `name.tmp` + fsync + `os.link(tmp, name)`. The link fails if `name` exists, which is
the atomic no-overwrite step. Then the tmp file is unlinked and the directory fsynced. Appends to
`spent.jsonl` hold `fcntl.flock(LOCK_EX)` on `DIR/.prereg.lock` for the whole check-then-append
sequence.

### 4.4 `score` order of checks (first failure wins, nothing is computed before step 7)
1. `ID.sealed.json` and `.sha256` exist and match → otherwise exit 3.
2. The recomputed `plan_sha256` equals the stored value. If `--plan` was given, or `ID.plan.json`
   sits in DIR, its canonical form must equal the sealed plan → otherwise exit 3 ("plan tampered").
3. Every data file exists and has the sealed sha256 and size → otherwise exit 3 ("data changed").
4. The current `prereg.py` and `quant_stats.py` hashes equal `scorer` → otherwise exit 3. There is
   no override: a changed scorer needs a new seal (an amendment).
5. Under the lock: `ID.result.json` exists, or `spent.jsonl` has a `spent` line for this id, or one
   whose [start, end] overlaps this window → exit 4 ("already scored / window spent").
6. Append the `spent` line and fsync it.
7. Parse the data (§4.2). A violation exits 5, and the window stays spent: the data was hashed at
   seal time, so a bad file is the analyst's error, and re-scoring after fixing it means a new seal.
8. Compute `block_signflip(D, block, draws, seed)`, then `holm(p_each, k)`, `nw_t`, and the
   decisions. Write the result and append the `result` line. Print a summary and exit 0.

`seal` refuses when `ID.sealed.json` or `ID.sealed.sha256` exists, or when the id is in
`spent.jsonl` (exit 4). It also refuses when the plan fails validation or a data file is missing
or outside DIR (exit 5).

### 4.5 Exit codes
`0` ok · `1` internal error (traceback is a bug) · `2` usage (argparse) · `3` integrity: tampered
plan, record, data or scorer · `4` one-shot violation: reseal, rescore, spent window · `5` invalid
plan or data.

### 4.6 What it does not stop (state this in `--help` and the docstring)
These are tripwires against accidents and shortcuts, not a sandbox (volbt and seal_holdout reached
the same conclusion). Someone who deletes `spent.jsonl`, copies the data elsewhere, or looks at the
holdout before sealing defeats them. The remedy is to commit `ID.sealed.*`, `spent.jsonl` and the
result at once, so the git history becomes the record. Git checks (volbt `committed()`) are out of
scope for v1. Hashing the data proves the data did not change after the seal. It does not prove
nobody looked at it.

### 4.7 `prereg` tests (each is a falsifier from §4 of the recipe)
- Edit one byte of the plan inside `ID.sealed.json`, then score → exit 3. Also edit `ID.plan.json`
  → exit 3.
- Change one byte of a data file → exit 3. Edit `quant_stats.py` in a temp copy of the scripts
  folder → exit 3.
- Score twice → the second run exits 4, and `ID.result.json` is unchanged (compare bytes).
- Seal twice → exit 4. Seal a new id whose window overlaps a spent one, then score it → exit 4.
- Crash injection: monkeypatch the computation to raise after step 6, then re-score → exit 4.
- The identity falsifier: data with d ≡ 0 → p_raw = p_holm = 1, and every decision is NOT_REJECTED.
- A 3-row holdout with block 1 has nb 3 < 8, so the decision is UNRESOLVED and the exit code is 0.
- End to end against a hand value: one candidate, d = [3,−1,2,1]·8 (32 periods) with block 4.
  That gives nb = 8, each block sum is 5, and only the identity reaches obs. So p_raw = 1/256 =
  0.00390625. With k = 3, p_holm = 0.01171875, and the decision is REJECT at α = 0.05.

## 5. Non-goals (v1)
MinTRL, the Harvey-Liu-Zhu t-threshold, fixed-b and Andrews DM variants (ivf keeps them),
block-length selection (`block_sweep` stays in the user's repos), bar and calendar handling in the
splits (callers map timestamps to t0 and t1), and git-commit checks in prereg.

## 6. Reference values (computed this session; `rel=1e-12` unless stated)

### 6.1 PSR: Sharpe Ratio Efficient Frontier (2012), p.10, monthly hedge-fund record
SR = 0.458 per month, SR* = 0, n = 24 ("2 years"), and n = 36 ("3 years instead of 2").

| skew, kurt | n | printed | computed |
|---|---|---|---|
| 0, 3 | 24 | 0.982 | 0.9816749190910771 |
| −2.448, 10.164 | 24 | 0.913 | 0.9133610838609328 |
| −2.448, 10.164 | 36 | 0.953 | 0.9535052188653401 |

All three agree with the paper to its 3 dp. Paper tests assert `abs=5e-4`, and our values assert
rel 1e-12. The excess-kurtosis mutant gives 0.9880 / 0.9200 / 0.9585.

### 6.2 DSR: The Deflated Sharpe Ratio (2014), p.10
Annual SR 2.5, 250 periods per year, so SR = 2.5/√250 = 0.15811388300841897. T = 1250, annual
V = 1/2, so V = 0.5/250 = 0.002. Skew −3, kurt 10 (the paper's radicand prints `(10−1)/4`, which
confirms Pearson) and `√1249` (which confirms n−1).

| N | printed | E[max SR] computed | DSR computed |
|---|---|---|---|
| 100 | SR0 ≈ 0.1132, DSR 0.9004 | 0.11317200186513214 | 0.9003968344493904 |
| 46 | 0.9505 | 0.10036237061765357 | 0.9505017068755787 |
| 88, normal (0, 3) | 0.9505 | — | 0.9504908166760138 |

Rounding note: the paper plugs in the *rounded* SR0 0.1132, which gives 0.9002568. The unrounded
SR0 gives 0.9003968. Both print as 0.900x, and our 0.9004 matches the printed 4 dp. Normal at
N = 87 gives 0.95114 and N = 89 gives 0.94984, so N = 88 is the crossing. The excess-kurt mutant
at N = 100 gives 0.9018 (Δ 1.4e-3). That is why §3 also has a kurtosis-heavy case.

### 6.3 Holm
`[0.01, 0.04, 0.03, 0.005] → [0.03, 0.06, 0.06, 0.02]`. `[0.4, 0.45, 0.9] → [1, 1, 1]`.
`[0.02]*3 → [0.06]*3` (ties). `holm([0.01], k=5) → [0.05]`. `holm([]) → []`. NaN raises.

### 6.4 Diebold-Mariano
d = `[0.8,−0.3,1.2,0.5,−0.9,0.4,1.1,−0.2,0.7,0.3,−0.5,0.9,0.6,−0.1,1.0,0.2]`, n = 16, Bartlett.
These were computed two ways: a γ-sum, and the Toeplitz form `eᵀWe/n` with `W_ij = max(0, 1−|i−j|/h)`.
The p was checked with scipy `t.sf` and mpmath `betainc`, and both agree to ≤ 3e-16.

| h | LRV | S (HLN) | p two-sided, t(15) |
|---|---|---|---|
| 1 | 0.35371093750000004 | 2.319937355158723 | 0.03485338653368755 |
| 2 | 0.20738037109375004 | 2.834136122495691 | 0.012563111021035488 |
| 3 | 0.07531901041666667 | 4.3780253607415744 | 0.0005401752526738373 |
| 4 | 0.10479248046875 | 3.4363082967135243 | 0.0036736230677608863 |

Rectangular: h = 2 gives LRV 0.0610498046875, S 5.223509508713366, p 0.00010301860616704354.
**h = 3 gives LRV −0.18880371093750004, so it raises (D8).** The normal p at h = 1 is 0.02034,
against the t p of 0.03485.
Use `rel=1e-10` (summation order), and assert the p values at `rel=1e-9`.

### 6.5 Block sign-flip (exact mode, one-sided greater; enumeration by hand and by algo)
`[3,−1,2,1]`, block 1 → 3/16. `1..8`, block 1 → 1/256 (= min_p).
x = `[.5,−.2,.3,.1,−.4,.6,.2,−.1,.4,.3,−.3,.2]`: block 1 → 416/4096 = 0.1015625, block 2 → 3/64,
block 3 → 1/16, block 5 → 2/8.
Two rows `[x, −x]` with block 3: obs = (0.13333…, −0.13333…), p_each = (0.0625, 1.0),
p_fw = (0.125, 1.0). `D = 0`: obs 0, p_each = p_fw = 1. The calibration and power falsifiers stay
as in `qas/stats.py` (200 AR(1) replicates, band [0.02, 0.09], power ≥ 0.9).

### 6.6 Splits
n = 10, t0 = i, t1 = i + 2.
- `purged_walk_forward(n_folds=3, min_train=4)` gives tests [4,5], [6,7], [8,9]. With gap 0 the
  trains are [0,1], [0..3], [0..5]. With gap 1 they are [0], [0,1,2], [0..4].
- `purged_kfold(n_folds=5)` gives tests [0,1] … [8,9]. Fold 2 (T0 = 4, T1 = 7) trains on
  [0,1,8,9] with embargo 0 and on [0,1,9] with embargo 1. Fold 0 with embargo 1 trains on [5..9].
  Fold 4 trains on [0..5].
- Property test: 200 seeded draws of n ∈ [20, 300], holds ∈ [0, 15], gap/embargo ∈ [0, 5], folds
  ∈ [2, 8]. Every split must pass `check_no_leakage`, and the test folds must partition. The
  property test must also fail against each split mutant in §3.

## 7. Changes after the adversarial review (2026-11-16)

The review ran the implementation against scipy, mpmath, brute-force enumeration and 29 extra
mutants. Each item below was reproduced before it was fixed.

1. **maxstat ignored k (BLOCKER).** One candidate with k = 100 gave REJECT at p_fw = 1/256 while
   Holm over k gave 0.39. `validate_plan` now refuses `correction: "maxstat"` unless
   `k == len(candidates)`.
2. **An environment failure spent the window (MAJOR).** With `python -I` numpy was not found
   after the `spent` line was written. `score` now loads quant_stats.py (and numpy) before it
   spends; the CLI form is `python3 -P` (Python 3.11+), which keeps site-packages.
3. **Windows compared as loosely parsed strings (MAJOR).** `2024-02-04` vs `2024-02-04T00:00`,
   time zones and `2024-13-45` passed. Plan and data dates are now plain `YYYY-MM-DD`, checked
   with `date.fromisoformat`; string order is then date order.
4. **The Newey-West sign check could never fire (MAJOR).** `nw_t = mean/sqrt(lrv/n)` with
   lrv > 0 always has the mean's sign. The veto and `sign_agree` are removed; `nw_t` is reported
   for information only.
5. **PSR guard refused valid two-point returns (MINOR).** Pearson kurtosis equals 1 + skew² for
   two-point data; rounding put it an ulp below. The guard now has a 1e-9 relative tolerance.
6. **Layout errors spent the window (MINOR).** `seal` now checks the header (refusing a UTF-8
   byte-order mark), row count and dates of the scored file, reading no value column.
7. **Test gaps.** Mutants for DM `less`, E[max] `mean_sr`, the leakage checker's gap, embargo
   and partition rules, the LRV guard, the studentised max-statistic, the Monte Carlo stream
   (now pinned for numpy 2.4.6) and the prereg maxstat path, date and data checks all survived;
   tests were added and the mutant runner (`tests/test_mutants.py`) now kills all 48.
8. **Known limits, not changed.** `student_t_sf` relative error grows past df = 1e4 (2.9e-11 at
   3e4, 1.2e-9 at 1e6, against mpmath at 60 digits). The E[max SR] approximation is the paper's
   and is below the exact expectation at N = 2 (0.5198 vs 0.5642). Exact-mode sign-flip memory
   grows with 2^nb × k. `amends` is not checked against an existing record.

The mutant table in section 3 is the original plan; the runner's tables in
`tests/test_mutants.py` are the ones that run (a mutant is a text edit of a temp copy, not a
monkeypatch). In the result file `p_fw_maxstat` is per row.
