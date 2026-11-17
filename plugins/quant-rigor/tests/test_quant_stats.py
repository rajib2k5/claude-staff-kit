"""Tests for scripts/quant_stats.py. unittest style so they run without pytest; pytest runs them too.

Reference values: DESIGN.md section 6 (paper examples from Bailey & Lopez de Prado 2012 p.10 and
2014 p.10, recomputed). The module under test can be swapped with QUANT_STATS_PATH; the mutant
runner (test_mutants.py) uses that to show each test fails against a hand-written bug.
"""
import importlib.util
import math
import os
import sys
import unittest
from pathlib import Path

import numpy as np

_DEFAULT = Path(__file__).resolve().parents[1] / "scripts" / "quant_stats.py"
_spec = importlib.util.spec_from_file_location("quant_stats_ut", os.environ.get("QUANT_STATS_PATH", _DEFAULT))
q = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = q          # dataclasses look the module up by name
_spec.loader.exec_module(q)

R = [0.01, 0.02, -0.01, 0.03, 0.0]
SR_DSR = 2.5 / math.sqrt(250)          # paper: annual 2.5, 250 periods/yr
V_DSR = 0.5 / 250                      # paper: annual variance 1/2
DM_D = [0.8, -0.3, 1.2, 0.5, -0.9, 0.4, 1.1, -0.2, 0.7, 0.3, -0.5, 0.9, 0.6, -0.1, 1.0, 0.2]


class Sharpe(unittest.TestCase):
    def test_sharpe_uses_ddof_1(self):
        self.assertAlmostEqual(q.sharpe(R), 0.6324555320336758, places=13)

    def test_annualise_scales_by_sqrt_periods(self):
        self.assertAlmostEqual(q.annualised_sharpe(R, 252), 10.039920318408905, places=11)
        self.assertAlmostEqual(q.annualise(0.1, 4), 0.2, places=15)

    def test_sharpe_rejects_constant_and_nan(self):
        with self.assertRaises(ValueError):
            q.sharpe([0.01, 0.01, 0.01])
        with self.assertRaises(ValueError):
            q.sharpe([0.01, float("nan"), 0.02])

    def test_moments_are_biased_pearson(self):
        s, k = q.moments([1, 2, 3, 4, 10])
        self.assertAlmostEqual(s, 1.1384199576606167, places=12)
        self.assertAlmostEqual(k, 2.788, places=12)


class PSR(unittest.TestCase):
    def test_paper_2012_normal(self):
        self.assertAlmostEqual(q.psr(0.458, 0, 24, 0, 3), 0.9816749190910771, places=12)

    def test_paper_2012_non_normal_24_and_36(self):
        self.assertAlmostEqual(q.psr(0.458, 0, 24, -2.448, 10.164), 0.9133610838609328, places=12)
        self.assertAlmostEqual(q.psr(0.458, 0, 36, -2.448, 10.164), 0.9535052188653401, places=12)

    def test_uses_sqrt_n_minus_1(self):
        self.assertAlmostEqual(q.psr(0.5, 0, 50, 0, 3), 0.9995162857748761, places=13)

    def test_excess_kurtosis_is_refused(self):
        with self.assertRaisesRegex(ValueError, "Pearson"):
            q.psr(0.1, 0, 100, 0.0, 0.2)

    def test_two_point_returns_are_accepted(self):
        # a fixed stop/target strategy: Pearson kurtosis == 1 + skew^2 exactly; rounding may land
        # an ulp below it, which must not be mistaken for excess kurtosis (review 2026-11-16)
        rng = np.random.default_rng(1)
        for _ in range(500):
            r = np.where(rng.random(40) < 0.5, -0.01, 0.015)
            if r.std() > 0:
                q.psr_from_returns(r)

    def test_psr_from_returns_matches_components(self):
        r = np.array([0.02, -0.01, 0.03, 0.015, -0.005, 0.01, 0.025, -0.02])
        s, k = q.moments(r)
        self.assertAlmostEqual(q.psr_from_returns(r), q.psr(q.sharpe(r), 0, 8, s, k), places=15)
        # per period, not annualised: an annualised SR in would push PSR to ~1
        self.assertLess(q.psr_from_returns(r), 0.99)


class DSR(unittest.TestCase):
    def test_expected_max_sharpe_paper(self):
        self.assertAlmostEqual(q.expected_max_sharpe(100, V_DSR), 0.11317200186513214, places=13)

    def test_expected_max_sharpe_gamma_weights(self):
        self.assertAlmostEqual(q.expected_max_sharpe(2, 1.0), 0.5197553442805939, places=12)
        self.assertAlmostEqual(q.expected_max_sharpe(1000, 1.0), 3.255121513652723, places=12)

    def test_expected_max_sharpe_one_trial_is_mean(self):
        self.assertEqual(q.expected_max_sharpe(1, 1.0, 0.3), 0.3)
        self.assertAlmostEqual(q.expected_max_sharpe(100, V_DSR, 0.05), 0.05 + 0.11317200186513214, places=13)

    def test_dsr_paper_2014(self):
        self.assertAlmostEqual(q.dsr(SR_DSR, 1250, -3, 10, 100, V_DSR), 0.9003968344493904, places=12)
        self.assertAlmostEqual(q.dsr(SR_DSR, 1250, -3, 10, 46, V_DSR), 0.9505017068755787, places=12)
        self.assertAlmostEqual(q.dsr(SR_DSR, 1250, 0, 3, 88, V_DSR), 0.9504908166760138, places=12)

    def test_trial_sharpe_variance_per_period(self):
        self.assertAlmostEqual(q.trial_sharpe_variance([1, 2, 3], periods_per_year=4), 0.25, places=15)


class Holm(unittest.TestCase):
    def test_monotone(self):
        np.testing.assert_allclose(q.holm([0.01, 0.04, 0.03, 0.005]), [0.03, 0.06, 0.06, 0.02], rtol=1e-12)

    def test_capped_at_one(self):
        np.testing.assert_array_equal(q.holm([0.4, 0.45, 0.9]), [1.0, 1.0, 1.0])

    def test_family_size_k(self):
        np.testing.assert_allclose(q.holm([0.01], k=5), [0.05], rtol=1e-12)
        with self.assertRaises(ValueError):
            q.holm([0.01, 0.02], k=1)

    def test_ties_empty_nan(self):
        np.testing.assert_allclose(q.holm([0.02] * 3), [0.06] * 3, rtol=1e-12)
        self.assertEqual(q.holm([]).size, 0)
        with self.assertRaises(ValueError):
            q.holm([0.01, float("nan"), 0.03])


class StudentT(unittest.TestCase):
    def test_tiny_t_keeps_precision(self):
        self.assertAlmostEqual(2 * q.student_t_sf(1e-8, 1), 0.9999999936338023, places=15)

    def test_cauchy_and_symmetry(self):
        self.assertAlmostEqual(q.student_t_sf(1.0, 1), 0.25, places=14)
        self.assertAlmostEqual(q.student_t_sf(-2.0, 7) + q.student_t_sf(2.0, 7), 1.0, places=14)
        self.assertEqual(q.student_t_sf(math.inf, 5), 0.0)


class DieboldMariano(unittest.TestCase):
    TABLE = {1: (0.35371093750000004, 2.319937355158723, 0.03485338653368755),
             2: (0.20738037109375004, 2.834136122495691, 0.012563111021035488),
             3: (0.07531901041666667, 4.3780253607415744, 0.0005401752526738373),
             4: (0.10479248046875, 3.4363082967135243, 0.0036736230677608863)}

    def test_long_run_variance_divisor_n(self):
        for h, (lrv, _, _) in self.TABLE.items():
            self.assertTrue(math.isclose(q.long_run_variance(DM_D, h - 1), lrv, rel_tol=1e-10), h)

    def test_dm_hln_reference_table(self):
        for h, (lrv, s, p) in self.TABLE.items():
            r = q.dm_test(DM_D, h)
            self.assertTrue(math.isclose(r.stat_hln, s, rel_tol=1e-10), h)
            self.assertTrue(math.isclose(r.p_value, p, rel_tol=1e-9), (h, r.p_value, p))
            self.assertEqual(r.df, 15)

    def test_rectangular_negative_lrv_raises(self):
        r = q.dm_test(DM_D, 2, kernel="rectangular")
        self.assertTrue(math.isclose(r.p_value, 0.00010301860616704354, rel_tol=1e-9))
        with self.assertRaises(ValueError):
            q.dm_test(DM_D, 3, kernel="rectangular")

    def test_one_sided(self):
        r2 = q.dm_test(DM_D, 1)
        self.assertTrue(math.isclose(q.dm_test(DM_D, 1, alternative="greater").p_value, r2.p_value / 2, rel_tol=1e-12))
        less = q.dm_test(DM_D, 1, alternative="less").p_value
        self.assertTrue(math.isclose(less, 1 - r2.p_value / 2, rel_tol=1e-12))
        neg = [-x for x in DM_D]                     # S < 0: "greater" must now be the large p
        self.assertTrue(math.isclose(q.dm_test(neg, 1, alternative="greater").p_value, less, rel_tol=1e-12))

    def test_long_run_variance_guard(self):
        with self.assertRaisesRegex(ValueError, "not positive"):
            q.long_run_variance(DM_D, 2, kernel="rectangular")
        with self.assertRaisesRegex(ValueError, "not positive"):
            q.long_run_variance([1.0, 1.0, 1.0, 1.0], 1)


T0 = np.arange(10)
T1 = np.arange(10) + 2


def _lists(splits):
    return [(s.train.tolist(), s.test.tolist()) for s in splits]


class Splits(unittest.TestCase):
    def test_walk_forward_hand_example(self):
        self.assertEqual(_lists(q.purged_walk_forward(T0, T1, 3, min_train=4)),
                         [([0, 1], [4, 5]), ([0, 1, 2, 3], [6, 7]), ([0, 1, 2, 3, 4, 5], [8, 9])])
        self.assertEqual([t for t, _ in _lists(q.purged_walk_forward(T0, T1, 3, min_train=4, gap=1))],
                         [[0], [0, 1, 2], [0, 1, 2, 3, 4]])

    def test_kfold_hand_example(self):
        f = q.purged_kfold(T0, T1, 5)
        self.assertEqual(f[2].train.tolist(), [0, 1, 8, 9])
        self.assertEqual(f[4].train.tolist(), [0, 1, 2, 3, 4, 5])
        fe = q.purged_kfold(T0, T1, 5, embargo=1)
        self.assertEqual(fe[2].train.tolist(), [0, 1, 9])
        self.assertEqual(fe[0].train.tolist(), [5, 6, 7, 8, 9])

    def test_check_no_leakage_catches_touching_labels(self):
        leaky = [q.Split(np.array([0, 1, 2]), np.array([4, 5]))]      # t1[2] == 4 == t0[4]
        with self.assertRaises(AssertionError):
            q.check_no_leakage(T0, T1, leaky, mode="walk_forward")
        # kfold mode has no gap rule, so only the closed-interval test can see this:
        # t1[6] == 8 == t0[8] (labels touch at one instant)
        touching = [q.Split(np.array([6]), np.array([8, 9]))]
        with self.assertRaisesRegex(AssertionError, "overlaps"):
            q.check_no_leakage(T0, T1, touching, mode="kfold")
        q.check_no_leakage(T0, T1, [q.Split(np.array([5]), np.array([8, 9]))], mode="kfold")

    def test_check_no_leakage_gap_embargo_partition(self):
        # train [0] ends at t1 = 2 < t0[4] = 4 (no overlap), but inside a gap of 2
        wf = [q.Split(np.array([0, 1]), np.array([4, 5, 6, 7, 8, 9]))]
        q.check_no_leakage(T0, T1, wf, gap=0, mode="walk_forward")
        with self.assertRaisesRegex(AssertionError, "gap"):
            q.check_no_leakage(T0, T1, wf, gap=2, mode="walk_forward")
        # test [0,1] has T1 = 3; train 4 starts at 4 = T1 + 1, inside an embargo of 1
        kf = [q.Split(np.array([4, 5]), np.array([0, 1])), q.Split(np.array([], dtype=np.int64), np.arange(2, 10))]
        q.check_no_leakage(T0, T1, kf, embargo=0, mode="kfold")
        with self.assertRaisesRegex(AssertionError, "embargo"):
            q.check_no_leakage(T0, T1, kf, embargo=1, mode="kfold")
        with self.assertRaisesRegex(AssertionError, "partition"):
            q.check_no_leakage(T0, T1, [q.Split(np.array([0]), np.array([4, 5]))], mode="walk_forward")

    def test_property_no_leakage(self):
        rng = np.random.default_rng(20261116)
        for _ in range(200):
            n = int(rng.integers(20, 301))
            t0 = np.sort(rng.integers(0, 3 * n, n)).astype(float)
            t1 = t0 + rng.integers(0, 16, n)
            folds = int(rng.integers(2, 9))
            g = float(rng.integers(0, 6))
            wf = q.purged_walk_forward(t0, t1, folds, min_train=n // 3, gap=g)
            q.check_no_leakage(t0, t1, wf, gap=g, mode="walk_forward")
            kf = q.purged_kfold(t0, t1, folds, embargo=g)
            q.check_no_leakage(t0, t1, kf, embargo=g, mode="kfold")
            self.assertEqual(np.concatenate([s.test for s in kf]).tolist(), list(range(n)))


PINNED_MC_P = 0.025987006496751622   # measured on numpy 2.4.6
X12 = [0.5, -0.2, 0.3, 0.1, -0.4, 0.6, 0.2, -0.1, 0.4, 0.3, -0.3, 0.2]


class SignFlip(unittest.TestCase):
    def test_exact_counts(self):
        self.assertEqual(q.block_signflip([3, -1, 2, 1], 1, seed=0).p_each[0], 3 / 16)
        self.assertEqual(q.block_signflip(list(range(1, 9)), 1, seed=0).p_each[0], 1 / 256)
        for block, p in ((1, 416 / 4096), (2, 3 / 64), (3, 1 / 16), (5, 2 / 8)):
            self.assertEqual(q.block_signflip(X12, block, seed=0).p_each[0], p, block)

    def test_family_wise_and_identity(self):
        x = np.array(X12)
        r = q.block_signflip(np.vstack([x, -x]), 3, seed=0)
        np.testing.assert_allclose(r.p_each, [0.0625, 1.0])
        np.testing.assert_allclose(r.p_fw, [0.125, 1.0])
        z = q.block_signflip(x - x, 3, seed=0)
        self.assertEqual((z.p_each[0], z.p_fw[0]), (1.0, 1.0))

    def test_monte_carlo_floor(self):
        r = q.block_signflip(np.arange(1, 41, dtype=float), 2, draws=999, seed=7)
        self.assertFalse(r.exact)
        self.assertEqual(r.p_each[0], 1 / 1000)

    def test_monte_carlo_stream_pinned(self):
        # numpy does not promise generator streams across versions (NEP 19): if this fails after
        # a numpy upgrade, MC p-values are no longer reproducible from (seed, draws); say so.
        x = np.sin(np.arange(60)) + 0.2
        r = q.block_signflip(x, 2, draws=2000, seed=11)
        self.assertEqual((r.nb, r.exact), (30, False))
        self.assertEqual(r.p_each[0], PINNED_MC_P)

    def test_family_wise_is_studentised(self):
        # rows with very different scales: the max statistic must compare z-scores, not means
        # (unstudentised, the big row's null swamps row 0: p_fw would be 0.5625, not 0.0625)
        a = np.array(X12)
        b = 100 * np.array([0.1, -0.5, 0.2, 0.3, -0.4, 0.1, -0.2, 0.3, 0.1, -0.1, 0.2, -0.3])
        r = q.block_signflip(np.vstack([a, b]), 3, seed=0)
        self.assertEqual(r.p_fw.tolist(), [0.0625, 1.0])
        self.assertEqual(r.p_each.tolist(), [0.0625, 0.875])

    def test_nw_t_bartlett(self):
        self.assertAlmostEqual(q.nw_t([1, 2, 3, 4], 1), 4.0, places=12)

    def test_min_p_and_resolvable_use_ceil(self):
        self.assertEqual(q.min_p(12, 5), 0.125)
        self.assertFalse(q.resolvable(12, 5))
        self.assertTrue(q.resolvable(36, 5))      # ceil = 8, floor = 7
        self.assertTrue(q.resolvable(8, 1))


if __name__ == "__main__":
    unittest.main()
