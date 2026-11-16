#!/usr/bin/env python3
"""Keep the kit's index files in step with the filesystem.

Counts skills, agents, commands, rules and hook scripts, then checks (--check) or rewrites
(--write) every place that states them:

  * Markdown files carry generated regions between marker comments:
        <!-- sync-index:KEY -->generated text<!-- /sync-index:KEY -->
    Add the pair by hand once; --write replaces only the text between the markers.
  * The count phrases in the plugin and marketplace descriptions ("37 skills",
    "23 model-routed agents", ...) are updated by regex.

--check exits 1 and lists every stale value, missing marker or missing skill family.
--write rewrites what it can and is idempotent; it exits 1 if a problem cannot be fixed
by rewriting (for example a missing marker). Standard library only.
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

# Families are listed in this order first, then any others alphabetically.
FAMILY_ORDER = ["staff", "data"]
# Where a family came from, for the INVENTORY rows. Unknown families are "written in this repo".
FAMILY_SOURCE = {"staff": "`~/.claude/skills/staff-*`", "data": "`~/.claude/skills/data-*`"}
DEFAULT_SOURCE = "written in this repo"

# Markdown file -> marker keys that must be present in it.
MARKDOWN_TARGETS = {
    "README.md": [
        "rules-count", "skills-count", "skill-families", "agents-count",
        "commands-count", "rules-standards",
    ],
    "docs/INVENTORY.md": [
        "skill-family-rows", "agents-count", "agents-models", "commands-count",
        "rules-count", "rules-standards", "hooks-count",
    ],
    "commands/standards.md": ["skill-prefixes"],
}

# Count phrases in JSON descriptions: key -> regex whose group 1 is the number.
COUNT_PHRASES = {
    "skills-count": r"(\d+)(?= skills\b)",
    "agents-count": r"(\d+)(?= (?:model-routed )?agents\b)",
    "commands-count": r"(\d+)(?= (?:slash )?commands\b)",
    "rules-count": r"(\d+)(?= rules\b)",
}


def count_facts(root):
    """Count the artifacts under root. Returns the raw facts used by every target."""
    root = Path(root)
    skills = sorted(p.parent.name for p in (root / "skills").glob("*/SKILL.md"))
    agents = sorted((root / "agents").glob("*.md"))
    models = Counter()
    for a in agents:
        m = re.search(r"^model:\s*(\S+)", a.read_text(encoding="utf-8"), re.M)
        models[m.group(1) if m else "unset"] += 1
    prefixes = Counter(s.split("-", 1)[0] for s in skills if "-" in s)
    families = {p: n for p, n in prefixes.items() if n >= 2}
    order = [p for p in FAMILY_ORDER if p in families] + sorted(p for p in families if p not in FAMILY_ORDER)
    singles = [s for s in skills if s.split("-", 1)[0] not in families]
    return {
        "skills": skills,
        "family_order": order,
        "family_members": {p: [s.split("-", 1)[1] for s in skills if s.startswith(p + "-")] for p in order},
        "singles": singles,
        "agents": len(agents),
        "models": models,
        "commands": len(list((root / "commands").glob("*.md"))),
        "rules": len(list((root / "rules").glob("*.md"))),
        "hooks": len([p for p in (root / "hooks").glob("*.js") if not p.name.endswith(".test.js")]),
    }


def generated_values(facts):
    """Map each marker key to the text that belongs between its markers."""
    fam = facts["family_order"]
    counts = {p: len(facts["family_members"][p]) for p in fam}
    fam_parts = [f"{counts[p]} `{p}-*`" for p in fam]
    fam_text = ", ".join(fam_parts[:-1]) + " and " + fam_parts[-1] if len(fam_parts) > 1 else ", ".join(fam_parts)
    singles = ", ".join(f"`{s}`" for s in facts["singles"])
    rows = []
    for p in fam:
        src = FAMILY_SOURCE.get(p, DEFAULT_SOURCE)
        rows.append(f"`skills/{p}-*` | {src} | {counts[p]} | {', '.join(facts['family_members'][p])}")
    models = ", ".join(f"{n} {m}" for m, n in sorted(facts["models"].items(), key=lambda kv: (-kv[1], kv[0])))
    return {
        "skills-count": str(len(facts["skills"])),
        "skill-families": f"{fam_text} skills, plus {singles}." if singles else f"{fam_text} skills.",
        "skill-prefixes": ", ".join(f"`{p}-*`" for p in fam),
        "skill-family-rows": " |\n| ".join(rows),
        "agents-count": str(facts["agents"]),
        "agents-models": f"({models})",
        "commands-count": str(facts["commands"]),
        "rules-count": str(facts["rules"]),
        "rules-standards": str(facts["rules"] - 1),
        "hooks-count": str(facts["hooks"]),
    }


def marker_re(key):
    return re.compile(
        r"(<!-- sync-index:" + re.escape(key) + r" -->)(.*?)(<!-- /sync-index:" + re.escape(key) + r" -->)", re.S
    )


def sync_markdown(path, keys, values):
    """Returns (problems, new_text). Problems are strings; new_text is None if unreadable."""
    problems = []
    text = path.read_text(encoding="utf-8")
    for key in keys:
        rx = marker_re(key)
        found = rx.findall(text)
        if not found:
            problems.append(f"{path}: missing marker pair for '{key}' (add <!-- sync-index:{key} -->...<!-- /sync-index:{key} -->)")
            continue
        for _, current, _ in found:
            if current != values[key]:
                problems.append(f"{path}: '{key}' is stale: has {current!r}, should be {values[key]!r}")
                break
        text = rx.sub(lambda m: m.group(1) + values[key] + m.group(3), text)
    return problems, text


def fix_description(desc, values, families):
    """Return (new_desc, problems) for a JSON description string."""
    problems = []
    for key, pat in COUNT_PHRASES.items():
        m = re.search(pat, desc)
        if not m:
            problems.append(f"description has no count phrase for '{key}'")
        elif m.group(1) != values[key]:
            problems.append(f"'{key}' is stale: has {m.group(1)}, should be {values[key]}")
            desc = desc[:m.start(1)] + values[key] + desc[m.end(1):]
    for p in families:
        if f"{p}-*" not in desc:
            problems.append(f"description does not mention skill family `{p}-*` (edit by hand)")
    return desc, problems


def sync_json(path, locate, values, families):
    """locate(data) -> description string. Rewrites the description literal in the raw text."""
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    old = locate(data)
    new, problems = fix_description(old, values, families)
    problems = [f"{path}: {p}" for p in problems]
    if new != old:
        lit_old, lit_new = json.dumps(old, ensure_ascii=False), json.dumps(new, ensure_ascii=False)
        if lit_old not in raw:
            problems.append(f"{path}: cannot locate the description literal to rewrite")
            return problems, raw
        raw = raw.replace(lit_old, lit_new, 1)
    return problems, raw


def staff_kit_description(data):
    for plugin in data["plugins"]:
        if plugin.get("name") == "staff-kit":
            return plugin["description"]
    raise KeyError("no staff-kit plugin in marketplace.json")


def run(root, write):
    """Check or write every target under root. Returns (stale_or_missing, unfixable)."""
    root = Path(root)
    facts = count_facts(root)
    values = generated_values(facts)
    families = facts["family_order"]
    problems, unfixable = [], []
    outputs = {}
    for rel, keys in MARKDOWN_TARGETS.items():
        path = root / rel
        if not path.is_file():
            unfixable.append(f"{rel}: file missing")
            continue
        p, text = sync_markdown(path, keys, values)
        problems += p
        outputs[path] = text
    # The plugin description names the skill families; the marketplace one only carries counts.
    for rel, locate, check_families in ((".claude-plugin/plugin.json", lambda d: d["description"], True),
                                        (".claude-plugin/marketplace.json", staff_kit_description, False)):
        path = root / rel
        if not path.is_file():
            unfixable.append(f"{rel}: file missing")
            continue
        p, text = sync_json(path, locate, values, families if check_families else [])
        problems += p
        outputs[path] = text
    unfixable += [p for p in problems if "missing marker" in p or "no count phrase" in p
                  or "does not mention skill family" in p or "cannot locate" in p]
    if write:
        for path, text in outputs.items():
            if path.read_text(encoding="utf-8") != text:
                path.write_text(text, encoding="utf-8")
    return problems, unfixable


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="exit 1 and list anything stale or missing")
    mode.add_argument("--write", action="store_true", help="rewrite the generated counts and lists")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent), help="kit root (default: this repo)")
    args = ap.parse_args(argv)
    problems, unfixable = run(args.root, args.write)
    if args.check:
        if problems or unfixable:
            for p in problems + [u for u in unfixable if u not in problems]:
                print("STALE:", p, file=sys.stderr)
            return 1
        print("sync-index: all counts and lists in sync")
        return 0
    for p in problems:
        print("fixed:" if p not in unfixable else "CANNOT FIX:", p)
    if unfixable:
        return 1
    print("sync-index: wrote" if problems else "sync-index: nothing to change")
    return 0


if __name__ == "__main__":
    sys.exit(main())
