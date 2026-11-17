"""Falsifier tests for scripts/prereg.py (DESIGN.md section 4.7).

Every test copies the scripts folder (or PREREG_SCRIPTS, which the mutant runner points at a
mutated copy) into a temp dir and drives the CLI there, so tampering never touches the repo.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SRC = Path(os.environ.get("PREREG_SCRIPTS", Path(__file__).resolve().parents[1] / "scripts"))


def plan(pid="h1", k=3, block=4, n=32, start="2024-01-01", end=None, cands=("cand",), **over):
    p = {"schema": "quant-rigor/prereg-plan/1", "id": pid, "hypothesis": "cand beats bench",
         "metric": {"name": "QLIKE", "is_proxy": True, "decision_metric": "PnL"},
         "candidates": list(cands), "k": k,
         "orientation": "d = metric(bench) - metric(cand); d > 0 favours cand",
         "alpha": 0.05, "sidedness": "greater", "correction": "holm",
         "test": {"name": "block_signflip", "block": block, "block_rationale": "test", "draws": 1000, "seed": 1},
         "holdout": {"start": start, "end": end or f"2024-{(n - 1) // 28 + 1:02d}-{(n - 1) % 28 + 1:02d}",
                     "n_periods": n},
         "amends": None}
    p.update(over)
    return p


def dates(n):
    return [f"2024-{i // 28 + 1:02d}-{i % 28 + 1:02d}" for i in range(n)]


def csv_text(values_by_cand, cands=("cand",)):
    n = len(values_by_cand[0])
    lines = ["date," + ",".join(cands)]
    for i, dte in enumerate(dates(n)):
        lines.append(dte + "," + ",".join(repr(float(v[i])) for v in values_by_cand))
    return "\n".join(lines) + "\n"


class Env:
    def __init__(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.scripts = self.tmp / "scripts"
        shutil.copytree(SRC, self.scripts, ignore=shutil.ignore_patterns("__pycache__"))
        self.dir = self.tmp / "holdout"
        self.dir.mkdir()

    def run(self, *args):
        p = subprocess.run([sys.executable, "-P", str(self.scripts / "prereg.py"), *args],
                           capture_output=True, text=True, timeout=120)
        return p.returncode, p.stdout + p.stderr

    def seal(self, pl, data_text, name="d.csv", extra=()):
        (self.dir / name).write_text(data_text, encoding="utf-8")
        (self.tmp / f"{pl['id']}.plan.json").write_text(json.dumps(pl))
        return self.run("seal", "--plan", str(self.tmp / f"{pl['id']}.plan.json"),
                        "--data", name, *extra, "--dir", str(self.dir))

    def score(self, pid="h1", *extra):
        return self.run("score", "--id", pid, "--dir", str(self.dir), *extra)

    def result(self, pid="h1"):
        return json.loads((self.dir / f"{pid}.result.json").read_text())

    def close(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


WEAK = [0.9, 0.1, -0.1, 0.2, 2.2, 0.4, 0.5, -1.1, 2.0, 1.3, 1.5, 0.4, 1.3, 0.8, 1.0, 0.2,
        -1.1, 1.4, -1.5, 0.2, 0.2, -0.6, 1.0, 0.2, 0.0, 0.9, -0.1, 1.8, 0.8, -0.1, -1.5, -0.9]
HAND = [3, -1, 2, 1] * 8          # 32 periods, block 4 -> nb 8, each block sums to 5


class Prereg(unittest.TestCase):
    def setUp(self):
        self.e = Env()

    def tearDown(self):
        self.e.close()

    def test_hand_value_end_to_end(self):
        self.assertEqual(self.e.seal(plan(), csv_text([HAND]))[0], 0)
        rc, out = self.e.score()
        self.assertEqual(rc, 0, out)
        r = self.e.result()
        self.assertEqual(r["rows"][0]["p_raw"], 1 / 256)
        self.assertEqual(r["rows"][0]["p_holm"], 3 / 256)
        self.assertEqual(r["decision"], {"cand": "REJECT"})
        self.assertTrue(r["exact"])
        self.assertEqual(self.e.run("verify", "--id", "h1", "--dir", str(self.e.dir))[0], 0)

    def test_score_twice_refused_and_result_unchanged(self):
        self.e.seal(plan(), csv_text([HAND]))
        self.assertEqual(self.e.score()[0], 0)
        before = (self.e.dir / "h1.result.json").read_bytes()
        self.assertEqual(self.e.score()[0], 4)
        self.assertEqual((self.e.dir / "h1.result.json").read_bytes(), before)

    def test_seal_twice_refused(self):
        self.assertEqual(self.e.seal(plan(), csv_text([HAND]))[0], 0)
        self.assertEqual(self.e.seal(plan(), csv_text([HAND]))[0], 4)

    def test_overlapping_window_is_spent(self):
        self.e.seal(plan(), csv_text([HAND]))
        self.assertEqual(self.e.score()[0], 0)
        self.assertEqual(self.e.seal(plan(pid="h2"), csv_text([HAND]), name="d2.csv")[0], 0)
        self.assertEqual(self.e.score("h2")[0], 4)

    def test_tampered_plan_in_record(self):
        self.e.seal(plan(), csv_text([HAND]))
        sp = self.e.dir / "h1.sealed.json"
        sp.write_bytes(sp.read_bytes().replace(b'"k":3', b'"k":1'))
        self.assertEqual(self.e.score()[0], 3)

    def test_tampered_plan_file(self):
        self.e.seal(plan(), csv_text([HAND]))
        (self.e.dir / "h1.plan.json").write_text(json.dumps(plan(k=1)))
        self.assertEqual(self.e.score()[0], 3)

    def test_changed_data(self):
        self.e.seal(plan(), csv_text([HAND]))
        p = self.e.dir / "d.csv"
        p.write_text(p.read_text().replace("-1.0", "-2.0", 1))
        self.assertEqual(self.e.score()[0], 3)

    def test_changed_scorer(self):
        self.e.seal(plan(), csv_text([HAND]))
        qs = self.e.scripts / "quant_stats.py"
        qs.write_text(qs.read_text() + "\n# edited\n")
        self.assertEqual(self.e.score()[0], 3)

    def test_identity_falsifier(self):
        self.e.seal(plan(), csv_text([[0.0] * 32]))
        self.assertEqual(self.e.score()[0], 0)
        r = self.e.result()
        self.assertEqual((r["rows"][0]["p_raw"], r["rows"][0]["p_holm"]), (1.0, 1.0))
        self.assertEqual(r["decision"], {"cand": "NOT_REJECTED"})

    def test_too_few_blocks_is_unresolved(self):
        self.e.seal(plan(block=1, n=3), csv_text([[5.0, 6.0, 7.0]]))
        rc, out = self.e.score()
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.e.result()["decision"], {"cand": "UNRESOLVED"})

    def test_invalid_plan(self):
        self.assertEqual(self.e.seal(plan(k=0), csv_text([HAND]))[0], 5)
        bad = plan()
        bad["metric"] = {"name": "QLIKE", "is_proxy": True}
        self.assertEqual(self.e.seal(bad, csv_text([HAND]))[0], 5)

    def test_layout_errors_refused_at_seal_without_spending(self):
        # dates match the window exactly; only the row count is wrong (32 rows, plan says 33)
        rc, out = self.e.seal(plan(n=33, end=dates(32)[-1]), csv_text([HAND]))
        self.assertEqual(rc, 5)
        self.assertIn("n_periods", out)
        # a UTF-8 BOM (Excel) breaks the header: refused at seal, nothing spent
        rc, out = self.e.seal(plan(), "\ufeff" + csv_text([HAND]))
        self.assertEqual(rc, 5)
        self.assertIn("byte-order mark", out)
        self.assertFalse((self.e.dir / "spent.jsonl").exists() and (self.e.dir / "spent.jsonl").read_text())
        # dates out of order
        text = csv_text([HAND]).splitlines()
        text[2], text[3] = text[3], text[2]
        self.assertEqual(self.e.seal(plan(), "\n".join(text) + "\n")[0], 5)
        self.assertEqual(self.e.seal(plan(), csv_text([HAND]))[0], 0)

    def test_non_finite_value_spends_window(self):
        vals = [float(v) for v in HAND]
        vals[5] = float("nan")
        self.assertEqual(self.e.seal(plan(), csv_text([vals]))[0], 0)   # values are not read at seal
        rc, out = self.e.score()
        self.assertEqual(rc, 5, out)
        self.assertIn("non-finite", out)
        self.assertEqual(self.e.score()[0], 4)

    def test_maxstat_must_cover_the_whole_family(self):
        # k = 100 trials but maxstat only sees 1 candidate: it would REJECT at p_fw = 1/256
        # while Holm over k says 0.39. Refused (review 2026-11-16, BLOCKER).
        self.assertEqual(self.e.seal(plan(k=100, correction="maxstat"), csv_text([HAND]))[0], 5)

    def test_maxstat_decides_on_family_wise_p(self):
        # cand alone: p_raw 12/256 <= 0.05; family-wise with the strong row: 18/256 > 0.05
        weak = WEAK
        pl = plan(k=2, cands=("cand", "other"), correction="maxstat")
        self.assertEqual(self.e.seal(pl, csv_text([weak, HAND], cands=("cand", "other")))[0], 0)
        rc, out = self.e.score()
        self.assertEqual(rc, 0, out)
        r = self.e.result()
        got = {row["candidate"]: (row["p_raw"], row["p_fw_maxstat"]) for row in r["rows"]}
        self.assertEqual(got, {"cand": (12 / 256, 18 / 256), "other": (1 / 256, 1 / 256)})
        self.assertEqual(r["decision"], {"cand": "NOT_REJECTED", "other": "REJECT"})

    def test_constant_positive_series_rejects(self):
        # no long-run variance, so no NW t; the sign-flip p is still 1/256
        self.e.seal(plan(), csv_text([[5.0] * 32]))
        self.assertEqual(self.e.score()[0], 0)
        self.assertEqual(self.e.result()["decision"], {"cand": "REJECT"})

    def test_dates_must_be_plain_iso_dates(self):
        self.assertEqual(self.e.seal(plan(start="2024-01-01T00:00"), csv_text([HAND]))[0], 5)
        rc, out = self.e.seal(plan(start="2024-00-01"), csv_text([HAND]))
        self.assertEqual(rc, 5)
        self.assertIn("holdout.start and holdout.end", out)   # refused by the plan check, not later

    def test_window_touching_on_one_day_overlaps(self):
        self.e.seal(plan(), csv_text([HAND]))
        self.assertEqual(self.e.score()[0], 0)
        last = dates(32)[-1]
        later = ["date,cand"] + [f"2024-03-{d:02d},1.0" for d in range(4, 12)]
        pl = plan(pid="h2", start=last, end="2024-03-11", n=9)
        text = "date,cand\n" + f"{last},1.0\n" + "\n".join(later[1:]) + "\n"
        self.assertEqual(self.e.seal(pl, text, name="d2.csv")[0], 0)
        self.assertEqual(self.e.score("h2")[0], 4)

    def test_environment_failure_does_not_spend(self):
        self.e.seal(plan(), csv_text([HAND]))
        spec = importlib.util.spec_from_file_location("prereg_noenv", self.e.scripts / "prereg.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        def no_numpy():
            raise ImportError("No module named 'numpy'")
        mod.load_quant_stats = no_numpy
        with self.assertRaises(ImportError):
            mod.main(["score", "--id", "h1", "--dir", str(self.e.dir)])
        self.assertEqual(self.e.score()[0], 0)

    def test_data_outside_dir_refused(self):
        (self.e.tmp / "outside.csv").write_text(csv_text([HAND]))
        (self.e.tmp / "p.json").write_text(json.dumps(plan()))
        rc, _ = self.e.run("seal", "--plan", str(self.e.tmp / "p.json"), "--data", "../outside.csv",
                           "--dir", str(self.e.dir))
        self.assertEqual(rc, 5)

    def test_crash_after_spent_still_spends(self):
        self.e.seal(plan(), csv_text([HAND]))
        spec = importlib.util.spec_from_file_location("prereg_crash", self.e.scripts / "prereg.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        def boom(*a, **k):
            raise RuntimeError("injected crash")
        mod.compute = boom
        with self.assertRaises(RuntimeError):
            mod.main(["score", "--id", "h1", "--dir", str(self.e.dir)])
        self.assertFalse((self.e.dir / "h1.result.json").exists())
        self.assertEqual(self.e.score()[0], 4)


if __name__ == "__main__":
    unittest.main()
