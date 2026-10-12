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
