#!/usr/bin/env bash
# Install the curated marketplace plugins listed in docs/recommended-plugins.json.
#
#   scripts/install-plugins.sh [--tier install|evaluate|all] [--dry-run]
#
# Default tier is "install" (the low-cost, direct-fit set). "evaluate" installs the heavier
# or account-dependent set. Each plugin is installed with
#   claude plugin install <name>@<marketplace>
# which is reversible with `claude plugin uninstall <name>@<marketplace>`.
# Installing changes ~/.claude/settings.json (enabledPlugins) through the Claude CLI itself.

set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
LIST="$KIT/docs/recommended-plugins.json"
TIER=install
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --tier) shift; TIER="${1:?--tier needs install|evaluate|all}" ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

command -v claude >/dev/null 2>&1 || { echo "claude CLI not found on PATH" >&2; exit 1; }
[ -f "$LIST" ] || { echo "missing $LIST" >&2; exit 1; }

MARKET="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["marketplace"])' "$LIST")"
NAMES="$(python3 - "$LIST" "$TIER" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); tier = sys.argv[2]
tiers = d["tiers"]
names = tiers["install"] + tiers["evaluate"] if tier == "all" else tiers[tier]
print("\n".join(names))
PY
)"

echo "marketplace: $MARKET   tier: $TIER"
FAIL=0
for name in $NAMES; do
  if [ "$DRY" = 1 ]; then
    echo "  DRY-RUN claude plugin install $name@$MARKET"
    continue
  fi
  if claude plugin install "$name@$MARKET"; then
    echo "  installed $name"
  else
    echo "  FAILED    $name" >&2; FAIL=$((FAIL + 1))
  fi
done
[ "$FAIL" = 0 ] || { echo "$FAIL plugin(s) failed to install" >&2; exit 1; }
echo "done. Restart Claude Code to load them."
