#!/usr/bin/env python3
"""Tests for sync-index.py. Each test builds a small fixture kit in a temp directory."""
import contextlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sync_index", HERE / "sync-index.py")
sync_index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync_index)


def m(key, value):
    return f"<!-- sync-index:{key} -->{value}<!-- /sync-index:{key} -->"


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def build_fixture(root, stale="99"):
    """A kit with 3 skills (2 staff-*, 1 single), 2 agents, 2 commands (go and standards), 3 rules, 1 hook script."""
    for s in ("staff-a", "staff-b", "solo"):
        write(root / "skills" / s / "SKILL.md", f"---\nname: {s}\ndescription: x\n---\n")
    write(root / "agents/one.md", "---\nname: one\nmodel: opus\n---\n")
    write(root / "agents/two.md", "---\nname: two\nmodel: sonnet\n---\n")
    write(root / "commands/go.md", "---\ndescription: x\n---\n")
    for r in ("README", "a", "b"):
        write(root / "rules" / f"{r}.md", "x\n")
    write(root / "hooks/guard.js", "//\n")
    write(root / "hooks/guard.test.js", "//\n")
    write(root / "README.md", "\n".join([
        f"Skills {m('skills-count', stale)}",
        f"Families {m('skill-families', stale)}",
        f"Agents {m('agents-count', stale)}",
        f"Commands {m('commands-count', stale)}",
        f"Rules {m('rules-count', stale)} / {m('rules-standards', stale)}",
    ]))
    write(root / "docs/INVENTORY.md", "\n".join([
        f"| {m('skill-family-rows', stale)} |",
        f"agents {m('agents-count', stale)} {m('agents-models', stale)}",
        f"commands {m('commands-count', stale)}",
        f"rules {m('rules-count', stale)} {m('rules-standards', stale)}",
        f"hooks {m('hooks-count', stale)}",
    ]))
    write(root / "commands/standards.md", f"Skills: {m('skill-prefixes', stale)}")
    write(root / ".claude-plugin/plugin.json", json.dumps({
        "description": f"Kit: {stale} skills (staff-*), {stale} agents, {stale} slash commands, {stale} rules."
    }, indent=2))
    write(root / ".claude-plugin/marketplace.json", json.dumps({"plugins": [
        {"name": "other", "description": "5 skills, 5 agents, 5 commands, 5 rules"},
        {"name": "staff-kit", "description": f"Kit: {stale} skills, {stale} model-routed agents, {stale} commands, {stale} rules."},
    ]}, indent=2))


class SyncIndexTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.root = self.tmp / "kit"
        build_fixture(self.root)
        out = contextlib.redirect_stdout(io.StringIO())
        err = contextlib.redirect_stderr(io.StringIO())
        out.__enter__(), err.__enter__()
        self.addCleanup(err.__exit__, None, None, None)
        self.addCleanup(out.__exit__, None, None, None)

    def snapshot(self):
        return {str(p.relative_to(self.root)): p.read_text() for p in sorted(self.root.rglob("*")) if p.is_file()}

    def test_counts_come_from_the_filesystem(self):
        facts = sync_index.count_facts(self.root)
        self.assertEqual(len(facts["skills"]), 3)
        self.assertEqual(facts["agents"], 2)
        self.assertEqual(facts["commands"], 2)
        self.assertEqual(facts["rules"], 3)
        self.assertEqual(facts["hooks"], 1)
        self.assertEqual(facts["family_order"], ["staff"])
        self.assertEqual(facts["singles"], ["solo"])

    def test_stale_count_is_detected(self):
        problems, _ = sync_index.run(self.root, write=False)
        text = "\n".join(problems)
        self.assertIn("'skills-count' is stale", text)
        self.assertIn("README.md", text)
        self.assertIn("plugin.json", text)
        self.assertIn("marketplace.json", text)
        self.assertEqual(sync_index.main(["--check", "--root", str(self.root)]), 1)

    def test_check_does_not_modify_files(self):
        before = self.snapshot()
        sync_index.main(["--check", "--root", str(self.root)])
        self.assertEqual(before, self.snapshot())

    def test_write_fixes_everything_and_check_then_passes(self):
        self.assertEqual(sync_index.main(["--write", "--root", str(self.root)]), 0)
        readme = (self.root / "README.md").read_text()
        self.assertIn(m("skills-count", "3"), readme)
        self.assertIn(m("agents-count", "2"), readme)
        self.assertIn(m("rules-standards", "2"), readme)
        plugin = json.loads((self.root / ".claude-plugin/plugin.json").read_text())["description"]
        self.assertEqual(plugin, "Kit: 3 skills (staff-*), 2 agents, 2 slash commands, 3 rules.")
        plugins = json.loads((self.root / ".claude-plugin/marketplace.json").read_text())["plugins"]
        self.assertEqual(plugins[0]["description"], "5 skills, 5 agents, 5 commands, 5 rules")  # untouched
        self.assertEqual(plugins[1]["description"], "Kit: 3 skills, 2 model-routed agents, 2 commands, 3 rules.")
        self.assertIn("(1 opus, 1 sonnet)", (self.root / "docs/INVENTORY.md").read_text())
        self.assertEqual(sync_index.main(["--check", "--root", str(self.root)]), 0)

    def test_second_write_is_a_no_op(self):
        sync_index.main(["--write", "--root", str(self.root)])
        after_first = self.snapshot()
        self.assertEqual(sync_index.main(["--write", "--root", str(self.root)]), 0)
        self.assertEqual(after_first, self.snapshot())

    def test_new_skill_family_appears_in_output(self):
        sync_index.main(["--write", "--root", str(self.root)])
        for s in ("zed-one", "zed-two"):
            write(self.root / "skills" / s / "SKILL.md", f"---\nname: {s}\ndescription: x\n---\n")
        problems, _ = sync_index.run(self.root, write=False)
        self.assertTrue(any("skill-prefixes" in p for p in problems))
        sync_index.main(["--write", "--root", str(self.root)])
        self.assertIn("`zed-*`", (self.root / "commands/standards.md").read_text())
        self.assertIn("`skills/zed-*`", (self.root / "docs/INVENTORY.md").read_text())
        self.assertIn("2 `zed-*`", (self.root / "README.md").read_text())
        # plugin.json names families by hand, so a new family there is reported, not invented
        problems, unfixable = sync_index.run(self.root, write=False)
        self.assertTrue(any("`zed-*`" in p for p in unfixable))
        self.assertEqual(sync_index.main(["--check", "--root", str(self.root)]), 1)

    def test_missing_marker_is_reported_and_not_fixable(self):
        p = self.root / "commands/standards.md"
        p.write_text("Skills: none\n")
        problems, unfixable = sync_index.run(self.root, write=True)
        self.assertTrue(any("missing marker pair for 'skill-prefixes'" in u for u in unfixable))
        self.assertEqual(sync_index.main(["--write", "--root", str(self.root)]), 1)


if __name__ == "__main__":
    unittest.main()
