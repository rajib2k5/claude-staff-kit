"""Tests for manifest.py. Run: python3 -m unittest discover -s <this folder> -p 'test_*.py'"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import manifest as m

HERE = Path(__file__).resolve().parent


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        self.mf = self.dir / "manifest.json"

    def write(self, name, data):
        p = self.dir / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data if isinstance(data, bytes) else data.encode())
        return p


class Record(Base):
    def test_entry_holds_hash_size_source_and_tool(self):
        p = self.write("SPY.csv", "date,close\n2024-01-02,10\n2024-01-03,11\n")
        e = m.record(self.mf, p, "https://example.org/SPY.csv", "requests", "2.32.0")
        raw = p.read_bytes()
        self.assertEqual(e["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(e["bytes"], len(raw))
        self.assertEqual(e["rows"], 2)
        self.assertEqual((e["source"], e["tool"], e["tool_version"]), ("https://example.org/SPY.csv", "requests", "2.32.0"))
        self.assertEqual(m.load(self.mf)["files"]["SPY.csv"], e)

    def test_fetch_time_is_utc_iso_with_offset(self):
        p = self.write("a.bin", b"x")
        plus2 = timezone(timedelta(hours=2))
        e = m.record(self.mf, p, "s", fetched_at=datetime(2026, 1, 1, 14, 0, tzinfo=plus2))
        self.assertEqual(e["fetched_at"], "2026-01-01T12:00:00+00:00")

    def test_default_fetch_time_is_aware(self):
        e = m.record(self.mf, self.write("a.bin", b"x"), "s")
        self.assertIsNotNone(datetime.fromisoformat(e["fetched_at"]).utcoffset())

    def test_naive_fetch_time_is_refused(self):
        with self.assertRaises(ValueError):
            m.record(self.mf, self.write("a.bin", b"x"), "s", fetched_at=datetime(2026, 1, 1, 14, 0))

    def test_empty_source_is_refused(self):
        with self.assertRaises(ValueError):
            m.record(self.mf, self.write("a.bin", b"x"), "")

    def test_missing_file_is_refused_and_no_manifest_written(self):
        with self.assertRaises(FileNotFoundError):
            m.record(self.mf, self.dir / "nope.csv", "s")
        self.assertFalse(self.mf.exists())

    def test_file_outside_manifest_folder_is_refused(self):
        with tempfile.TemporaryDirectory() as other:
            p = Path(other) / "a.bin"
            p.write_bytes(b"x")
            with self.assertRaises(ValueError):
                m.record(self.mf, p, "s")

    def test_recording_again_replaces_the_entry_and_keeps_others(self):
        a, b = self.write("a.bin", b"one"), self.write("sub/b.bin", b"two")
        m.record(self.mf, a, "s1")
        m.record(self.mf, b, "s2")
        a.write_bytes(b"one-changed")
        m.record(self.mf, a, "s1b")
        files = m.load(self.mf)["files"]
        self.assertEqual(sorted(files), ["a.bin", "sub/b.bin"])
        self.assertEqual(files["a.bin"]["source"], "s1b")
        self.assertEqual(files["a.bin"]["bytes"], len(b"one-changed"))

    def test_rows_option(self):
        p = self.write("a.csv", "h\n1\n2\n3\n")
        self.assertIsNone(m.record(self.mf, p, "s", rows=None)["rows"])
        self.assertEqual(m.record(self.mf, p, "s", rows=99)["rows"], 99)


class CountRows(Base):
    def test_csv_rows_exclude_header(self):
        self.assertEqual(m.count_rows(self.write("a.csv", "h\n1\n2\n")), 2)

    def test_csv_quoted_newline_is_one_row(self):
        self.assertEqual(m.count_rows(self.write("a.csv", 'h,note\n1,"two\nlines"\n2,x\n')), 2)

    def test_csv_header_only_and_empty(self):
        self.assertEqual(m.count_rows(self.write("h.csv", "h\n")), 0)
        self.assertEqual(m.count_rows(self.write("e.csv", "")), 0)

    def test_other_suffix_is_none(self):
        self.assertIsNone(m.count_rows(self.write("a.json", "{}")))


class Verify(Base):
    def setUp(self):
        super().setUp()
        self.a = self.write("a.csv", "h\n1\n")
        m.record(self.mf, self.a, "s")

    def test_clean_manifest_has_no_problems(self):
        self.assertEqual(m.verify(self.mf), [])

    def test_missing_file_is_reported(self):
        self.a.unlink()
        self.assertEqual(m.verify(self.mf), ["MISSING a.csv"])

    def test_same_size_content_change_is_reported_as_sha_mismatch(self):
        self.a.write_bytes(b"h\n2\n")
        problems = m.verify(self.mf)
        self.assertEqual(len(problems), 1)
        self.assertTrue(problems[0].startswith("SHA256 a.csv"))

    def test_size_change_is_reported(self):
        self.a.write_bytes(b"h\n1\n1\n")
        self.assertTrue(any(p.startswith("SIZE a.csv") for p in m.verify(self.mf)))

    def test_missing_manifest_raises(self):
        with self.assertRaises(m.ManifestError):
            m.verify(self.dir / "none.json")

    def test_manifest_with_nan_token_is_refused(self):
        self.mf.write_text('{"files": {"a.csv": {"rows": NaN}}}')
        with self.assertRaises(m.ManifestError):
            m.verify(self.mf)

    def test_manifest_without_files_object_is_refused(self):
        self.mf.write_text("[]")
        with self.assertRaises(m.ManifestError):
            m.verify(self.mf)


class AtomicWrite(Base):
    def test_nan_is_refused_and_existing_manifest_survives(self):
        m.atomic_write_json(self.mf, {"ok": 1})
        with self.assertRaises(ValueError):
            m.atomic_write_json(self.mf, {"bad": float("nan")})
        self.assertEqual(json.loads(self.mf.read_text()), {"ok": 1})

    def test_infinity_is_refused(self):
        with self.assertRaises(ValueError):
            m.atomic_write_json(self.mf, {"bad": float("inf")})

    def test_failure_leaves_no_temp_file(self):
        with self.assertRaises(ValueError):
            m.atomic_write_json(self.mf, {"bad": float("nan")})
        self.assertEqual(os.listdir(self.dir), [])

    def test_failure_after_temp_file_exists_removes_it_and_keeps_old_manifest(self):
        m.atomic_write_json(self.mf, {"ok": 1})
        real = os.replace

        def boom(src, dst):
            raise OSError("disk gone")
        os.replace = boom
        try:
            with self.assertRaises(OSError):
                m.atomic_write_json(self.mf, {"ok": 2})
        finally:
            os.replace = real
        self.assertEqual(os.listdir(self.dir), ["manifest.json"])
        self.assertEqual(json.loads(self.mf.read_text()), {"ok": 1})

    def test_success_leaves_only_the_manifest(self):
        m.atomic_write_json(self.mf, {"ok": 1})
        self.assertEqual(os.listdir(self.dir), ["manifest.json"])

    def test_write_goes_through_os_replace(self):
        calls = []
        real = os.replace
        os.replace = lambda src, dst: (calls.append((Path(src).name, Path(dst).name)), real(src, dst))[1]
        try:
            m.atomic_write_json(self.mf, {"ok": 1})
        finally:
            os.replace = real
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1], "manifest.json")
        self.assertNotEqual(calls[0][0], "manifest.json")


class Cli(Base):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(HERE / "manifest.py"), *args], capture_output=True, text=True)

    def test_record_then_verify_exits_zero(self):
        p = self.write("a.csv", "h\n1\n")
        r = self.run_cli("record", str(self.mf), str(p), "--source", "https://example.org/a.csv")
        self.assertEqual(r.returncode, 0, r.stderr)
        v = self.run_cli("verify", str(self.mf))
        self.assertEqual(v.returncode, 0, v.stdout + v.stderr)
        self.assertIn("OK", v.stdout)

    def test_verify_exits_one_on_tamper_and_on_missing(self):
        p = self.write("a.csv", "h\n1\n")
        self.run_cli("record", str(self.mf), str(p), "--source", "s")
        p.write_bytes(b"h\n9\n")
        self.assertEqual(self.run_cli("verify", str(self.mf)).returncode, 1)
        p.unlink()
        v = self.run_cli("verify", str(self.mf))
        self.assertEqual(v.returncode, 1)
        self.assertIn("MISSING a.csv", v.stdout)

    def test_verify_with_no_manifest_exits_two(self):
        self.assertEqual(self.run_cli("verify", str(self.dir / "none.json")).returncode, 2)


if __name__ == "__main__":
    unittest.main()
