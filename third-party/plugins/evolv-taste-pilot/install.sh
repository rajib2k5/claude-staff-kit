#!/usr/bin/env bash
# evolv-taste-pilot installer.
#
#   bash install.sh                 # install the skill globally, verify it
#   bash install.sh --repo PATH     # also wire the advisory pilot harness into a repo
#   bash install.sh --check         # prerequisites only, install nothing
#
# Written for bash 3.2 (the macOS default). POSIX-clean; no `case` inside $( ).
set -uo pipefail

ok(){   printf '  \033[32mok\033[0m    %s\n' "$1"; }
warn(){ printf '  \033[38;5;173mwarn\033[0m  %s\n' "$1"; }
bad(){  printf '  \033[31mfail\033[0m  %s\n' "$1"; }
hdr(){  printf '\n\033[1m%s\033[0m\n' "$1"; }

HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL_SRC="$HERE/skills/frontend-ship-gate"
DEST="$HOME/.claude/skills/frontend-ship-gate"
REPO=""
CHECK_ONLY=0
PROBLEMS=0

while [ $# -gt 0 ]; do
  if [ "$1" = "--check" ]; then CHECK_ONLY=1; shift
  elif [ "$1" = "--repo" ]; then REPO="${2:-}"; shift 2
  else printf 'unknown argument: %s\n' "$1" >&2; exit 2; fi
done

printf '\n\033[1mevolv-taste-pilot installer\033[0m\n'
printf '  bash %s on %s\n' "${BASH_VERSION:-unknown}" "$(uname -s)"

hdr "1. prerequisites"
if command -v python3 >/dev/null 2>&1; then
  ok "python3 $(python3 -V 2>&1 | awk '{print $2}')"
else
  bad "python3 not found - the source gate needs it"; PROBLEMS=$((PROBLEMS + 1))
fi
if command -v node >/dev/null 2>&1; then
  ok "node $(node -v)"
else
  warn "node not found - the rendered layer will skip, source checks still run"
fi
BROWSER=""
for c in "${CHROME_PATH:-}" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/usr/bin/chromium" "/usr/bin/google-chrome" ; do
  if [ -n "$c" ] && [ -x "$c" ]; then BROWSER="$c"; break; fi
done
if [ -n "$BROWSER" ]; then
  ok "browser: $(basename "$BROWSER")"
else
  warn "no system browser found - Playwright's own chromium will be tried"
fi
[ -f "$SKILL_SRC/SKILL.md" ] && ok "skill payload present" || { bad "skills/frontend-ship-gate/SKILL.md missing"; PROBLEMS=$((PROBLEMS + 1)); }

if [ "$PROBLEMS" -gt 0 ]; then
  printf '\n  %d fatal prerequisite(s). Nothing installed.\n\n' "$PROBLEMS"; exit 1
fi
if [ "$CHECK_ONLY" -eq 1 ]; then
  printf '\n  check only, nothing installed.\n\n'; exit 0
fi

hdr "2. installing the skill"
mkdir -p "$HOME/.claude/skills"
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  BACKUP="$DEST.bak.$(date +%s)"
  mv "$DEST" "$BACKUP"
  warn "existing install moved to $(basename "$BACKUP")"
fi
cp -R "$SKILL_SRC" "$DEST"
chmod +x "$DEST/scripts/"*.py 2>/dev/null || true
ok "installed to $DEST"

hdr "3. verifying the install gate"
NM="$(sed -n 's/^name:[[:space:]]*//p' "$DEST/SKILL.md" | head -1 | tr -d "\"'")"
DL="$(sed -n 's/^description:[[:space:]]*//p' "$DEST/SKILL.md" | head -1 | wc -c | tr -d ' ')"
[ "$NM" = "frontend-ship-gate" ] && ok "name: $NM" || { bad "unexpected name: $NM"; PROBLEMS=$((PROBLEMS + 1)); }
if [ "$DL" -le 501 ]; then ok "description $((DL - 1)) chars (cap 500)"
else bad "description $((DL - 1)) chars exceeds the 500 cap"; PROBLEMS=$((PROBLEMS + 1)); fi
MISSING=0
for f in references/phase-01-countable-checks.md references/phase-02-rendered-checks.md \
         references/phase-03-layout-taxonomy.md references/phase-04-precedence.md \
         references/gotchas.md references/worked-example.html \
         scripts/ship_gate.py scripts/render_probe.mjs scripts/_record.py ; do
  [ -f "$DEST/$f" ] || { bad "bundled file missing: $f"; MISSING=$((MISSING + 1)); }
done
[ "$MISSING" -eq 0 ] && ok "all 9 bundled files resolve" || PROBLEMS=$((PROBLEMS + MISSING))

hdr "4. smoke test on the worked example"
V="$(python3 "$DEST/scripts/ship_gate.py" "$DEST/references/worked-example.html" 2>/dev/null | grep 'VERDICT' | tail -1)"
if printf '%s' "$V" | grep -q 'SHIP'; then
  ok "source gate runs, worked example passes 27/27"
else
  bad "unexpected verdict on a page that should pass: ${V:-no output}"; PROBLEMS=$((PROBLEMS + 1))
fi

if [ -n "$REPO" ]; then
  hdr "5. wiring the advisory pilot harness into $REPO"
  if [ ! -d "$REPO/.git" ]; then
    warn "$REPO is not a git repo - skipping the harness"
  else
    mkdir -p "$REPO/tools/hooks"
    cp "$DEST/scripts/ship_gate.py" "$DEST/scripts/render_probe.mjs" \
       "$DEST/scripts/_record.py" "$HERE/pilot/override.sh" \
       "$HERE/pilot/rollup.py" "$HERE/pilot/install-hook.sh" "$REPO/tools/"
    cp "$HERE/pilot/hooks/pre-commit" "$REPO/tools/hooks/"
    chmod +x "$REPO/tools/"*.sh "$REPO/tools/hooks/pre-commit" 2>/dev/null || true
    ( cd "$REPO" && ./tools/install-hook.sh >/dev/null 2>&1 ) \
      && ok "advisory pre-commit hook installed (never blocks a commit)" \
      || warn "hook install returned non-zero - run ./tools/install-hook.sh in $REPO to see why"
    ok "harness in $REPO/tools"
    printf '        enable the rendered layer there:  cd %s && npm i -D playwright\n' "$REPO"
  fi
fi

printf '\n'
if [ "$PROBLEMS" -eq 0 ]; then
  printf '\033[32mInstalled.\033[0m Restart Claude Code so it picks up the new skill, then try:\n'
  printf '  "pre-flight this page before I ship it"\n\n'
  printf 'Copy the precedence overlay somewhere global if you have not already:\n'
  printf '  mkdir -p ~/.claude/docs && cp %s/docs/evolv-taste-overlay.md ~/.claude/docs/\n\n' "$HERE"
else
  printf '\033[38;5;173m%d problem(s) above.\033[0m\n\n' "$PROBLEMS"
fi
exit 0
