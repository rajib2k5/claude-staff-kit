#!/usr/bin/env bash
# Validate the kit: manifests, JSON, frontmatter, scripts, and the hook test suite.
# Exit non-zero on the first failure. Run before every commit; CI runs the same steps.
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$KIT"
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== JSON"
for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json hooks/hooks.json docs/recommended-plugins.json; do
  [ -f "$f" ] || fail "missing $f"
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" || fail "invalid JSON: $f"
  echo "  ok $f"
done

echo "== frontmatter"
python3 - <<'PY'
import glob, re, sys
bad = []
def fm(path):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    return m.group(1) if m else None
for p in sorted(glob.glob("skills/*/SKILL.md")):
    f = fm(p)
    if not f or not re.search(r"^name:", f, re.M) or not re.search(r"^description:", f, re.M):
        bad.append(f"{p}: needs name and description")
for p in sorted(glob.glob("agents/*.md")):
    f = fm(p)
    if not f or not re.search(r"^model:\s*(opus|sonnet|haiku|fable)", f, re.M):
        bad.append(f"{p}: needs an explicit model: opus|sonnet|haiku|fable")
    if not f or not re.search(r"^description:", f, re.M):
        bad.append(f"{p}: needs description")
for p in sorted(glob.glob("commands/*.md")):
    f = fm(p)
    if not f or not re.search(r"^description:", f, re.M):
        bad.append(f"{p}: needs description")
if bad:
    print("\n".join("  " + b for b in bad)); sys.exit(1)
print(f"  ok {len(glob.glob('skills/*/SKILL.md'))} skills, {len(glob.glob('agents/*.md'))} agents, {len(glob.glob('commands/*.md'))} commands")
PY

echo "== shell syntax"
for f in scripts/*.sh adapters/cortex/bootstrap.sh; do bash -n "$f" || fail "syntax: $f"; echo "  ok $f"; done
python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read())' scripts/merge-settings.py && echo "  ok scripts/merge-settings.py"

echo "== hook tests"
node --test hooks/*.test.js

if command -v claude >/dev/null 2>&1; then
  echo "== claude plugin validate --strict (plugin manifest, then marketplace manifest)"
  claude plugin validate --strict "$KIT/.claude-plugin/plugin.json"
  claude plugin validate --strict "$KIT/.claude-plugin/marketplace.json"
else
  echo "== claude CLI not on PATH; skipped manifest validation (run it locally)"
fi
echo "all checks passed"
