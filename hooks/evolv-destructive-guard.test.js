// Tests for evolv-destructive-guard.js. Run: node --test ~/.claude/hooks/evolv-destructive-guard.test.js
//
// Scope (owner, 2026-10-03): approval only for the user's real things — a repository, the user's own folders, a live
// database (Snowflake or any RDBMS server) and published artifacts. Claude's own session scratchpad, task output and
// session metadata are not the user's data, so deleting them needs no approval.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { decide } = require('./evolv-destructive-guard.js');

const HOME = os.homedir();
const REPO = path.join(HOME, 'dev', 'some-repo');
const SCRATCH = '/private/tmp/claude-502/-Users-someone-dev/11a0a334-fa2e-4273-8f4d-151bf179ea1f/scratchpad';
const SESSION = '11a0a334-fa2e-4273-8f4d-151bf179ea1f';

const bash = (command, cwd = REPO) => decide('Bash', { command }, cwd);
const verdict = (v) => (v ? v.decision : 'allow');

// --- Claude-internal session and task files: no approval ------------------------------------------------------
const internal = [
  `rm -rf ${SCRATCH}/egv2`,
  `rm -rf /tmp/claude-502/-Users-someone-dev/${SESSION}/tasks`,
  `S=${SCRATCH}; rm -rf "$S/egv2" "$S/wave3b"`,
  `rm -rf ~/.claude/projects/-Users-someone-dev/${SESSION}`,
  `rm -f ~/.claude/projects/-Users-someone-dev/${SESSION}.jsonl`,
  'rm -rf ~/.claude/shell-snapshots/*',
  'rm -rf ~/.claude/session-env/abc ~/.claude/file-history/def ~/.claude/debug ~/.claude/paste-cache',
  `rm -rf "${HOME}/.claude/todos/x.json" "$HOME/.claude/cache"`,
  `python3 -c "import shutil; shutil.rmtree('${SCRATCH}/copy1')"`,
  `node -e "require('fs').rmSync('${SCRATCH}/x', { recursive: true, force: true })"`,
];
for (const command of internal) {
  test(`allows deleting Claude's own session and task files: ${command.slice(0, 70)}`, () => {
    assert.equal(verdict(bash(command)), 'allow');
  });
}

test('a relative path is resolved against the working directory', () => {
  assert.equal(verdict(bash('rm -rf egv2 ./wave3b', SCRATCH)), 'allow');
  assert.equal(verdict(bash('rm -rf build', REPO)), 'ask');
});

// --- Reading or writing text that mentions a destructive verb is not destructive -------------------------------
test('searching for a destructive phrase is read-only', () => {
  assert.equal(verdict(bash('grep -rn "DROP DATABASE" sql/ | head -5')), 'allow');
  assert.equal(verdict(bash('rg -n "rm -rf /" docs')), 'allow');
});

test('a heredoc that only writes a file is not executed', () => {
  assert.equal(verdict(bash(`cat > ${REPO}/sql/a.sql <<'EOF'\nDROP TABLE t;\nDELETE FROM u;\nEOF`)), 'allow');
});

// --- The user's real things: approval -------------------------------------------------------------------------
const askCases = [
  [`rm -rf ${REPO}/docs`, 'a recursive delete inside a repository'],
  ['rm -rf "$UNKNOWN/x"', 'a target that cannot be resolved'],
  ['rm -rf ~/.claude/projects/-Users-someone-dev/memory', "the user's persistent memory"],
  ['rm -rf ~/.claude/skills/foo', "the user's skills"],
  [`rm -rf ${SCRATCH}/x ${REPO}/data`, 'a mix of internal and real targets'],
  [`rm ${REPO}/*.log`, 'a glob outside the internal folders'],
  [`rm -rf ${SCRATCH}/../../../../Users/someone/dev`, 'a path that climbs out of the scratchpad'],
  ['snowsql -q "DROP TABLE DB.S.T"', 'a DROP against a live database'],
  [`python3 - <<'EOF'\ncur.execute("DROP TABLE t")\nEOF`, 'a heredoc fed to an interpreter'],
  ['git reset --hard', 'discarding uncommitted work'],
  ['python3 -c "import shutil; shutil.rmtree(p)"', 'rmtree of a path the guard cannot see'],
  ['find . -name "*.tmp" | xargs rm -rf', 'targets read from a pipe'],
];
for (const [command, why] of askCases) {
  test(`asks for ${why}`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}

test('asks before a live SQL tool drops an object', () => {
  assert.equal(verdict(decide('mcp__snowflake__run_query', { query: 'DROP TABLE X' }, REPO)), 'ask');
});

test('asks before a published artifact is deleted', () => {
  assert.equal(verdict(decide('Artifact', { action: 'delete', url: 'https://claude.ai/artifact/x' }, REPO)), 'ask');
  assert.equal(verdict(decide('Artifact', { action: 'publish', file_path: '/tmp/a.html' }, REPO)), 'allow');
});

test('asks before writing to settings or secrets, as before', () => {
  assert.equal(verdict(decide('Write', { file_path: `${HOME}/.claude/settings.json` }, REPO)), 'ask');
  assert.equal(verdict(decide('Write', { file_path: `${REPO}/.env` }, REPO)), 'ask');
  assert.equal(verdict(decide('Write', { file_path: `${SCRATCH}/notes.md` }, REPO)), 'allow');
});

// --- Catastrophic: still denied --------------------------------------------------------------------------------
const denyCases = [
  ['psql -c "DROP DATABASE prod"', 'DROP DATABASE'],
  ['echo "DROP DATABASE prod" | snowsql', 'DROP DATABASE piped into a database client'],
  ['rm -rf /', 'the filesystem root'],
  ['rm -rf ~', 'the home folder'],
  ['rm -rf $HOME', 'the home folder through $HOME'],
  ['rm -rf ~/*', 'everything in the home folder'],
  ['rm -rf ~/.claude', "the whole Claude configuration, memory and skills"],
  ['rm -rf /Users', 'every home folder'],
  ['git push --force origin main', 'a force-push to main'],
];
for (const [command, why] of denyCases) {
  test(`denies ${why}`, () => {
    assert.equal(verdict(bash(command)), 'deny', command);
  });
}

test('denies DROP DATABASE through a live SQL tool', () => {
  assert.equal(verdict(decide('mcp__snowflake__run_query', { query: 'DROP DATABASE DQ' }, REPO)), 'deny');
});

test('leaves ordinary commands alone', () => {
  for (const command of ['ls -la', 'git status', 'npm test', `rm ${REPO}/one-file.txt`, 'echo hello']) {
    assert.equal(verdict(bash(command)), 'allow', command);
  }
});

// --- Holes found by attacking the first version -----------------------------------------------------------------
test('a cd earlier in the command decides where a relative delete points', () => {
  assert.equal(verdict(bash(`cd ${REPO} && rm -rf build`, SCRATCH)), 'ask');
  assert.equal(verdict(bash(`cd ${SCRATCH} && rm -rf egv2`, REPO)), 'allow');
  assert.equal(verdict(bash('cd "$UNKNOWN" && rm -rf x', SCRATCH)), 'ask');
});

test('a delete wrapped in another interpreter is still judged by its target', () => {
  assert.equal(verdict(bash('bash -c "rm -rf /"')), 'deny');
  assert.equal(verdict(bash(`python3 -c "import os; os.system('rm -rf /')"`)), 'deny');
  assert.equal(verdict(bash('eval "rm -rf ~"')), 'deny');
});

test('a heredoc piped into a database client is executed, not written', () => {
  assert.equal(verdict(bash("cat <<'EOF' | snowsql\nDROP DATABASE prod;\nEOF")), 'deny');
});

test('temp folders other than Claude\'s are the user\'s', () => {
  assert.equal(verdict(bash('rm -rf /tmp')), 'deny');
  assert.equal(verdict(bash('rm -rf /private/tmp/other-app')), 'ask');
});

// --- Text that only mentions rm is not a delete -------------------------------------------------------------------
test('rm inside the text of a non-running command is not a delete', () => {
  assert.equal(verdict(bash(`mkdir -p ${SCRATCH}/e2e && echo "live rm -rf of an internal folder ran; done"`)), 'allow');
  assert.equal(verdict(bash('git add -A && git commit -m "chore: rm -rf the old build dir"')), 'allow');
});

test('find -exec rm and xargs rm are judged by what find searches', () => {
  assert.equal(verdict(bash(`find ${SCRATCH}/egv2 -name '*.tmp' -exec rm -f {} +`)), 'allow');
  assert.equal(verdict(bash('find . -name "*.log" -exec rm -rf {} +', REPO)), 'ask');
  assert.equal(verdict(bash('find / -name "*.bak" -delete')), 'deny');
});

test('a relative delete after a cd inside an interpreter string cannot be resolved', () => {
  assert.equal(verdict(bash(`bash -c "cd ${REPO} && rm -rf build"`, SCRATCH)), 'ask');
});

test('the hook denies by itself what the wildcard settings rules were meant to catch', () => {
  for (const command of ['rm -rf /*', 'rm -rf ~/*', 'rm -rf / ', 'rm -rf ~/']) {
    assert.equal(verdict(bash(command)), 'deny', command);
  }
});

// --- Holes found by the 2026-10-04 adversarial validation ----------------------------------------------------------
const sql = (query) => decide('mcp__snowflake__run_query', { query }, REPO);

// A safe signal (a read, a dry run, a plan) excused the whole command line, so a destructive part ran unasked.
const maskedBefore = [
  'ls && git reset --hard',
  'git status; git clean -fdx',
  'terraform plan && terraform apply -auto-approve',
  'cat notes.txt; psql -c "TRUNCATE TABLE accounts"',
  'rsync --dry-run a/ b/ && git branch -D old-work',
  'echo "DROP TABLE accounts" | psql',
  'echo x > /etc/hosts',
];
for (const command of maskedBefore) {
  test(`a harmless part of the line does not excuse a destructive part: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}

test('a read statement does not excuse a write that follows it in a SQL script', () => {
  assert.equal(verdict(sql('SELECT 1 FROM t; TRUNCATE TABLE accounts')), 'ask');
  assert.equal(verdict(sql('UPDATE accounts SET status = (SELECT s FROM x)')), 'ask');
});

// A commit message or echoed text that only mentions a verb was scanned as if it ran.
const textOnly = [
  'git commit -m "docs: the guard denies DROP DATABASE"',
  "git commit -m \"$(cat <<'EOF'\ndocs: the guard denies DROP DATABASE\n\nCo-Authored-By: x\nEOF\n)\"",
  'mkdir -p notes && echo "DROP DATABASE is denied" > notes/guard.txt',
  'git add -A && git commit -m "docs: DROP TABLE needs approval"',
  'git tag -a v1 -m "TRUNCATE notes"',
];
for (const command of textOnly) {
  test(`message or echoed text is not run: ${command.split('\n')[0]}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}

// Text that something on the same line can run is still judged as code.
const runnable = [
  ['echo "DROP DATABASE prod" > x.sql && snowsql -f x.sql', 'deny'],
  ["bash -c \"$(cat <<'EOF'\npsql -c 'DROP DATABASE prod'\nEOF\n)\"", 'deny'],
  ["echo \"$(cat <<'EOF'\npsql -c 'DROP DATABASE prod'\nEOF\n)\" | bash", 'deny'],
  ['git commit -m "wip" && psql -c "DROP TABLE accounts"', 'ask'],
  ["printf 'TRUNCATE TABLE accounts' | xargs -0 snowsql -q", 'ask'],
];
for (const [command, expected] of runnable) {
  test(`text that the line can run is judged as code: ${command.split('\n')[0]}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

// Regression (2026-11-09): a PR body that only quotes destructive text was denied as if it ran.
const postedText = [
  'gh pr create --title "guard fix" --body "The guard now denies rm -rf / and DROP DATABASE prod."',
  "gh pr create --body 'Notes: terraform destroy and git reset --hard need approval'",
  'gh issue comment 12 --body "TRUNCATE TABLE accounts was seen in the log"',
  'gh -R owner/repo pr edit 3 --body "rm -rf ~ is denied"',
  "gh pr create --title t --body \"$(cat <<'EOF'\nrm -rf / is denied; DROP DATABASE asks nothing\nEOF\n)\"",
  'gh release create v1 --notes "pkill -f and snowddl destroy are now guarded"',
];
for (const command of postedText) {
  test(`posted PR/issue text is not run: ${command.split('\n')[0].slice(0, 70)}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}

// ...but a real delete next to it, or a command substitution inside the quoted text, still runs and is judged.
const stillRuns = [
  ['gh pr create --body "x" && rm -rf ~', 'deny'],
  ['gh pr create --body "x"; rm -rf /', 'deny'],
  ['gh pr create --body "$(rm -rf ~)"', 'deny'],
  ['git commit -m "$(rm -rf ~)"', 'deny'],
  ['git commit -m "`rm -rf /`"', 'deny'],
  ["git commit -m \"$(psql -c 'DROP DATABASE prod')\"", 'deny'],
  ['gh pr create --body "$(echo "$(rm -rf build)")"', 'ask'],
  ['gh repo delete owner/repo --yes', 'ask'],
  ['bash -c "gh pr create --body x; rm -rf /"', 'deny'],
];
for (const [command, expected] of stillRuns) {
  test(`a real delete beside posted text is still judged: ${command.slice(0, 70)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

// Adversarial review of W2 (2026-11-16): ways the text exemption or the parser disagreed with bash.
const reviewRefuted = [
  // An assignment before a text command is not text: the editor or ssh command it names runs.
  ['GH_EDITOR="sh -c \'git reset --hard\'" gh pr create --editor', 'ask'],
  ['GIT_SSH_COMMAND="sh -c \'git reset --hard\'" gh pr checkout 1', 'ask'],
  ['EDITOR="git push --force origin main" gh issue create --editor', 'deny'],
  // $'...' (ANSI-C) quoting: \' does not end the string, so the $(...) after it is outside any quote.
  ["gh pr create --title $'x\\'' --body $(git reset --hard) '#'", 'ask'],
  ["echo $'x\\'' $(rm -rf ~) '#'", 'deny'],
  ["git commit -m $'it\\'s' -m \"$(rm -rf ~)\"", 'deny'],
  // An unquoted heredoc expands $(...) in its body even when the body is only written to a file.
  ['cat <<EOF > notes.txt\nhello $(rm -rf ~)\nEOF', 'deny'],
  // A substitution runs where it appears, not in the folder of the last cd on the line.
  [`git commit -m "$(rm -rf *)"; cd ${SCRATCH}`, 'ask'],
  // numerapi's command-line tool spells its commands with dashes; pgrep -f feeding kill is pkill -f.
  ['numerapi stake-drain --model_id x', 'ask'],
  ['numerapi stake-increase 1 --model_id x', 'ask'],
  ['pgrep -f train.py | xargs kill', 'ask'],
  ['kill -9 $(pgrep -f train.py)', 'ask'],
];
for (const [command, expected] of reviewRefuted) {
  test(`review case: ${command.split('\n')[0].slice(0, 70)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

test('quoted single-quote heredoc bodies stay text, and a tool named "mistake" is not a stake tool', () => {
  assert.equal(verdict(bash("cat <<'EOF' > notes.txt\nhello $(rm -rf ~)\nEOF")), 'allow');
  assert.equal(verdict(decide('mcp__notes__log_mistake', { text: 'unstake later' })), 'allow');
});

// --- pkill -f, snowddl and stake changes (W2, 2026-11-16) -----------------------------------------------------
const newRules = [
  ['pkill -f train.py', 'ask'],
  ['pkill -9 -f "python r2_train"', 'ask'],
  ['pkill -u me -f worker', 'ask'],
  ['pkill --full worker', 'ask'],
  ['sudo pkill -ef jupyter', 'ask'],
  ['snowddl -c ./config -a acct apply', 'ask'],
  ['snowddl -c ./config apply --apply-unsafe', 'ask'],
  ['snowddl-singledb -c ./db apply', 'ask'],
  ['snowddl -c ./config -a acct destroy', 'deny'],
  ['python3 -c "import numerapi; numerapi.NumerAPI().stake_increase(1, \'model\')"', 'ask'],
  ['python3 -c "napi.stake_drain(\'m\')"', 'ask'],
  ['curl -X POST https://api-tournament.numer.ai -d \'{"query":"mutation { v2ChangeStake(value: 1) { id } }"}\'', 'ask'],
];
for (const [command, expected] of newRules) {
  test(`new rule: ${command.slice(0, 70)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

const notNewRules = [
  'pkill train.py',
  'pkill -x python3',
  'kill -TERM -- -12345',
  'snowddl -c ./config -a acct plan',
  'grep -rn "pkill -f" docs',
  'git commit -m "docs: never use pkill -f; snowddl destroy is denied; stake_increase asks"',
  'python3 -c "print(napi.get_account())"',
];
for (const command of notNewRules) {
  test(`new rules leave alone: ${command.slice(0, 70)}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}

test('a stake mutation through a Numerai MCP tool asks', () => {
  const q = { query: 'mutation { releaseStake(modelId: "x", value: "1") { id } }' };
  assert.equal(verdict(decide('mcp__numerai__graphql_query', q)), 'ask');
  assert.equal(verdict(decide('mcp__numerai__graphql_query', { query: '{ account { models { name } } }' })), 'allow');
  assert.equal(verdict(decide('mcp__numerai__get_model_profile', { name: 'stake_change_test' })), 'allow');
});

test('a stake change through a tool that is not a query tool asks (not caught by the SQL-tool path)', () => {
  assert.equal(verdict(decide('mcp__numerai__set_stake', { model: 'm', value: 1 })), 'ask');
  assert.equal(verdict(decide('mcp__numerai__run_mutation', { body: 'mutation { v2ChangeStake(value: 1) { id } }' })), 'ask');
  assert.equal(verdict(decide('mcp__numerai__get_leaderboard', { limit: 5 })), 'allow');
});

// --- One case per rule, so that deleting a rule fails a test ------------------------------------------------------
const everyDenyRule = [
  'mkfs.ext4 /dev/disk2',
  'dd if=/dev/zero of=/dev/disk2 bs=1m',
  'git push -f origin master',
  'git filter-repo --path secrets.txt --invert-paths',
  'git filter-branch --tree-filter "rm -f x" HEAD',
  'terraform destroy -auto-approve',
  'shred -u notes.txt',
];
for (const command of everyDenyRule) {
  test(`denies: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'deny', command);
  });
}

const everyAskStatement = [
  'DROP SCHEMA S',
  'TRUNCATE TABLE accounts',
  'DELETE FROM accounts',
  "UPDATE accounts SET status = 'x'",
  'ALTER TABLE accounts DROP COLUMN email',
  'CREATE OR REPLACE TABLE accounts AS SELECT 1 AS id',
  'MERGE INTO t USING s ON t.id = s.id WHEN NOT MATCHED BY SOURCE THEN DELETE',
  'REVOKE SELECT ON TABLE t FROM ROLE analyst',
  'ALTER TABLE t SET DATA_RETENTION_TIME_IN_DAYS = 0',
];
for (const statement of everyAskStatement) {
  test(`asks before the SQL tool runs: ${statement}`, () => {
    assert.equal(verdict(sql(statement)), 'ask', statement);
  });
}

test('a bounded DELETE or UPDATE does not ask', () => {
  assert.equal(verdict(sql('DELETE FROM accounts WHERE id = 1')), 'allow');
  assert.equal(verdict(sql("UPDATE accounts SET status = 'x' WHERE id = 1")), 'allow');
});

const everyAskCommand = [
  'dbt run --full-refresh -s orders',
  'dbt run-operation drop_old_schemas',
  'git push --force origin feature-x',
  'git clean -fdx',
  'git branch -D old-work',
  'git push origin --delete old-work',
  'git push origin :old-work',
  'chmod -R 777 build',
  'echo x | tee -a /etc/hosts',
  'python3 -c "from app import db; db.drop_all()"',
  'npx prisma db push --accept-data-loss',
  'npx prisma migrate reset',
  'node -e "localStorage.clear()"',
  'kubectl delete namespace prod',
  'helm uninstall web',
  'docker system prune -a',
  'docker volume rm data',
  'aws s3 rm s3://bucket/path --recursive',
  'aws s3 rb s3://bucket',
  'gcloud sql instances delete prod',
  'terraform apply -auto-approve',
  'terraform state rm aws_s3_bucket.b',
  './rotate-key.sh prod',
  'gh repo delete owner/repo --yes',
  'curl -X DELETE https://api.example.com/v1/items/1',
];
for (const command of everyAskCommand) {
  test(`asks: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}

// A safe signal excuses the destructive verb of its own command, and only that command.
const excusedByItsOwnSignal = [
  'git clean -fdx --dry-run',
  'helm uninstall web --plan',
  'terraform plan -var "note=kubectl delete"',
  'git clean -fdx --check',
  'git log -S "DROP TABLE" && npm test',
  'grep -c "DROP TABLE" sql/x.sql && npm test',
];
for (const command of excusedByItsOwnSignal) {
  test(`a safe signal excuses its own command: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}

test('a plan or a read statement is not a write', () => {
  assert.equal(verdict(sql('EXPLAIN DELETE FROM accounts')), 'allow');
  assert.equal(verdict(sql("SELECT 'DROP TABLE' AS note FROM t")), 'allow');
});

// --- Branches the 2026-10-04 mutation run showed no test guarding ------------------------------------------------
test('a wrapper such as sudo or env does not hide the command it runs', () => {
  assert.equal(verdict(bash('sudo rm -rf /')), 'deny');
  assert.equal(verdict(bash('env FOO=1 rm -rf ~')), 'deny');
});

test('a glob whose fixed part climbs with .. is not trusted as internal', () => {
  assert.equal(verdict(bash(`rm -rf ${SCRATCH}/../other/*`)), 'ask');
});

test('nothing on the line excuses the catastrophic tier, not even a dry-run flag in a comment', () => {
  assert.equal(verdict(bash('git push --force origin main # --dry-run')), 'deny');
});

test('a heredoc body fed to a shell is judged for deletes', () => {
  assert.equal(verdict(bash("bash <<'EOF'\nrm -rf ~\nEOF")), 'deny');
});

test('--recursive is a recursive delete', () => {
  assert.equal(verdict(bash('rm --recursive ~/Documents')), 'ask');
});

test('rmtree of a literal catastrophic path is denied', () => {
  assert.equal(verdict(bash(`python3 -c "import shutil; shutil.rmtree('/')"`)), 'deny');
});

test('asks before writing to every sensitive path', () => {
  for (const file of [`${REPO}/.git/config`, `${HOME}/.ssh/id_rsa`, '/etc/hosts']) {
    assert.equal(verdict(decide('Write', { file_path: file }, REPO)), 'ask', file);
  }
});

// --- Trivial prompts seen in a week of transcripts (2026-11-18): temp files, caches, owner chmod, redirects -------
const { spawnSync } = require('node:child_process');
const LINUX_SCRATCH = `/tmp/claude-1000/-home-someone-dev/${SESSION}/scratchpad`;

/** The hook as Claude Code runs it: a child process with a chosen environment, the payload on stdin. */
function hookProcess(command, env, cwd = REPO) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'evolv-destructive-guard.js')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }),
    env: { PATH: process.env.PATH, HOME, ...env },
    encoding: 'utf8',
  });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow';
}

test('Claude temp root: folders inside <tmp>/claude-<uid>/ are internal, the root itself asks', () => {
  assert.equal(verdict(bash(`rm -rf ${LINUX_SCRATCH}/egv2`)), 'allow');
  assert.equal(verdict(bash(`rm -rf /tmp/claude-1000/-home-someone-dev/${SESSION}/tasks`)), 'allow');
  assert.equal(verdict(bash('rm -rf /tmp/claude-1000')), 'ask');
  assert.equal(verdict(bash('rm -rf /tmp/claude-1000/')), 'ask');
  assert.equal(verdict(bash('rm -rf /tmp/claude-1000/*')), 'ask');
  assert.equal(verdict(bash('rm -rf /private/tmp/claude-502')), 'ask');
  assert.equal(verdict(bash('rm -rf /tmp')), 'deny');
  assert.equal(verdict(bash('rm -rf /tmp/claudette/x')), 'ask');
});

test('Claude temp root follows CLAUDE_CODE_TMPDIR, else TMPDIR (os.tmpdir())', () => {
  const cc = { CLAUDE_CODE_TMPDIR: '/var/tmp/cc' };
  assert.equal(hookProcess('rm -rf /var/tmp/cc/claude-1000/sess/scratchpad/x', cc), 'allow');
  assert.equal(hookProcess('rm -rf /var/tmp/cc/claude-1000', cc), 'ask');
  assert.equal(hookProcess('rm -rf /var/tmp/cc', cc), 'deny');
  assert.equal(hookProcess('rm -rf /var/tmp/tt/claude-1000/sess/x', { TMPDIR: '/var/tmp/tt' }), 'allow');
  assert.equal(hookProcess('rm -rf /var/tmp/cc/claude-1000/sess/x', {}), 'ask');
  assert.equal(hookProcess(`rm -rf ${LINUX_SCRATCH}/x`, cc), 'allow');
});

// A variable assigned a literal path earlier on the same line, at top level and once, is judged by that path.
const resolvedVariables = [
  [`S=${LINUX_SCRATCH}; rm -rf $S/x`, 'allow'],
  [`export O=${LINUX_SCRATCH}\nrm -rf "\${O}/bt" "$O/pt"`, 'allow'],
  [`O='${LINUX_SCRATCH}' && rm -rf $O/bt`, 'allow'],
  [`cd ${REPO} && S="${LINUX_SCRATCH}" && rm -rf "$S/w7" && ls`, 'allow'],
  [`S=${LINUX_SCRATCH}; bash -c "rm -rf $S/x"`, 'allow'],
  [`S=${LINUX_SCRATCH}; cat <<EOF | bash\nrm -rf $S/x\nEOF`, 'allow'],
  [`S=${LINUX_SCRATCH}; rm -rf $S/x 2>/dev/null; rm -rf "$S/y" >/dev/null 2>&1`, 'allow'],
  [`S=${LINUX_SCRATCH}; for f in a b; do if test -e $f; then echo y; else echo n; fi; done; rm -rf $S/x`, 'allow'],
  [`S=${LINUX_SCRATCH} && rm -rf $S/h && python3 - <<'EOF'\nS = "elsewhere"\nEOF`, 'allow'],
  [`S=${LINUX_SCRATCH}; source /dev/stdin <<'EOF'\nS=${REPO}\nEOF\nrm -rf $S/x`, 'ask'],
  [`S=${LINUX_SCRATCH}; python3 - <<'EOF'\nmodel.eval()\nS = 1\nEOF\nrm -rf $S/x`, 'allow'],
  [`S=${LINUX_SCRATCH}\nrm -rf "$S/x"\ngit ls-files | while IFS= read -r f; do echo "$f"; done`, 'allow'],
  [`S=${LINUX_SCRATCH}; cp1(){ for f in "$@"; do cp "$f" .; done; }; rm -rf "$S/x"`, 'allow'],
  [`S=${LINUX_SCRATCH}; for m in "a|b"; do n=\${m%%|*}; rm -rf $S/dbg; done`, 'allow'],
  [`S=${REPO}; rm -rf $S/build`, 'ask'],
  ['S=/; rm -rf $S', 'deny'],
  // A value that names an earlier resolved variable is resolved too (chained), then judged by its real path.
  [`B=${LINUX_SCRATCH}; S=$B/x; rm -rf $S/y`, 'allow'],
  [`B=${REPO}; S=$B/x; rm -rf $S/y`, 'ask'],
  ['B=/; S=$B; rm -rf $S', 'deny'],
];
// ...anything else is left unresolved, so it still asks.
const unresolvedVariables = [
  [`S=${REPO}; rm -rf $S/a; S=${LINUX_SCRATCH}`, 'reassigned later'],
  [`S=${LINUX_SCRATCH}; S=${REPO}; rm -rf $S/a`, 'reassigned before the use'],
  [`rm -rf $S/x; S=${LINUX_SCRATCH}`, 'used before the assignment'],
  [`for d in a; do S=${LINUX_SCRATCH}; done; rm -rf $S/x`, 'assigned in a loop'],
  [`while false; do echo x; S=${LINUX_SCRATCH}; done; rm -rf $S/x`, 'assigned later in a loop body'],
  [`for S in ${LINUX_SCRATCH}; do :; done; rm -rf $S/x`, 'a loop variable'],
  [`if true; then S=${LINUX_SCRATCH}; fi; rm -rf $S/x`, 'assigned in a conditional block'],
  [`test -d /nope && S=${LINUX_SCRATCH}; rm -rf $S/x`, 'assigned behind && but used after ;'],
  [`false || S=${LINUX_SCRATCH}; rm -rf $S/x`, 'assigned behind ||'],
  [`(S=${LINUX_SCRATCH}); rm -rf $S/x`, 'assigned in a subshell'],
  [`f() { S=${LINUX_SCRATCH}; }; f; rm -rf $S/x`, 'assigned in a function'],
  [`S=${LINUX_SCRATCH} true; rm -rf $S/x`, 'an assignment prefixed to a command'],
  [`S=${LINUX_SCRATCH} && true & rm -rf $S/x`, 'assigned in a backgrounded list'],
  [`S=${LINUX_SCRATCH} | cat; rm -rf $S/x`, 'assigned in a pipeline'],
  ['S=$(mktemp -d); rm -rf $S/x', 'from a command substitution'],
  [`B=$(mktemp -d); S=$B/x; rm -rf $S/y`, 'a chain through a command substitution'],
  [`S=${LINUX_SCRATCH}; bash -c 'rm -rf $S/x'`, 'a use in single quotes (not exported to the inner shell)'],
  [`S=${LINUX_SCRATCH}; bash <<'EOF'\nrm -rf $S/x\nEOF`, 'a use in a quoted heredoc'],
  ['read S; rm -rf $S/x', 'read from input'],
  [`S=${LINUX_SCRATCH}; unset S; rm -rf $S/x`, 'unset'],
  ['rm -rf $GUARD_TEST_ENV_DIR/x', 'a variable only the real environment sets'],
  [`cd /nope && HOME=${REPO}; rm -rf ~/.claude/cache`, 'a home folder rebound on the line'],
  [`IFS=a; S=${LINUX_SCRATCH}/xa/home; rm -rf $S`, 'IFS changed, so the value splits differently'],
  [`OLDPWD=${LINUX_SCRATCH}; cd ${REPO}; rm -rf $OLDPWD/x`, 'a name the shell itself changes'],
];
for (const [command, expected] of resolvedVariables) {
  test(`variable resolved: ${command.split('\n')[0].slice(0, 70)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}
for (const [command, why] of unresolvedVariables) {
  test(`variable left unresolved (${why}): asks`, () => {
    process.env.GUARD_TEST_ENV_DIR = LINUX_SCRATCH;
    try {
      assert.equal(verdict(bash(command)), 'ask', command);
    } finally {
      delete process.env.GUARD_TEST_ENV_DIR;
    }
  });
}

test('$PWD is the working directory only on a line that never changes folder', () => {
  assert.equal(verdict(bash('rm -rf "$PWD/egv2"', LINUX_SCRATCH)), 'allow');
  assert.equal(verdict(bash('rm -rf "$PWD/build"', REPO)), 'ask');
  assert.equal(verdict(bash(`cd ${REPO} && rm -rf $PWD/build`, LINUX_SCRATCH)), 'ask');
  assert.equal(verdict(bash(`PWD=${LINUX_SCRATCH}; cd ${REPO}; rm -rf $PWD/x`, REPO)), 'ask');
  // A cd that fails, one in a subshell, or pushd then popd leaves $PWD where it was: any cd on the line, it asks.
  assert.equal(verdict(bash(`cd ${LINUX_SCRATCH} && rm -rf $PWD/x`, REPO)), 'ask');
  assert.equal(verdict(bash('cd /tmp/claude-1000/nonexistent; rm -rf "$PWD"/*', REPO)), 'ask');
  assert.equal(verdict(bash(`(cd ${LINUX_SCRATCH}); rm -rf "$PWD"`, REPO)), 'ask');
  assert.equal(verdict(bash(`pushd ${LINUX_SCRATCH}; popd; rm -rf "$PWD"`, REPO)), 'ask');
  // A line that sets PWD itself, or runs a cd only once its variables are resolved.
  assert.equal(verdict(bash(`PWD=${REPO}; rm -rf "$PWD/x"`, LINUX_SCRATCH)), 'ask');
  assert.equal(verdict(bash('X=c; Y=${X}d; $Y /; rm -rf "$PWD/x"', LINUX_SCRATCH)), 'ask');
});

// Regenerable caches, named exactly, need no approval; anything that could be more still asks.
const cacheDeletes = [
  `rm -rf ${REPO}/src/__pycache__`,
  'rm -rf .pytest_cache .hypothesis .mypy_cache .ruff_cache',
  'rm -rf tools/a/__pycache__ src/__pycache__ ./analysis/forward/__pycache__',
  'rm -rf node_modules/.cache',
  'rm -rf */__pycache__',
  'find . -name __pycache__ -exec rm -rf {} +',
  'find . -type d -name __pycache__ -prune -exec rm -rf {} +',
  "find src tests -name '__pycache__' -type d -exec rm -rf {} \\;",
  'find . -name .pytest_cache -exec rm -rf {} + && find . -name __pycache__ -exec rm -rf {} +',
  'find . -name __pycache__ -print0 | xargs -0 rm -rf',
  'find . -name __pycache__ -print0 2>&1 | xargs -0 rm -rf',
  'find . -name .mypy_cache -print0 | xargs --null -r rm -rf',
];
for (const command of cacheDeletes) {
  test(`a regenerable cache is not the user's data: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}
const notOnlyCaches = [
  'rm -rf .venv',
  'rm -rf node_modules',
  'rm -rf .tox',
  'rm -rf .cache',
  'rm -rf src/.cache',
  'rm -rf __pycache__*',
  'rm -rf *cache*',
  'rm -rf src/__pycache__/..',
  'rm -rf src/__pycache__/',
  'rm -rf $X/__pycache__',
  'rm -rf __pycache__ build',
  'find . -name "*.pyc" -exec rm -rf {} +',
  'find . -name __pycache__ -o -name src -exec rm -rf {} +',
  'find . ! -name __pycache__ -exec rm -rf {} +',
  'find . -not -name __pycache__ -delete',
  'find . -exec rm -rf {} + -name __pycache__',
  'find . -name __pycache__ -exec rm -rf {} build +',
  'find . -name __pycache__ -name src -exec rm -rf {} +',
  'find $X -name __pycache__ -exec rm -rf {} +',
  'find . -name src | xargs rm -rf',
  'find . -name __pycache__ | grep x | xargs rm -rf',
  "find . -name __pycache__ -printf '%h\\n' | xargs rm -rf",
  'find . -name __pycache__ | xargs -a list.txt rm -rf',
  'cat list.txt | xargs rm -rf',
  'echo src -name __pycache__ | xargs rm -rf',
  // Newline-separated names split on blanks and quotes (a/__pycache__ x/__pycache__ can be read as a, x/...): only
  // -print0 into xargs -0 hands rm exactly the paths find matched.
  'find . -name .mypy_cache | xargs rm -rf',
  `find ${REPO} -name __pycache__ | xargs rm -rf`,
  'find . -name __pycache__ -print0 | xargs rm -rf',
  'find . -name __pycache__ | xargs -0 rm -rf',
  'find . -name __pycache__ -print -print0 | xargs -0 rm -rf',
  'find . -name __pycache__ -print0 | xargs -0 -d / rm -rf',
  'find . -name __pycache__ -print0 | xargs -0 rm -rf ~/dev',
  // A find that writes a file is not only deleting caches.
  `find . -name __pycache__ -fprint ${REPO}/notes.md -delete`,
  `find . -name __pycache__ -fprintf ${REPO}/.bashrc x -exec rm -rf {} +`,
  'find . -name __pycache__ -exec rm -rf {} + -fls x',
  'find . -name __pycache__ -fprint0 x -delete',
  // -o, or anything else that is not a plain test, widens what the delete reaches.
  'find . -name __pycache__ -o -path ./src -exec rm -rf {} +',
  'find . -name __pycache__ -newer x -o -delete',
  // Brace expansion makes more than one target out of one word.
  'rm -rf ~/dev{,/__pycache__}',
  'rm -rf $HOME{,/__pycache__}',
  'rm -rf {src,tests/__pycache__}',
  'rm -rf "src"{,/__pycache__}',
  'find {.,src} -name __pycache__ -delete',
];
for (const command of notOnlyCaches) {
  test(`a delete that is not only caches still asks: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}
test('a cache under a catastrophic root is still denied', () => {
  assert.equal(verdict(bash('find / -name __pycache__ -exec rm -rf {} +')), 'deny');
  // -L, -H and -P come before the folders a find searches: / is still the root here.
  assert.equal(verdict(bash('find -L / -name __pycache__ -exec rm -rf {} +')), 'deny');
});

test('a brace word is never judged internal: it can expand to a folder outside the scratchpad', () => {
  assert.equal(verdict(bash('rm -rf /tmp/claude-1000/{x,../../etc}')), 'ask');
  assert.equal(verdict(bash(`rm -rf ${LINUX_SCRATCH}/{a,../../../../../etc}`)), 'ask');
  assert.equal(verdict(bash(`rm -rf {a,${REPO}}`, LINUX_SCRATCH)), 'ask');
  assert.equal(verdict(bash('rm -rf {a,/}', LINUX_SCRATCH)), 'ask');
});

test("the temp root is claude-<uid>: another claude-* folder in /tmp is not Claude's", () => {
  assert.equal(verdict(bash('rm -rf /tmp/claude-evil/x')), 'ask');
  assert.equal(verdict(bash('rm -rf /tmp/claude-backups/important')), 'ask');
  assert.equal(verdict(bash('rm -rf /tmp/claude-1000x/a')), 'ask');
});

const ownerChmod = ['chmod -R u+rwx build', 'chmod -R u+w,u+x out', 'chmod -R u+r data', `chmod -R u+rwx ${LINUX_SCRATCH}/x`,
  'chmod -R u+X build', 'chmod -R u+x src/*', `chmod -R u+rwx ${REPO}/bin 2>/dev/null`];
for (const command of ownerChmod) {
  test(`chmod -R that only adds owner bits does not ask: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}
const otherChmod = ['chmod -R 700 x', 'chmod -R 0755 x', 'chmod -R u-w x', 'chmod -R u=rwx x', 'chmod -R go+r x',
  'chmod -R a+x x', 'chmod -R +x x', 'chmod -R u+rwx,g+w x', 'chmod -R ug+rwx x', 'chmod -R u+rwx x && chmod -R 777 y',
  'chown -R me x', 'chgrp -R staff x',
  // Owner-add modes, but on a folder that is not a project's, by another user, or not only owner-add.
  'chmod -R u+rwx /', 'chmod -R u+rwx ~', 'chmod -R u+rwx $HOME', 'chmod -R u+w /etc', 'chmod -R u+w /usr/local/lib',
  'chmod -R u+x ~/*', 'chmod -R u+x /*', 'chmod -R u+x {src,/etc}', 'chmod -R u+x $DIR', 'sudo chmod -R u+rwx src',
  'chmod -R u+w --reference=x src', 'chmod -R u+x -- -R 777 ~', 'chmod -R u+s ~/bin', 'chmod -R u+t src',
  'bash -c "chmod -R u+rwx /"', 'cd / && chmod -R u+rwx etc', '/bin/chmod -R u+rwx /',
  'find . -type d | xargs chmod -R u+x'];
for (const command of otherChmod) {
  test(`any other recursive permission change asks: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}

test('redirections are not delete targets, and a redirect before the command does not hide it', () => {
  assert.equal(verdict(bash(`rm -rf ${LINUX_SCRATCH}/x 2>/dev/null`)), 'allow');
  assert.equal(verdict(bash(`rm -rf ${LINUX_SCRATCH}/x > /dev/null 2>&1`)), 'allow');
  assert.equal(verdict(bash(`rm -rf ${LINUX_SCRATCH}/x &>/dev/null`)), 'allow');
  assert.equal(verdict(bash('>/dev/null rm -rf ~')), 'deny');
  assert.equal(verdict(bash(`rm -rf ${LINUX_SCRATCH}/x 2>${REPO}/err.log`)), 'allow');
  assert.equal(verdict(bash('git push origin main 2>&1 | tail -1')), 'allow');
  assert.equal(verdict(bash('git push --force origin main 2>&1')), 'deny');
  // >| writes even with noclobber set, and its | is not a pipe.
  assert.equal(verdict(bash('echo x >| /etc/hosts')), 'ask');
  assert.equal(verdict(bash('echo x 2>| /etc/hosts')), 'ask');
});

// SQL in a heredoc on a line that runs anything is judged as code: the guard cannot know which program reads the file
// (2026-11-18 review: an exemption keyed on a list of SQL clients let `python3 run_sql.py f.sql` drop a table).
const runSql = [
  [`cat > f.sql <<EOF\nDROP TABLE t;\nEOF\npython3 run_sql.py f.sql`, 'ask'],
  [`cat > f.sql <<'EOF'\nTRUNCATE TABLE orders;\nEOF\npython3 -m app.db.apply f.sql`, 'ask'],
  [`cat > f.sql <<'EOF'\nDROP TABLE users;\nEOF\nbash apply.sh f.sql`, 'ask'],
  [`python3 - <<'EOF'\nQ = "DROP TABLE users"\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport pty\npty.spawn(["snow", "sql", "-q", "TRUNCATE TABLE users"])\nEOF`, 'ask'],
  [`python3 - <<'EOF'\ncur.execute("DROP TABLE t")\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport sqlite3\nsqlite3.connect('x.db').executescript('DROP TABLE t')\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['psql', '-c', 'DROP TABLE t'])\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport duckdb\nduckdb.sql("DROP DATABASE prod")\nEOF`, 'deny'],
  [`python3 run_sql.py <<'EOF'\nDROP TABLE t;\nEOF`, 'ask'],
  [`cat > x.sql <<'EOF'\nDROP TABLE t;\nEOF\nsnowsql -f x.sql`, 'ask'],
  [`cat > x.sql <<'EOF'\nDROP DATABASE prod;\nEOF\npsql -f x.sql`, 'deny'],
  [`cat > x.sh <<'EOF'\npsql -c "DROP TABLE t"\nEOF\nbash x.sh`, 'ask'],
  [`cat > t.py <<'EOF'\nconn.execute("TRUNCATE TABLE accounts")\nEOF\npython3 t.py`, 'ask'],
  [`cat <<'EOF' | psql\nDROP TABLE t;\nEOF`, 'ask'],
  [`psql <<'EOF'\nDROP TABLE t;\nEOF`, 'ask'],
  [`duckdb x.db <<'EOF'\nDROP TABLE t;\nEOF`, 'ask'],
  [`dolt sql <<'EOF'\nDROP TABLE t;\nEOF`, 'ask'],
  [`snow sql <<'EOF'\nDROP TABLE t;\nEOF`, 'ask'],
  [`mytool <<'EOF'\nDROP TABLE t;\nEOF`, 'ask'],
  [`uv run python - <<'EOF'\nDROP_NOTE = "DROP TABLE t"\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport shutil\nshutil.rmtree('/')\nEOF`, 'deny'],
  [`python3 - <<'EOF'\nprint("DROP DATABASE prod")\nEOF`, 'deny'],
  [`cat > x.sql <<'EOF'\nDROP DATABASE prod;\nEOF\nbash -c true`, 'deny'],
];
for (const [command, expected] of runSql) {
  test(`SQL that something on the line can run is still judged: ${command.split('\n')[0].slice(0, 60)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

// --- Review holes in the variable resolver (2026-11-18 adversarial review) ----------------------------------------
// Each line assigns a scratch path, but bash may not have it in the variable when rm runs: they must not be allowed.
const notResolved = [
  // A newline after && || or | continues the list: the assignment is conditional or in a pipeline.
  [`[ 1 = 2 ] &&\n  S=${LINUX_SCRATCH}/x; rm -rf "$S"/*`, '&& then a newline'],
  [`false &&\nS=${LINUX_SCRATCH}/x\nrm -rf "$S"/*`, '&& then a newline, used on the next line'],
  [`true ||\nS=${LINUX_SCRATCH}/x\nrm -rf "$S"/*`, '|| then a newline'],
  [`echo hi |\nS=${LINUX_SCRATCH}/x\nrm -rf "$S"/*`, '| then a newline'],
  [`true && # note\nS=${LINUX_SCRATCH}/x\nrm -rf "$S"/*`, '&& then a comment and a newline'],
  // A heredoc body is data, whatever its delimiter looks like.
  [`cat > /dev/null <<\\EOF\nS=${LINUX_SCRATCH}/x\nEOF\nrm -rf "$S"/*`, 'a <<\\EOF body'],
  [`cat > /dev/null <<EOF.\nS=${LINUX_SCRATCH}/x\nEOF.\nrm -rf "$S"/*`, 'a body whose delimiter has a dot'],
  [`cat > /dev/null <<"E O"\nS=${LINUX_SCRATCH}/x\nE O\nrm -rf "$S"/*`, 'a quoted delimiter with a space'],
  [`cat <<A >/dev/null <<B\nx\nA\nS=${LINUX_SCRATCH}/x\nB\nrm -rf "$S"/*`, 'the second of two heredocs on one line'],
  // Something on the line can set the variable in a way the guard does not parse.
  [`S=${LINUX_SCRATCH}/x; eval "S=${REPO}"; rm -rf $S`, 'eval'],
  [`S=${LINUX_SCRATCH}/x; declare "S=${REPO}"; rm -rf $S`, 'declare with a quoted assignment'],
  [`S=${LINUX_SCRATCH}/x; export 'S=${REPO}'; rm -rf $S`, 'export with a quoted assignment'],
  [`S=${LINUX_SCRATCH}/x; V=S; declare $V=${REPO}; rm -rf $S`, 'declare with an indirect name'],
  [`S=${LINUX_SCRATCH}/x; printf -v "S" %s ${REPO}; rm -rf $S`, 'printf -v'],
  [`S=${LINUX_SCRATCH}/x; read "S" <<< ${REPO}; rm -rf $S`, 'read'],
  [`S=${LINUX_SCRATCH}/x; V=S; read $V <<< ${REPO}; rm -rf $S`, 'read with an indirect name'],
  [`S=${LINUX_SCRATCH}/x; source ./env.sh; rm -rf $S`, 'source'],
  [`S=${LINUX_SCRATCH}/x; . ./env.sh; rm -rf $S`, '. (source)'],
  [`S=${LINUX_SCRATCH}/x; exec {S}>/dev/null; rm -rf $S`, 'exec {VAR}> (a file descriptor number)'],
  [`S=${LINUX_SCRATCH}/x; declare -n R=S; R=${REPO}; rm -rf $S`, 'a nameref'],
  [`S=${LINUX_SCRATCH}/x; trap 'S=${REPO}' DEBUG; rm -rf $S`, 'a DEBUG trap'],
  [`S=${LINUX_SCRATCH}/x; wait -n -p S; rm -rf $S`, 'wait -p'],
  [`X='S=${LINUX_SCRATCH}/x'; $X; rm -rf $S/*`, 'a variable as the command word (never an assignment)'],
  [`X=S; $X=${LINUX_SCRATCH}/x; rm -rf "$S"/*`, 'a variable that expands to an assignment'],
  [`S=${LINUX_SCRATCH}/x; X=eval; $X "S=${REPO}"; rm -rf $S`, 'a command word that expands to eval'],
  [`cd /nonexistent && A=${LINUX_SCRATCH}; B=$A/x; rm -rf $B`, 'a chain through a value set only if cd succeeds'],
  [`HOME=/x; S=~/.claude/cache; rm -rf $S`, 'a ~ value after HOME is rebound'],
  [`S='${LINUX_SCRATCH}/x > /dev/null'; rm -rf $S`, 'a value with a > (bash splits it into words, not a redirection)'],
  [`A=${LINUX_SCRATCH}; B='$A/x'; rm -rf $B`, 'a single-quoted value keeps $A as text'],
];
for (const [command, why] of notResolved) {
  test(`variable not resolved (${why}): asks`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}

test('a quoted "2" before > is a file to delete, not a file descriptor', () => {
  assert.equal(verdict(bash(`rm -rf "${LINUX_SCRATCH}/x" "2">/dev/null`)), 'ask');
});

test('a heredoc delimiter with a dot or a space hides nothing after its body', () => {
  assert.equal(verdict(bash('cat <<EOF.\nhello\nEOF.\nrm -rf ~')), 'deny');
  assert.equal(verdict(bash("cat <<'E O'\nhello\nE O\nrm -rf ~")), 'deny');
});

/** blow.js from the review: each assignment uses the one before it ten times, so each level is ten times longer. */
function chainedAssignments(levels, last) {
  const names = 'ABCDEFGHIJKLMNOP';
  let command = `A=${LINUX_SCRATCH}/x`;
  for (let i = 1; i <= levels; i += 1) command += `; ${names[i]}=${`$${names[i - 1]}`.repeat(10)}`;
  return `${command}; ${last}`;
}

test('variable resolution has a size budget: a chain that grows 10x per level decides fast and does not allow', () => {
  for (const [last, expected] of [['rm -rf ~', 'deny'], ['rm -rf $H/y', 'ask']]) {
    const command = chainedAssignments(7, last);
    const started = process.hrtime.bigint();
    const result = verdict(bash(command));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(result, expected, command);
    assert.ok(ms < 200, `${ms.toFixed(0)} ms for ${command.length} characters`);
  }
});

test('a chain of a few uses is still resolved', () => {
  assert.equal(verdict(bash(`A=${LINUX_SCRATCH}; B=$A/x; C=$B/y$B; rm -rf $C/z`)), 'allow');
});

// --- Trivial asks after the 2026-11-18 update (13 in transcripts): text that only mentions a delete ---------------
// Each command below is one that asked, with the user's paths replaced by HOME, REPO and LINUX_SCRATCH and long
// bodies cut to the lines that made it ask.
const D = path.join(HOME, 'dev');

// 1. A heredoc written to a file is data only when every other command on the line is a read-only command from a
// short allowlist (second review, 2026-11-18: a script that imports or sources the file is invisible to the guard).
const testFileTail = [
  '',
  '// --- Review holes in the variable resolver (2026-11-18 adversarial review) ---',
  'const notResolved = [',
  `  [\`[ 1 = 2 ] &&\\n  S=\${LINUX_SCRATCH}/x; rm -rf "$S"/*\`, '&& then a newline'],`,
  `  [\`false &&\\nS=\${LINUX_SCRATCH}/x\\nrm -rf "$S"/*\`, '&& then a newline, used on the next line'],`,
  `  [\`cat > /dev/null <<\\\\EOF\\nS=\${LINUX_SCRATCH}/x\\nEOF\\nrm -rf "$S"/*\`, 'a <<\\\\EOF body'],`,
  `  [\`S=\${LINUX_SCRATCH}/x; eval "S=\${REPO}"; rm -rf $S\`, 'eval'],`,
  `  [\`S=\${LINUX_SCRATCH}/x; exec {S}>/dev/null; rm -rf $S\`, 'exec {VAR}> (a file descriptor number)'],`,
  `  [\`X='S=\${LINUX_SCRATCH}/x'; $X; rm -rf $S/*\`, 'a variable as the command word (never an assignment)'],`,
  '];',
  'for (const [command, why] of notResolved) {',
  '  test(`variable not resolved (${why}): asks`, () => {',
  "    assert.equal(verdict(bash(command)), 'ask', command);",
  '  });',
  '}',
  '',
  "test('a heredoc delimiter with a dot hides nothing after its body', () => {",
  "  assert.equal(verdict(bash('cat <<EOF.\\nhello\\nEOF.\\nrm -rf ~')), 'deny');",
  '});',
].join('\n');

const specPy = [
  '"""round 26n: the round-26m mutants with the 6 whose anchor changed re-anchored."""',
  'import os',
  'import runpy',
  '',
  '_HERE = os.path.dirname(os.path.abspath(__file__))',
  '_B = runpy.run_path(os.path.join(_HERE, "spec_r26n_base.py"))',
  'MUTANTS, TESTS, R = dict(_B["MUTANTS"]), dict(_B["TESTS"]), _B["R"]',
  '_PR = "validation/ml/probes.py"',
  'for _n in _B["STALE"]:',
  '    del MUTANTS[_n]',
  '',
  '',
  'def _e(name, rel, old, new):',
  '    assert "real_" not in name and "real_" not in rel',
  '    n = open(os.path.join(R, rel)).read().count(old)',
  '    assert n == 1, (name, rel, n, old[:80])',
  '    MUTANTS[name] = (rel, old, new)',
  '',
  '',
  '_e("n26n_pr_junit_dir_kept", _PR, "        skips = _skips(jdir)\\n    finally:\\n        shutil.rmtree(jdir, ignore_errors=True)\\n",',
  '   "        skips = _skips(jdir)\\n    finally:\\n        pass\\n")',
  '',
  'if __name__ == "__main__":',
  '    print("mutants", len(MUTANTS))',
].join('\n');

const heredocToFile = [
  // The test file is written, then node --test runs it: its code mentions rm -rf only in strings.
  [`cd ${REPO} && tail -5 hooks/g.test.js && cat >> hooks/g.test.js <<'EOF'\n${testFileTail}\nEOF\n` +
   'node --test hooks/g.test.js 2>&1 | grep -E "^# (tests|pass|fail)"', 'a test file appended, then run by node'],
  // The script is written, then python runs it: rmtree is only in a string it compares.
  [`W=${D}/aw/a6rev21; cat > $W/mut/spec_r26n.py <<'EOF'\n${specPy}\nEOF\n` +
   `cd $W/mut && ${D}/as/.venv/bin/python -B spec_r26n.py`, 'a python script written, then run by python'],
  // Nothing on the line names the file, but python3, node --version and tee are not on the allowlist.
  [`cat > ${REPO}/NOTES.md <<'EOF'\nClean up with rm -rf build/* and shutil.rmtree(tmp).\nEOF\npython3 tools/check.py`,
   'notes written while another script runs'],
  [`cat <<'EOF' > ${REPO}/NOTES.md\nrm -rf "$OUT"/*\nEOF\nnode --version`, 'cat <<EOF > file'],
  [`tee ${REPO}/NOTES.md <<'EOF' >/dev/null\nrm -rf "$OUT"/*\nEOF\npython3 -c "print(1)"`, 'tee file'],
];
for (const [command, why] of heredocToFile) {
  test(`a heredoc written to a file, with a runner beyond the allowlist on the line, keeps the text rule (${why}): asks`,
    () => {
      assert.equal(verdict(bash(command)), 'ask', command);
    });
}

const heredocRun = [
  // Transcript ask: the script is written, then bash runs it, and it deletes "$C" in the user's folders.
  [`W=${D}/aw; O=$W/a6rev149/own; cat > $O/repref.sh <<EOF\nset -u\nrun() { m=\\$1; C=\\$O/ref_\\$m; cd \\$C/python\n` +
   '  rm -rf "\\$C"; }\nfor m in a b; do run \\$m; done\nEOF\ncd $O && { bash repref.sh; bash runm.sh; } > logs/s.txt 2>&1', 'ask'],
  // Transcript ask: the file is data for hf.js, which may run each string.
  [`cd ${LINUX_SCRATCH}/fix && cat > cases-x.js <<'EOF'\nmodule.exports = [\n  \`$SHELL -c "rm -rf ~/dev"\`,\n];\nEOF\n` +
   'node hf.js cases-x.js', 'ask'],
  [`cat <<'EOF' | bash\nrm -rf ${D}/x\nEOF`, 'ask'],
  [`cat > x.sh <<'EOF'\nrm -rf ${D}/x\nEOF\nbash x.sh`, 'ask'],
  [`cat > x.sh <<'EOF'\nrm -rf ${D}/x\nEOF\nbash *.sh`, 'ask'],
  [`cat > x.sh <<'EOF'\nrm -rf ${D}/x\nEOF\ncat x.sh | bash`, 'ask'],
  [`cat > x.sh <<'EOF'\nrm -rf ${D}/x\nEOF\nbash -c "$(cat x.sh)"`, 'ask'],
  [`cat > x.sh <<'EOF'\nrm -rf ${D}/x\nEOF\nsource x.sh; bash -c true`, 'ask'],
  [`cat > tests/test_x.py <<'EOF'\nimport shutil\nshutil.rmtree('${D}/x')\nEOF\npython3 -m pytest -q`, 'ask'],
  [`cat >> ~/.bashrc <<'EOF'\nrm -rf ${D}/x\nEOF\nbash -c true`, 'ask'],
  [`cat > t.py <<'EOF'\nimport shutil\nshutil.rmtree('${D}/x')\nEOF\npython3 t.py`, 'ask'],
  [`cat > t.js <<'EOF'\nrequire('child_process').execSync('rm -rf ${D}/x')\nEOF\nnode t.js`, 'ask'],
  [`cat > /etc/cron.d/x <<'EOF'\n* * * * * root true\nEOF`, 'ask'],
  [`tee /etc/cron.d/x <<'EOF'\n* * * * * root true\nEOF`, 'ask'],
  [`cat > x.sh <<'EOF'\nrm -rf ~\nEOF\nbash x.sh`, 'deny'],
];
for (const [command, expected] of heredocRun) {
  test(`a heredoc that the line runs, or writes to a system path, is still judged: ${command.split('\n')[0].slice(0, 50)}`,
    () => {
      assert.equal(verdict(bash(command)), expected, command);
    });
}

// 2. Interpreter code that only mentions a delete inside its string literals runs no delete.
const stringsOnly = [
  [`cd ${REPO} && node -e '\nconst n=require("./hooks/evolv-destructive-guard.js"), ` +
   `o=require("${LINUX_SCRATCH}/replay/old/evolv-destructive-guard.js");\nconst cwd="${REPO}";\n` +
   'const cases=["rm -rf ~/dev{,/__pycache__}","rm -rf {src,tests/__pycache__}","find ~/dev -name __pycache__ | ' +
   'xargs rm -rf","cd /tmp/claude-1000/nonexistent; rm -rf \\"$PWD\\"/*","(cd /tmp/claude-1000/x); rm -rf \\"$PWD\\"",' +
   '"cat > f.sql <<EOF\\nDROP TABLE t;\\nEOF\\npython3 run_sql.py f.sql","rm -rf /tmp/claude-evil/x"];\n' +
   'const d=x=>{const r=x&&x.decision;return r||"allow"};\n' +
   'for(const c of cases) console.log(d(o.decide("Bash",{command:c},cwd)).padEnd(6), "->", ' +
   'd(n.decide("Bash",{command:c},cwd)).padEnd(6), "|", c.replace(/\\n/g," ⏎ "));\'', 'node -e with test cases'],
  [`cd ${REPO} && git log --oneline -1 && node --test hooks/*.test.js 2>&1 | grep -E "^# (pass|fail)"; node -e '\n` +
   'const n=require("./hooks/evolv-destructive-guard.js");const cwd=process.cwd();\n' +
   'for(const c of ["rm -rf ~/dev{,/__pycache__}","find ~/dev -name __pycache__ | xargs rm -rf"]){' +
   'const d=n.decide("Bash",{command:c},cwd);console.log((d&&d.decision||"allow").padEnd(6),c.replace(/\\n/g," ⏎ "))}\'\n' +
   `S=${LINUX_SCRATCH}; cp hooks/evolv-destructive-guard.js $S/chain2/g.js.fix; ` +
   `sed "s#S+'/chain2/g.js'#S+'/chain2/g.js.fix'#" $S/mycount.js > $S/mycount2.js; node $S/mycount2.js $S`,
  'node -e with test cases among other commands'],
  [`cd ${LINUX_SCRATCH}/fix && mkdir -p m19 && node -e "\n` +
   "const fs=require('fs');const s=fs.readFileSync('hooks/evolv-destructive-guard.js','utf8');\n" +
   "fs.writeFileSync('m19/g.js', s.replace('if (value === null || !LITERAL.test(value)) return;','if (value === null) return;'));\n" +
   `const g=require('./m19/g.js');const L='/tmp/claude-1000/-home-someone-dev/abc/scratchpad';const R='${REPO}';\n` +
   'for (const c of [\\"S=\'\\"+L+\\"/x #\'; rm -rf \\$S \\"+R, \\"S=\'\\"+L+\\"/x;\'; rm -rf \\$S\\"]) { ' +
   "const r=g.decide('Bash',{command:c},R); console.log(r?r.decision:'allow', JSON.stringify(c)); }\n\"",
  'node -e in double quotes, with \\$ escaped'],
  [`cd ${REPO} && node --test hooks/evolv-destructive-guard.test.js 2>&1 | grep -E "^# (pass|fail)"; node -e "\n` +
   "const g=require('./hooks/evolv-destructive-guard.js'); const L='/tmp/claude-1000/s';\n" +
   "for (const c of ['A='+L+'; B=\\$A/x; C=\\$B/y\\$B; rm -rf \\$C/z', 'A=\\$(printf %065536d 0); B=\\$A\\$A; rm -rf ~']) " +
   "{ const t=Date.now(); const r=g.decide('Bash',{command:c},'/'); console.log(Date.now()-t,'ms', r?r.decision:'allow'); }\"",
  'node -e with $(...) escaped'],
  [`W=${D}/aw/a6rev21; cd $W/r26n_c1; python3 -B - <<'EOF'\np='validation/ml/probes.py'\ns=open(p).read()\n` +
   "old='''    r = _run([py, \"-m\", \"pytest\"] + _P7_TESTS, cwd=REPO / \"python\", env=env)\n'''\n" +
   "new='''    jdir = Path(tempfile.mkdtemp(prefix=\"p7_junit_\", dir=a.work))\n    try:\n" +
   '        r = _run([py, "-m", "pytest", "--junitxml", str(jdir / "p7_junit.xml")] + _P7_TESTS, env=env)\n' +
   "    finally:\n        shutil.rmtree(jdir, ignore_errors=True)\n'''\n" +
   "assert s.count(old)==1; s=s.replace(old,new)\nopen(p,'w').write(s)\nEOF\n" +
   'grep -n "^import\\|^from" validation/ml/probes.py | head -20', 'python3 - editing a file by s.replace'],
  [`W=${D}/aw/a6rev21; cd $W; python3 -B - <<'EOF'\ns=open('bin/r26m_gapkill.py').read()\n` +
   "s=s.replace('''    finally:\n        shutil.rmtree(tmp)''','''    finally:\n" +
   "        shutil.rmtree(tmp)                              # logged before each launch (recursive)''')\n" +
   "open('bin/r26n_gapkill.py','w').write(s)\nEOF\n" +
   'grep -n "rmtree\\|FORCE" bin/r26n_gapkill.py; grep -n "def _scratch_copy" -A12 r26n_c1/validation/ml/probes.py | head -20',
  'python3 - writing text that contains rmtree'],
  [`python3 - <<'EOF'\nX = "rm -rf ${D}/x"\nprint(X)\nEOF`, 'python3 - printing a delete command'],
  [`python3 -c "X = 'rm -rf ${D}/x'; print(X)"`, 'python3 -c printing a delete command'],
  [`node -p '"rm -rf ${D}/x".length'`, 'node -p'],
  [`node -e 'const s = \`rm -rf ${D}/\${process.argv[1]}\`; console.log(s) // rm -rf ~' x`, 'a template literal and a comment'],
];
// Second review (2026-11-18): a line with any command beyond the read-only list keeps the text rule, because another
// command can import, source or find what the code wrote. These first-version cases ask again: the first two lines
// also run node --test, cp, sed s/…/ and a node script; the third writes a file and then requires it.
// The two python3 - cases write a plain named file that nothing on the line runs, and with only grep beside them they
// are allowed again (coordinator, third round, 2026-11-19: a write of data counts as `cat > file`).
const nowAsk = new Set(['node -e with test cases among other commands', 'node -e with $(...) escaped',
  'node -e in double quotes, with \\$ escaped']);
for (const [command, why] of stringsOnly) {
  const expected = nowAsk.has(why) ? 'ask' : 'allow';
  test(`interpreter code that only mentions a delete in strings is not a delete (${why}): ${expected}s`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

const realCode = [
  // Transcript ask: require of a computed name (S+'/x.js') keeps the text rule; chmod -R in a regex asks.
  [`cd ${LINUX_SCRATCH}/fix && node -e "\nconst S='${LINUX_SCRATCH}';\nconst B=require(S+'/rv-guards/base.js');\n` +
   "const hits=(c.match(/[^;\\n&|]*\\b(rm -[a-zA-Z]*r[a-zA-Z]*|rm -rf|find |chmod -R|xargs rm)[^;\\n&|]*/g)||[]);\n" +
   'console.log(hits);\n" 2>&1 | head -200', 'ask'],
  // Transcript ask: pkill -f is a different rule.
  [`pkill -f "r12_chain.py r12_chain.json"; cd ${D}/nj && python3 - <<'EOF'\ns=open('r12_chain.py').read()\n` +
   "open('r12a_calls.py','w').write(s[:10])\nEOF\ntimeout 300 python3 -I r12a_calls.py r12a_calls.json", 'ask'],
  [`python3 - <<'EOF'\nimport shutil\nshutil.rmtree('${D}/x')\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport shutil\nshutil.rmtree('/home/u/dev')\nEOF`, 'ask'],
  [`python3 -c "import shutil; shutil.rmtree('${D}/x')"`, 'ask'],
  [`python3 - <<'EOF'\nimport os\nos.system("rm -rf ${D}/x")\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport subprocess as sp\nsp.run("rm -rf ${D}/x", shell=True)\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nexec("import shutil; shutil.rmtree('${D}/x')")\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nprint(f"{__import__('os').system('rm -rf ${D}/x')}")\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport sys\nsys.modules["os"].system("rm -rf ${D}/x")\nEOF`, 'ask'],
  [`python3 - <<'EOF'\nimport os\nf = vars(os)["sys" + "tem"]\nf("rm -rf ${D}/x")\nEOF`, 'ask'],
  // Code that writes a file is judged as before when something else on the line can run that file.
  [`python3 - <<'EOF'\nopen('x.sh', 'w').write('rm -rf ${D}/x')\nEOF\nbash x.sh`, 'ask'],
  [`node -e 'require("fs").writeFileSync("x.sh", "rm -rf ${D}/x")'; bash x.sh`, 'ask'],
  // Code the guard cannot parse, or that bash still expands, keeps the text rule.
  [`python3 - <<'EOF'\nX = "rm -rf ${D}/x"\ndef broken(:\nEOF`, 'ask'],
  [`python3 - <<EOF\nX = "rm -rf $T/x"\nEOF`, 'ask'],
  [`node -e "console.log('rm -rf ${D}/$X')"`, 'ask'],
  [`python3 run.py - <<'EOF'\nrm -rf ${D}/x\nEOF`, 'ask'],
  [`$PY - <<'EOF'\nX = "rm -rf ${D}/x"\nEOF`, 'ask'],
  [`node -e 'require("child_process").execSync("rm -rf ~")'`, 'deny'],
  [`node -e 'require("child_process").execSync("rm -rf ${D}/x")'`, 'ask'],
  [`node -e 'console.log(\`\${require("child_process").execSync("rm -rf ~")}\`)'`, 'deny'],
  [`node -e 'require("fs").rmSync("${D}/x", { recursive: true })'`, 'ask'],
  [`node -e 'const m = require("child_" + "process"); m.execSync("rm -rf ${D}/x")'`, 'ask'],
  [`node -e 'globalThis["ev" + "al"]("rm -rf ${D}/x")'`, 'ask'],
  [`node -e 'new Function("rm -rf ${D}/x")'`, 'ask'],
  [`node -e 'if (1) /"/.test(""); require("child_process").execSync("rm -rf ${D}/x")'`, 'ask'],
  [`node -e 'console.log("rm -rf ${D}/x"'`, 'ask'],
  [`node -e '\\u0065val("rm -rf ${D}/x")'`, 'ask'],
  // Code whose output a shell runs, or that a substitution hands on, is not only text.
  [`python3 -c "print('rm -rf ${D}/x')" | bash`, 'ask'],
  [`node -e 'console.log("rm -rf ${D}/x")' | grep rm | sh`, 'ask'],
  [`python3 -c "print('rm -rf ${D}/x')" > x.sh; bash x.sh`, 'ask'],
  [`python3 - <<'EOF' | bash\nprint("rm -rf ${D}/x")\nEOF`, 'ask'],
  [`$(python3 -c "print('rm -rf ${D}/x')")`, 'ask'],
  [`eval "$(node -e 'console.log("rm -rf ${D}/x")')"`, 'ask'],
];
for (const [command, expected] of realCode) {
  test(`interpreter code that can run a delete is still judged: ${command.split('\n')[0].slice(0, 60)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

test('without python3 the code is not read, so the text rule still asks', () => {
  assert.equal(hookProcess(`python3 - <<'EOF'\nX = "rm -rf ${D}/x"\nEOF`, { PATH: '/nonexistent' }), 'ask');
  assert.equal(hookProcess(`python3 - <<'EOF'\nX = "rm -rf ${D}/x"\nEOF`, {}), 'allow');
});

// A << in quotes or a comment is not a heredoc: the lines after it are commands (2026-11-18, found with class 1).
const notHeredocs = [
  ['cat "<<EOF" > f\nrm -rf ~\nEOF', 'deny'],
  [`cat "<<EOF" > f\nrm -rf ${D}/proj\nEOF`, 'ask'],
  ["echo '<<EOF'\nrm -rf ~\nEOF", 'deny'],
  ['echo $\'<<EOF\'\nrm -rf ~\nEOF', 'deny'],
  ['# cat <<EOF\nrm -rf ~\nEOF', 'deny'],
  ['x="a\n<<EOF"\nrm -rf ~\nEOF', 'deny'],
  // In $(…) it is code again, also inside double quotes.
  ['x="$(cat <<\'EOF\'\nhello\nEOF\n)"; rm -rf ~', 'deny'],
  ["git commit -m \"$(cat <<'EOF'\nfeat: rm -rf ~ is denied\nEOF\n)\"", 'allow'],
];
for (const [command, expected] of notHeredocs) {
  test(`a << in quotes or a comment starts no heredoc: ${JSON.stringify(command).slice(0, 50)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

// 3. A non-recursive rm of a glob that names specific files in a git work tree (second review, 2026-11-18: the first
// version allowed `*.py`, `*.db`, `.git/ind*`, `~/.aws/cred*` and globs through a symlink to the home folder). The glob
// keeps a literal stem of 2+ characters before its first wildcard, and the folder, resolved through symlinks, is in a
// git work tree, outside .git, and below no home dot folder. Fixtures are real folders: the rule reads the disk.
const fs = require('node:fs');
const FIX = fs.realpathSync(fs.mkdtempSync('/tmp/guard-fixture-'));
process.on('exit', () => fs.rmSync(FIX, { recursive: true, force: true }));
const mk = (...parts) => fs.mkdirSync(path.join(FIX, ...parts), { recursive: true });
const GIT = path.join(FIX, 'repo');
const PLAIN = path.join(FIX, 'plain');
for (const d of ['repo/.git/hooks', 'repo/.git/refs/heads', 'repo/.github', 'repo/logs', 'repo/analysis/ranking',
  'repo/data', 'repo/sub', 'plain', 'home1/dev/repo/.git', 'home1/.config/tool/repo/.git', 'home2/.git', 'home2/dev/x',
  'home2/.aws']) mk(...d.split('/'));
fs.symlinkSync(PLAIN, path.join(GIT, 'link-plain'));
fs.symlinkSync(HOME, path.join(GIT, 'link-home'));
fs.symlinkSync(path.join(GIT, '.git/hooks/pre-commit'), path.join(GIT, 'hook-link'));
const HOME1 = path.join(FIX, 'home1');
const HOME2 = path.join(FIX, 'home2');

const namedFileGlobs = [
  [`~/venvs/nj/bin/python -c "import scipy,numpy;print(scipy.__version__,numpy.__version__)"; ` +
   `rm -f ${GIT}/analysis/ranking/_probe*.py; ls ${GIT}/analysis/ranking`, 'the transcript ask'],
  [`rm ${GIT}/logs/out_*.log`, 'out_*.log'],
  [`rm -f ${GIT}/r26m_*`, 'r26m_*'],
  [`rm -f ${GIT}/data/part-[0-9].csv`, 'a character class after the stem'],
  [`rm -f ${GIT}/aa_*.tmp ${GIT}/bb_*.tmp`, 'two targets'],
  [`cd ${GIT} && rm -f r26m_*`, 'a relative glob after cd'],
  [`rm -f ${GIT}/logs/out_*.log  # it's the old run`, 'a comment with an apostrophe after the glob'],
];
for (const [command, why] of namedFileGlobs) {
  test(`a non-recursive rm of named files in a git work tree is not a wide delete (${why}): allows`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}
test('a relative glob is resolved against the working directory', () => {
  assert.equal(verdict(bash('rm -f logs/out_*.log', GIT)), 'allow');
  assert.equal(verdict(bash('rm -f out_*.log', PLAIN)), 'ask');
});

const wideGlobs = [
  ['rm -f *', 'ask'],
  [`rm -f ${GIT}/*`, 'ask'],
  [`rm -f ${GIT}/*.*`, 'ask'],
  [`rm -f ${GIT}/.*`, 'ask'],
  [`rm -f ${GIT}/?*`, 'ask'],
  [`rm -f ${GIT}/*.py`, 'ask'],
  [`rm -f ${GIT}/*.db`, 'ask'],
  [`rm -f ${GIT}/data/*.parquet`, 'ask'],
  [`rm -f ${GIT}/*.pyc`, 'ask'],
  [`rm -f ${GIT}/*_probe.py`, 'ask'],
  [`rm -f ${GIT}/x*`, 'ask'],
  [`rm -f ${GIT}/?x*`, 'ask'],
  [`rm -f ${GIT}/[ab]*`, 'ask'],
  [`rm -f ${GIT}/out_*/x.log`, 'ask'],
  [`rm -f ${GIT}/{a,b}_*.log`, 'ask'],
  [`rm -rf ${GIT}/out_*.log`, 'ask'],
  [`rm -Rf ${GIT}/out_*.log`, 'ask'],
  [`rm --recursive ${GIT}/out_*.log`, 'ask'],
  [`rm -f ${GIT}/.git/ind*`, 'ask'],
  [`rm -f ${GIT}/.git/HE*`, 'ask'],
  [`rm -f ${GIT}/.git/refs/heads/ma*`, 'ask'],
  [`cd ${GIT}/.git && rm -f ind*`, 'ask'],
  [`rm -f ${PLAIN}/out_*.log`, 'ask'],
  [`rm -f ${GIT}/link-plain/out_*.log`, 'ask'],
  [`rm -f ${GIT}/link-home/.ba*`, 'ask'],
  [`rm -f ${GIT}/missing/out_*.log`, 'ask'],
  [`rm ${REPO}/logs/out_*.log`, 'ask'],
  ['rm -f build/out_*.o', 'ask'],
  ['rm -f $X/out_*.log', 'ask'],
  ['cd "$X" && rm -f out_*.log', 'ask'],
  [`find ${GIT} -name 'out_*' | xargs rm -f ${GIT}/out_*.log`, 'ask'],
  [`find ${GIT} -name x -exec rm -f ${GIT}/out_*.log \\;`, 'ask'],
  ['rm -f ~/*.txt', 'deny'],
  [`rm -f ${HOME}/*.txt`, 'deny'],
  [`rm -f ${D}/../*.txt`, 'deny'],
  ['rm -f /etc/*.conf', 'deny'],
  ['rm -f /usr/lib/*.so', 'ask'],
  ['rm -f /var/log/app_*.log', 'ask'],
  ['rm -f ~/.ssh/id_*', 'ask'],
  ['rm -f ~/.gnupg/*.gpg', 'ask'],
  ['rm -f ~/.claude/*.json', 'deny'],
  ['rm -f ~/.claude/projects/-home-someone-dev/memory/*.md', 'ask'],
  // The second review's claim-4 cases: every one asked before the first version.
  ...['rm -f ~/dev/*.py', `rm -f ${D}/proj/*.py`, 'rm -f -- *.db', `rm -f ${D}/proj/data/*.parquet`,
    'rm -f .git/objects/pack/*.pack', 'rm -f .git/ind*', 'rm -f .git/refs/heads/ma*', 'rm -f ../*.py',
    'rm -f ~/.config/*.json', 'rm -f ~/.config/gh/ho*', 'rm -f ~/.aws/cred*', 'rm -f ~/.kube/co*',
    'rm -f ~/.docker/co*', 'rm -f ~/.local/share/keyrings/*.keyring', 'rm -f ~/.password-store/*.gpg',
    'rm -f ~/.mozilla/firefox/x.default/key*', 'rm -f ~/Documents/*.pdf', 'rm -f ~/Downloads/*.zip',
    `rm -f ${D}/proj/src*`, `rm -d ${D}/proj/ab*`, `rm -f ${D}/proj/*.py*`, 'rm -f /mnt/data/*.parquet',
    'rm -f /media/u/usb/*.jpg', 'rm -f /data/*.db', 'rm -f /run/*.pid', 'rm -f /home/other/*.db',
    `cd ${D}/proj && rm -f *.py`, 'cd .. && rm -f *.py', `D=${D}; rm -f $D/*.md`, 'ln -s ~ link; rm -f link/.ba*',
    `rm -f ${D}/proj/link-to-home/.ba*`].map((c) => [c, 'ask']),
];
for (const [command, expected] of wideGlobs) {
  test(`a wide, unresolved or sensitive glob delete keeps its verdict: ${command}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

test('below the home folder, a work tree inside a dot folder, or the home folder as a work tree, keeps the old verdict',
  () => {
    assert.equal(hookProcess(`rm -f ${HOME1}/dev/repo/out_*.log`, { HOME: HOME1 }), 'allow');
    assert.equal(hookProcess(`rm -f ${HOME1}/.config/tool/repo/out_*.log`, { HOME: HOME1 }), 'ask');
    assert.equal(hookProcess(`rm -f ${HOME2}/dev/x/out_*.log`, { HOME: HOME2 }), 'ask');
    assert.equal(hookProcess(`rm -f ${HOME2}/.aws/cred*`, { HOME: HOME2 }), 'ask');
  });

// --- Second review of the relaxation (2026-11-18): what it refuted keeps the old verdict ----------------------------
const P = `rm -rf ${D}/proj/data`;
const PY = `import shutil\ndef clean():\n    shutil.rmtree('${D}/proj/data')`;
const toFile = (file, extra = '', body = P) => `cat > ${file} <<'EOF'\n${body}\nEOF${extra}`;

// B. A heredoc written to a file is data when every other command on the line is on the read-only allowlist (ls, cat
// without a heredoc, head, tail, wc, grep, sed -n …p, echo, printf, stat, diff, cmp, cd, mkdir -p, true, test, [,
// node --check, python3 -B -m py_compile) and no file it or they write is a startup or autorun file.
const allowlistedLines = [
  [toFile(`${GIT}/tool.py`, `\npython3 -B -m py_compile ${GIT}/tool.py`, 'import shutil\nshutil.rmtree(tmp)'),
   'python3 -B -m py_compile'],
  [`cd ${GIT} && ${toFile('t.js', '\nnode --check t.js && ls -la t.js', "require('fs').rmSync(dir, { recursive: true })")}`,
   'node --check after cd'],
  [`mkdir -p ${GIT}/sub && ${toFile(`${GIT}/sub/x.py`, `\nhead -3 ${GIT}/sub/x.py; wc -l ${GIT}/sub/x.py; ` +
   `grep -n rm ${GIT}/sub/x.py | tail -2; sed -n '1,5p' ${GIT}/sub/x.py; stat ${GIT}/sub/x.py >/dev/null; ` +
   `[ -s ${GIT}/sub/x.py ] && python3 -B -m py_compile ${GIT}/sub/x.py && echo ok || printf 'bad\\n'`)}`,
   'every allowlisted reader'],
  [`tee ${GIT}/notes.txt <<'EOF' >/dev/null\nrm -rf "$OUT"/*\nEOF\nnode --check ${GIT}/a.js`, 'tee to a file'],
  [`W=${GIT}; cat > $W/n.md <<'EOF'\n${P}\nEOF\ndiff $W/n.md $W/m.md; cmp $W/n.md $W/m.md; true; node --check $W/a.js`,
   'a literal assignment, diff, cmp'],
];
for (const [command, why] of allowlistedLines) {
  test(`a heredoc written to a file, with only allowlisted readers on the line, is data (${why}): allows`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}

const N = `\nnode --check ${GIT}/a.js`;
const notData = [
  // The second review's claim-1 cases: a runner the guard cannot follow, or a file that runs unasked.
  [`cat > helpers.py <<'EOF'\n${PY}\nEOF\npython3 main.py`, 'a module main.py imports'],
  [`cat > src/pkg/clean.py <<'EOF'\n${PY}\nEOF\ncd ${D}/proj && python3 scripts/run.py --all`, 'a package module'],
  [toFile('lib.sh', '\nbash run.sh'), 'a file run.sh sources'],
  [toFile('steps/clean.sh', '\npython3 pipeline.py'), 'a step a python pipeline runs'],
  [toFile('lib/clean.js', '\nnode index.js', `require('fs').rmSync('${D}/proj/data',{recursive:true})`),
   'a module index.js requires'],
  [toFile('lib/clean.js', '\nnode --test tests/x.test.js', `require('fs').rmSync('${D}/proj/data',{recursive:true})`),
   'node --test'],
  [`cat > tests/helpers.py <<'EOF'\n${PY}\nclean()\nEOF\npython3 tests/test_a.py`, 'a test helper'],
  [toFile('.husky/pre-commit', "\ngit add -A && git commit -m wip && python3 -c 'print(1)'"), 'a husky hook'],
  [`cat > .git/config <<'EOF'\n[core]\n\tfsmonitor = ${P}\nEOF\ngit status; python3 -c 1`, '.git/config fsmonitor'],
  [`cat > ~/.claude/settings.json <<'EOF'\n{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"${P}"}]}]}}` +
   "\nEOF\nnode -e 'console.log(1)'", 'Claude hooks'],
  [toFile('~/.bash_aliases', '\nbash -ic true'), '.bash_aliases'],
  [toFile('~/.config/fish/config.fish', '\nfish -c true'), 'fish config'],
  [toFile('Dockerfile', '\ndocker build -t x .', `RUN ${P}`), 'Dockerfile'],
  [toFile('x.sh', '\nbash x.{sh,}'), 'a brace name'],
  [toFile('x.sh', '\nbash "x"".sh"'), 'a quote-split name'],
  [toFile('x.sh', '\nbash x\\.sh'), 'an escaped name'],
  [toFile('x.sh', '\nbash <(cat x.sh)'), 'process substitution'],
  [toFile('x.sh', '\nbash <(cat x.sh) && python3 -V'), 'process substitution and python'],
  [toFile('x.sh', '\nchmod +x x.sh; nohup ./x.sh & python3 -c \'print(1)\''), 'nohup'],
  [`( cat > /dev/stdout <<'EOF'\n${P}\nEOF\n) | bash`, 'a subshell piped to bash'],
  [toFile('Dockerfile', '\ndocker build .'), 'docker build'],
  // Allowlisted readers do not excuse anything else on the line, or a reader that can run or copy the file.
  [toFile(`${GIT}/tool.py`, `\npython3 -B -m py_compile ${GIT}/tool.py && python3 ${GIT}/tool.py`), 'py_compile, then run'],
  [toFile(`${GIT}/t.js`, `\nnode --check ${GIT}/t.js; node ${GIT}/t.js`), 'node --check, then run'],
  [toFile(`${GIT}/x.sh`, `${N}; sed -n '1e' ${GIT}/x.sh`), 'sed -n with the e command'],
  [toFile(`${GIT}/x.sh`, `${N}; sed -i 's/a/b/' ${GIT}/x.sh`), 'sed -i'],
  [toFile(`${GIT}/x.sh`, `\ncat ${GIT}/x.sh >> ~/.bashrc${N}`), 'cat into a startup file'],
  [toFile(`${GIT}/x.sh`, `\necho done > ${GIT}/.git/hooks/post-commit${N}`), 'echo into a git hook'],
  [toFile(`${GIT}/x.sh`, `\n./ls${N}`), 'a local program named like a reader'],
  [toFile(`${GIT}/x.sh`, `\nmkdir ${GIT}/m${N}`), 'mkdir without -p'],
  [toFile(`${GIT}/x.sh`, `\nnode --check --require ./x.js ${GIT}/a.js`), 'node --check with another option'],
  [toFile(`${GIT}/x.py`, `\nPYTHONPATH=${GIT} python3 -B -m py_compile ${GIT}/x.py`), 'py_compile with PYTHONPATH'],
  [toFile(`${GIT}/x.py`, `\npython3 -m py_compile ${GIT}/x.py`), 'py_compile without -B'],
  [`cd ${GIT} && ${toFile('argparse.py', '\npython3 -B -m py_compile x.py', PY)}`, 'a module py_compile imports'],
  [`cd ${GIT} && ${toFile('traceback/__init__.py', '\npython3 -B -m py_compile x.py', PY)}`, 'a package py_compile imports'],
  [toFile(`${GIT}/x.sh`, `\nF=${GIT}/x.sh; bash $F${N}`), 'bash through a variable'],
  [`cat > $OUT/x.sh <<'EOF'\n${P}\nEOF${N}`, 'an unresolved target'],
  [`cat <<'EOF' > ${GIT}/a.txt; cat <<'Z' > ${GIT}/b.txt\n${P}\nEOF\nhi\nZ${N}`, 'two heredocs on a line'],
  // Startup and autorun files: a write there runs later, with nothing on the line.
  ...['~/.bashrc', '~/.profile', '~/.bash_profile', '~/.bash_aliases', '~/.zshrc', '~/.config/fish/config.fish',
    '~/.config/autostart/x.desktop', '~/.config/systemd/user/x.service', '~/.claude/settings.json',
    '~/.claude/hooks/x.js', '~/.local/bin/ls', `${GIT}/.git/hooks/pre-commit`, `${GIT}/.git/config`,
    `${GIT}/.husky/pre-commit`, `${GIT}/Makefile`, `${GIT}/package.json`, `${GIT}/pyproject.toml`, `${GIT}/setup.py`,
    `${GIT}/conftest.py`, `${GIT}/sitecustomize.py`, `${GIT}/usercustomize.py`, `${GIT}/x.pth`, `${GIT}/.envrc`,
    `${GIT}/crontab`, '/var/spool/cron/crontabs/u', `${GIT}/hook-link`, '/dev/stdout']
    .map((file) => [toFile(file, N), `a write to ${file}`]),
];
for (const [command, why] of notData) {
  test(`a heredoc written to a file keeps the text rule when ${why}: asks`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}

// C. A comment ends at its newline: a quote in it hides no later line (pre-existing, found by the second review).
// `#` starts a comment only at the start of a word, outside quotes.
const comments = [
  [`# clean the user's build\nrm -rf ${D}/proj/data`, 'ask'],
  ["echo hi # it's done\nrm -rf ~", 'deny'],
  [`echo hi # it's done\nrm -rf ${D}/proj/data`, 'ask'],
  [`# don't forget\nrm -rf ${D}/proj/data`, 'ask'],
  [`cd ${D}/proj  # Claude's repo\nrm -rf data build`, 'ask'],
  [`ls # what's here\nrm -rf ${D}/proj/data`, 'ask'],
  [`echo "a" # "quote\nrm -rf ${D}/proj/data`, 'ask'],
  ["git status # it's clean | true\nrm -rf ~", 'deny'],
  // An escaped space or ; before # is part of a word: no comment, so the heredoc after it is real.
  ["echo a\\ #b; cat <<'EOF'\ncat > f <<'Z'\nEOF\nrm -rf ~\nZ", 'deny'],
  [`echo a\\ #b; cat <<'EOF'\ncat > f <<'Z'\nEOF\nrm -rf ${D}/proj/data\nZ`, 'ask'],
  ["echo a\\;#b; cat <<'EOF'\ncat > f <<'Z'\nEOF\nrm -rf ~\nZ", 'deny'],
  [`printf '%s\\n' x\\ #y > notes.txt; cat >> notes.txt <<'EOF'\ncat > f <<'Z'\nEOF\nrm -rf ${D}/proj/data\nZ`, 'ask'],
  // # inside a word, in quotes or in ${#…} is not a comment.
  ['echo a#b; rm -rf ~', 'deny'],
  ['echo "#"; rm -rf ~', 'deny'],
  ["echo '#'; rm -rf ~", 'deny'],
  ['echo ${#HOME}; rm -rf ~', 'deny'],
  ['echo {#x,y}; rm -rf ~', 'deny'],
  ["rm -rf ~ # it's gone", 'deny'],
  // A quote inside $(…) or `…` in double quotes is the substitution's own (bash: x="$(echo "'")" is valid).
  [`x="$(echo "'")"\nrm -rf ~`, 'deny'],
  ['x="`echo "\'"`"\nrm -rf ~', 'deny'],
  [`x="$(echo "'")"; rm -rf ${D}/proj/data`, 'ask'],
  // case … in a) inside a substitution: its ) is not followed, so the line asks whatever else it holds.
  [`x="$(case a in a) echo "'";; esac)"\nrm -rf ~`, 'ask'],
  ['y=`case a in a) echo x;; esac`; ls', 'ask'],
];
for (const [command, expected] of comments) {
  test(`comments and substitutions hide no command: ${JSON.stringify(command).slice(0, 60)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}

// D. Interpreter code the checkers could misread, or that something else on the line can reach, keeps the text rule.
const T = `${D}/proj/data`;
const R = `rm -rf ${T}`;
const stdin = (code) => `python3 - <<'EOF'\n${code}\nEOF`;
const misread = [
  [stdin(`# coding: utf-7\n# +AAo-import os+AAo-os.system('${R}')`), 'a utf-7 coding cookie on stdin'],
  [`python3 -c "# coding: utf-7\n# +AAo-import os+AAo-os.system('${R}')"`, 'a utf-7 coding cookie in -c'],
  [stdin(`#!/usr/bin/env python3\n# -*- coding: latin-1 -*-\nX = '${R}'`), 'a latin-1 cookie on line 2'],
  [toFile('t.py', '\npython3 t.py', `# coding: utf-7\n# +AAo-import os+AAo-os.system('${R}')`), 'a utf-7 file run'],
  [stdin(`import yaml\nyaml.unsafe_load("!!python/object/apply:os.system ['${R}']")`), 'yaml.unsafe_load'],
  [stdin(`import yaml\nyaml.load("!!python/object/apply:os.system ['${R}']", Loader=yaml.Loader)`), 'yaml.load'],
  [stdin(`import yaml as y\ny.full_load("!!python/object/apply:os.system ['${R}']")`), 'yaml.full_load'],
  [stdin(`from yaml import load, Loader\nload("!!python/object/apply:os.system ['${R}']", Loader)`), 'from yaml import load'],
  [stdin(`import operator, os\nm = operator.methodcaller('system', '${R}')\nm(os)`), 'operator.methodcaller'],
  [stdin(`from operator import attrgetter\nimport os\nattrgetter('system')(os)('${R}')`), 'operator.attrgetter'],
  // runpy starts a module or file as __main__: timeit, code, pdb or trace then run a string or file from argv.
  [`python3 -c 'import runpy,sys; sys.argv=["t","__import__(\\"os\\").system(\\"${R}\\")"]; ` +
   `runpy.run_module("timeit", run_name="__main__")'`, 'runpy.run_module of timeit'],
  [`python3 -c 'import runpy,sys; sys.argv=sys.argv[1:]; runpy.run_module("timeit", run_name="__main__")' ` +
   `t '__import__("os").system("${R}")'`, 'runpy.run_module with the code in argv'],
  [stdin(`from runpy import run_path\nimport sys\nsys.argv = ["t", "__import__('os').system('${R}')"]\n` +
   `run_path("/usr/lib/python3.12/timeit.py", run_name="__main__")`), 'runpy.run_path of timeit'],
  [`PYTHONPATH=evil python3 -c "import json; print('${R}')"`, 'PYTHONPATH='],
  [`PYTHONSTARTUP=x.py python3 -c "print('${R}')"`, 'PYTHONSTARTUP='],
  [`export PYTHONPATH=evil; python3 -c "import json; print('${R}')"`, 'export PYTHONPATH='],
  [`NODE_OPTIONS="--require ./x.js" node -e 'console.log("${R}")'`, 'NODE_OPTIONS='],
  [`node -e 'console.log(1) //  require("child_process").execSync("${R}")'`, 'U+2028 ends a line comment'],
  [`node -e 'console.log(1) //  require("child_process").execSync("${R}")'`, 'U+2029 ends a line comment'],
  [`node -e 'console.log(1) // \rrequire("child_process").execSync("${R}")'`, 'a lone CR ends a line comment'],
  [`node -e '<!-- \`\nrequire("child_process").execSync("${R}")\n// \`'`, 'an HTML open comment'],
  [`node -e 'const a = 1\n--> \`\nrequire("child_process").execSync("${R}")\n// \`'`, 'an HTML close comment'],
  [`node -e 'if (1) /\`/.test("a")\nrequire("child_process").execSync("${R}")\nif (1) /\`/.test("a")'`,
   'a regex after )'],
  [`node -e 'while (0) /\`/; require("child_process").execSync("${R}"); while (0) /\`/'`, 'a regex after while (…)'],
  [`node -e 'let x = {} /"/; console.log("${R}") //"/'`, 'a / after }'],
  // Code that writes a file, or output sent to a startup file, or a runner the guard cannot follow on the line.
  [`python3 -c "print('${R}')" > ~/.bashrc`, 'python output into ~/.bashrc'],
  [`node -e "console.log('${R}')" > ~/.bashrc`, 'node output into ~/.bashrc'],
  [`node -e 'require("fs").writeFileSync(require("os").homedir()+"/.bashrc", "${R}")'`, 'node writes ~/.bashrc'],
  [`node -e 'require("fs").appendFileSync(".git/hooks/pre-commit", "${R}")'`, 'node appends to a git hook'],
  [stdin(`import fileinput\nfor l in fileinput.input('x.sh', inplace=True): print('${R}')`) + '\nbash x.sh',
   'fileinput, then bash'],
  [stdin(`import numpy as np\nnp.savetxt('x.sh', ['${R}'], fmt='%s')`) + '\nbash x.sh', 'np.savetxt, then bash'],
  [stdin(`import pandas as pd\npd.Series(['${R}']).to_csv('x.sh', index=False, header=False)`) + '\nbash x.sh',
   'to_csv, then bash'],
  [`python3 -c "print('${R}')"; bash x.sh`, 'another runner on the line'],
];
for (const [command, why] of misread) {
  test(`interpreter code keeps the text rule (${why}): asks`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}

const readable = [
  [stdin(`import yaml\ncfg = yaml.safe_load(open("c.yml"))  # ${R}\nprint(cfg)`), 'yaml.safe_load'],
  [stdin(`import json\nd = json.load(open("c.json"))  # ${R}\nprint(d)`), 'json.load'],
  [stdin(`# -*- coding: utf-8 -*-\nX = '${R}'\nprint(X)`), 'a utf-8 cookie'],
  [`PYTHONDONTWRITEBYTECODE=1 python3 -c "print('${R}')"`, 'an unrelated environment variable'],
  [`python3 -c "print('${R}')" > ${GIT}/out.txt 2>&1`, 'output to a plain file'],
  [`node -e 'const n = (1 + 2) * 3; console.log("${R}", n)'`, 'parentheses without a following /'],
  [`cd ${GIT} && python3 -c "print('${R}')" | grep rm | head -1`, 'output to readers'],
];
for (const [command, why] of readable) {
  test(`interpreter code that only mentions a delete is still relaxed (${why}): allows`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}

test('python code over the size cap keeps the text rule', () => {
  const small = stdin(`X = "${R}"\n`.repeat(100));
  const big = stdin(`X = "${R}"\nY = "${'a'.repeat(70 * 1024)}"\n`);
  assert.equal(verdict(bash(small)), 'allow');
  assert.equal(verdict(bash(big)), 'ask');
});

// --- Third review round (2026-11-19): continuations, the working folder, stems, readers that run code ------------
// 1. bash removes a backslash-newline outside single quotes, before it reads words: `ls \⏎# x` makes `#` start a word
// (a comment), `a\⏎#b` is the word a#b. A backquoted string ends at the first backquote not escaped, whatever quotes
// are in it. A heredoc delimiter $'EOF' or $"EOF" is EOF.
const continuations = [
  ["ls -la \\\n# don't list hidden\nrm -rf ~", 'deny', 'a comment after a continuation'],
  [`ls -la \\\n# don't list hidden\nrm -rf ${D}/proj/data\necho 'done'`, 'ask', 'the same, a later quote'],
  ["echo a \\\n#b 'x\nrm -rf ~\n#'", 'deny', 'a space, then a continuation, then #'],
  ["echo a\\\n#b; cat <<'EOF'\ncat > f <<'Z'\nEOF\nrm -rf ~\nZ", 'deny', 'a#b is one word, so the heredoc is real'],
  [`echo a\\\n#b; cat <<'EOF'\ncat > f <<'Z'\nEOF\nrm -rf ${D}/proj/data\nZ`, 'ask', 'the same, ask level'],
  ['r\\\nm -rf ~', 'deny', 'a command word split by a continuation'],
  ['rm -rf \\\n  ~', 'deny', 'a target on the next line'],
  ["cat <<'EOF' > f \\\n; rm -rf ~\nx\nEOF", 'deny', 'a heredoc line continued: the body starts after it'],
  ['cat > f <<EOF\nEO\\\nF\nrm -rf ~\nEOF', 'deny', 'an unquoted body: EO\\⏎F is the delimiter'],
  ["bash -c 'rm -rf \\\n~'", 'deny', 'a continuation in code bash runs'],
  ['echo `#\'`\nrm -rf ~\necho "\'"', 'deny', 'a quote in a comment in backquotes'],
  ['x=`#\'`; rm -rf ~; echo "\'"', 'deny', 'the same, on one line'],
  [`x=\`echo "'"\`; rm -rf ${D}/proj/data`, 'ask', 'a quote in backquotes'],
  ["cat <<$'EOF'\nx\nEOF\nrm -rf ~\n$EOF", 'deny', "a $'EOF' delimiter"],
  ['cat <<$"EOF"\nx\nEOF\nrm -rf ~\n$EOF', 'deny', 'a $"EOF" delimiter'],
  ['echo a\r# ; rm -rf ~', 'deny', 'a CR is a word character: no comment'],
  ['echo a\v# ; rm -rf ~', 'deny', 'a vertical tab is a word character'],
  ['echo a # ; rm -rf ~', 'deny', 'a no-break space is a word character'],
];
for (const [command, expected, why] of continuations) {
  test(`bash's backslash-newline, backquotes and delimiters (${why}): ${expected}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}
test('a quote in a comment in backquotes hides no heredoc after it', () => {
  // bash: x is empty, the heredoc is real, and its body is only written to notes.md.
  assert.equal(verdict(bash("x=`#'`; cat > notes.md <<'EOF'\nrm -rf ~\nEOF")), 'allow');
});
test('a CR before # inside one simple command: the words after it are still targets', () => {
  assert.equal(verdict(bash(`rm -rf ${D}/proj/x \r# ~`)), 'deny');
});
test("a $'…' delimiter with an escape cannot be read for certain: asks", () => {
  assert.equal(verdict(bash("cat > f <<$'E\\x4fF'\nx\nEOF\necho hi\nE\\x4fF")), 'ask');
});
const stillAllowed = [
  'python3 train.py \\\n  --epochs 3 \\\n  --lr 0.1',
  'cat > run.sh <<EOF\npython3 x.py \\\n  --a 1\nEOF\nls',
  `rm -f ${GIT}/logs/out_*.log \\\n  ${GIT}/logs/err_*.log`,
  'git commit -m "x \\\ny"',
];
for (const command of stillAllowed) {
  test(`a continuation alone changes nothing: ${JSON.stringify(command).slice(0, 60)}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}

// 2. Rule A resolves a relative glob only where the folder is certain: no cd on the line, or one leading
// `cd <literal path> &&`. A subshell, pushd, popd, a cd after another command, $(cd …), eval, env -C or --chdir, or
// a computed cd leaves the folder unknown (the second review ran these from a home folder and deleted ~/.ba*).
const unsureFolder = [
  `(cd ${GIT} && make); rm -f out_*.log`,
  `pushd ${GIT} && make; popd; rm -f out_*.log`,
  `false && cd ${GIT}; rm -f out_*.log`,
  `cd ${GIT} & rm -f out_*.log`,
  `cd ${GIT} | true; rm -f out_*.log`,
  `x=$(cd ${GIT}); rm -f out_*.log`,
  `cd ${GIT} && ls; rm -f out_*.log`,
  `cd ${GIT} || exit; rm -f out_*.log`,
  `ls && cd ${GIT} && rm -f out_*.log`,
  `cd ${GIT} && cd logs && rm -f out_*.log`,
  `D=${GIT}; cd $D && rm -f out_*.log`,
  `c\\d ${GIT} && cd logs && rm -f out_*.log`,
];
for (const command of unsureFolder) {
  test(`a relative glob where the folder is not certain asks: ${command.replace(FIX, '<fx>')}`, () => {
    assert.equal(verdict(bash(command, PLAIN)), 'ask', command);
  });
}
const unsureFromRepo = [`eval cd ${PLAIN}; rm -f out_*.log`, `env --chdir=${PLAIN} rm -f out_*.log`,
  `sudo --chdir=${PLAIN} rm -f out_*.log`, `cd ${GIT} && source x.sh && rm -f out_*.log`];
for (const command of unsureFromRepo) {
  test(`a folder change the guard cannot follow keeps the old verdict: ${command.replace(FIX, '<fx>')}`, () => {
    assert.equal(verdict(bash(command, GIT)), 'ask', command);
  });
}
test('one leading cd to a literal path, then only &&: the glob is resolved there', () => {
  assert.equal(verdict(bash(`cd ${GIT} && rm -f out_*.log`, PLAIN)), 'allow');
  assert.equal(verdict(bash(`cd ${GIT} && ls && rm -f logs/out_*.log`, PLAIN)), 'allow');
  assert.equal(verdict(bash(`cd ${GIT} && ls; rm -f logs/out_*.log`, GIT)), 'allow');
  assert.equal(verdict(bash(`(cd ${PLAIN} && make); rm -f ${GIT}/out_*.log`, PLAIN)), 'allow');
});

// 3. The stem: 3+ literal characters, not starting with a dot, with _ - or a digit, or 4+ characters. No dot folder
// anywhere below the home folder or the work tree root, no bare repo inside the work tree, and not the guard's files.
mk('repo', '.private');
mk('repo', 'remote.git', 'objects', 'pack');
mk('repo', 'remote.git', 'refs', 'heads');
fs.writeFileSync(path.join(GIT, 'remote.git', 'HEAD'), 'ref: refs/heads/main\n');
fs.symlinkSync(path.join(GIT, '.private'), path.join(GIT, 'pv'));
const stems = [
  ['pv/ke_*', 'ask'],
  ['te*', 'ask'], ['ma*', 'ask'], ['data/20*', 'ask'], ['tmp*', 'ask'], ['out*', 'ask'], ['.env*', 'ask'],
  ['.e*', 'ask'], ['.gi*', 'ask'], ['.git*', 'ask'], ['.private/ke_*', 'ask'], ['.github/ci_*.yml', 'ask'],
  ['remote.git/objects/pack/pack-*', 'ask'], ['remote.git/HEAD*', 'ask'], ['remote.git/refs/heads/main*', 'ask'],
  ['main*', 'allow'], ['ab1*', 'allow'], ['a-b*', 'allow'], ['r26m_*', 'allow'], ['_probe*.py', 'allow'],
  ['out_*', 'allow'], ['data/2026-*', 'allow'], ['test_*', 'allow'],
];
for (const [glob, expected] of stems) {
  test(`the stem rule: rm -f ${glob} in a work tree: ${expected}`, () => {
    assert.equal(verdict(bash(`rm -f ${glob}`, GIT)), expected);
  });
}
test("a glob that would match the guard's own files asks; another glob beside them does not", () => {
  mk('repo', 'hooks');
  const copy = path.join(GIT, 'hooks', 'evolv-destructive-guard.js');
  fs.copyFileSync(path.join(__dirname, 'evolv-destructive-guard.js'), copy);
  const guard = require(copy);
  const run = (command) => verdict(guard.decide('Bash', { command }, GIT));
  assert.equal(run('rm -f hooks/evolv-de*'), 'ask');
  assert.equal(run('rm -f hooks/evol*'), 'ask');
  assert.equal(run(`rm -f ${GIT}/hooks/evolv-*.js`), 'ask');
  assert.equal(run('rm -f hooks/out_*'), 'allow');
});
test('a glob that would match a copy of the guard files in another work tree asks', () => {
  mk('repo', 'kit', 'hooks');
  fs.writeFileSync(path.join(GIT, 'kit', 'hooks', 'evolv-destructive-guard.js'), '');
  assert.equal(verdict(bash('rm -f kit/hooks/evolv-de*', GIT)), 'ask');
  assert.equal(verdict(bash('rm -f kit/hooks/out_*', GIT)), 'allow');
});

// 4. Readers that run code, a shadowing file written by any redirect, more autorun names.
const readersThatRun = [
  [toFile(`${GIT}/x.sh`, `\n[ -v 'a[$(bash x.sh)]' ]${N}`), 'test -v'],
  [toFile(`${GIT}/x.sh`, `\ntest -v 'a[$(bash x.sh)]'${N}`), 'test -v, spelled out'],
  [toFile(`${GIT}/x.sh`, `\nprintf -v 'a[$(bash x.sh)]' y${N}`), 'printf -v'],
  [`cd ${GIT} && ${toFile('notes.md', `\nprintf 'import os' > argparse.py; python3 -B -m py_compile y.py`)}`,
   'a printf redirect that shadows a standard module'],
  [`cd ${GIT} && ${toFile('notes.md', '\necho x > json.py && python3 -B -m py_compile y.py')}`, 'echo into json.py'],
  ...['.mcp.json', '.yarnrc.yml', '.justfile', 'justfile', 'lefthook.yml', '.gitlab-ci.yml']
    .map((name) => [toFile(`${GIT}/${name}`, N), `a write to ${name}`]),
];
for (const [command, why] of readersThatRun) {
  test(`a heredoc written to a file keeps the text rule when ${why}: asks`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}
test('an installed module name is shadowed too', () => {
  const r = spawnSync('python3', ['-I', '-c', 'import pkgutil, site, sys; print(next(m.name for m in pkgutil.' +
    'iter_modules(site.getsitepackages() + [site.getusersitepackages()]) if m.name.isidentifier() and ' +
    'm.name not in sys.stdlib_module_names))'], { encoding: 'utf8' });
  const name = r.stdout.trim();
  assert.ok(name, 'python3 lists at least one installed module');
  assert.equal(verdict(bash(`cd ${GIT} && ${toFile(`${name}.py`, '\npython3 -B -m py_compile y.py')}`)), 'ask', name);
});
test('python -c or python on stdin after a redirect that writes a module it imports keeps the text rule', () => {
  assert.equal(verdict(bash(`cd ${GIT} && printf 'import os' > json.py; python3 -c 'import json  # ${R}'`)), 'ask');
  assert.equal(verdict(bash(`cd ${GIT} && echo x > json.py\n${stdin(`import json  # ${R}`)}`)), 'ask');
  assert.equal(verdict(bash(`cd ${GIT} && echo x > notes.txt; python3 -c 'import json  # ${R}'`)), 'allow');
});
test('interpreter code after a redirect that writes a file it could load keeps the text rule', () => {
  assert.equal(verdict(bash(`cd ${GIT} && printf 'import os' > helper.py; python3 -c 'import helper  # ${R}'`)), 'ask');
  assert.equal(verdict(bash(`cd ${GIT} && printf x > lib.js; node -e 'require("./lib") // ${R}'`)), 'ask');
  assert.equal(verdict(bash(`cd ${GIT} && printf x > notes.txt; node -e 'require("./notes.txt") // ${R}'`)), 'ask');
  assert.equal(verdict(bash(`cd ${GIT} && node -e 'console.log(1) // ${R}' > out.txt`)), 'allow');
});
test('a reader with -v elsewhere, or printf without -v, is still a reader', () => {
  assert.equal(verdict(bash(toFile(`${GIT}/x.md`, `\nprintf '%s\\n' done; [ -s ${GIT}/x.md ]${N}`))), 'allow');
  assert.equal(verdict(bash(toFile(`${GIT}/x.md`, `\npython3 -B -m py_compile ${GIT}/y.py > ${GIT}/out.txt`))), 'allow');
});

// 5. Code with real effects keeps the old verdict.
const realEffects = [
  [stdin(`import git\ngit.Repo('.').git.clean('-fdx')  # then ${R}`), 'GitPython clean'],
  [stdin(`import git\ngit.Repo('.').git.reset('--hard')  # ${R}`), 'GitPython reset'],
  [stdin(`from git import Repo\nRepo('.').head.reset(index=True, working_tree=True)  # ${R}`), 'Repo().head.reset'],
  [stdin(`r = repo_of('.')\nr.git.checkout('--', '.')  # ${R}`), 'a .git attribute'],
  [stdin(`import sys, tarfile\ntarfile.open(sys.argv[1]).extractall(sys.argv[2])  # ${R}`), 'extractall'],
  [stdin(`import shutil\nshutil.unpack_archive('a.zip', 'data')  # ${R}`), 'unpack_archive'],
  [`python3 -c 'import os; os.kill(-1, 15)  # ${R}'`, 'os.kill'],
  [`node -e 'process.kill(-1) // ${R}'`, 'process.kill(-1)'],
  [`node -e 'process.kill(-123, "SIGTERM") // ${R}'`, 'process.kill of a group'],
  [`node -e 'process["kill"](-1) // ${R}'`, 'process["kill"]'],
  [`python3 -c 'import functools, shutil; g = functools.reduce(getattr, ["rmtre" "e"], shutil); g("${T}")  # ${R}'`,
   'functools.reduce with getattr'],
  [`python3 -c 'import inspect, shutil; g = [f for n, f in inspect.getmembers(shutil) if n == "r" "mtree"][0]; ` +
   `g("${T}")  # ${R}'`, 'inspect.getmembers'],
  [`python3 -c 'g = getattr; import shutil; f = g(shutil, "rmtre" "e"); f("${T}")  # ${R}'`, 'getattr bound to a name'],
];
for (const [command, why] of realEffects) {
  test(`code with a real effect keeps the old verdict (${why}): asks`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}
test('getattr called with a constant name, and plain code, are still relaxed', () => {
  assert.equal(verdict(bash(`python3 -c 'import sys; print(getattr(sys, "version"))  # ${R}'`)), 'allow');
  assert.equal(verdict(bash(stdin(`import pandas as pd\nprint(pd.DataFrame().reset_index())  # ${R}`))), 'allow');
});

// Surviving mutants of the second review. B6: cat with a heredoc is not a reader. C2: a comment is not targets.
test('a second cat that takes a heredoc keeps the first body under the text rule', () => {
  const command = `cat > ${GIT}/a.md <<'EOF'\n${P}\nEOF\ncat <<'Z'\nhello\nZ${N}`;
  assert.equal(verdict(bash(command)), 'ask', command);
});
test('a glob in a comment after an rm is not a target', () => {
  assert.equal(verdict(bash(`rm -f ${GIT}/logs/out_*.log  # not *.py`)), 'allow');
  assert.equal(verdict(bash('rm -f out_*.log # keep ?x*', GIT)), 'allow');
});

// 6. Delete words only as data in Python or Node code (coordinator, 2026-11-19): a string that goes to str.replace, a
// list or a write of a plain named file runs nothing, as with `cat > file`. The same string given to a run sink asks.
const dataOnly = [
  [stdin('s=open("t.js").read()\ns=s.replace("rm -f a_*.tmp","rm -f aa_*.tmp")\nopen("t.js","w").write(s)'),
   'str.replace, then a write back to the same file'],
  [stdin(`p = "cases.txt"\nopen(p, "w").write("${R}\\n")`), 'a write to a name bound once to a string'],
  [stdin(`from pathlib import Path\nPath("cases.txt").write_text("import shutil; shutil.rmtree('${T}')")`),
   'Path.write_text'],
  [stdin(`cases = ["${R}", "rm -f a_*"]\nprint(len(cases))`), 'a list'],
  [`node -e 'require("fs").writeFileSync("cases.txt", "${R}")'`, 'node writeFileSync of a plain name'],
];
for (const [command, why] of dataOnly) {
  test(`delete words only as data in interpreter code (${why}): allows`, () => {
    assert.equal(verdict(bash(command, GIT)), 'allow', command);
  });
}
const dataReachesASink = [
  [stdin(`import subprocess\nsubprocess.run("${R}", shell=True)`), 'subprocess.run'],
  [stdin(`import os\nos.system("${R}")`), 'os.system'],
  [stdin(`exec("import shutil; shutil.rmtree('${T}')")`), 'exec'],
  [`bash -c '${R}'`, 'bash -c'],
  [`${stdin(`open("x.sh", "w").write("${R}")`)}\nbash x.sh`, 'a write of the file that the line then runs'],
  [stdin(`open(".bashrc", "w").write("${R}")`), 'a write to a startup file'],
  [stdin(`open(".git/hooks/pre-commit", "w").write("${R}")`), 'a write to a git hook'],
  [stdin(`p = input()\nopen(p, "w").write("${R}")`), 'a write to a computed name'],
  [stdin(`p = "a.txt"\np = "b.txt"\nopen(p, "w").write("${R}")`), 'a write to a name bound twice'],
  [stdin(`open("helper.py", "w").write("import shutil; shutil.rmtree('${T}')")\nimport helper`),
   'a write of a module the code then imports'],
  [stdin(`open("json.py", "w").write("x")\nprint("${R}")`), 'a write of a standard module name'],
  [`node -e 'const fs = require("fs"); fs.writeFileSync("h.js", "x"); require("./h") // ${R}'`,
   'node: a write beside a require of a path'],
  [`node -e 'require("fs").writeFileSync(process.argv[1], "${R}")' x`, 'node: a write to a computed name'],
  [stdin(`import shutil\nshutil.copy("a.txt", "b.txt")  # ${R}`), 'a copy'],
];
for (const [command, why] of dataReachesASink) {
  test(`delete words that can reach a run sink keep the text rule (${why}): asks`, () => {
    assert.equal(verdict(bash(command, GIT)), 'ask', command);
  });
}

// --- Fourth round (owner, 2026-11-20): emptying an existing file asks ---------------------------------------------
// A command or code that leaves an existing, non-empty file empty destroys its content as surely as rm. A write with
// content, a new or already empty file, /dev/null and Claude's own session and task folders do not ask. The fixtures
// are real files: the rule reads the disk.
const EMPTY_DIR = path.join(FIX, 'empties');
fs.mkdirSync(EMPTY_DIR);
const KEPT = path.join(EMPTY_DIR, 'kept.db');
fs.writeFileSync(KEPT, 'rows\n');
fs.writeFileSync(path.join(EMPTY_DIR, 'blank.txt'), '');
fs.symlinkSync(KEPT, path.join(EMPTY_DIR, 'link.db'));
const OWN = path.join('/tmp', `claude-${process.getuid()}`, `guard-empty-${process.pid}`);
fs.mkdirSync(OWN, { recursive: true });
process.on('exit', () => fs.rmSync(OWN, { recursive: true, force: true }));
fs.writeFileSync(path.join(OWN, 'out.txt'), 'old\n');
fs.symlinkSync(KEPT, path.join(OWN, 'to-kept'));
const py = (code) => `python3 - <<'EOF'\n${code}\nEOF`;
const empties = [
  [`: > ${KEPT}`, 'shell : >'],
  [`> ${KEPT}`, 'a bare >'],
  [`true >| ${KEPT}`, 'true >|'],
  [`truncate -s 0 ${KEPT}`, 'truncate -s 0'],
  [`truncate --size=0 ${KEPT}`, 'truncate --size=0'],
  [`truncate -s0 ${KEPT}`, 'truncate -s0'],
  [`cp /dev/null ${KEPT}`, 'cp /dev/null'],
  [`cat /dev/null > ${KEPT}`, 'cat /dev/null >'],
  [`cd ${EMPTY_DIR} && : > kept.db`, 'a relative target after a literal cd'],
  [`: > ${path.join(EMPTY_DIR, 'link.db')}`, 'a symlink to a kept file'],
  [`: > ${path.join(OWN, 'to-kept')}`, 'a symlink in the session folder to a kept file'],
  [py(`open("${KEPT}", "w").close()`), 'python open w, then close'],
  [py(`open("${KEPT}", "wb").close()`), 'python open wb, then close'],
  [py(`with open("${KEPT}", "w"):\n    pass`), 'python with open w: pass'],
  [py(`f = open("${KEPT}", "w")\nf.close()`), 'python open bound to a name, only closed'],
  [py(`import os\nos.truncate("${KEPT}", 0)`), 'python os.truncate(p, 0)'],
  [py(`f = open("${KEPT}", "r+")\nf.truncate(0)`), 'python f.truncate(0)'],
  [py(`from pathlib import Path\nPath("${KEPT}").write_text("")`), "python Path.write_text('')"],
  [py(`from pathlib import Path\nPath("${KEPT}").write_bytes(b"")`), "python Path.write_bytes(b'')"],
  [`python3 -c 'open("${KEPT}", "w").close()'`, 'python -c'],
  [`node -e 'require("fs").writeFileSync("${KEPT}", "")'`, "node writeFileSync(p, '')"],
  [`node -e 'require("fs").truncateSync("${KEPT}")'`, 'node truncateSync(p)'],
  [`node -e 'const fs = require("fs"); fs.truncateSync("${KEPT}", 0)'`, 'node fs.truncateSync(p, 0)'],
  [py('import sys\nopen(sys.argv[1], "w").close()'), 'python, a computed name'],
  [`cd ${EMPTY_DIR}; : > kept.db`, 'a relative target after cd and ;'],
  [`{ cd ${OWN}; }; : > kept.db`, 'a cd inside a group: the folder is unknown after it'],
  [`(cd ${OWN}); : > kept.db`, 'a cd in a subshell does not move the next command'],
  ['cd /nonexistent-guard-dir; : > kept.db', 'a cd to a folder that does not exist'],
  [`python3 -c "open('${KEPT}', 'w').close(); print($N)"`, 'unparsed python that still looks like an emptying'],
];
for (const [command, why] of empties) {
  test(`emptying an existing file asks (${why})`, () => {
    assert.equal(verdict(bash(command, EMPTY_DIR)), 'ask', command);
  });
}
const notEmpties = [
  [': > /dev/null', '/dev/null'],
  [`: > ${path.join(OWN, 'out.txt')}`, "Claude's session folder"],
  [`truncate -s 0 ${path.join(OWN, 'out.txt')}`, "truncate in Claude's session folder"],
  [`: > ${path.join(EMPTY_DIR, 'new.log')}`, 'a new file'],
  [`: > ${path.join(EMPTY_DIR, 'blank.txt')}`, 'an already empty file'],
  [`echo rows > ${KEPT}`, 'a write with content'],
  [`printf 'a,b\\n' > ${KEPT}`, 'printf with content'],
  [`cat ${KEPT} > ${path.join(OWN, 'copy.txt')}`, 'a copy into the session folder'],
  [`cat > ${KEPT} <<'EOF'\nrows\nEOF`, 'a heredoc with content'],
  [`echo more >> ${KEPT}`, 'an append'],
  [`truncate -s 100 ${KEPT}`, 'truncate to a size that is not 0'],
  [py(`open("${KEPT}", "w").write("rows\\n")`), 'python write with content'],
  [py(`with open("${KEPT}", "w") as f:\n    f.write("rows")`), 'python with open, then a write'],
  [py(`f = open("${KEPT}", "r+")\ns = f.read()\nf.seek(0)\nf.write(s.upper())\nf.truncate()`), 'python rewrite in place'],
  [py(`open("${path.join(OWN, 'out.txt')}", "w").close()`), "python, Claude's session folder"],
  [py(`print("truncate -s 0 ${KEPT}; : > ${KEPT}")\nx = "open(p, 'w').close()"`), 'the text only in strings'],
  [`node -e 'require("fs").writeFileSync("${KEPT}", "rows")'`, 'node write with content'],
  [`node -e 'console.log("truncateSync(${KEPT})")'`, 'node, the text only in a string'],
  [`echo ': > ${KEPT}; truncate -s 0 ${KEPT}'`, 'shell, the text only in an echo'],
  [`grep -c rows ${KEPT} > ${path.join(OWN, 'n.txt')}`, 'a count into the session folder'],
  [`(echo rows) > ${KEPT}`, 'the output of a subshell'],
  [`{ echo rows; } > ${KEPT}`, 'the output of a group'],
  [`cd ${EMPTY_DIR} && (time ls) > kept.db 2>&1`, 'a timed subshell after a cd'],
  ['ls\n# 2 unreadable transcript -> kept.db trace', 'a > inside a comment'],
  [`x=$(echo rows > ${KEPT})`, 'a write with content inside a substitution'],
  [`: > ${KEPT}; for x in a b; do echo $x >> ${KEPT}; done`, 'emptied, then rebuilt by appends on the same line'],
  [`cd ${OWN} && : > out.txt`, "a relative name after a cd to Claude's session folder"],
  [`S=${OWN}; cd $S && : > out.txt`, 'a cd to a variable bound earlier on the line'],
  [`python3 -c "print($N); s = open('${KEPT}').read()"`, 'unparsed python that only reads'],
];
for (const [command, why] of notEmpties) {
  test(`not an emptying of an existing file (${why}): allows`, () => {
    assert.equal(verdict(bash(command, EMPTY_DIR)), 'allow', command);
  });
}
