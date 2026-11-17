"""quant_stats: one tested module for the statistics quant research keeps re-writing.

Standard library + numpy only (no scipy, no pandas). Design and reference values:
``plugins/quant-rigor/DESIGN.md``.

Conventions (read these before you call anything):

* **Units.** Every Sharpe ratio that goes into ``psr``, ``expected_max_sharpe`` or ``dsr`` is
  **per period**, never annualised. ``annualise`` exists for display only. Convert a variance of
  annualised trial Sharpes with ``V_per_period = V_annual / periods_per_year``.
* **Returns** are per-period *excess* returns. Subtract the risk-free rate yourself; there is no
  ``rf`` argument because it invites mixing an annual rate with daily returns.
* **Dispersion.** Sharpe uses ``std(ddof=1)``. Skew is ``m3 / m2**1.5`` and kurtosis is
  ``m4 / m2**2`` with biased central moments ``m_k = mean((x - mean)**k)``, as in Bailey &
  Lopez de Prado. **Kurtosis is Pearson (normal = 3), not excess.** ``pandas.Series.kurt()`` and the
  default ``scipy.stats.kurtosis`` return EXCESS kurtosis; do not feed them in.
* **Errors.** Invalid input raises ``ValueError``. No function returns NaN for invalid input,
  because a NaN p-value reads as "not significant", which is a silent failure.

References: Bailey & Lopez de Prado (2012) "The Sharpe Ratio Efficient Frontier", J. Risk 15(2);
Bailey & Lopez de Prado (2014) "The Deflated Sharpe Ratio", J. Portfolio Mgmt 40(5); Bailey,
Borwein, Lopez de Prado & Zhu (2014) Notices AMS 61(5); Holm (1979) Scand. J. Statist. 6(2);
Diebold & Mariano (1995) JBES 13(3); Harvey, Leybourne & Newbold (1997) IJF 13(2); Lopez de Prado
(2018) Advances in Financial Machine Learning, ch. 7; White (2000); Romano & Wolf (2005).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import NormalDist

import numpy as np

__all__ = [
    "EULER_GAMMA", "MIN_BLOCKS", "MAX_EXACT_BLOCKS",
    "sharpe", "annualise", "annualised_sharpe", "moments",
    "psr", "psr_from_returns", "expected_max_sharpe", "trial_sharpe_variance", "dsr",
    "holm",
    "autocovariances", "long_run_variance", "student_t_sf", "DMResult", "dm_test",
    "Split", "purged_walk_forward", "purged_kfold", "check_no_leakage",
    "SignFlipResult", "block_signflip", "nw_t", "min_p", "resolvable",
]

EULER_GAMMA = 0.5772156649015329
MIN_BLOCKS = 8                 # fewer blocks than this: the sign-flip test is UNRESOLVED
MAX_EXACT_BLOCKS = 16          # exact enumeration up to 2**16 sign patterns
_N = NormalDist()


# ----------------------------------------------------------------------------- input checks
def _arr(x, name: str, min_len: int = 1) -> np.ndarray:
    a = np.asarray(x, dtype=np.float64)
    if a.ndim != 1:
        raise ValueError(f"{name} must be 1-D, got shape {a.shape}")
    if a.size < min_len:
        raise ValueError(f"{name} needs at least {min_len} values, got {a.size}")
    if not np.isfinite(a).all():
        raise ValueError(f"{name} must be finite (no NaN or inf)")
    return a


def _num(x, name: str) -> float:
    if isinstance(x, bool):
        raise ValueError(f"{name} must be a number, got bool")
    v = float(x)
    if not math.isfinite(v):
        raise ValueError(f"{name} must be finite, got {x!r}")
    return v


def _int(x, name: str, lo: int) -> int:
    if isinstance(x, bool) or not isinstance(x, (int, np.integer)):
        raise ValueError(f"{name} must be an int, got {type(x).__name__}")
    if x < lo:
        raise ValueError(f"{name} must be >= {lo}, got {x}")
    return int(x)


# ----------------------------------------------------------------------------- Sharpe
def sharpe(returns) -> float:
    """Per-period Sharpe ratio: mean / std(ddof=1) of per-period excess returns."""
    r = _arr(returns, "returns", 2)
    sd = float(r.std(ddof=1))
    if not sd > 0:
        raise ValueError("returns have zero standard deviation; Sharpe is undefined")
    return float(r.mean()) / sd


def annualise(sr: float, periods_per_year: float) -> float:
    """Display only: ``sr * sqrt(periods_per_year)``. Never feed the result into psr/dsr."""
    ppy = _num(periods_per_year, "periods_per_year")
    if ppy <= 0:
        raise ValueError("periods_per_year must be > 0")
    return _num(sr, "sr") * math.sqrt(ppy)


def annualised_sharpe(returns, periods_per_year: float) -> float:
    return annualise(sharpe(returns), periods_per_year)


def moments(x) -> tuple[float, float]:
    """(skew, Pearson kurtosis) from biased central moments. Normal data gives about (0, 3)."""
    a = _arr(x, "x", 2)
    e = a - a.mean()
    m2 = float(np.mean(e ** 2))
    if not m2 > 0:
        raise ValueError("x has zero variance; moments are undefined")
    m3 = float(np.mean(e ** 3))
    m4 = float(np.mean(e ** 4))
    return m3 / m2 ** 1.5, m4 / m2 ** 2


# ----------------------------------------------------------------------------- PSR / DSR
def psr(sr: float, sr_star: float, n: int, skew: float, kurtosis: float) -> float:
    """Probabilistic Sharpe Ratio, Bailey & Lopez de Prado (2012) eq. (11).

    ``PSR = Phi((sr - sr_star) sqrt(n - 1) / sqrt(1 - skew sr + (kurtosis - 1)/4 sr^2))``.
    ``sr`` and ``sr_star`` are per period; ``n`` is the number of return observations;
    ``kurtosis`` is Pearson (normal = 3). Raises when ``kurtosis < 1 + skew**2``, which no Pearson
    kurtosis can be (so excess kurtosis from near-normal data is refused, not silently used).
    """
    sr, sr_star = _num(sr, "sr"), _num(sr_star, "sr_star")
    skew, kurtosis = _num(skew, "skew"), _num(kurtosis, "kurtosis")
    n = _int(n, "n", 2)
    # Pearson's bound is attained exactly by two-point returns (fixed stop/target), and rounding
    # can land an ulp below it, so compare with a relative tolerance.
    if kurtosis < (1.0 + skew * skew) * (1.0 - 1e-9):
        raise ValueError(f"kurtosis must be Pearson (normal = 3), got {kurtosis}; "
                         "did you pass excess kurtosis?")
    radicand = 1.0 - skew * sr + (kurtosis - 1.0) / 4.0 * sr * sr
    if not radicand > 0:
        raise ValueError(f"PSR variance term is not positive ({radicand}); inputs inconsistent")
    return _N.cdf((sr - sr_star) * math.sqrt(n - 1) / math.sqrt(radicand))


def psr_from_returns(returns, sr_star: float = 0.0) -> float:
    """PSR of a per-period excess-return series against a per-period benchmark Sharpe."""
    r = _arr(returns, "returns", 2)
    skew, kurt = moments(r)
    return psr(sharpe(r), sr_star, int(r.size), skew, kurt)


def expected_max_sharpe(n_trials: int, var_sr: float, mean_sr: float = 0.0) -> float:
    """Expected maximum Sharpe of ``n_trials`` independent trials under the null (False Strategy
    Theorem; Bailey & Lopez de Prado 2014 eq. 2):

    ``E[max] = mean_sr + sqrt(var_sr) ((1 - g) Phi^-1(1 - 1/N) + g Phi^-1(1 - 1/(N e)))``.

    ``var_sr`` is the per-period variance of the trial Sharpes. ``n_trials`` is the number of
    *independent* trials; passing a raw count of correlated trials overstates the threshold
    (the conservative side). N = 1 returns ``mean_sr``: one trial means no selection.
    """
    n = _int(n_trials, "n_trials", 1)
    v = _num(var_sr, "var_sr")
    mean_sr = _num(mean_sr, "mean_sr")
    if v < 0:
        raise ValueError("var_sr must be >= 0")
    if n == 1:
        return mean_sr
    g = EULER_GAMMA
    z = (1.0 - g) * _N.inv_cdf(1.0 - 1.0 / n) + g * _N.inv_cdf(1.0 - 1.0 / (n * math.e))
    return mean_sr + math.sqrt(v) * z


def trial_sharpe_variance(trial_sharpes, periods_per_year: float = 1.0) -> float:
    """Per-period variance (ddof = 1) of the Sharpe ratios of all trials. Pass annualised
    Sharpes with their ``periods_per_year`` and the result is divided by it. The paper does not
    fix ddof; 1 is the unbiased choice."""
    s = _arr(trial_sharpes, "trial_sharpes", 2)
    ppy = _num(periods_per_year, "periods_per_year")
    if ppy <= 0:
        raise ValueError("periods_per_year must be > 0")
    return float(s.var(ddof=1)) / ppy


def dsr(sr: float, n: int, skew: float, kurtosis: float, n_trials: int, var_sr: float) -> float:
    """Deflated Sharpe Ratio: ``psr(sr, expected_max_sharpe(n_trials, var_sr), n, skew, kurt)``.
    All Sharpe quantities per period; kurtosis Pearson."""
    return psr(sr, expected_max_sharpe(n_trials, var_sr), n, skew, kurtosis)


# ----------------------------------------------------------------------------- Holm
def holm(pvalues, k: int | None = None) -> np.ndarray:
    """Holm (1979) step-down adjusted p-values, in input order.

    ``adj_(i) = max_{j<=i} min(1, (m - j + 1) p_(j))`` over ascending p, with m = ``k`` if given
    (the full family, including members not yet tested: they count as p = 1) else len(p).
    NaN, p < 0 or p > 1 raise: dropping a NaN would shrink m, which is anti-conservative.
    """
    p = np.asarray(pvalues, dtype=np.float64).ravel()
    if p.size and (not np.isfinite(p).all() or (p < 0).any() or (p > 1).any()):
        raise ValueError("p-values must be finite and in [0, 1]")
    m = p.size if k is None else _int(k, "k", 0)
    if m < p.size:
        raise ValueError(f"k ({m}) is smaller than the number of p-values ({p.size})")
    order = np.argsort(p, kind="stable")
    adj = np.empty(p.size)
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * p[i]))
        adj[i] = running
    return adj


# ----------------------------------------------------------------------------- Student t
def _betacf(a: float, b: float, x: float) -> float:
    """Continued fraction for the incomplete beta (Numerical Recipes 3e 6.4, modified Lentz)."""
    fpmin = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < fpmin:
        d = fpmin
    d = 1.0 / d
    h = d
    for m in range(1, 301):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-15:
            return h
    raise ArithmeticError(f"incomplete beta continued fraction did not converge (a={a}, b={b}, x={x})")


def _betainc(a: float, b: float, x: float, y: float) -> float:
    """Regularised incomplete beta I_x(a, b), with y = 1 - x supplied separately so that it is
    not lost to rounding when x is close to 1."""
    if x <= 0.0:
        return 0.0
    if y <= 0.0:
        return 1.0
    ln_front = (math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
                + a * math.log(x) + b * math.log(y))
    if x < (a + 1.0) / (a + b + 2.0):
        return math.exp(ln_front) * _betacf(a, b, x) / a
    return 1.0 - math.exp(ln_front) * _betacf(b, a, y) / b


def student_t_sf(t: float, df: float) -> float:
    """P(T > t) for Student's t with ``df`` degrees of freedom, without scipy.

    Two-sided p = I_x(df/2, 1/2) with x = df/(df+t^2); y = 1 - x = t^2/(df+t^2) is computed
    directly (deriving it as 1 - x returns p = 1.0 exactly for |t| below ~1e-8).
    """
    if isinstance(t, bool) or isinstance(df, bool):
        raise ValueError("t and df must be numbers")
    t, df = float(t), float(df)
    if math.isnan(t) or not math.isfinite(df) or df <= 0:
        raise ValueError(f"need finite t-statistic and df > 0, got t={t}, df={df}")
    if math.isinf(t):
        return 0.0 if t > 0 else 1.0
    t2 = t * t
    two_sided = _betainc(df / 2.0, 0.5, df / (df + t2), t2 / (df + t2))
    return two_sided / 2.0 if t >= 0 else 1.0 - two_sided / 2.0


# ----------------------------------------------------------------------------- Diebold-Mariano
def autocovariances(d, max_lag: int) -> np.ndarray:
    """``gamma_j = sum_{t>j} e_t e_{t-j} / n`` for j = 0..max_lag, e = d - mean(d) (divisor n)."""
    a = _arr(d, "d", 1)
    L = _int(max_lag, "max_lag", 0)
    if L >= a.size:
        raise ValueError(f"max_lag ({L}) must be < len(d) ({a.size})")
    e = a - a.mean()
    n = a.size
    return np.array([float(e[j:] @ e[: n - j]) / n for j in range(L + 1)])


def long_run_variance(d, lags: int, kernel: str = "bartlett") -> float:
    """``gamma_0 + 2 sum_{j=1}^{lags} w_j gamma_j`` with Bartlett ``w_j = 1 - j/(lags+1)``
    (Newey-West) or rectangular ``w_j = 1``. Raises when the result is not positive (Bartlett:
    only for a constant series; rectangular can go negative, and there is no silent fallback)."""
    L = _int(lags, "lags", 0)
    g = autocovariances(d, L)
    if kernel == "bartlett":
        w = 1.0 - np.arange(1, L + 1) / (L + 1.0)
    elif kernel == "rectangular":
        w = np.ones(L)
    else:
        raise ValueError(f"kernel must be 'bartlett' or 'rectangular', got {kernel!r}")
    lrv = float(g[0] + 2.0 * (w @ g[1:]))
    if not lrv > 0:
        raise ValueError(f"long-run variance is not positive ({lrv}) with kernel={kernel!r}")
    return lrv


@dataclass(frozen=True)
class DMResult:
    n: int
    h: int
    mean_d: float
    lrv: float
    dm: float
    stat_hln: float
    df: int
    p_value: float
    kernel: str
    alternative: str


def dm_test(d, h: int, *, kernel: str = "bartlett", alternative: str = "two-sided") -> DMResult:
    """Diebold-Mariano test of equal predictive accuracy with the Harvey-Leybourne-Newbold
    small-sample correction, compared with t(n-1).

    ``d_t = L_a,t - L_b,t`` (loss of A minus loss of B; you orient it). Lags = h - 1. "greater"
    tests E[d] > 0 (B is better). HLN derived their factor for the rectangular estimator;
    applying it with the default Bartlett kernel is a convention, stated here. Note:
    statsmodels-style DM implementations may default to ``max(h-1, ceil(n^(1/3)))`` lags, so their
    numbers differ from these.
    """
    a = _arr(d, "d", 3)
    h = _int(h, "h", 1)
    n = a.size
    if h >= n:
        raise ValueError(f"h ({h}) must be < len(d) ({n})")
    if alternative not in ("two-sided", "greater", "less"):
        raise ValueError(f"alternative must be two-sided, greater or less, got {alternative!r}")
    lrv = long_run_variance(a, h - 1, kernel)
    mean_d = float(a.mean())
    dm = mean_d / math.sqrt(lrv / n)
    factor = (n + 1 - 2 * h + h * (h - 1) / n) / n
    if not factor > 0:
        raise ValueError(f"HLN factor is not positive for n={n}, h={h}")
    s = dm * math.sqrt(factor)
    df = n - 1
    if alternative == "two-sided":
        p = min(1.0, 2.0 * student_t_sf(abs(s), df))
    elif alternative == "greater":
        p = student_t_sf(s, df)
    else:
        p = student_t_sf(-s, df)
    return DMResult(n, h, mean_d, lrv, dm, s, df, p, kernel, alternative)


# ----------------------------------------------------------------------------- purged splits
@dataclass(frozen=True)
class Split:
    train: np.ndarray
    test: np.ndarray


def _label_times(t0, t1):
    a0, a1 = _arr(t0, "t0", 1), _arr(t1, "t1", 1)
    if a0.size != a1.size:
        raise ValueError("t0 and t1 must have the same length")
    if (a1 < a0).any():
        raise ValueError("every label must satisfy t0[i] <= t1[i]")
    if (np.diff(a0) < 0).any():
        raise ValueError("t0 must be non-decreasing (events in time order)")
    return a0, a1


def _edges(n: int, start: int, n_folds: int) -> list[int]:
    if n_folds > n - start:
        raise ValueError(f"n_folds ({n_folds}) exceeds the {n - start} positions available")
    # integer arithmetic only: no 0.70 * 90 = 62.999... edges
    return [start + (j * (n - start)) // n_folds for j in range(n_folds + 1)]


def purged_walk_forward(t0, t1, n_folds: int, *, min_train: int, gap: float = 0) -> list[Split]:
    """Expanding walk-forward with purging (AFML 7.4.1) and a pre-test gap.

    Events are positions 0..n-1 with label intervals [t0[i], t1[i]] on one numeric clock. Test
    fold j is positions [e_j, e_{j+1}) with ``e_j = min_train + j (n - min_train) // n_folds``.
    Train = {i < e_j : t1[i] < t0[e_j] - gap}. The post-test embargo does nothing here because
    training never follows the test fold. A fold with an empty train set is still returned: check.
    """
    a0, a1 = _label_times(t0, t1)
    n = a0.size
    k = _int(n_folds, "n_folds", 1)
    s = _int(min_train, "min_train", 0)
    gap = _num(gap, "gap")
    if gap < 0:
        raise ValueError("gap must be >= 0")
    e = _edges(n, s, k)
    out = []
    for j in range(k):
        start, stop = e[j], e[j + 1]
        cut = a0[start] - gap
        prior = np.arange(start)
        out.append(Split(prior[a1[:start] < cut].astype(np.int64),
                         np.arange(start, stop, dtype=np.int64)))
    return out


def purged_kfold(t0, t1, n_folds: int, *, embargo: float = 0) -> list[Split]:
    """Purged k-fold with embargo (AFML 7.4). With T0 = min t0 and T1 = max t1 over the test
    fold, train = {i not in test : t1[i] < T0 or t0[i] > T1 + embargo}."""
    a0, a1 = _label_times(t0, t1)
    n = a0.size
    k = _int(n_folds, "n_folds", 2)
    emb = _num(embargo, "embargo")
    if emb < 0:
        raise ValueError("embargo must be >= 0")
    e = _edges(n, 0, k)
    idx = np.arange(n)
    out = []
    for j in range(k):
        start, stop = e[j], e[j + 1]
        T0, T1 = a0[start:stop].min(), a1[start:stop].max()
        in_test = (idx >= start) & (idx < stop)
        keep = ~in_test & ((a1 < T0) | (a0 > T1 + emb))
        out.append(Split(idx[keep].astype(np.int64), np.arange(start, stop, dtype=np.int64)))
    return out


def check_no_leakage(t0, t1, splits, *, gap: float = 0, embargo: float = 0, mode: str) -> None:
    """Raise AssertionError if any split leaks: a train label interval that intersects a test
    label interval (closed intervals), or (walk_forward) a train label ending at or after
    min test t0 - gap, or (kfold) a train label starting in (T1, T1 + embargo]. Test folds must
    partition [s, n) in order."""
    if mode not in ("walk_forward", "kfold"):
        raise ValueError("mode must be 'walk_forward' or 'kfold'")
    a0, a1 = _label_times(t0, t1)
    tests = np.concatenate([np.asarray(s.test) for s in splits]) if splits else np.array([], int)
    if tests.size:
        if not np.array_equal(tests, np.arange(tests[0], a0.size)):
            raise AssertionError("test folds do not partition a contiguous tail of positions")
    for j, s in enumerate(splits):
        tr, te = np.asarray(s.train, dtype=np.int64), np.asarray(s.test, dtype=np.int64)
        if np.intersect1d(tr, te).size:
            raise AssertionError(f"split {j}: train and test share positions")
        if tr.size == 0 or te.size == 0:
            continue
        # closed intervals [a,b] and [c,d] intersect iff a <= d and c <= b
        overlap = (a0[tr][:, None] <= a1[te][None, :]) & (a0[te][None, :] <= a1[tr][:, None])
        if overlap.any():
            raise AssertionError(f"split {j}: a train label interval overlaps a test label")
        T0, T1 = a0[te].min(), a1[te].max()
        if mode == "walk_forward" and (a1[tr] >= T0 - gap).any():
            raise AssertionError(f"split {j}: train label ends inside the pre-test gap")
        if mode == "kfold" and ((a0[tr] > T1) & (a0[tr] <= T1 + embargo)).any():
            raise AssertionError(f"split {j}: train label starts inside the embargo")


# ----------------------------------------------------------------------------- sign-flip
@dataclass(frozen=True)
class SignFlipResult:
    obs: np.ndarray        # observed mean per row
    p_each: np.ndarray     # one-sided p per row (H1: mean > 0)
    p_fw: np.ndarray       # family-wise p (max over rows of the studentised null)
    nb: int
    exact: bool
    draws_used: int


def _tie_tol(D: np.ndarray, block: int, nb: int) -> np.ndarray:
    """First-order bound on rounding in block sums, subset sums and inputs, times 4. Patterns
    within this of the observed statistic count as ties (conservative)."""
    T = D.shape[1]
    return 4.0 * (block + nb + 1) * np.finfo(np.float64).eps * np.abs(D).sum(axis=1) / T


def block_signflip(D, block: int, *, draws: int = 10_000, seed: int) -> SignFlipResult:
    """One-sided block sign-flip test of mean(d) > 0 for each row of D (k, T).

    One sign per block of ``block`` consecutive periods (last block holds the remainder), the
    same pattern for every row. Exact mode (nb <= 16): all 2^nb patterns, p = #(Delta >= -tol) /
    2^nb with the identity included, so p >= 2^-nb. Monte Carlo mode: ``draws`` patterns from
    ``numpy.random.default_rng(seed)``, p = (1 + #)/(draws + 1). Note: numpy does not guarantee
    generator streams across versions (NEP 19); record the numpy version with any MC p.
    """
    D = np.atleast_2d(np.asarray(D, dtype=np.float64))
    if D.ndim != 2 or D.shape[1] < 1:
        raise ValueError("D must be 1-D or 2-D (k, T) with T >= 1")
    if not np.isfinite(D).all():
        raise ValueError("D must be finite")
    block = _int(block, "block", 1)
    seed = _int(seed, "seed", 0)
    draws = _int(draws, "draws", 1)
    k, T = D.shape
    nb = -(-T // block)
    B = np.add.reduceat(D, np.arange(0, T, block), axis=1)            # (k, nb)
    exact = nb <= MAX_EXACT_BLOCKS
    if exact:
        m = np.arange(2 ** nb)
        flips = ((m[:, None] >> np.arange(nb)) & 1).astype(np.float64)
    else:
        rng = np.random.default_rng(seed)
        rows = max(1, (1 << 20) // nb)
        parts, left = [], draws
        while left:
            r = min(rows, left)
            parts.append((rng.random((r, nb)) < 0.5).astype(np.float64))
            left -= r
        flips = np.concatenate(parts)
    obs = D.mean(axis=1)
    delta = (-2.0 / T) * (flips @ B.T)                                 # (n_eff, k); 0 for identity
    null = obs[None, :] + delta
    tol = _tie_tol(D, block, nb)
    n_eff = flips.shape[0]
    adj = 0 if exact else 1
    p_each = ((delta >= -tol[None, :]).sum(0) + adj) / (n_eff + adj)
    sd = null.std(0)
    sd = np.where(sd == 0, 1.0, sd)
    z, null_z = obs / sd, null / sd
    tol_z = tol / sd + 4.0 * np.finfo(np.float64).eps * np.abs(z)
    p_fw = ((null_z.max(1)[:, None] >= (z - tol_z)[None, :]).sum(0) + adj) / (n_eff + adj)
    return SignFlipResult(obs, p_each, p_fw, int(nb), bool(exact), int(n_eff))


def nw_t(d, lag: int) -> float:
    """Newey-West t of mean(d) with Bartlett weights ``1 - L/(lag+1)``: the sign check, never
    the p. Raises if the long-run variance is not positive."""
    a = _arr(d, "d", 2)
    lrv = long_run_variance(a, _int(lag, "lag", 0), "bartlett")
    return float(a.mean()) / math.sqrt(lrv / a.size)


def min_p(T: int, block: int) -> float:
    """Smallest attainable exact sign-flip p: 2^-ceil(T/block)."""
    T, block = _int(T, "T", 1), _int(block, "block", 1)
    return 2.0 ** -(-(-T // block))


def resolvable(T: int, block: int) -> bool:
    """False when there are fewer than MIN_BLOCKS blocks (report UNRESOLVED)."""
    T, block = _int(T, "T", 1), _int(block, "block", 1)
    return -(-T // block) >= MIN_BLOCKS
