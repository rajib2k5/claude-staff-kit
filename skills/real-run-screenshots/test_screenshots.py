"""Tests for screenshots.py. No network and no browser. Run: python3 -B -m pytest skills/real-run-screenshots
or: python3 -B skills/real-run-screenshots/test_screenshots.py"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("screenshots", HERE / "screenshots.py")
ss = importlib.util.module_from_spec(_spec)
sys.modules["screenshots"] = ss
_spec.loader.exec_module(ss)

HAS_RICH = importlib.util.find_spec("rich") is not None
HAS_PLAYWRIGHT = importlib.util.find_spec("playwright") is not None


def minimal(**over):
    d = {"shots": [{"name": "a", "commands": ["echo hi"]}]}
    d.update(over)
    return d


class ViewportTests(unittest.TestCase):
    def test_forms(self):
        self.assertEqual(ss.parse_viewport("1280x800"), (1280, 800))
        self.assertEqual(ss.parse_viewport("1280,800"), (1280, 800))
        self.assertEqual(ss.parse_viewport([640, 480]), (640, 480))

    def test_rejects(self):
        for bad in ("1280", "axb", "50x50", "9000x800", None):
            with self.assertRaises(ss.SpecError, msg=repr(bad)):
                ss.parse_viewport(bad)


class NameTests(unittest.TestCase):
    def test_good(self):
        self.assertEqual(ss.safe_name("01-install.v2"), "01-install.v2")

    def test_bad(self):
        for bad in ("../x", "a/b", "", ".hidden", "a b", None, "a..b"):
            with self.assertRaises(ss.SpecError, msg=repr(bad)):
                ss.safe_name(bad)


class ScanTests(unittest.TestCase):
    def pats(self):
        return ss.private_patterns(home="/home/zed", user="zedman")

    def test_flags_home_email_token_user(self):
        for text in ("see /home/zed/x", "/Users/bob/x", "mail a.b@example.com", "ghp_abcdef123",
                     "key sk-abc123", "by Zedman here", "AKIAABCDEFGH1234"):
            self.assertTrue(ss.scan_text(text, self.pats()), text)

    def test_clean_text_passes(self):
        self.assertEqual(ss.scan_text("$ tool --help\nusage: tool [-h]\n", self.pats()), [])

    def test_allow_list_removes_public_url(self):
        text = "https://github.com/zedman/tool"
        self.assertTrue(ss.scan_text(text, self.pats()))
        self.assertEqual(ss.scan_text(text, self.pats(), allow=["github.com/zedman/tool"]), [])

    def test_user_name_is_whole_word(self):
        self.assertEqual(ss.scan_text("zedmanship", self.pats()), [])

    def test_extra_pattern(self):
        self.assertTrue(ss.scan_text("codename PHOENIX", ss.private_patterns(["PHOENIX"], home="/", user="")))

    def test_svg_text_ignores_css(self):
        svg = '<svg><style>@font-face{src:url(x)}</style><title>t &amp; u</title><text x="1">a&#160;b</text></svg>'
        out = ss.svg_text_content(svg)
        self.assertIn("a b", out)
        self.assertIn("t & u", out)
        self.assertNotIn("font-face", out)


class HelperTests(unittest.TestCase):
    def test_strip_ansi(self):
        self.assertEqual(ss.strip_ansi("\x1b[31mred\x1b[0m ok"), "red ok")

    def test_trim_lines(self):
        text = "\n".join(str(i) for i in range(10)) + "\n"
        self.assertEqual(ss.trim_lines(text, 0), text)
        self.assertEqual(ss.trim_lines(text, 20), text)
        self.assertEqual(ss.trim_lines(text, 3), "...\n7\n8\n9")

    def test_check_size(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.svg"
            p.write_bytes(b"a" * 2048)
            ss.check_size(p, 3)
            with self.assertRaises(RuntimeError):
                ss.check_size(p, 1)

    def test_clean_env_drops_real_environment(self):
        os.environ["SOME_SECRET_FOR_TEST"] = "x"
        env = ss.clean_env(Path("/tmp/w"), {"A": 1}, width=88)
        self.assertNotIn("SOME_SECRET_FOR_TEST", env)
        self.assertEqual((env["HOME"], env["A"], env["COLUMNS"]), ("/tmp/w", "1", "88"))


class SpecTests(unittest.TestCase):
    def test_defaults(self):
        s = ss.validate_spec(minimal())
        self.assertEqual((s["out_dir"], s["format"], s["max_kb"], s["width"]), ("docs/images", "svg", 500, 100))
        self.assertEqual(s["shots"][0]["expect_exit"], 0)

    def test_page_shot(self):
        s = ss.validate_spec({"shots": [{"kind": "page", "name": "p", "url": "http://127.0.0.1:1/", "viewport": "800x600"}]})
        self.assertEqual(s["shots"][0]["viewport"], (800, 600))

    def test_rejects(self):
        bad = [
            [], {"shots": []}, {"shots": "x"},
            minimal(format="gif"), minimal(width=5),
            {"shots": [{"name": "a", "commands": []}]},
            {"shots": [{"name": "a", "commands": [""]}]},
            {"shots": [{"name": "a", "commands": ["x"]}, {"name": "a", "commands": ["y"]}]},
            {"shots": [{"kind": "page", "name": "p", "url": "file:///etc/passwd"}]},
            {"shots": [{"kind": "video", "name": "p"}]},
            {"shots": [{"name": "../a", "commands": ["x"]}]},
        ]
        for b in bad:
            with self.assertRaises(ss.SpecError, msg=repr(b)):
                ss.validate_spec(b)

    def test_load_json_and_bad_json(self):
        with tempfile.TemporaryDirectory() as d:
            good, bad = Path(d, "g.json"), Path(d, "b.json")
            good.write_text(json.dumps(minimal()))
            bad.write_text("{nope")
            self.assertEqual(ss.load_spec(good)["shots"][0]["name"], "a")
            with self.assertRaises(ss.SpecError):
                ss.load_spec(bad)

    def test_cli_args_build_a_spec(self):
        a = ss.build_parser().parse_args(["term", "--cmd", "echo 1", "--cmd", "echo 2", "--name", "n", "--format", "both"])
        s = ss.spec_from_args(a)
        self.assertEqual(s["shots"][0]["commands"], ["echo 1", "echo 2"])
        self.assertEqual(s["format"], "both")
        a = ss.build_parser().parse_args(["page", "--url", "http://x.test", "--name", "p", "--full-page"])
        self.assertTrue(ss.spec_from_args(a)["shots"][0]["full_page"])


class RunTests(unittest.TestCase):
    def test_run_command_captures_real_output_and_code(self):
        with tempfile.TemporaryDirectory() as d:
            env = ss.clean_env(Path(d))
            rc, out = ss.run_command("echo out; echo err >&2; exit 3", Path(d), env)
            self.assertEqual(rc, 3)
            self.assertEqual(sorted(out.split()), ["err", "out"])

    def test_workdir_guard(self):
        with tempfile.TemporaryDirectory() as d:
            foreign = Path(d, "foreign")
            foreign.mkdir()
            (foreign / "keep.txt").write_text("x")
            with self.assertRaises(ss.SpecError):
                ss.prepare_workdir(foreign)
            self.assertTrue((foreign / "keep.txt").exists())
            mine = Path(d, "mine")
            ss.prepare_workdir(mine)
            (mine / "junk").write_text("x")
            ss.prepare_workdir(mine)
            self.assertFalse((mine / "junk").exists())

    @unittest.skipUnless(HAS_RICH, "rich not installed")
    def test_terminal_shot_end_to_end(self):
        with tempfile.TemporaryDirectory() as d:
            spec = ss.validate_spec({"out_dir": f"{d}/img", "workdir": f"{d}/w", "shots": [
                {"name": "t", "title": "demo", "commands": ["echo real-output-42"]}]})
            (written,) = ss.run_spec(spec)
            self.assertIn("real-output-42", written.read_text())

    @unittest.skipUnless(HAS_RICH, "rich not installed")
    def test_wrong_exit_code_fails_and_privacy_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            base = {"out_dir": f"{d}/img", "workdir": f"{d}/w"}
            with self.assertRaises(RuntimeError):
                ss.run_spec(ss.validate_spec({**base, "shots": [{"name": "t", "commands": ["exit 2"]}]}))
            with self.assertRaises(ss.PrivacyError):
                ss.run_spec(ss.validate_spec({**base, "shots": [{"name": "t", "commands": ["echo /home/someone/x"]}]}))
            self.assertFalse(list(Path(d, "img").glob("*.svg")))

    def test_main_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "s.json")
            p.write_text("{}")
            self.assertEqual(ss.main(["run", str(p)]), 2)

    @unittest.skipUnless(HAS_PLAYWRIGHT, "playwright not installed")
    def test_page_shot_needs_running_app(self):
        with tempfile.TemporaryDirectory() as d:
            spec = ss.validate_spec({"out_dir": d, "workdir": f"{d}/w", "shots": [
                {"kind": "page", "name": "p", "url": "http://127.0.0.1:9/"}]})
            with self.assertRaises(Exception):
                ss.run_spec(spec)

    def test_missing_playwright_gives_clear_error(self):
        if HAS_PLAYWRIGHT:
            self.skipTest("playwright is installed")
        with self.assertRaises(SystemExit) as cm:
            ss.svg_to_png("<svg/>", Path("/tmp/x.png"))
        self.assertIn("playwright", str(cm.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
