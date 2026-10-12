#!/usr/bin/env bash
# Install staff-kit into ~/.claude as dotfiles.
#
# Default mode is --link: each component is a symlink into this checkout, so `git pull`
# updates the live library and edits in ~/.claude land in the repo. Use --copy for an
# independent copy.
#
# Safety contract:
#   - Never overwrites an existing file or directory unless --force is given.
#   - With --force, the existing item is MOVED to $TARGET/backups/staff-kit-<timestamp>/
#     before it is replaced. Nothing is deleted.
#   - Refuses any target path that resolves inside this checkout (that would create
#     symlink loops and move the repo's own files into backups/).
#   - --dry-run prints every action and performs none.
#   - Re-running is idempotent in both modes: a symlink that already points here, or a
#     copy whose content already matches, is left alone. Switching --link to --copy over
#     an earlier install needs --force (the links are backed up, then replaced by copies).
#   - settings.json is never edited here. Hooks are registered by scripts/merge-settings.py,
#     which you run separately and which also backs up first.
#
# Usage:
#   scripts/install.sh [--link|--copy] [--force] [--dry-run] [--with-memory] [--with-claude-md]
#                      [--target DIR]
#
#   --with-memory     also install memory/ (global memory seed files). Opt-in: personal.
#   --with-claude-md  also install templates/global-CLAUDE.md as $TARGET/CLAUDE.md. Opt-in.
#   --target DIR      install somewhere other than $HOME/.claude (used by tests).

set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${CLAUDE_HOME:-$HOME/.claude}"
MODE=link
FORCE=0
DRY=0
WITH_MEMORY=0
WITH_CLAUDE_MD=0

usage() { sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --link) MODE=link ;;
    --copy) MODE=copy ;;
    --force) FORCE=1 ;;
    --dry-run) DRY=1 ;;
    --with-memory) WITH_MEMORY=1 ;;
    --with-claude-md) WITH_CLAUDE_MD=1 ;;
    --target) shift; TARGET="${1:?--target needs a directory}" ;;
    -h|--help) usage 0 ;;
    *) echo "unknown option: $1" >&2; usage 2 ;;
  esac
  shift
done

# Absolute target. If it exists, resolve symlinks so the overlap check below is honest.
case "$TARGET" in /*) ;; *) TARGET="$PWD/$TARGET" ;; esac
if [ -d "$TARGET" ]; then TARGET="$(cd "$TARGET" && pwd -P)"; fi
case "$TARGET/" in
  "$KIT"/*) echo "ERROR: target $TARGET resolves inside the kit checkout $KIT. Refusing." >&2; exit 2 ;;
esac

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET/backups/staff-kit-$TS"
N_LINKED=0; N_COPIED=0; N_UNCHANGED=0; N_SKIPPED=0; N_BACKED=0; N_ERR=0

say()  { printf '  %-10s %s\n' "$1" "$2"; }
run()  { if [ "$DRY" = 1 ]; then say "DRY-RUN" "$*"; else "$@"; fi; }

# True when DEST is already what MODE would produce for SRC.
already_installed() {
  local src="$1" dest="$2"
  if [ "$MODE" = link ]; then
    [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]
  else
    [ ! -L "$dest" ] && [ -e "$dest" ] && diff -rq "$src" "$dest" >/dev/null 2>&1
  fi
}

# install_item SRC DEST
install_item() {
  local src="$1" dest="$2" rel parent real
  rel="${dest#"$TARGET"/}"

  # A dest whose parent resolves into the checkout (e.g. $TARGET/rules is a symlink to
  # $KIT/rules) would make us back up and replace our own source file. Refuse it.
  parent="$(dirname "$dest")"
  if [ -e "$parent" ]; then
    real="$(cd "$parent" && pwd -P)"
    case "$real/" in
      "$KIT"/*) say "ERROR" "$rel resolves inside the kit checkout ($real); refusing"; N_ERR=$((N_ERR + 1)); return 0 ;;
    esac
  fi

  if already_installed "$src" "$dest"; then
    N_UNCHANGED=$((N_UNCHANGED + 1)); return 0
  fi

  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if [ "$FORCE" = 0 ]; then
      if [ "$MODE" = copy ] && [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
        say "SKIP" "$rel is a link into this checkout (use --force to convert it to a copy)"
      else
        say "SKIP" "$rel exists (use --force to replace; it would be backed up first)"
      fi
      N_SKIPPED=$((N_SKIPPED + 1)); return 0
    fi
    run mkdir -p "$BACKUP/$(dirname "$rel")"
    run mv "$dest" "$BACKUP/$rel"
    say "BACKUP" "$rel -> backups/staff-kit-$TS/$rel"
    N_BACKED=$((N_BACKED + 1))
  fi

  run mkdir -p "$parent"
  if [ "$MODE" = link ]; then
    run ln -s "$src" "$dest"
    say "LINK" "$rel"
    N_LINKED=$((N_LINKED + 1))
  else
    run cp -R "$src" "$dest"
    say "COPY" "$rel"
    N_COPIED=$((N_COPIED + 1))
  fi
}

echo "staff-kit install"
echo "  source : $KIT"
echo "  target : $TARGET"
echo "  mode   : $MODE$( [ "$FORCE" = 1 ] && printf ' (force)' )$( [ "$DRY" = 1 ] && printf ' (dry-run)' )"
echo

for d in "$KIT"/skills/*/; do
  d="${d%/}"; install_item "$d" "$TARGET/skills/$(basename "$d")"
done
for f in "$KIT"/agents/*.md "$KIT"/commands/*.md "$KIT"/rules/*.md "$KIT"/contexts/*.md; do
  install_item "$f" "$TARGET/$(basename "$(dirname "$f")")/$(basename "$f")"
done
for f in "$KIT"/hooks/*.js; do
  install_item "$f" "$TARGET/hooks/$(basename "$f")"
done
if [ "$WITH_MEMORY" = 1 ]; then
  for f in "$KIT"/memory/*.md; do install_item "$f" "$TARGET/memory/$(basename "$f")"; done
fi
if [ "$WITH_CLAUDE_MD" = 1 ]; then
  install_item "$KIT/templates/global-CLAUDE.md" "$TARGET/CLAUDE.md"
fi

echo
if [ "$DRY" = 1 ]; then
  echo "summary (dry-run, nothing was changed; a real run would do): linked=$N_LINKED copied=$N_COPIED unchanged=$N_UNCHANGED skipped=$N_SKIPPED backed-up=$N_BACKED errors=$N_ERR"
else
  echo "summary: linked=$N_LINKED copied=$N_COPIED unchanged=$N_UNCHANGED skipped=$N_SKIPPED backed-up=$N_BACKED errors=$N_ERR"
fi
[ "$N_BACKED" -gt 0 ] && echo "backups : $BACKUP"
echo
echo "next:"
if [ "$TARGET" = "$HOME/.claude" ]; then
  echo "  1. Register the hooks (prints the snippet; --apply merges it with a backup):"
  echo "       python3 $KIT/scripts/merge-settings.py --print"
  echo "       python3 $KIT/scripts/merge-settings.py --apply"
else
  echo "  1. Register the hooks in this target's settings (prints the snippet; --apply merges it with a backup):"
  echo "       python3 $KIT/scripts/merge-settings.py --print --hook-dir '$TARGET/hooks'"
  echo "       python3 $KIT/scripts/merge-settings.py --apply --settings '$TARGET/settings.json' --hook-dir '$TARGET/hooks'"
fi
echo "  2. Restart Claude Code. Run /standards to confirm the library is visible."
[ "$N_SKIPPED" -gt 0 ] && echo "  3. $N_SKIPPED item(s) were skipped because they already exist. Re-run with --force to replace them (backed up first)."
[ "$N_ERR" -gt 0 ] && { echo "  !  $N_ERR item(s) refused: their target path resolves inside the kit checkout." >&2; exit 1; }
exit 0
