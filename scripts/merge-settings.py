#!/usr/bin/env python3
"""Register the staff-kit hooks in ~/.claude/settings.json (dotfiles mode only).

Plugin mode does not need this: hooks/hooks.json registers them automatically.

    merge-settings.py --print                      show the hook entries that would be added
    merge-settings.py --apply                      merge them into settings.json (backup taken first)
    merge-settings.py --apply --settings PATH      use another settings file (tests, --target installs)
    merge-settings.py ... --hook-dir DIR           where the hook scripts live (default ~/.claude/hooks)

Contract:
  - Idempotent: an entry is added only when no existing hook for that event already runs
    the same command string. Existing hooks, permissions, and every other key are untouched.
  - A symlinked settings.json is updated in place (the link is kept, the real file changes).
  - The file's permission bits are preserved; a new file is created 0600.
  - A backup is written next to the real file as <name>.bak-staff-kit-<timestamp> before any write.
  - Malformed input (not JSON, "hooks" not an object, an event not an array, ...) exits 1 with a
    one-line message and the file is not touched.
"""
import argparse
import json
import os
import shutil
import stat
import sys
import time

DEFAULT_HOOK_DIR = "~/.claude/hooks"


def hook_entries(hook_dir):
    """The entries to register. The matcher strings are deliberate:
    - PreToolUse "" (every tool): the guard also inspects Artifact deletes and any MCP tool whose
      name contains sql/query/snowflake/bigquery/postgres/mysql/duckdb. A narrower matcher would
      silently drop that protection.
    - SessionStart startup|clear|compact, not resume or fork: those sessions already carry the
      policy in their transcript, so re-injecting it only costs tokens. Compaction can drop it.
    """
    guard = f"node {hook_dir}/evolv-destructive-guard.js"
    enforcer = f"node {hook_dir}/evolv-skills-enforcer.js"
    return {
        "PreToolUse": [{"matcher": "", "hooks": [{"type": "command", "command": guard}]}],
        "SessionStart": [{"matcher": "startup|clear|compact", "hooks": [{"type": "command", "command": enforcer}]}],
        "Stop": [{"matcher": "", "hooks": [{"type": "command", "command": enforcer}]}],
    }


class ShapeError(ValueError):
    pass


def validate_shape(settings):
    """Reject anything merge() could not handle without guessing. Raises ShapeError."""
    if not isinstance(settings, dict):
        raise ShapeError("top level must be a JSON object")
    hooks = settings.get("hooks")
    if hooks is None:
        return
    if not isinstance(hooks, dict):
        raise ShapeError('"hooks" must be an object')
    for event, groups in hooks.items():
        if not isinstance(groups, list):
            raise ShapeError(f'"hooks.{event}" must be an array')
        for i, group in enumerate(groups):
            if not isinstance(group, dict):
                raise ShapeError(f'"hooks.{event}[{i}]" must be an object')
            inner = group.get("hooks")
            if inner is not None and not isinstance(inner, list):
                raise ShapeError(f'"hooks.{event}[{i}].hooks" must be an array')
            for j, h in enumerate(inner or []):
                if not isinstance(h, dict):
                    raise ShapeError(f'"hooks.{event}[{i}].hooks[{j}]" must be an object')


def commands_in(groups):
    out = set()
    for g in groups:
        for h in g.get("hooks") or []:
            if h.get("command"):
                out.add(h["command"])
    return out


def merge(settings, entries):
    """Return (merged_settings, added_count). Pure: does not touch disk. Call validate_shape first."""
    if settings.get("hooks") is None:  # absent or explicit null: both mean "no hooks yet"
        settings["hooks"] = {}
    hooks = settings["hooks"]
    added = 0
    for event, groups in entries.items():
        existing = hooks.setdefault(event, [])
        have = commands_in(existing)
        for g in groups:
            cmd = g["hooks"][0]["command"]
            if cmd not in have:
                existing.append(json.loads(json.dumps(g)))
                have.add(cmd)
                added += 1
    return settings, added


def load(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8-sig") as fh:  # utf-8-sig: tolerate a BOM
        raw = fh.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def write_in_place(path, settings):
    """Write atomically to the REAL file behind `path`, keeping symlinks and permission bits."""
    real = os.path.realpath(path)
    exists = os.path.exists(real)
    mode = stat.S_IMODE(os.stat(real).st_mode) if exists else 0o600
    if exists:
        backup = f"{real}.bak-staff-kit-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(real, backup)
        print(f"backup: {backup}")
    else:
        os.makedirs(os.path.dirname(real) or ".", exist_ok=True)
    tmp = real + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(settings, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.chmod(tmp, mode)
    os.replace(tmp, real)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--print", dest="show", action="store_true", help="print the hook entries and exit")
    p.add_argument("--apply", action="store_true", help="merge into the settings file (backup first)")
    p.add_argument("--settings", default=os.path.expanduser("~/.claude/settings.json"))
    p.add_argument("--hook-dir", default=DEFAULT_HOOK_DIR, help="directory the hook commands point at")
    a = p.parse_args(argv)

    entries = hook_entries(a.hook_dir)
    if not (a.show or a.apply):
        p.print_help()
        return 2
    if a.show:
        print(json.dumps({"hooks": entries}, indent=2))
        if not a.apply:
            return 0

    path = a.settings
    try:
        settings = load(path)
        validate_shape(settings)
    except json.JSONDecodeError as e:
        print(f"error: {path} is not valid JSON ({e.msg} at line {e.lineno}); file not touched", file=sys.stderr)
        return 1
    except ShapeError as e:
        print(f"error: {path}: {e}; file not touched", file=sys.stderr)
        return 1

    settings, added = merge(settings, entries)
    if added == 0:
        print(f"nothing to do: all staff-kit hooks already registered in {path}")
        return 0

    write_in_place(path, settings)
    print(f"added {added} hook entr{'y' if added == 1 else 'ies'} to {path}")
    print("restart Claude Code for the hooks to take effect")
    return 0


if __name__ == "__main__":
    sys.exit(main())
