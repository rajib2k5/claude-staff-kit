#!/usr/bin/env bash
# memguard.sh - run ONE heavy command under a memory guard and a single-job lock.
#
# Usage: memguard.sh [options] -- COMMAND [ARGS...]
#   --max-rss-gb N       kill the job if its process group uses more than N GB RSS (default: 0 = off)
#   --min-avail-gb N     refuse to start, and kill the job, if MemAvailable drops below N GB (default: 4)
#   --interval-s N       seconds between checks (default: 2)
#   --log FILE           log file (default: ./memguard.log)
#   --lock FILE          lock file (default: ${TMPDIR:-/tmp}/memguard.lock)
#   --no-lock            skip the lock (use only for a job that is known to be light)
# Env defaults: MEMGUARD_MAX_RSS_GB, MEMGUARD_MIN_AVAIL_GB, MEMGUARD_INTERVAL_S, MEMGUARD_LOG, MEMGUARD_LOCK.
# Test hook: MEMGUARD_MEMINFO overrides /proc/meminfo.
#
# Exit codes: the child's own code; 97 refused (memory below floor); 98 lock held; 99 killed by the
# guard; 64 bad usage.
#
# The guard kills only its own child process group, by PGID. It never uses pkill -f or pgrep -f:
# those match the calling shell's own command line and kill it.
set -u

max_rss_gb="${MEMGUARD_MAX_RSS_GB:-0}"
min_avail_gb="${MEMGUARD_MIN_AVAIL_GB:-4}"
interval_s="${MEMGUARD_INTERVAL_S:-2}"
log="${MEMGUARD_LOG:-./memguard.log}"
lock="${MEMGUARD_LOCK:-${TMPDIR:-/tmp}/memguard.lock}"
use_lock=1
meminfo="${MEMGUARD_MEMINFO:-/proc/meminfo}"

usage() { sed -n '2,16p' "$0" >&2; exit 64; }
while [ $# -gt 0 ]; do
  case "$1" in
    --max-rss-gb) max_rss_gb="${2:?}"; shift 2 ;;
    --min-avail-gb) min_avail_gb="${2:?}"; shift 2 ;;
    --interval-s) interval_s="${2:?}"; shift 2 ;;
    --log) log="${2:?}"; shift 2 ;;
    --lock) lock="${2:?}"; shift 2 ;;
    --no-lock) use_lock=0; shift ;;
    --) shift; break ;;
    -h|--help) usage ;;
    *) echo "memguard: unknown option $1" >&2; usage ;;
  esac
done
[ $# -gt 0 ] || { echo "memguard: no command after --" >&2; usage; }

stamp() { date +%T; }
say() { echo "$(stamp) $*" >> "$log"; }
avail_mb() { awk '/^MemAvailable:/ {print int($2/1024)}' "$meminfo"; }
# GB (may be fractional) to MB, integer.
to_mb() { awk -v g="$1" 'BEGIN {printf "%d", g*1024}'; }
# Sum of RSS (MB) over every process in group $1. ps -g selects by process group.
group_rss_mb() { ps -o rss= -g "$1" 2>/dev/null | awk '{s+=$1} END {printf "%d", s/1024}'; }

floor_mb=$(to_mb "$min_avail_gb")
cap_mb=$(to_mb "$max_rss_gb")

av=$(avail_mb)
if [ "$av" -lt "$floor_mb" ]; then
  say "REFUSED start: avail_mb=$av below floor_mb=$floor_mb cmd=$*"
  echo "memguard: refusing to start, ${av} MB available is below the ${floor_mb} MB floor" >&2
  exit 97
fi

if [ "$use_lock" -eq 1 ]; then
  exec 9>"$lock"
  if ! flock -n 9; then
    say "REFUSED start: lock $lock is held cmd=$*"
    echo "memguard: another heavy job holds $lock; run one at a time" >&2
    exit 98
  fi
fi

# setsid makes the child a session and group leader, so its PID is its PGID.
# fd 9 (the lock) is closed in the child so a daemonised grandchild cannot keep the lock.
setsid "$@" 9>&- &
child=$!
say "START pid=$child pgid=$child avail_mb=$av cap_mb=$cap_mb floor_mb=$floor_mb cmd=$*"

killed=0
kill_group() {
  # TERM the group, wait up to 5 s, then KILL. Negative PID means the whole group.
  kill -TERM -- "-$child" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$child" 2>/dev/null || break
    sleep 0.5
  done
  # Always KILL the group last: the leader may be gone while a grandchild lives on.
  kill -KILL -- "-$child" 2>/dev/null
}
on_signal() { say "SIGNAL received, killing group $child"; killed=1; kill_group; }
trap on_signal INT TERM

while kill -0 "$child" 2>/dev/null; do
  av=$(avail_mb)
  rss=$(group_rss_mb "$child")
  say "avail_mb=$av rss_mb=$rss"
  if [ "$av" -lt "$floor_mb" ]; then
    say "KILLED group $child: avail_mb=$av below floor_mb=$floor_mb"
    killed=1; kill_group; break
  fi
  if [ "$cap_mb" -gt 0 ] && [ "$rss" -gt "$cap_mb" ]; then
    say "KILLED group $child: rss_mb=$rss above cap_mb=$cap_mb"
    killed=1; kill_group; break
  fi
  sleep "$interval_s" &
  wait $! 2>/dev/null
done

wait "$child" 2>/dev/null
code=$?
say "END exit=$code killed=$killed"
[ "$killed" -eq 1 ] && exit 99
exit "$code"
