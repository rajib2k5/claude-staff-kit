#!/usr/bin/env python3
"""
_record.py - internal helper for the pre-commit hook.

Reads a gate's --json output from a file, prints the failures for a human, and appends
every check (pass and fail) to the findings log so rollup.py can compute an override rate
against a real denominator.

  python3 _record.py <json-file> <layer:source|rendered> <log-path> <parent-sha> <author> <ts>

Prints failures to stdout and the fail count to stderr as FAILCOUNT=<n>, so the hook can
show output and read the count without parsing what it shows.
"""
import json
import os
import sys

ORANGE = "\033[38;5;173m"
DIM = "\033[2m"
RESET = "\033[0m"


def main():
    if len(sys.argv) < 7:
        print("FAILCOUNT=0", file=sys.stderr)
        return 0
    json_file, layer, log, sha, who, stamp = sys.argv[1:7]

    if not os.path.exists(json_file) or os.path.getsize(json_file) == 0:
        print("  %s?%s %-19s gate produced no output (see it directly with --json)"
              % (ORANGE, RESET, layer))
        print("FAILCOUNT=0", file=sys.stderr)
        return 0

    try:
        with open(json_file, encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as e:
        print("  %s?%s %-19s gate output was not valid JSON (%s)"
              % (ORANGE, RESET, layer, e))
        print("FAILCOUNT=0", file=sys.stderr)
        return 0

    rows = []
    if layer == "source":
        for f in data.get("files", []):
            for c in f.get("results", []):
                rows.append((f.get("file", "?"), c))
    else:
        for c in data.get("checks", []):
            rows.append((data.get("file", "?"), c))

    os.makedirs(os.path.dirname(log) or ".", exist_ok=True)
    with open(log, "a", encoding="utf-8") as fh:
        for fp, c in rows:
            fh.write(json.dumps({
                "ts": stamp, "commit_parent": sha, "author": who, "layer": layer,
                "file": fp, "rule": c.get("rule"), "ok": c.get("ok"),
                "detail": c.get("detail", ""), "override": None,
            }) + "\n")

    fails = [(fp, c) for fp, c in rows if not c.get("ok")]
    for _fp, c in fails:
        print("  %s!%s %-19s %s" % (ORANGE, RESET, c.get("rule", "?"), c.get("detail", "")))
        prov = c.get("provenance")
        if prov:
            print("    %s%s%s" % (DIM, prov, RESET))

    print("FAILCOUNT=%d" % len(fails), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
