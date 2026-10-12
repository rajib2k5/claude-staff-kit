#!/usr/bin/env bash
# Record that a gate finding was wrong, and why.
#
# This is the single most important file in the pilot. A rule that fires often and
# is always overridden is a bad rule and should be deleted; a rule that fires often
# and is always accepted is the one to keep. Neither judgement is possible without
# this log.
#
#   tools/override.sh eyebrow "client brand mandates a label above every section"
#   tools/override.sh emdash  "legal copy, dash is in the contract wording"
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: tools/override.sh <rule-name> \"reason it was wrong\"" >&2
  echo "" >&2
  echo "rules that have fired in this repo:" >&2
  LOG="$(git rev-parse --show-toplevel)/.taste-pilot/findings.jsonl"
  if [ -f "$LOG" ]; then
    python3 -c "
import json,sys,collections
c=collections.Counter()
for l in open('$LOG'):
    d=json.loads(l)
    if not d['ok']: c[d['rule']]+=1
for r,n in c.most_common(): print('  %-20s %d finding(s)' % (r,n))
" >&2
  else
    echo "  (none yet)" >&2
  fi
  exit 2
fi

RULE="$1"; shift
REASON="$*"
ROOT="$(git rev-parse --show-toplevel)"
mkdir -p "$ROOT/.taste-pilot"
python3 - "$ROOT/.taste-pilot/findings.jsonl" "$RULE" "$REASON" <<'PYEOF'
import json, sys, datetime, subprocess
log, rule, reason = sys.argv[1:4]
who = subprocess.run(["git", "config", "user.email"], capture_output=True,
                     text=True).stdout.strip() or "unknown"
with open(log, "a", encoding="utf-8") as fh:
    fh.write(json.dumps({
        "ts": datetime.datetime.now(datetime.timezone.utc)
                 .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "author": who, "layer": "override", "file": None, "rule": rule,
        "ok": None, "detail": reason, "override": True,
    }) + "\n")
print("recorded override for %r: %s" % (rule, reason))
PYEOF
