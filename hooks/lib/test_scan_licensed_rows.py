#!/usr/bin/env python3
"""Tests for scan_licensed_rows.py. Each test builds a tiny SYNTHETIC raw store (made-up numbers, no
vendor data) and a temp git repo, then runs the scanner as the pre-publish hook does.

    python3 -B -m unittest hooks/lib/test_scan_licensed_rows.py
"""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "scan_licensed_rows.py"
spec = importlib.util.spec_from_file_location("scan_licensed_rows", SCRIPT)
scan = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = scan  # dataclasses look their module up there
spec.loader.exec_module(scan)

# Made-up prices: Date, Open, High, Low, Close, Volume. Closes 42.13, 39.95, 39.84, 41.06, ... are consecutive sessions.
ROWS = [
    ("2001-03-05", "41.37", "42.88", "40.91", "42.13", "1834567"),
    ("2001-03-06", "42.20", "43.05", "39.60", "39.95", "2045133"),
    ("2001-03-07", "40.02", "40.77", "39.12", "39.84", "1977412"),
    ("2001-03-08", "39.90", "41.52", "39.71", "41.06", "1688209"),
    ("2001-03-09", "41.11", "42.36", "40.58", "41.93", "1590876"),
    ("2001-03-12", "41.80", "41.97", "38.44", "38.67", "2311540"),
    ("2001-03-13", "38.71", "40.29", "38.52", "40.18", "2102398"),
    ("2001-03-14", "40.25", "40.63", "39.27", "39.48", "1756021"),
]
# Padding rows from 2005 on (values 60 to 90, volumes from 3,000,000) make the file over 100 KB, so its
# size has 6 digits, as a real vendor file's does; none of the made-up control numbers below falls there.
PADDING = [
    (f"{date(2005, 1, 1) + timedelta(days=i)}", *(f"{60 + (i * 7919 + k * 131) % 3000 / 100:.2f}" for k in range(4)), str(3_000_000 + i))
    for i in range(2500)
]
PRICES = "Date,Open,High,Low,Close,Volume\n" + "".join(",".join(r) + "\n" for r in ROWS + PADDING)
MARKET_CAP = "Symbol,MarketCap\nAAA,987654321\n"
CLEAN = "# notes\nprice = 12.34  # on 2001-03-05, made up\nvalues = [11.11, 22.22, 33.33]\nprint('hello world 2001')\n"
GIT = ["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"]


def epoch(day, scale=1):
    return int(datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp()) * scale


class Store:
    """A synthetic raw store under ``root/data`` and an empty git repo under ``root/repo``."""

    def __init__(self, root, undated_integers=False, extra_raw=()):
        self.root = root
        self.data = root / "data"
        self.prices = self.data / "raw" / "vendor" / "AAA" / "prices.csv"
        self.prices.parent.mkdir(parents=True)
        self.prices.write_text(PRICES)
        caps = self.data / "caps" / "market_cap.csv"
        caps.parent.mkdir(parents=True)
        caps.write_text(MARKET_CAP)
        self.repo = root / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        self.config = {"raw": ["$SCAN_TEST_DATA/raw/**/*.csv", "$SCAN_TEST_DATA/caps/*.csv", *extra_raw]}
        if undated_integers:
            self.config["undated_integers"] = True
        (self.repo / ".licensed-data.json").write_text(json.dumps(self.config))
        self.env = {**os.environ, "SCAN_TEST_DATA": str(self.data)}

    def git(self, *args):
        return subprocess.run([*GIT, *args], cwd=self.repo, capture_output=True, text=True, check=True).stdout

    def write(self, name, text):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def commit(self, message):
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)
        return self.git("rev-parse", "HEAD").strip()

    def scan(self, *args):
        result = subprocess.run(
            [sys.executable, "-B", str(SCRIPT), "--repo", str(self.repo), *args],
            cwd=self.repo, env=self.env, capture_output=True, text=True, timeout=60,
        )
        return result.returncode, result.stdout, result.stderr


class ScannerTestCase(unittest.TestCase):
    undated_integers = False

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="scan-licensed-"))
        self.store = Store(self.tmp, self.undated_integers)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def flagged(self, stdout):
        """``{(path, line): rule}`` from the scanner's output (every line but the summary)."""
        out = {}
        for line in stdout.splitlines()[:-1]:
            where, rule = line.rsplit(" rule=", 1)
            path, number = where.rsplit(":", 1)
            out[(path, int(number))] = int(rule)
        return out

    def assert_rule(self, text, rule, line=1, name="leak.txt"):
        self.store.write(name, text)
        code, out, err = self.store.scan()
        self.assertEqual(code, 1, f"expected a flag, got:\n{out}{err}")
        self.assertEqual(self.flagged(out).get((name, line)), rule, out)
        return out


class RuleTests(ScannerTestCase):
    def test_rule1_verbatim_raw_fragment(self):
        self.assert_rule("41.37,42.88,40.91,42.13\n", 1)

    def test_rule1_ignores_a_header_without_digits(self):
        self.store.write("header.csv", "Date,Open,High,Low,Close,Volume\n")
        code, out, _ = self.store.scan()
        self.assertEqual(code, 0, out)

    def test_rule2_raw_row_inside_a_bytes_literal(self):
        self.assert_rule('DATA = b"Date,Close\\n2001-03-06,42.20,43.05,39.60,39.95,2045133\\n"\n', 2)

    def test_rule3_dated_value(self):
        self.assert_rule("The close on 2001-03-07 was 39.84 that day.\n", 3)

    def test_rule4_raw_file_size_with_thousands_commas(self):
        size = self.store.prices.stat().st_size
        self.assertGreaterEqual(size, 1000)
        self.assert_rule(f"the vendor file is {size:,} bytes\n", 4)

    def test_rule4_total_of_all_raw_files(self):
        total = sum(p.stat().st_size for p in self.store.data.rglob("*.csv"))
        self.assert_rule(f"raw total: {total:_}\n", 4)

    def test_rule5_raw_file_sha256(self):
        sha = hashlib.sha256(self.store.prices.read_bytes()).hexdigest()
        self.assert_rule(f'{{"sha256": "{sha}"}}\n', 5)

    def test_rule6_consecutive_closes_without_dates(self):
        self.assert_rule("closes = [42.13, 39.95, 39.84]\n", 6)

    def test_rule6_one_close_per_line(self):
        out = self.assert_rule("a\n41.06\n41.93\n38.67\n40.18\n", 6, line=2)
        self.assertEqual({k[1] for k in self.flagged(out)}, {2, 3, 4, 5})

    def test_rule6_two_sessions_are_not_a_run(self):
        self.store.write("short.txt", "closes = [42.13, 39.95]\n")
        code, out, _ = self.store.scan()
        self.assertEqual(code, 0, out)

    def test_clean_file_is_not_flagged(self):
        self.store.write("clean.py", CLEAN)
        code, out, err = self.store.scan()
        self.assertEqual(code, 0, out + err)
        self.assertTrue(out.startswith("clean: 0 lines flagged"), out)

    def test_output_never_contains_the_matched_text(self):
        sha = hashlib.sha256(self.store.prices.read_bytes()).hexdigest()
        planted = ["41.37,42.88,40.91,42.13", "39.84", "42.13, 39.95", sha, "2001-03-07"]
        self.store.write("leak.txt", f"{planted[0]}\nThe close on 2001-03-07 was 39.84.\nc = [42.13, 39.95, 39.84]\n{sha}\n")
        code, out, err = self.store.scan()
        self.assertEqual(code, 1)
        self.assertEqual(len(self.flagged(out)), 4, out)
        for text in planted:
            self.assertNotIn(text, out + err)

    def test_undated_integer_not_flagged_by_default(self):
        self.store.write("cap.md", "Market cap was 987,654,321 at the time.\n")
        code, out, _ = self.store.scan()
        self.assertEqual(code, 0, out)


class UndatedIntegerTests(ScannerTestCase):
    undated_integers = True

    def test_undated_integer_flagged_when_enabled(self):
        self.assert_rule("Market cap was 987,654,321 at the time.\n", 4, name="cap.md")


class PlantedShapeTests(ScannerTestCase):
    """The shapes the implied-vol copy's review B planted (synthetic stand-ins), each next to 2001-03-07's close 39.84."""

    SHAPES = {
        "python date()": "row = (date(2001, 3, 7), 39.84)\n",
        "datetime()": "Timestamp(2001, 3, 7): 39.84\n",
        "JS Date months from 0": "point = [Date.UTC(2001, 2, 7), 39.84]\n",
        "epoch ms key": f'{{"{epoch("2001-03-07", 1000)}": 39.84}}\n',
        "epoch s key": f'{{"{epoch("2001-03-07")}": 39.84}}\n',
        "compact date": "20010307 39.84\n",
        "slash ISO": "2001/03/07 close 39.84\n",
        "US date": "03/07/2001 close 39.84\n",
        "day-first dotted, decimal comma": "07.03.2001;39,84\n",
        "textual MDY": "On March 7, 2001 it closed at 39.84.\n",
        "textual DMY": "7 Mar 2001: 39.84\n",
        "textual dashed": "07-Mar-2001 39.84\n",
        "one decimal, same line": "2001-03-07 39.8\n",
        "rescaled /100": "2001-03-07 vol 0.3984\n",
        "value 2 lines below": "date: 2001-03-07\nopen: 1\nclose: 39.84\n",
        "dated volume integer": "2001-03-07 volume 1,977,412\n",
    }

    def test_each_shape_is_flagged_by_rule3(self):
        for i, (label, text) in enumerate(self.SHAPES.items()):
            with self.subTest(shape=label):
                name = f"shape{i}.txt"
                self.store.write(name, text)
                code, out, err = self.store.scan("--tree", str(self.store.repo))
                rules = {k[1]: v for k, v in self.flagged(out).items() if k[0] == name}
                self.assertIn(3, rules.values(), f"{label}: {out}{err}")
                (self.store.repo / name).unlink()

    def test_pretty_json_record_beyond_near_lines(self):
        record = json.dumps({"date": "2001-03-07", "a": 1, "b": 2, "c": 3, "d": 4, "close": 39.84}, indent=2) + "\n"
        line = record.splitlines().index('  "close": 39.84') + 1
        self.assertGreater(line - 2, scan.NEAR_LINES)  # the date is on line 2
        self.assert_rule(record, 3, line=line, name="record.json")

    def test_date_within_near_lines_but_not_the_nearest_dated_line(self):
        # FAR_LINES only lends the nearest dated line; the date of 39.84 is the second nearest, 2 lines up.
        self.assert_rule("2001-03-07\n2001-03-12\nclose 39.84\n", 3, line=3)

    def test_made_up_values_in_the_same_shapes_are_clean(self):
        for i, (label, text) in enumerate(self.SHAPES.items()):
            fake = text.replace("39.84", "37.21").replace("39,84", "37,21").replace("39.8", "37.2")
            fake = fake.replace("0.3984", "0.3721").replace("1,977,412", "1,912,345")
            self.store.write(f"fake{i}.txt", fake)
        code, out, err = self.store.scan()
        self.assertEqual(code, 0, out + err)


class ModeTests(ScannerTestCase):
    LEAK = "The close on 2001-03-07 was 39.84 that day.\n"

    def test_staged_reads_the_index_not_the_working_tree(self):
        self.store.write("notes.md", self.LEAK)
        self.store.git("add", "notes.md")
        self.store.write("notes.md", CLEAN)
        code, out, _ = self.store.scan("--staged")
        self.assertEqual(code, 1, out)
        self.assertEqual(self.flagged(out), {("notes.md", 1): 3})
        code, out, _ = self.store.scan()  # the working tree is clean
        self.assertEqual(code, 0, out)

    def test_staged_ignores_a_leak_only_in_the_working_tree(self):
        self.store.write("notes.md", CLEAN)
        self.store.git("add", "notes.md")
        self.store.write("notes.md", self.LEAK)
        code, out, _ = self.store.scan("--staged")
        self.assertEqual(code, 0, out)
        self.assertIn("1 text file(s)", out)
        code, out, _ = self.store.scan()
        self.assertEqual(code, 1, out)

    def test_staged_skips_deleted_files(self):
        self.store.write("notes.md", self.LEAK)
        self.store.commit("leak")
        self.store.git("rm", "-q", "notes.md")
        code, out, _ = self.store.scan("--staged")
        self.assertEqual(code, 0, out)

    def test_range_scans_changed_files_at_b(self):
        self.store.write("old.md", self.LEAK)
        a = self.store.commit("old leak")
        self.store.write("new.md", "c = [42.13, 39.95, 39.84]\n")
        b = self.store.commit("new leak")
        code, out, _ = self.store.scan("--range", f"{a}..{b}")
        self.assertEqual(code, 1, out)
        self.assertEqual(self.flagged(out), {("new.md", 1): 6})  # old.md did not change in a..b

    def test_range_reads_content_at_b(self):
        self.store.write("notes.md", self.LEAK)
        a = self.store.commit("leak")
        self.store.write("notes.md", CLEAN)
        b = self.store.commit("fix")
        self.store.write("notes.md", self.LEAK)  # the working tree does not matter
        code, out, _ = self.store.scan("--range", f"{a}..{b}")
        self.assertEqual(code, 0, out)

    def test_rev_scans_every_file_in_the_commit(self):
        self.store.write("notes.md", self.LEAK)
        self.store.write("clean.py", CLEAN)
        rev = self.store.commit("leak")
        self.store.write("notes.md", CLEAN)
        self.store.commit("fix")
        code, out, _ = self.store.scan("--rev", rev)
        self.assertEqual(code, 1, out)
        self.assertEqual(self.flagged(out), {("notes.md", 1): 3})

    def test_tree_needs_no_git(self):
        tree = self.tmp / "plain"
        (tree / "sub").mkdir(parents=True)
        (tree / "sub" / "a.txt").write_text(self.LEAK)
        (tree / "b.bin").write_bytes(b"\0\x01binary 39.84 2001-03-07")
        code, out, err = self.store.scan("--tree", str(tree))
        self.assertEqual(code, 1, out + err)
        self.assertEqual(self.flagged(out), {(os.path.join("sub", "a.txt"), 1): 3})
        self.assertIn("skipped 1 binary", err)

    def test_default_mode_skips_gitignored_files(self):
        self.store.write(".gitignore", "secret.md\n")
        self.store.write("secret.md", self.LEAK)
        code, out, _ = self.store.scan()
        self.assertEqual(code, 0, out)


class ExitCodeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="scan-licensed-"))
        self.store = Store(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_missing_config_exits_2(self):
        (self.store.repo / ".licensed-data.json").unlink()
        code, out, err = self.store.scan()
        self.assertEqual(code, 2)
        self.assertIn("no config", err)

    def test_invalid_config_exits_2(self):
        for text in ("{not json", "[]", '{"raw": []}', '{"raw": ["x"], "undated_integers": "yes"}'):
            with self.subTest(config=text):
                (self.store.repo / ".licensed-data.json").write_text(text)
                code, _, _ = self.store.scan()
                self.assertEqual(code, 2)

    def test_no_raw_file_matched_exits_2(self):
        code, _, err = self.store.scan("--config", str(self.write_config({"raw": ["$SCAN_TEST_DATA/nothing/*.csv"]})))
        self.assertEqual(code, 2)
        self.assertIn("matched no file", err)

    def test_unset_variable_exits_2(self):
        code, _, err = self.store.scan("--config", str(self.write_config({"raw": ["$SCAN_TEST_UNSET_VAR/*.csv"]})))
        self.assertEqual(code, 2)
        self.assertIn("unset variable", err)

    def test_bad_revision_exits_3(self):
        code, _, err = self.store.scan("--rev", "no-such-rev")
        self.assertEqual(code, 3, err)

    def write_config(self, data):
        path = self.tmp / "other.json"
        path.write_text(json.dumps(data))
        return path


class ParquetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="scan-licensed-"))

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_missing_pyarrow_warns_and_keeps_text_sources(self):
        store = Store(self.tmp, extra_raw=["$SCAN_TEST_DATA/pq/*.parquet"])
        fake = store.data / "pq" / "chain.parquet"
        fake.parent.mkdir()
        fake.write_bytes(b"PAR1 synthetic, not a real parquet file PAR1")
        store.write("leak.txt", f"The close on 2001-03-07 was 39.84.\nhash {hashlib.sha256(fake.read_bytes()).hexdigest()}\n")
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(sys.modules, {"pyarrow": None, "pyarrow.parquet": None}), \
                mock.patch.dict(os.environ, {"SCAN_TEST_DATA": str(store.data)}), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = scan.main(["--repo", str(store.repo), "--tree", str(store.repo)])
        self.assertEqual(code, 1, stdout.getvalue() + stderr.getvalue())
        self.assertIn("pyarrow is not installed", stderr.getvalue())
        rules = {line.rsplit(" rule=", 1)[1] for line in stdout.getvalue().splitlines()[:-1]}
        self.assertEqual(rules, {"3", "5"})  # the text source still indexed; the Parquet file's hash too

    @unittest.skipUnless(importlib.util.find_spec("pyarrow"), "pyarrow not installed")
    def test_parquet_series_and_chain(self):
        import pyarrow as pa
        import pyarrow.parquet as pq

        store = Store(self.tmp, extra_raw=["$SCAN_TEST_DATA/pq/*.parquet"])
        (store.data / "pq").mkdir()
        days = [date(2002, 7, d) for d in (1, 2, 3, 5, 8)]
        pq.write_table(pa.table({"day": days, "close": [57.31, 58.02, 56.47, 55.19, 59.66]}), store.data / "pq" / "series.parquet")
        chain_days = [date(2002, 7, 1)] * 50
        pq.write_table(pa.table({"date": chain_days, "bid": [round(1 + i * 0.37, 2) for i in range(50)]}), store.data / "pq" / "chain.parquet")
        store.write("series.txt", "July 3, 2002 close 56.47\n" + "\n" * 20 + "list = [58.02, 56.47, 55.19]\n")  # beyond FAR_LINES
        store.write("chain.txt", "2002-07-01 bid 4.70\n")  # a chain value (1 + 10 * 0.37): too common to flag
        code, out, err = store.scan()
        self.assertEqual(code, 1, out + err)
        self.assertIn("a chain, not a series", err)
        flagged = {line.rsplit(" rule=", 1)[0]: line.rsplit(" rule=", 1)[1] for line in out.splitlines()[:-1]}
        self.assertEqual(flagged, {"series.txt:1": "3", "series.txt:22": "6"})


if __name__ == "__main__":
    unittest.main()
