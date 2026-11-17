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

echo "== index sync (counts and lists in README, manifests, INVENTORY, standards)"
python3 scripts/sync-index.py --check || fail "indexes are stale; run: python3 scripts/sync-index.py --write"
python3 -B scripts/test_sync_index.py 2>&1 | tail -3
python3 -B scripts/test_sync_index.py >/dev/null 2>&1 || fail "scripts/test_sync_index.py failed"

echo "== bundled evidence-gated-validation copy"
EGV_SRC="${EGV_SRC:-$HOME/dev/evidence-gated-validation}"
if [ -d "$EGV_SRC" ]; then
  diff -rq --exclude=.git "$EGV_SRC" skills/evidence-gated-validation >/dev/null \
    || fail "bundled evidence-gated-validation copy differs from $EGV_SRC (rsync the EGV repo into the bundled copy)"
  echo "  ok bundled copy identical to $EGV_SRC (whole tree, .git excluded)"
else
  echo "  WARN: $EGV_SRC not present; bundled-copy identity check SKIPPED (set EGV_SRC to the evidence-gated-validation checkout)"
fi

echo "== hook tests"
node --test hooks/*.test.js

echo "== plugins/* (manifest, frontmatter, bundled tests, claude plugin validate)"
for pdir in plugins/*/; do
  [ -f "$pdir.claude-plugin/plugin.json" ] || continue
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$pdir.claude-plugin/plugin.json" \
    || fail "invalid JSON: $pdir.claude-plugin/plugin.json"
  python3 - "$pdir" <<'PY' || fail "frontmatter: $pdir"
import glob, re, sys
root, bad = sys.argv[1], []
def fm(path):
    m = re.match(r"^---\n(.*?)\n---\n", open(path, encoding="utf-8").read(), re.S)
    return m.group(1) if m else ""
for p in glob.glob(root + "skills/*/SKILL.md"):
    if not re.search(r"^name:", fm(p), re.M) or not re.search(r"^description:", fm(p), re.M):
        bad.append(f"{p}: needs name and description")
for p in glob.glob(root + "agents/*.md"):
    if not re.search(r"^model:\s*(opus|sonnet|haiku|fable)", fm(p), re.M):
        bad.append(f"{p}: needs an explicit model")
for p in glob.glob(root + "commands/*.md"):
    if not re.search(r"^description:", fm(p), re.M):
        bad.append(f"{p}: needs description")
print("\n".join("  " + b for b in bad) or f"  ok frontmatter {root}")
sys.exit(1 if bad else 0)
PY
  while IFS= read -r t; do
    ( cd "$(dirname "$t")" && python3 -B "$(basename "$t")" >/dev/null 2>&1 ) || fail "tests failed: $t"
    echo "  ok $t"
  done < <(find "$pdir" -name 'test_*.py' -not -path '*/node_modules/*' | sort)
  if command -v claude >/dev/null 2>&1; then
    claude plugin validate --strict "$KIT/$pdir.claude-plugin/plugin.json" || fail "claude plugin validate: $pdir"
  fi
done

if command -v claude >/dev/null 2>&1; then
  echo "== claude plugin validate --strict (plugin manifest, then marketplace manifest)"
  claude plugin validate --strict "$KIT/.claude-plugin/plugin.json"
  claude plugin validate --strict "$KIT/.claude-plugin/marketplace.json"
else
  echo "== claude CLI not on PATH; skipped manifest validation (run it locally)"
fi
echo "all checks passed"
