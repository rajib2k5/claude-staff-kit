"""Tests for merge-settings.py. Run: python3 -B scripts/test_merge_settings.py"""
import importlib.util
import json
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("merge_settings", os.path.join(HERE, "merge-settings.py"))
ms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ms)


def commands(settings, event):
    return [h["command"] for g in settings["hooks"].get(event, []) for h in g["hooks"]]


class MergeSettings(unittest.TestCase):
    def test_registers_guard_ledger_and_journal_events(self):
        s, added = ms.merge({}, ms.hook_entries("/h"), ms.status_line("/h"))
        self.assertIn("node /h/subagent-model-guard.js", commands(s, "PreToolUse"))
        self.assertEqual([g["matcher"] for g in s["hooks"]["PreToolUse"] if "model-guard" in g["hooks"][0]["command"]], ["Agent|Task"])
        self.assertIn("node /h/subagent-cost-ledger.js", commands(s, "SubagentStop"))
        self.assertIn("node /h/subagent-cost-ledger.js", commands(s, "Stop"))
        self.assertIn("node /h/compact-journal.js", commands(s, "PreCompact"))
        self.assertIn("node /h/compact-journal.js", commands(s, "SessionStart"))
        self.assertEqual(s["statusLine"]["command"], "node /h/cost-statusline.js")
        self.assertEqual(added, 10)  # 9 hook entries + the status line

    def test_second_merge_adds_nothing(self):
        s, _ = ms.merge({}, ms.hook_entries("/h"), ms.status_line("/h"))
        before = json.dumps(s, sort_keys=True)
        s, added = ms.merge(s, ms.hook_entries("/h"), ms.status_line("/h"))
        self.assertEqual(added, 0)
        self.assertEqual(json.dumps(s, sort_keys=True), before)

    def test_existing_status_line_and_hooks_are_kept(self):
        mine = {"type": "command", "command": "my-status"}
        start = {"statusLine": mine, "hooks": {"Stop": [{"matcher": "", "hooks": [{"type": "command", "command": "mine"}]}]}}
        s, _ = ms.merge(start, ms.hook_entries("/h"), ms.status_line("/h"))
        self.assertEqual(s["statusLine"], mine)
        self.assertIn("mine", commands(s, "Stop"))

    def test_apply_backs_up_and_keeps_other_keys(self):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "settings.json")
        with open(p, "w") as fh:
            json.dump({"env": {"KEEP": "1"}, "model": "opus"}, fh)
        self.assertEqual(ms.main(["--apply", "--settings", p, "--hook-dir", "/h"]), 0)
        got = json.load(open(p))
        self.assertEqual(got["env"], {"KEEP": "1"})
        self.assertTrue(any(n.startswith("settings.json.bak-staff-kit-") for n in os.listdir(d)))


if __name__ == "__main__":
    unittest.main()
