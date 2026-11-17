"""Mutation check: one hand-written, realistic bug per public function of quant_stats.py.

Each mutant is a textual edit applied to a temporary copy of the module (the edit must match
exactly once, so a mutant can never silently become a no-op). test_quant_stats.py then runs
against the copy via QUANT_STATS_PATH and MUST fail. A surviving mutant fails this test.

prereg.py mutants work the same way: the scripts folder is copied, prereg.py is mutated, and
test_prereg.py runs against the copy via PREREG_SCRIPTS.

Run ``python3 tests/test_mutants.py`` to print which tests kill each mutant.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE = HERE.parent / "scripts" / "quant_stats.py"

# (function, mutant description, exact source text, replacement)
MUTANTS = [
    ("sharpe", "std(ddof=0)",
     'sd = float(r.std(ddof=1))', 'sd = float(r.std(ddof=0))'),
    ("annualise", "* ppy instead of * sqrt(ppy)",
     'return _num(sr, "sr") * math.sqrt(ppy)', 'return _num(sr, "sr") * ppy'),
    ("moments", "excess kurtosis (m4/m2^2 - 3)",
     'return m3 / m2 ** 1.5, m4 / m2 ** 2', 'return m3 / m2 ** 1.5, m4 / m2 ** 2 - 3.0'),
    ("psr", "excess kurtosis in the radicand ((k-4)/4)",
     '(kurtosis - 1.0) / 4.0 * sr * sr', '(kurtosis - 4.0) / 4.0 * sr * sr'),
    ("psr", "sqrt(n) instead of sqrt(n - 1)",
     'math.sqrt(n - 1) / math.sqrt(radicand)', 'math.sqrt(n) / math.sqrt(radicand)'),
    ("psr_from_returns", "passes the annualised Sharpe",
     'return psr(sharpe(r), sr_star, int(r.size), skew, kurt)',
     'return psr(annualised_sharpe(r, 252), sr_star, int(r.size), skew, kurt)'),
    ("expected_max_sharpe", "gamma weights swapped",
     'z = (1.0 - g) * _N.inv_cdf(1.0 - 1.0 / n) + g * _N.inv_cdf(1.0 - 1.0 / (n * math.e))',
     'z = g * _N.inv_cdf(1.0 - 1.0 / n) + (1.0 - g) * _N.inv_cdf(1.0 - 1.0 / (n * math.e))'),
    ("trial_sharpe_variance", "no per-period conversion",
     'return float(s.var(ddof=1)) / ppy', 'return float(s.var(ddof=1))'),
    ("dsr", "benchmark 0 instead of E[max SR] (it is then PSR)",
     'return psr(sr, expected_max_sharpe(n_trials, var_sr), n, skew, kurtosis)',
     'return psr(sr, 0.0, n, skew, kurtosis)'),
    ("holm", "no running max (not monotone)",
     'running = max(running, min(1.0, (m - rank) * p[i]))', 'running = min(1.0, (m - rank) * p[i])'),
    ("holm", "no cap at 1",
     'running = max(running, min(1.0, (m - rank) * p[i]))', 'running = max(running, (m - rank) * p[i])'),
    ("autocovariances", "divisor n - j instead of n",
     'return np.array([float(e[j:] @ e[: n - j]) / n for j in range(L + 1)])',
     'return np.array([float(e[j:] @ e[: n - j]) / (n - j) for j in range(L + 1)])'),
    ("long_run_variance", "Bartlett weight 1 - j/lags instead of 1 - j/(lags+1)",
     'w = 1.0 - np.arange(1, L + 1) / (L + 1.0)', 'w = 1.0 - np.arange(1, L + 1) / max(L, 1.0)'),
    ("dm_test", "HLN factor omitted",
     's = dm * math.sqrt(factor)', 's = dm'),
    ("student_t_sf", "1 - x recomputed instead of t^2/(df+t^2)",
     'two_sided = _betainc(df / 2.0, 0.5, df / (df + t2), t2 / (df + t2))',
     'two_sided = _betainc(df / 2.0, 0.5, df / (df + t2), 1.0 - df / (df + t2))'),
    ("purged_walk_forward", "purge boundary <= instead of <",
     'out.append(Split(prior[a1[:start] < cut]', 'out.append(Split(prior[a1[:start] <= cut]'),
    ("purged_kfold", "embargo ignored",
     'keep = ~in_test & ((a1 < T0) | (a0 > T1 + emb))', 'keep = ~in_test & ((a1 < T0) | (a0 > T1))'),
    ("check_no_leakage", "interval test < where <= belongs",
     'overlap = (a0[tr][:, None] <= a1[te][None, :]) & (a0[te][None, :] <= a1[tr][:, None])',
     'overlap = (a0[tr][:, None] < a1[te][None, :]) & (a0[te][None, :] < a1[tr][:, None])'),
    ("block_signflip", "recipe p (1 + #)/(2^nb + 1) in exact mode",
     'adj = 0 if exact else 1\n    p_each', 'adj = 1\n    p_each'),
    ("nw_t", "rectangular kernel instead of Bartlett",
     'lrv = long_run_variance(a, _int(lag, "lag", 0), "bartlett")',
     'lrv = long_run_variance(a, _int(lag, "lag", 0), "rectangular")'),
    ("min_p", "floor instead of ceil",
     'return 2.0 ** -(-(-T // block))', 'return 2.0 ** -(T // block)'),
    ("resolvable", "floor instead of ceil",
     'return -(-T // block) >= MIN_BLOCKS', 'return T // block >= MIN_BLOCKS'),
    # added after the 2026-11-16 adversarial review found these bug classes survived the suite
    ("dm_test", "'less' computed like 'greater'",
     'p = student_t_sf(-s, df)', 'p = student_t_sf(s, df)'),
    ("dm_test", "'greater' uses |S|",
     'p = student_t_sf(s, df)', 'p = student_t_sf(abs(s), df)'),
    ("expected_max_sharpe", "mean_sr ignored",
     'return mean_sr + math.sqrt(v) * z', 'return math.sqrt(v) * z'),
    ("long_run_variance", "positivity guard removed",
     'if not lrv > 0:', 'if False:'),
    ("check_no_leakage", "gap rule removed",
     'raise AssertionError(f"split {j}: train label ends inside the pre-test gap")', 'pass'),
    ("check_no_leakage", "embargo rule removed",
     'raise AssertionError(f"split {j}: train label starts inside the embargo")', 'pass'),
    ("check_no_leakage", "partition check removed",
     'raise AssertionError("test folds do not partition a contiguous tail of positions")', 'pass'),
    ("block_signflip", "family-wise max not studentised",
     'z, null_z = obs / sd, null / sd', 'z, null_z = obs, null'),
    ("block_signflip", "Monte Carlo stream changed (seed + 1)",
     'rng = np.random.default_rng(seed)', 'rng = np.random.default_rng(seed + 1)'),
]


PREREG = HERE.parent / "scripts" / "prereg.py"

# prereg.py: (function, mutant description, exact source text, replacement)
PREREG_MUTANTS = [
    ("validate_plan", "k may be smaller than the candidate count",
     'plan["k"] >= len(c),', 'plan["k"] >= 0,'),
    ("inside", "data outside --dir accepted",
     'raise PreregError(EXIT_INVALID, f"data file {f} resolves outside --dir")', 'rel = p'),
    ("check_integrity", "scorer hashes not checked",
     'if scorer_hashes() != record["scorer"]:', 'if False:'),
    ("check_integrity", "data checked by size only",
     'p.stat().st_size != item["bytes"] or sha256_file(p) != item["sha256"]',
     'p.stat().st_size != item["bytes"]'),
    ("spent_conflict", "other ids' overlapping windows ignored",
     'if overlaps(h["start"], h["end"], e.get("start", ""), e.get("end", "")):', 'if False:'),
    ("cmd_score", "window not marked spent before computing",
     'append_ledger(d, {"event": "spent", "id": pid,', 'dict({"event": "spent", "id": pid,'),
    ("parse_data", "n_periods not checked",
     'if len(body) != h["n_periods"]:', 'if False:'),
    ("compute", "Holm over the candidates only, not the full family k",
     'p_holm = qs.holm(r.p_each, plan["k"])', 'p_holm = qs.holm(r.p_each)'),
    ("compute", "too-few-blocks rule dropped",
     'if not can_resolve:\n            verdict = "UNRESOLVED"', 'if False:\n            verdict = "UNRESOLVED"'),
    ("compute", "maxstat decides on the raw p",
     'else float(r.p_fw[j])', 'else float(r.p_each[j])'),
    ("validate_plan", "maxstat allowed with k > len(candidates)",
     'plan["correction"] != "maxstat" or plan["k"] == len(c),', 'True,'),
    ("is_date", "calendar validity not checked",
     '        dt.date.fromisoformat(x)\n', '        pass\n'),
    ("check_layout", "date order not checked",
     'if any(b <= a for a, b in zip(dates, dates[1:])):', 'if False:'),
    ("check_layout", "byte-order mark not refused at seal",
     'if text.startswith("\\ufeff"):', 'if False:'),
    ("parse_data", "non-finite values accepted",
     'if not all(math.isfinite(v) for v in col):', 'if False:'),
    ("overlaps", "strict < (windows touching on one day pass)",
     'return a_start <= b_end and b_start <= a_end', 'return a_start < b_end and b_start < a_end'),
    ("cmd_score", "scorer loaded after the window is spent",
     '    qs = load_quant_stats()\n    with Lock(d):', '    with Lock(d):'),
]


def _apply(src, old, new):
    hits = src.count(old)
    if hits != 1:
        raise AssertionError(f"mutant source text matched {hits} times, expected 1: {old!r}")
    return src.replace(old, new)


def run_mutant(old, new, target="quant_stats"):
    """Apply one mutant to a temp copy, run the suite against it; return (returncode, failed tests)."""
    with tempfile.TemporaryDirectory() as tmp:
        if target == "quant_stats":
            path = Path(tmp) / "quant_stats.py"
            path.write_text(_apply(MODULE.read_text(encoding="utf-8"), old, new), encoding="utf-8")
            env = dict(os.environ, QUANT_STATS_PATH=str(path))
            pattern = "test_quant_stats.py"
        else:
            scripts = Path(tmp) / "scripts"
            shutil.copytree(MODULE.parent, scripts, ignore=shutil.ignore_patterns("__pycache__"))
            pp = scripts / "prereg.py"
            pp.write_text(_apply(PREREG.read_text(encoding="utf-8"), old, new), encoding="utf-8")
            env = dict(os.environ, PREREG_SCRIPTS=str(scripts))
            pattern = "test_prereg.py"
        proc = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", str(HERE),
                               "-p", pattern], env=env, capture_output=True, text=True,
                              timeout=600)
    failed = sorted(set(re.findall(r"^(?:FAIL|ERROR): (\w+)", proc.stderr, re.M)))
    return proc.returncode, failed


class Mutants(unittest.TestCase):
    def test_every_public_function_has_a_mutant(self):
        import ast
        tree = ast.parse(MODULE.read_text(encoding="utf-8"))
        public = {n.name for n in tree.body if isinstance(n, ast.FunctionDef) and not n.name.startswith("_")}
        self.assertEqual(public - {m[0] for m in MUTANTS}, {"annualised_sharpe"}  # covered via annualise
                         )

    def test_each_mutant_is_killed(self):
        for func, desc, old, new in MUTANTS:
            with self.subTest(func=func, mutant=desc):
                rc, failed = run_mutant(old, new)
                self.assertNotEqual(rc, 0, f"mutant SURVIVED: {func}: {desc}")
                self.assertTrue(failed, f"{func}: suite failed without a named failing test")

    def test_each_prereg_mutant_is_killed(self):
        for func, desc, old, new in PREREG_MUTANTS:
            with self.subTest(func=func, mutant=desc):
                rc, failed = run_mutant(old, new, "prereg")
                self.assertNotEqual(rc, 0, f"prereg mutant SURVIVED: {func}: {desc}")
                self.assertTrue(failed, f"{func}: suite failed without a named failing test")


if __name__ == "__main__":
    if sys.argv[1:] == ["--report"] or not sys.argv[1:]:
        for target, table in (("quant_stats", MUTANTS), ("prereg", PREREG_MUTANTS)):
            for func, desc, old, new in table:
                rc, failed = run_mutant(old, new, target)
                print(f"{'KILLED ' if rc else 'SURVIVED'} {target}.{func:22s} {desc:52s} by {', '.join(failed)}")
    else:
        unittest.main()
