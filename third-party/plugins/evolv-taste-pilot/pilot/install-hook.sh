#!/usr/bin/env bash
# Wire the advisory gate into this repository.
#
#   ./tools/install-hook.sh          # install into .git/hooks/pre-commit
#   ./tools/install-hook.sh --check  # verify prerequisites, install nothing
#
# Safe to re-run. If a pre-commit hook already exists it is backed up, never clobbered.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SRC="$HERE/hooks/pre-commit"
HOOK_DST="$ROOT/.git/hooks/pre-commit"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

ok(){ printf '  \033[32mok\033[0m    %s\n' "$1"; }
warn(){ printf '  \033[38;5;173mwarn\033[0m  %s\n' "$1"; }
bad(){ printf '  \033[31mmiss\033[0m  %s\n' "$1"; }

echo ""
echo "taste-pilot prerequisites"

FATAL=0
command -v python3 >/dev/null && ok "python3 $(python3 -V 2>&1 | awk '{print $2}')" \
  || { bad "python3 not found - ship_gate.py needs it"; FATAL=1; }

if command -v node >/dev/null; then
  ok "node $(node -v)"
  if node -e "require.resolve('playwright')" 2>/dev/null; then
    ok "playwright resolvable - rendered checks will run"
  else
    warn "playwright not installed - rendered checks will skip (source checks still run)"
    warn "  to enable: npm i -D playwright && npx playwright install chromium"
  fi
else
  warn "node not found - rendered checks will skip, source checks still run"
fi

BROWSER=""
for c in "${CHROME_PATH:-}" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/usr/bin/chromium" "/usr/bin/google-chrome"; do
  [ -n "$c" ] && [ -x "$c" ] && { BROWSER="$c"; break; }
done
[ -n "$BROWSER" ] && ok "browser: $BROWSER" || warn "no system browser found - playwright's own chromium will be tried"

[ -f "$HERE/ship_gate.py" ] && ok "ship_gate.py present" || { bad "tools/ship_gate.py missing"; FATAL=1; }
[ -f "$HERE/render_probe.mjs" ] && ok "render_probe.mjs present" || warn "tools/render_probe.mjs missing - rendered checks unavailable"
if [ -f "$ROOT/docs/evolv-taste-overlay.md" ]; then
  ok "overlay reachable (repo docs/)"
elif [ -f "$HOME/.claude/docs/evolv-taste-overlay.md" ]; then
  ok "overlay reachable (~/.claude/docs/)"
else
  warn "evolv-taste-overlay.md not in docs/ or ~/.claude/docs/ - the agent will not see the precedence rules"
fi

[ "$FATAL" = "1" ] && { echo ""; echo "  fatal prerequisites missing. Not installing."; exit 1; }
[ "$CHECK_ONLY" = "1" ] && { echo ""; echo "  check only, nothing installed."; exit 0; }

if [ -e "$HOOK_DST" ] && ! grep -q "taste-pilot advisory pre-commit hook" "$HOOK_DST" 2>/dev/null; then
  BACKUP="$HOOK_DST.pre-taste-pilot.$(date +%s)"
  mv "$HOOK_DST" "$BACKUP"
  warn "existing pre-commit hook backed up to $(basename "$BACKUP")"
  warn "  chain it manually if you still need it"
fi

mkdir -p "$ROOT/.git/hooks"
cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST" "$HERE/override.sh" 2>/dev/null || true
ok "installed advisory pre-commit hook"

if [ -f "$ROOT/.gitignore" ] && ! grep -q '^\.taste-pilot/' "$ROOT/.gitignore"; then
  printf '\n# taste-pilot local findings log\n.taste-pilot/\n' >> "$ROOT/.gitignore"
  ok "added .taste-pilot/ to .gitignore"
fi

cat <<'EOF'

  Wired. The hook is ADVISORY - it never blocks a commit.

  Next:
    - commit a front-end file and watch it report
    - when a rule is wrong:  tools/override.sh <rule> "why"
    - at the end of the pilot: python3 tools/rollup.py

EOF
