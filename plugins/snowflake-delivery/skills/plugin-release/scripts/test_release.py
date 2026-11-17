#!/usr/bin/env python3
"""Tests for release.py. Each test builds a throwaway git repository. Run: python3 -B test_release.py"""
import contextlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import release  # noqa: E402


def sh(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, timeout=30)


def make_repo(tmp, version="1.4.0", market_version="1.4.0", git_ref=False):
    repo = Path(tmp)
    sh(repo, "init", "-q", "-b", "main")
    sh(repo, "config", "user.email", "t@example.invalid")
    sh(repo, "config", "user.name", "t")
    plug = repo / "plugins" / "demo" / ".claude-plugin"
    plug.mkdir(parents=True)
    (plug / "plugin.json").write_text(json.dumps({"name": "demo", "version": version}, indent=2) + "\n")
    entry = {"name": "demo", "source": "./plugins/demo", "version": market_version}
    if git_ref:
        entry = {"name": "demo", "source": {"source": "github", "repo": "o/demo", "ref": f"demo-v{market_version}"}}
    (repo / ".claude-plugin").mkdir()
    (repo / ".claude-plugin" / "marketplace.json").write_text(json.dumps({"name": "m", "plugins": [entry]}, indent=2))
    sh(repo, "add", "-A")
    sh(repo, "commit", "-q", "-m", "init")
    return repo, repo / "plugins" / "demo"


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        rc = release.main(list(argv))
    return rc, out.getvalue() + err.getvalue()


def version_of(plugin_dir):
    return json.loads((plugin_dir / ".claude-plugin" / "plugin.json").read_text())["version"]


class Regression(unittest.TestCase):
    def test_uncommitted_backward_edit_is_reported(self):
        # The recorded bug: HEAD says 1.4.0, an uncommitted edit says 1.3.4.
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            (plug / ".claude-plugin" / "plugin.json").write_text(json.dumps({"name": "demo", "version": "1.3.4"}))
            rc, out = run("check", "--plugin-dir", str(plug))
            self.assertEqual(rc, 1)
            self.assertIn("REGRESSION working tree plugin.json 1.3.4 is behind HEAD plugin.json 1.4.0", out)

    def test_explicit_version_below_head_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            rc, out = run("bump", "--plugin-dir", str(plug), "--to", "1.3.5", "--skip-validate")
            self.assertEqual(rc, 1)
            self.assertIn("refusing 1.3.5", out)
            self.assertEqual(version_of(plug), "1.4.0")

    def test_equal_version_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            self.assertEqual(run("bump", "--plugin-dir", str(plug), "--to", "1.4.0", "--skip-validate")[0], 1)

    def test_version_below_existing_tag_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            sh(repo, "tag", "demo-v2.0.0")
            rc, out = run("bump", "--plugin-dir", str(plug), "--to", "1.5.0", "--skip-validate")
            self.assertEqual(rc, 1)
            self.assertIn("highest tag 2.0.0", out)

    def test_version_below_marketplace_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d, market_version="1.9.0")
            self.assertEqual(run("bump", "--plugin-dir", str(plug), "--to", "1.5.0", "--skip-validate")[0], 1)

    def test_part_bump_starts_above_the_highest_known(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            sh(repo, "tag", "demo-v1.6.2")
            rc, out = run("bump", "--plugin-dir", str(plug), "--part", "patch", "--skip-validate")
            self.assertEqual(rc, 0, out)
            self.assertEqual(version_of(plug), "1.6.3")

    def test_other_plugins_tags_do_not_count(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            sh(repo, "tag", "other-v9.0.0")
            rc, out = run("bump", "--plugin-dir", str(plug), "--part", "minor", "--skip-validate")
            self.assertEqual(rc, 0, out)
            self.assertEqual(version_of(plug), "1.5.0")


class BumpWrites(unittest.TestCase):
    def test_bump_updates_manifest_and_marketplace_version(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            rc, out = run("bump", "--plugin-dir", str(plug), "--part", "minor", "--skip-validate")
            self.assertEqual(rc, 0, out)
            market = json.loads((repo / ".claude-plugin" / "marketplace.json").read_text())
            self.assertEqual(market["plugins"][0]["version"], "1.5.0")
            self.assertEqual(version_of(plug), "1.5.0")

    def test_bump_updates_git_source_ref(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d, git_ref=True)
            rc, out = run("bump", "--plugin-dir", str(plug), "--part", "major", "--skip-validate")
            self.assertEqual(rc, 0, out)
            src = json.loads((repo / ".claude-plugin" / "marketplace.json").read_text())["plugins"][0]["source"]
            self.assertEqual(src["ref"], "demo-v2.0.0")

    def test_missing_marketplace_entry_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            (repo / ".claude-plugin" / "marketplace.json").write_text(json.dumps({"name": "m", "plugins": []}))
            self.assertEqual(run("bump", "--plugin-dir", str(plug), "--part", "patch", "--skip-validate")[0], 1)

    def test_bad_version_string_is_a_usage_error(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            self.assertEqual(run("bump", "--plugin-dir", str(plug), "--to", "v1.5", "--skip-validate")[0], 2)


class Tag(unittest.TestCase):
    def test_tag_refuses_dirty_tree(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            run("bump", "--plugin-dir", str(plug), "--part", "patch", "--skip-validate")
            rc, out = run("tag", "--plugin-dir", str(plug))
            self.assertEqual(rc, 1)
            self.assertIn("not clean", out)

    def test_tag_after_commit(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            run("bump", "--plugin-dir", str(plug), "--part", "patch", "--skip-validate")
            sh(repo, "commit", "-q", "-am", "release demo 1.4.1")
            rc, out = run("tag", "--plugin-dir", str(plug))
            self.assertEqual(rc, 0, out)
            tags = subprocess.run(["git", "-C", str(repo), "tag", "--list"], capture_output=True, text=True).stdout
            self.assertIn("demo-v1.4.1", tags.split())

    def test_tag_refuses_when_tag_already_at_head_version(self):
        with tempfile.TemporaryDirectory() as d:
            repo, plug = make_repo(d)
            sh(repo, "tag", "demo-v1.4.0")
            self.assertEqual(run("tag", "--plugin-dir", str(plug))[0], 1)


if __name__ == "__main__":
    unittest.main(verbosity=1)
