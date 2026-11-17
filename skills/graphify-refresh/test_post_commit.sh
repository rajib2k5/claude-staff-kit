#!/usr/bin/env bash
# Tests for post-commit. Uses a fake `graphify` that records its env and args. No real graphify runs.
# Run: bash skills/graphify-refresh/test_post_commit.sh
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
HOOK="$here/post-commit"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fails=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: expected '$2' got '$3'"; fails=$((fails+1)); fi; }
wait_for() { for _ in $(seq 1 50); do [ -e "$1" ] && return 0; sleep 0.1; done; return 1; }

bin="$work/bin"; mkdir -p "$bin"
cat > "$bin/graphify" <<FAKE
#!/bin/sh
{ echo "ARGS=\$*"; env; } > "$work/record.tmp"
[ -n "\${FAKE_SLEEP:-}" ] && sleep "\$FAKE_SLEEP"
mv "$work/record.tmp" "$work/record"
exit \${FAKE_EXIT:-0}
FAKE
chmod +x "$bin/graphify"

new_repo() { # name: makes a git repo with graphify-out
  r="$work/$1"; mkdir -p "$r/graphify-out"; git -C "$r" init -q; echo "$r"
}
safe_path="$bin:/usr/bin:/bin"

# 1. keys are unset, the flag is set, the args are "update ."
repo=$(new_repo r1)
rm -f "$work/record"
( cd "$repo" && ANTHROPIC_API_KEY=a OPENAI_API_KEY=b GEMINI_API_KEY=c GOOGLE_API_KEY=d GROQ_API_KEY=e \
  MISTRAL_API_KEY=f OPENROUTER_API_KEY=g CUSTOM_VENDOR_API_KEY=h KEEP_ME=yes PATH="$safe_path" sh "$HOOK" ); check "hook exits 0" 0 $?
wait_for "$work/record"; check "graphify was called" 0 $?
rec="$(cat "$work/record" 2>/dev/null)"
check "args are 'update .'" "ARGS=update ." "$(echo "$rec" | head -1)"
for k in ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY GOOGLE_API_KEY GROQ_API_KEY MISTRAL_API_KEY OPENROUTER_API_KEY CUSTOM_VENDOR_API_KEY; do
  echo "$rec" | grep -q "^$k="; check "$k unset" 1 $?
done
echo "$rec" | grep -q '^GRAPHIFY_NO_AUTO_REFRESH=1$'; check "GRAPHIFY_NO_AUTO_REFRESH=1 set" 0 $?
echo "$rec" | grep -q '^KEEP_ME=yes$'; check "unrelated env kept" 0 $?
wait_for "$repo/graphify-out/.refresh.log"; grep -q 'done, exit 0' "$repo/graphify-out/.refresh.log" 2>/dev/null || sleep 0.5
grep -q 'done, exit 0' "$repo/graphify-out/.refresh.log"; check "log written" 0 $?

# 2. no graphify-out: graphify is not called
repo="$work/r2"; mkdir -p "$repo"; git -C "$repo" init -q; rm -f "$work/record"
( cd "$repo" && PATH="$safe_path" sh "$HOOK" ); check "no graphify-out exits 0" 0 $?
sleep 0.5; [ -e "$work/record" ]; check "no graphify-out: not called" 1 $?

# 3. graphify not on PATH: exit 0, nothing written
repo=$(new_repo r3)
if PATH="/usr/bin:/bin" command -v graphify >/dev/null 2>&1; then echo "SKIP no-graphify case: a real graphify is in /usr/bin"; else
  ( cd "$repo" && PATH="/usr/bin:/bin" sh "$HOOK" ); check "no graphify exits 0" 0 $?
  [ -e "$repo/graphify-out/.refresh.log" ]; check "no graphify: no log" 1 $?
fi

# 4. a failing graphify never fails the commit
repo=$(new_repo r4); rm -f "$work/record"
( cd "$repo" && FAKE_EXIT=3 PATH="$safe_path" sh "$HOOK" ); check "failing graphify: hook exits 0" 0 $?
wait_for "$work/record"
sleep 0.5; grep -q 'done, exit 3' "$repo/graphify-out/.refresh.log"; check "failure logged" 0 $?

# 5. non-blocking: the hook returns while a slow graphify still runs
repo=$(new_repo r5); rm -f "$work/record"
start=$SECONDS
( cd "$repo" && FAKE_SLEEP=3 PATH="$safe_path" sh "$HOOK" )
check "hook returned in under 2 s while graphify sleeps 3 s" 1 $(( SECONDS - start < 2 ))
[ -e "$work/record" ]; check "graphify still running at hook exit" 1 $?
wait_for "$work/record"; check "slow graphify finished later" 0 $?

echo "failures: $fails"
[ "$fails" -eq 0 ]
