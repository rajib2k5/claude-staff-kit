---
name: quant-stats
description: Compute Sharpe, PSR, deflated Sharpe (DSR), Holm-adjusted p-values, the Diebold-Mariano test, purged walk-forward or k-fold splits and a block sign-flip test with one tested stdlib+numpy module (quant_stats.py) instead of writing them again. Use when a quant research result needs a risk-adjusted return, a luck correction for many trials, a forecast comparison, leakage-free time-series cross-validation or a p-value on an autocorrelated series. Triggers - sharpe ratio, probabilistic sharpe, deflated sharpe, PSR, DSR, how many trials, holm correction, multiple testing, diebold mariano, compare forecasts, purged cross validation, embargo, walk forward split, block sign flip.
---

# quant-stats

One module, `${CLAUDE_PLUGIN_ROOT}/scripts/quant_stats.py`, standard library + numpy only. It
replaces the hand-written copies in many research repos. Each function is pinned by a reference
value (Bailey & Lopez de Prado worked examples, hand-enumerated sign-flip counts) and by one
hand-written mutant that a test is shown to kill (`tests/test_mutants.py`).

## Procedure

1. **Load it by path, not by copying it.** Copies drift; the point of this module is one copy.
   ```python
   import importlib.util, sys
   spec = importlib.util.spec_from_file_location("quant_stats", "<plugin>/scripts/quant_stats.py")
   qs = importlib.util.module_from_spec(spec); sys.modules["quant_stats"] = qs; spec.loader.exec_module(qs)
   ```
   If a repo must vendor it, vendor the file unchanged plus `tests/`, and record the plugin version.
2. **Put everything per period.** Per-period excess returns in; `qs.sharpe(r)` is per period.
   Annualise only for display (`qs.annualise(sr, 252)`).
3. **Pick the function.**

| Question | Call |
|---|---|
| Is this Sharpe above a benchmark, given skew and fat tails? | `qs.psr_from_returns(r, sr_star=0.0)` or `qs.psr(sr, sr_star, n, skew, kurt)` |
| Could the best of N tries be luck? | `v = qs.trial_sharpe_variance(all_trial_srs)`, then `qs.dsr(sr, n, skew, kurt, n_trials=N, var_sr=v)` |
| Several hypotheses at once | `qs.holm(pvals, k=total_tried)` |
| Is forecast B better than A? | `qs.dm_test(loss_a - loss_b, h, alternative="greater")` |
| Cross-validate without leakage | `qs.purged_walk_forward(t0, t1, n_folds, min_train=..., gap=...)` or `qs.purged_kfold(t0, t1, n_folds, embargo=...)`, then `qs.check_no_leakage(...)` |
| p-value of a mean on an autocorrelated per-date series | `qs.block_signflip(D, block, seed=...)` with `qs.resolvable(T, block)` |

4. **Count N and k honestly.** N (DSR) and k (Holm) are every variant tried, including the ones
   you dropped. Read the git log and notebooks; do not count only the survivors.
5. **For a holdout claim, do not call these by hand.** Use the `quant-prereg-holdout` skill,
   which seals the plan first and scores once.

## Traps

| Trap | What happens | Guard in the module |
|---|---|---|
| Excess kurtosis (pandas `.kurt()`, default `scipy.stats.kurtosis`) passed as kurtosis | PSR/DSR too high or too low | `moments()` returns Pearson (normal = 3); `psr` raises if `kurtosis < 1 + skew**2` |
| Annualised Sharpe into PSR/DSR | PSR near 1 for anything | Documented; per-period everywhere |
| NaN p-value dropped before Holm | m shrinks, anti-conservative | `holm` raises on NaN; pass `k` for untested members |
| Normal instead of t in DM at small n | p 0.020 vs 0.035 at n = 16 | exact Student t (`student_t_sf`, no scipy) |
| Rectangular DM variance goes negative | silent fallback elsewhere | raises; Bartlett/Newey-West is the default |
| Purge boundary `<=` | a label touching the test start leaks | strict `<`; `check_no_leakage` uses closed intervals |
| Float fold edges (`0.7 * 90 = 62.999`) | off-by-one folds | integer edge arithmetic |
| Sign-flip `(1+#)/(2^nb+1)` in exact mode | counts the identity twice | `#/2^nb`, identity included, tie tolerance |
| Fewer than 8 blocks | the smallest p is above 0.004; a "pass" is noise | `resolvable()`: report UNRESOLVED |
| Monte Carlo p across numpy versions | stream may change (NEP 19) | record the numpy version with the p |

Full conventions, the decisions between disagreeing copies, and every reference value:
`${CLAUDE_PLUGIN_ROOT}/DESIGN.md`.

## Report

State, for every number: the function called, the inputs' units (per period), n, N or k and how
it was counted, the kurtosis convention, and for DM the h, kernel and alternative. Label a metric
that stands in for the decision metric as a proxy. A DSR or Holm-adjusted p is evidence for a
human decision, not the decision.

Tests: `python3 -m unittest discover -s ${CLAUDE_PLUGIN_ROOT}/tests` (the mutation check takes
about 30 s).
