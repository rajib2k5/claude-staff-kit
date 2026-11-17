#!/usr/bin/env bash
# Tests for memguard.sh. Fast (<20 s) and safe: the biggest allocation is 120 MB, in steps.
# Run: bash skills/heavy-job/test_memguard.sh
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
MG="$here/memguard.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fails=0
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: expected '$2' got '$3'"; fails=$((fails+1)); fi
}
run() { bash "$MG" --interval-s 0.2 --log "$work/log" --lock "$work/lock" --min-avail-gb 0 "$@"; }

# 1. exit code passes through
run -- bash -c 'exit 7'; check "exit code passthrough (7)" 7 $?
run -- true;             check "exit code passthrough (0)" 0 $?

# 2. a child over the RSS cap is killed (cap 40 MB; child grows to 120 MB in 10 MB steps)
start=$SECONDS
run --max-rss-gb 0.04 -- python3 -c '
import time
keep = []
for _ in range(12):
    keep.append(bytearray(10 * 1024 * 1024))
    for i in range(0, len(keep[-1]), 4096):
        keep[-1][i] = 1
    time.sleep(0.3)
time.sleep(5)
open("'"$work"'/survived", "w").close()
'
check "kill path returns 99" 99 $?
[ -e "$work/survived" ]; check "killed child never reached its end" 1 $?
check "kill path is quick (<8 s)" 1 $(( SECONDS - start < 8 ))
grep -q 'KILLED group' "$work/log"; check "kill logged" 0 $?

# 3. the kill takes the grandchildren too, and does not touch an unrelated process
sleep 30 & bystander=$!
run --max-rss-gb 0.04 -- bash -c 'sleep 60 & python3 -c "
import time
k=[]
for _ in range(10):
    k.append(bytearray(10*1024*1024)); k[-1][::4096]=b\"x\"*len(k[-1][::4096]); time.sleep(0.3)
time.sleep(5)"'
check "group kill returns 99" 99 $?
kill -0 $bystander 2>/dev/null; check "bystander still alive" 0 $?
kill $bystander 2>/dev/null; wait $bystander 2>/dev/null

# 4. refuse to start when available memory is below the floor (fake meminfo: 1 GB free)
printf 'MemTotal: 8000000 kB\nMemAvailable: 1048576 kB\n' > "$work/meminfo"
touch "$work/ran"; rm "$work/ran"
MEMGUARD_MEMINFO="$work/meminfo" bash "$MG" --log "$work/log" --lock "$work/lock" --min-avail-gb 4 -- touch "$work/ran" 2>/dev/null
check "refuse returns 97" 97 $?
[ -e "$work/ran" ]; check "refused job never ran" 1 $?
MEMGUARD_MEMINFO="$work/meminfo" bash "$MG" --log "$work/log" --lock "$work/lock" --min-avail-gb 0.5 -- touch "$work/ran"
check "above floor runs" 0 $?

# 5. lock: a second job is refused while the first holds it, then runs after it ends
run -- sleep 2 & first=$!
sleep 0.7
run -- true 2>/dev/null; check "second job refused (98)" 98 $?
wait $first; check "first job finished (0)" 0 $?
run -- true; check "lock released after first job" 0 $?

echo "failures: $fails"
[ "$fails" -eq 0 ]
