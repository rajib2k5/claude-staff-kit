#!/usr/bin/env python3
"""
rollup.py - turn the pilot's findings log into the decision the pilot exists to make.

Reads .taste-pilot/findings.jsonl (written by the pre-commit hook and override.sh)
and produces the three lists the pilot plan promises:

  KEEP    - fired repeatedly, rarely overridden. Earned its place.
  DELETE  - fired repeatedly, mostly overridden. The rule is wrong, not the code.
  UNPROVEN- never fired. No evidence either way; do not forge against it.

Plus the forge backlog, if reviewer misses were logged with:
  tools/override.sh MISS:<name> "what the gate should have caught"

Usage:
  python3 tools/rollup.py [--log PATH] [--json] [--min-fires N]

Thresholds are deliberately crude. The pilot is a handful of engagements, not a
study; anything more precise would be false precision.
"""
import argparse
import collections
import json
import os
import sys

KEEP_MAX_OVERRIDE = 0.25   # <=25% overridden -> the rule is doing real work
DELETE_MIN_OVERRIDE = 0.60  # >=60% overridden -> the rule is noise


def load(path):
    if not os.path.exists(path):
        print("no findings log at %s - has the hook run yet?" % path, file=sys.stderr)
        sys.exit(2)
    rows = []
    for i, line in enumerate(open(path, encoding="utf-8"), 1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            print("skipping malformed line %d" % i, file=sys.stderr)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", default=".taste-pilot/findings.jsonl")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--min-fires", type=int, default=3,
                    help="below this many findings a rule stays UNPROVEN (default 3)")
    a = ap.parse_args()

    rows = load(a.log)
    fires = collections.Counter()
    runs = collections.Counter()
    overrides = collections.Counter()
    misses = []
    files = set()
    authors = set()

    for r in rows:
        rule = r.get("rule") or ""
        if r.get("layer") == "override":
            if rule.startswith("MISS:"):
                misses.append((rule[5:], r.get("detail", ""), r.get("author", "")))
            else:
                overrides[rule] += 1
            continue
        runs[rule] += 1
        if r.get("ok") is False:
            fires[rule] += 1
        if r.get("file"):
            files.add(r["file"])
        if r.get("author"):
            authors.add(r["author"])

    keep, delete, unproven, watch = [], [], [], []
    for rule in sorted(runs):
        f = fires[rule]
        o = overrides[rule]
        rate = (o / f) if f else 0.0
        rec = {"rule": rule, "evaluated": runs[rule], "findings": f,
               "overrides": o, "override_rate": round(rate, 2)}
        if f < a.min_fires:
            unproven.append(rec)
        elif rate <= KEEP_MAX_OVERRIDE:
            keep.append(rec)
        elif rate >= DELETE_MIN_OVERRIDE:
            delete.append(rec)
        else:
            watch.append(rec)

    for lst in (keep, delete, watch):
        lst.sort(key=lambda r: -r["findings"])
    unproven.sort(key=lambda r: r["rule"])

    if a.json:
        print(json.dumps({"keep": keep, "delete": delete, "watch": watch,
                          "unproven": unproven,
                          "forge_backlog": [{"name": n, "detail": d, "by": w}
                                            for n, d, w in misses],
                          "coverage": {"files": len(files),
                                       "contributors": len(authors),
                                       "log_lines": len(rows)}}, indent=2))
        return 0

    def table(title, rows_, note):
        print("\n\033[1m%s\033[0m  (%d)" % (title, len(rows_)))
        print("  " + note)
        if not rows_:
            print("  \033[2mnone\033[0m")
            return
        print("  %-20s %9s %9s %10s %s" % ("rule", "evaluated", "findings", "overrides", "override rate"))
        for r in rows_:
            print("  %-20s %9d %9d %10d %13s" % (
                r["rule"], r["evaluated"], r["findings"], r["overrides"],
                "%.0f%%" % (r["override_rate"] * 100) if r["findings"] else "-"))

    print("\n\033[1mtaste-pilot rollup\033[0m")
    print("  %d log lines, %d files touched, %d contributor(s)"
          % (len(rows), len(files), len(authors)))
    print("  a rule needs >=%d findings before this tool will judge it" % a.min_fires)
    if a.min_fires < 3:
        print("  \033[38;5;173mindicative only:\033[0m at --min-fires %d a single finding plus a"
              % a.min_fires)
        print("  single override reads as a 100% override rate. Do not delete a rule on this;")
        print("  use the default (3) or higher for a real decision.")

    table("KEEP", keep,
          "fired for real and was accepted. Carry into the overlay and, if you forge, into the skill.")
    table("DELETE", delete,
          "fired often and was almost always wrong. Remove it - do not tune it.")
    table("WATCH", watch,
          "genuinely mixed. Needs a human read of the override reasons before deciding.")
    never = [r for r in unproven if r["findings"] == 0]
    thin = [r for r in unproven if r["findings"] > 0]
    table("THIN", thin,
          "fired, but not enough times to judge. Keep collecting before deciding.")
    print("\n\033[1mNEVER FIRED\033[0m  (%d)" % len(never))
    print("  no evidence either way. Not a reason to delete, and not a reason to forge.")
    if never:
        names = [r["rule"] for r in never]
        line = "  "
        for nm in names:
            if len(line) + len(nm) > 92:
                print(line.rstrip(", ")); line = "  "
            line += nm + ", "
        print(line.rstrip(", "))
    else:
        print("  \033[2mnone - every rule fired at least once\033[0m")

    print("\n\033[1mFORGE BACKLOG\033[0m  (%d)" % len(misses))
    print("  reviewer catches the gate missed. This, and only this, is what a new skill should cover.")
    if not misses:
        print("  \033[2mnone logged. If reviews found nothing the gate missed, the gate is complete "
              "for now - which is also a result.\033[0m")
    for n, d, w in misses:
        print("  - %-22s %s  \033[2m(%s)\033[0m" % (n, d, w))

    thin_delete = [r for r in delete if r["findings"] < 3]
    if delete and not thin_delete:
        print("\n  \033[38;5;173mNote:\033[0m %d rule(s) are in DELETE. Removing them is the point, "
              "not a failure of the pilot." % len(delete))
    elif thin_delete:
        print("\n  \033[38;5;173mHold:\033[0m %d DELETE row(s) rest on fewer than 3 findings "
              "(%s)." % (len(thin_delete), ", ".join(r["rule"] for r in thin_delete)))
        print("  That is not enough to retire a rule. Keep collecting before acting on those.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
