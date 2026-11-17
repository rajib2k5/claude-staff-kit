#!/usr/bin/env bash
# Report how far vendored copies of kit skills have drifted from the kit.
# Report only: this script never writes, deletes or syncs anything.
#
# Usage: bash scripts/kit-drift.sh [ROOT]      (ROOT defaults to ~/dev)
#
# For every skill in the kit's skills/ it looks for copies at
#   ROOT/*/.claude/skills/<skill>/   and   ROOT/*/*/.claude/skills/<skill>/
# skips ROOT/all-repos and the kit itself, skips copies that are symlinks into the kit,
# compares each copy with `diff -rq` and prints one row per copy.
set -uo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
ROOT="${1:-$HOME/dev}"
[ -d "$ROOT" ] || { echo "kit-drift: no such directory: $ROOT" >&2; exit 2; }
ROOT="$(cd "$ROOT" && pwd -P)"

rows=()
identical=0
drifted=0
for kit_skill in "$KIT"/skills/*/; do
  name="$(basename "$kit_skill")"
  for copy in "$ROOT"/*/.claude/skills/"$name" "$ROOT"/*/*/.claude/skills/"$name"; do
    [ -d "$copy" ] || continue
    real="$(cd "$copy" && pwd -P)"
    case "$real/" in "$KIT"/*) continue ;; esac            # the kit itself, or a link into it
    case "$copy" in "$ROOT/all-repos/"*|"$KIT"/*) continue ;; esac
    [ -L "$copy" ] && case "$(readlink -f "$copy")/" in "$KIT"/*) continue ;; esac
    repo="${copy%/.claude/skills/$name}"
    repo="${repo#"$ROOT"/}"
    # diff -rq prints one line per differing or one-sided file; count those lines.
    out="$(diff -rq "$kit_skill" "$copy" 2>&1)"
    if [ -z "$out" ]; then
      rows+=("$repo|$name|IDENTICAL")
      identical=$((identical + 1))
    else
      n="$(printf '%s\n' "$out" | grep -c .)"
      rows+=("$repo|$name|DRIFTED ($n differing file(s))")
      drifted=$((drifted + 1))
    fi
  done
done

printf '%-52s %-34s %s\n' "REPO" "SKILL" "STATUS"
if [ "${#rows[@]}" -gt 0 ]; then
  printf '%s\n' "${rows[@]}" | sort | while IFS='|' read -r repo name status; do
    printf '%-52s %-34s %s\n' "$repo" "$name" "$status"
  done
fi
echo
echo "kit: $KIT"
echo "root: $ROOT"
echo "copies found: ${#rows[@]} ($identical identical, $drifted drifted)"
