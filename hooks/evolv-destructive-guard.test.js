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
  [`B=${LINUX_SCRATCH}; S=$B/x; rm -rf $S/y`, 'a value that itself expands'],
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

test('$PWD is the folder the guard already tracks for relative paths', () => {
  assert.equal(verdict(bash('rm -rf "$PWD/egv2"', LINUX_SCRATCH)), 'allow');
  assert.equal(verdict(bash('rm -rf "$PWD/build"', REPO)), 'ask');
  assert.equal(verdict(bash(`cd ${REPO} && rm -rf $PWD/build`, LINUX_SCRATCH)), 'ask');
  assert.equal(verdict(bash(`cd ${LINUX_SCRATCH} && rm -rf $PWD/x`, REPO)), 'allow');
  assert.equal(verdict(bash(`PWD=${LINUX_SCRATCH}; cd ${REPO}; rm -rf $PWD/x`, REPO)), 'ask');
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
  'find . -name .mypy_cache | xargs rm -rf',
  'find . -name __pycache__ -print0 2>&1 | xargs -0 rm -rf',
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
];
for (const command of notOnlyCaches) {
  test(`a delete that is not only caches still asks: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'ask', command);
  });
}
test('a cache under a catastrophic root is still denied', () => {
  assert.equal(verdict(bash('find / -name __pycache__ -exec rm -rf {} +')), 'deny');
});

const ownerChmod = ['chmod -R u+rwx build', 'chmod -R u+w,u+x out', 'chmod -R u+r data', `chmod -R u+rwx ${LINUX_SCRATCH}/x`];
for (const command of ownerChmod) {
  test(`chmod -R that only adds owner bits does not ask: ${command}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}
const otherChmod = ['chmod -R 700 x', 'chmod -R 0755 x', 'chmod -R u-w x', 'chmod -R u=rwx x', 'chmod -R go+r x',
  'chmod -R a+x x', 'chmod -R +x x', 'chmod -R u+rwx,g+w x', 'chmod -R ug+rwx x', 'chmod -R u+rwx x && chmod -R 777 y',
  'chown -R me x', 'chgrp -R staff x'];
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
});

// SQL text in a file being written, or in a Python program's own source, runs nothing.
const inertSql = [
  `cat > ${REPO}/tests/test_sql.py <<'EOF'\nassert "DROP TABLE x" in refused\nEOF\npython3 -m pytest -q tests/test_sql.py`,
  `cd ${REPO}; cat > SKILL.md <<'EOF'\nTo undo a run, DROP SCHEMA on the sandbox.\nEOF\npython3 scripts/check.py`,
  `python3 - <<'EOF'\np = 'a.md'\ns = open(p).read().replace('x', 'DROP TABLE t needs approval')\nopen(p, 'w').write(s)\nEOF`,
  `cd ${REPO} && python3 - <<'EOF'\n# append the torn tail, then truncate the file to its last newline\nEOF`,
  `python3 - <<'EOF'\nnote = "DROP TABLE asks first in the guard"\nEOF`,
  `tee notes.md <<'EOF'\nDELETE FROM visitors\nEOF\nnode x.js`,
];
for (const command of inertSql) {
  test(`SQL text that nothing runs: ${command.split('\n')[0].slice(0, 70)}`, () => {
    assert.equal(verdict(bash(command)), 'allow', command);
  });
}
const runSql = [
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
  // Only the ask-tier SQL rules are lifted from these bodies; DROP DATABASE stays denied as it was before.
  [`python3 - <<'EOF'\nprint("DROP DATABASE prod")\nEOF`, 'deny'],
  [`cat > x.sql <<'EOF'\nDROP DATABASE prod;\nEOF\nbash -c true`, 'deny'],
];
for (const [command, expected] of runSql) {
  test(`SQL that something on the line can run is still judged: ${command.split('\n')[0].slice(0, 60)}`, () => {
    assert.equal(verdict(bash(command)), expected, command);
  });
}
