// Tests for pre-publish-guard.js. Run: node --test hooks/pre-publish-guard.test.js
//
// Each test builds a throwaway git repository under the OS temp folder. The licensed-data scanner is replaced by a
// fake (opts.scanner) that records its arguments and answers with a chosen exit code, so these tests pin the hook's
// own logic; the real scanner has its own tests in hooks/lib/.

'use strict';

// Isolate every git call and hook spawn from the machine's git configuration (core.hooksPath, hook.*, diff.*, ...).
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { decide, homePattern, addedLines, pushTargets, commitArgs } = require('./pre-publish-guard.js');

const HOME = os.homedir();
const TRAILER = 'Co-Authored-By: Claude <noreply@' + 'anthropic.com>';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppg-'));
  run(dir, 'init', '-q', '--template=', '-b', 'main');
  run(dir, 'config', 'user.email', 'dev@example.com');
  run(dir, 'config', 'user.name', 'Dev');
  run(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n');
  run(dir, 'add', 'README.md');
  run(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

/** A remote that already has the current history, so later commits are the outgoing ones. */
function withRemote(dir) {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ppg-remote-'));
  run(bare, 'init', '-q', '--template=', '--bare');
  run(dir, 'remote', 'add', 'origin', bare);
  run(dir, 'push', '-q', 'origin', 'main');
  return bare;
}

/** A fake scanner: records argv to argv.json beside itself and exits with `code` after printing `out`. */
function fakeScanner(code, out = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppg-scan-'));
  const p = path.join(dir, 'scan.py');
  fs.writeFileSync(p, [
    'import json, sys, pathlib',
    `pathlib.Path(${JSON.stringify(path.join(dir, 'argv.json'))}).write_text(json.dumps(sys.argv[1:]))`,
    `print(${JSON.stringify(out)})`,
    `sys.exit(${code})`,
  ].join('\n'));
  return { path: p, argv: () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'argv.json'), 'utf8')); } catch { return null; } } };
}

const write = (dir, name, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
};
const bash = (command, cwd, opts = {}) => decide('Bash', { command }, cwd, opts);
const verdict = (v) => (v && v.decision ? v.decision : 'allow');

// --- 1. AI attribution ---------------------------------------------------------------------------------------------
test('denies a commit whose heredoc message carries a Claude co-author trailer', () => {
  const dir = repo();
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  const cmd = `git commit -m "$(cat <<'EOF'\nfeat: a\n\n${TRAILER}\nEOF\n)"`;
  const v = bash(cmd, dir);
  assert.equal(verdict(v), 'deny');
  assert.match(v.reason, /AI attribution/);
});

test('denies a "Generated with Claude Code" line and an -F message file with the trailer', () => {
  const dir = repo();
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  assert.equal(verdict(bash('git commit -m "feat: a" -m "Generated with [Claude Code](https://claude.com)"', dir)), 'deny');
  write(dir, '../msg-' + path.basename(dir) + '.txt', `feat: a\n\n${TRAILER}\n`);
  assert.equal(verdict(bash(`git commit -F ../msg-${path.basename(dir)}.txt`, dir)), 'deny');
});

test('denies a co-author trailer that names Claude without the anthropic address', () => {
  const dir = repo();
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  assert.equal(verdict(bash('git commit -m "feat: a" -m "co-authored-by: Claude Opus <bot@example.com>"', dir)), 'deny');
  assert.equal(verdict(bash('git commit -m "feat: a" -m "Co-Authored-By: Dana <dana@example.com>"', dir)), 'allow');
});

test('a message that only talks about trailers mid-line is allowed', () => {
  const dir = repo();
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  assert.equal(verdict(bash('git commit -m "feat: block Co-Authored-By trailers that name an AI"', dir)), 'allow');
});

test('denies a push whose outgoing commit carries the trailer', () => {
  const dir = repo();
  withRemote(dir);
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  run(dir, 'commit', '-q', '-m', `feat: a\n\n${TRAILER}`);
  const v = bash('git push origin main', dir);
  assert.equal(verdict(v), 'deny');
  assert.match(v.reason, /outgoing commit/);
});

// --- 2. Home-directory paths ---------------------------------------------------------------------------------------
test('asks when a staged added line holds the home path, and names file:line', () => {
  const dir = repo();
  write(dir, 'cfg/settings.py', `A = 1\nDATA = "${HOME}/data/raw"\n`);
  run(dir, 'add', '.');
  const v = bash('git commit -m "add settings"', dir);
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /cfg\/settings\.py:2/);
  assert.ok(!v.reason.includes(`${HOME}/data`), 'the matched text is not echoed');
});

test('an unstaged home path is not part of a plain commit, but is with -a or a git add on the same line', () => {
  const dir = repo();
  write(dir, 'README.md', `see ${HOME}/notes\n`); // tracked file, changed, not staged
  write(dir, 'b.txt', 'clean\n');
  run(dir, 'add', 'b.txt');
  assert.equal(verdict(bash('git commit -m "b"', dir)), 'allow');
  assert.equal(verdict(bash('git commit -am "b"', dir)), 'ask');
  assert.equal(verdict(bash('git commit -a -m "b"', dir)), 'ask');
  assert.equal(verdict(bash('git add -A && git commit -m "b"', dir)), 'ask');
});

test('an untracked file is scanned when a git add runs first on the same line', () => {
  const dir = repo();
  write(dir, 'new/notes.md', `path: /home/${os.userInfo().username}/x\n`);
  assert.equal(verdict(bash('git add new && git commit -m "notes"', dir)), 'ask');
  assert.equal(verdict(bash('git commit -m "notes"', dir)), 'allow'); // nothing staged yet
});

test('a push scans every outgoing commit: a path added then removed is still in the history', () => {
  const dir = repo();
  withRemote(dir);
  write(dir, 'p.txt', `${HOME}/secret\n`);
  run(dir, 'add', '.');
  run(dir, 'commit', '-q', '-m', 'add');
  write(dir, 'p.txt', 'clean\n');
  run(dir, 'commit', '-q', '-am', 'remove');
  const v = bash('git push', dir);
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /p\.txt:1/);
});

test('nothing outgoing: a push of a branch the remote already has is allowed', () => {
  const dir = repo();
  write(dir, 'p.txt', `${HOME}/secret\n`);
  run(dir, 'add', '.');
  run(dir, 'commit', '-q', '-m', 'add');
  withRemote(dir); // pushes everything, including p.txt
  assert.equal(verdict(bash('git push origin main', dir)), 'allow');
});

test('follows cd and git -C to the repository that commits', () => {
  const dir = repo();
  write(dir, 'x.txt', `${HOME}/x\n`);
  run(dir, 'add', '.');
  const elsewhere = os.tmpdir();
  assert.equal(verdict(bash(`cd ${dir} && git commit -m x`, elsewhere)), 'ask');
  assert.equal(verdict(bash(`git -C ${dir} commit -m x`, elsewhere)), 'ask');
});

test('home path spellings: HOME, /home/<user>, /Users/<user>, C:\\Users\\<user>; not a longer name', () => {
  const re = homePattern('/home/alice', 'alice');
  for (const s of ['/home/alice/dev', '"/Users/alice/x"', 'C:\\Users\\alice\\x', 'C:\\\\Users\\\\alice', '/home/alice']) {
    assert.match(s, re, s);
  }
  for (const s of ['/home/alicex/dev', '/home/bob/x', '-home-alice-dev', 'github.com/alice']) assert.doesNotMatch(s, re, s);
});

// --- 3. Licensed data (fake scanner) -------------------------------------------------------------------------------
function stagedRepo(withConfig = true) {
  const dir = repo();
  if (withConfig) write(dir, '.licensed-data.json', '{"raw": ["$NO_SUCH_VAR/raw/*.csv"]}\n');
  write(dir, 'data.csv', 'date,close\n2001-01-02,123.45\n');
  run(dir, 'add', '.');
  return dir;
}

test('denies when the scanner flags a line, and shows only file:line', () => {
  const dir = stagedRepo();
  const s = fakeScanner(1, 'data.csv:2 rule=1\n1 line(s) flagged');
  const v = bash('git commit -m "data"', dir, { scanner: s.path });
  assert.equal(verdict(v), 'deny');
  assert.match(v.reason, /data\.csv:2 rule=1/);
  assert.deepEqual(s.argv(), ['--repo', fs.realpathSync(dir), '--staged']);
});

test('no .licensed-data.json: the scanner is not run', () => {
  const dir = stagedRepo(false);
  const s = fakeScanner(1, 'data.csv:2 rule=1');
  assert.equal(verdict(bash('git commit -m "data"', dir, { scanner: s.path })), 'allow');
  assert.equal(s.argv(), null);
});

test('scanner clean -> allow; scanner skipped (no raw data) -> allow with a warning; scanner error -> ask', () => {
  const dir = stagedRepo();
  assert.equal(verdict(bash('git commit -m d', dir, { scanner: fakeScanner(0, 'clean').path })), 'allow');
  const skipped = bash('git commit -m d', dir, { scanner: fakeScanner(2, 'no raw files').path });
  assert.equal(verdict(skipped), 'allow');
  assert.match(skipped.warn.join('\n'), /scan skipped/);
  assert.equal(verdict(bash('git commit -m d', dir, { scanner: fakeScanner(3, 'boom').path })), 'ask');
  assert.equal(verdict(bash('git commit -m d', dir, { scanner: '/nonexistent/scan.py' })), 'ask');
});

test('scanner mode: a git add on the line scans the working tree; a push scans the outgoing range', () => {
  const dir = stagedRepo();
  const s1 = fakeScanner(0);
  bash('git add -A && git commit -m d', dir, { scanner: s1.path });
  assert.deepEqual(s1.argv(), ['--repo', fs.realpathSync(dir)]);

  run(dir, 'commit', '-q', '-m', 'd');
  const s2 = fakeScanner(0);
  bash('git push origin main', dir, { scanner: s2.path }); // no remote refs: every commit is outgoing, root included
  const tip = run(dir, 'rev-parse', 'HEAD').trim();
  assert.deepEqual(s2.argv(), ['--repo', fs.realpathSync(dir), '--rev', tip]);

  withRemote(dir);
  write(dir, 'more.csv', 'x\n');
  run(dir, 'add', '.');
  run(dir, 'commit', '-q', '-m', 'more');
  const s3 = fakeScanner(0);
  bash('git push', dir, { scanner: s3.path });
  const base = run(dir, 'rev-parse', 'HEAD^').trim();
  assert.deepEqual(s3.argv(), ['--repo', fs.realpathSync(dir), '--range', `${base}..${run(dir, 'rev-parse', 'HEAD').trim()}`]);
});

// --- Adversarial review of W2 (2026-11-16): each of these published a leak and the hook allowed it -------------
test('review: -F - with the message in a heredoc on stdin', () => {
  const dir = repo();
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  assert.equal(verdict(bash(`git commit -F - <<'EOF'\nfeat: a\n\n${TRAILER}\nEOF`, dir)), 'deny');
  assert.equal(verdict(bash(`cat <<'EOF' | git commit --file=-\nfeat: a\n\n${TRAILER}\nEOF`, dir)), 'deny');
});

test('review: --trailer adds the co-author line', () => {
  const dir = repo();
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  assert.equal(verdict(bash(`git commit -m "feat: a" --trailer "${TRAILER}"`, dir)), 'deny');
});

test('review: -C / --reuse-message reuse a message that has the trailer', () => {
  const dir = repo();
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  run(dir, 'commit', '-q', '-m', `old\n\n${TRAILER}`);
  const sha = run(dir, 'rev-parse', 'HEAD').trim();
  write(dir, 'b.txt', 'y\n');
  run(dir, 'add', 'b.txt');
  assert.equal(verdict(bash(`git commit -C ${sha}`, dir)), 'deny');
  assert.equal(verdict(bash(`git commit --reuse-message=${sha}`, dir)), 'deny');
});

test('review: an annotated tag message with the trailer, at tag time and at push', () => {
  const dir = repo();
  assert.equal(verdict(bash(`git tag -a v1 -m "release" -m "${TRAILER}"`, dir)), 'deny');
  withRemote(dir);
  run(dir, 'tag', '-a', 'v2', '-m', `release\n\n${TRAILER}`);
  assert.equal(verdict(bash('git push origin tag v2', dir)), 'deny');
  assert.equal(verdict(bash('git push --tags', dir)), 'deny');
  assert.equal(verdict(bash('git push --follow-tags origin main', dir)), 'deny');
});

test('review: the first commit of a new repository is checked (no HEAD yet)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppg-fresh-'));
  run(dir, 'init', '-q', '--template=', '-b', 'main');
  write(dir, 'a.txt', `${HOME}/x\n`);
  assert.equal(verdict(bash(`git add -A && git commit -m "init" -m "${TRAILER}"`, dir)), 'deny');
  const v = bash('git add -A && git commit -m init', dir);
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /home-directory path[\s\S]*a\.txt:1/); // found, not "could not read"
  run(dir, 'add', '-A');
  assert.match(bash('git commit -am init', dir).reason, /a\.txt:1/);
});

test('review: a push to a new remote publishes history that is already on another remote', () => {
  const dir = repo();
  write(dir, 'p.txt', `${HOME}/secret\n`);
  run(dir, 'add', '.');
  run(dir, 'commit', '-q', '-m', 'add');
  withRemote(dir); // history is on origin
  const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'ppg-public-'));
  run(pub, 'init', '-q', '--bare');
  run(dir, 'remote', 'add', 'public', pub);
  assert.equal(verdict(bash('git push public main', dir)), 'ask');
  assert.equal(verdict(bash('git push -u public main', dir)), 'ask');
  assert.equal(verdict(bash('git push origin main', dir)), 'allow');
});

test('review: --all, several refspecs, and -o values are all resolved', () => {
  const dir = repo();
  withRemote(dir);
  run(dir, 'checkout', '-q', '-b', 'side');
  write(dir, 's.txt', `${HOME}/side\n`);
  run(dir, 'add', '.');
  run(dir, 'commit', '-q', '-m', 'side');
  run(dir, 'checkout', '-q', 'main');
  assert.equal(verdict(bash('git push --all origin', dir)), 'ask');
  assert.equal(verdict(bash('git push origin main side', dir)), 'ask');
  assert.equal(verdict(bash('git push -o ci.skip origin side', dir)), 'ask');
  assert.equal(verdict(bash('git push origin main', dir)), 'allow');
});

test('review: a push whose refs cannot be resolved asks instead of allowing', () => {
  const dir = repo();
  withRemote(dir);
  assert.equal(verdict(bash('git push origin no-such-branch', dir)), 'ask');
});

test('review: pathspec commits and git stage on the line scan the working tree', () => {
  const dir = repo();
  write(dir, 'README.md', `${HOME}/notes\n`);
  assert.equal(verdict(bash('git commit README.md -m x', dir)), 'ask');
  assert.equal(verdict(bash('git commit -o README.md -m x', dir)), 'ask');
  assert.equal(verdict(bash('git stage README.md && git commit -m x', dir)), 'ask');
});

// --- 2b. A git add of named paths scans those paths, not every untracked file ------------------------------------
/** A repo with a clean tracked c.txt and an untracked log that holds the home path, which no command here commits. */
function addRepo() {
  const dir = repo();
  write(dir, 'c.txt', 'clean\n');
  run(dir, 'add', 'c.txt');
  run(dir, 'commit', '-q', '-m', 'c');
  write(dir, 'untracked.log', `one\ntwo\n${HOME}/x\n`);
  return dir;
}

test('git add <file> && git commit does not ask about an untracked file the add does not name', () => {
  const dir = addRepo();
  write(dir, 'c.txt', 'changed\n');
  assert.equal(verdict(bash('git add c.txt && git commit -q -m c', dir)), 'allow');
  assert.equal(verdict(bash('git add -v -- c.txt && git commit -q -m c', dir)), 'allow');
});

test('git add <file> asks when the named file holds the home path: untracked, or tracked and modified', () => {
  const dir = addRepo();
  write(dir, 'n.txt', `${HOME}/n\n`);
  const v = bash('git add n.txt && git commit -m n', dir);
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /n\.txt:1/);
  assert.ok(!v.reason.includes('untracked.log'), v.reason);
  write(dir, 'c.txt', `clean\n${HOME}/c\n`);
  const t = bash('git add c.txt && git commit -m c', dir);
  assert.equal(verdict(t), 'ask');
  assert.match(t.reason, /c\.txt:2/);
});

test('git add -A, git add . and git add <dir> still scan every untracked file they stage', () => {
  const dir = addRepo();
  assert.match(bash('git add -A && git commit -m a', dir).reason, /untracked\.log:3/);
  assert.match(bash('git add --all && git commit -m a', dir).reason, /untracked\.log:3/);
  assert.match(bash('git add . && git commit -m a', dir).reason, /untracked\.log:3/);
  write(dir, 'src/deep/s.txt', `${HOME}/s\n`);
  assert.match(bash('git add src && git commit -m a', dir).reason, /src\/deep\/s\.txt:1/);
  assert.match(bash("git add '*.log' && git commit -m a", dir).reason, /untracked\.log:3/);
});

test('a git add that cannot be bounded scans the whole tree: a variable, an unknown flag, rm/mv on the line', () => {
  const dir = addRepo();
  write(dir, 'x.txt', 'x\n');
  run(dir, 'add', 'x.txt');
  run(dir, 'commit', '-q', '-m', 'x');
  for (const cmd of ['git add "$F" && git commit -m c', 'git add c.txt && git rm -q x.txt && git commit -m c',
    'git add c.txt && git mv x.txt y.txt && git commit -m c', 'git add -u c.txt && git commit -m c',
    'git add -p c.txt && git commit -m c', 'git add --pathspec-from-file=l c.txt && git commit -m c',
    'git add && git commit -m c', 'git --work-tree=. add c.txt && git commit -m c',
    'git add c.txt > /dev/null && git commit -m c', 'git add ~/c.txt && git commit -m c']) {
    assert.equal(verdict(bash(cmd, dir)), 'ask', cmd);
  }
  write(dir, 'list.txt', 'untracked.log\n'); // the paths come from a file, so the untracked log is staged
  assert.match(bash('git add --pathspec-from-file=list.txt c.txt && git commit -m c', dir).reason, /untracked\.log:3/);
});

test('git add paths are resolved in the folder the cd commands lead to; a cd after an add scans wide', () => {
  const dir = addRepo();
  write(dir, 'sub/c.txt', 'clean\n');
  assert.equal(verdict(bash('cd sub && git add c.txt && git commit -m c', dir)), 'allow');
  assert.match(String((bash('cd sub && git add c.txt && cd .. && git commit -m c', dir) || {}).reason),
    /untracked\.log:3/);
  write(dir, 'sub/c.txt', `${HOME}/sub\n`);
  const v = bash('cd sub && git add c.txt && git commit -m c', dir);
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /sub\/c\.txt:1/);
  assert.equal(verdict(bash(`git -C ${dir}/sub add c.txt && git commit -m c`, dir)), 'ask');
});

test('git add -f names an ignored file: the scan includes it', () => {
  const dir = addRepo();
  write(dir, '.gitignore', 'secret.txt\n');
  run(dir, 'add', '.gitignore');
  run(dir, 'commit', '-q', '-m', 'ignore');
  write(dir, 'secret.txt', `${HOME}/s\n`);
  assert.equal(verdict(bash('git add c.txt && git commit -m c', dir)), 'allow');
  assert.match(bash('git add -f secret.txt && git commit -m c', dir).reason, /secret\.txt:1/);
  assert.match(bash('git add -vf secret.txt && git commit -m c', dir).reason, /secret\.txt:1/);
  assert.match(bash('git add -Nfv -- secret.txt && git commit -m c', dir).reason, /secret\.txt:1/);
  write(dir, '-f', `${HOME}/f\n`); // after --, git stages the file named -f
  assert.match(String((bash('git add -- -f && git commit -m c', dir) || {}).reason), /-f:1/);
});

// Adversarial review of the scoped add (2026-11-17): each line stages o.txt where the hook could not follow it.
/** addRepo plus a clean tracked d/c and an untracked o.txt that holds the home path. */
function hiddenAddRepo() {
  const dir = addRepo();
  write(dir, 'd/c', 'clean\n');
  run(dir, 'add', 'd/c');
  run(dir, 'commit', '-q', '-m', 'd');
  write(dir, 'o.txt', `${HOME}/o\n`);
  return dir;
}

test('review: a line the hook cannot follow in full scans the whole tree', () => {
  const dir = hiddenAddRepo();
  for (const cmd of [
    '( cd d && git add c ) && git add o.txt && git commit -q -m x',
    'git add c.txt && echo o.txt | xargs git add && git commit -q -m x',
    'false && cd d; git add o.txt && git commit -q -m x',
    "sh -c 'git add o.txt' && git add c.txt && git commit -q -m x",
    'git a o.txt && git add c.txt && git commit -q -m x', // an alias
    'git update-index --add o.txt && git add c.txt && git commit -q -m x',
    'pushd d && popd && git add o.txt && git commit -q -m x',
    "eval 'git add o.txt' && git add c.txt && git commit -q -m x",
    'GIT_WORK_TREE=. git add c.txt && git commit -q -m x',
    'git add * && git commit -q -m x',
  ]) {
    assert.match(String((bash(cmd, dir) || {}).reason), /o\.txt:1/, cmd);
  }
  // The shell expands ?A to the file name -A, so git runs `git add -A`; git's own ?A would match only that file.
  write(dir, '-A', 'x\n');
  assert.match(String((bash('git add ?A && git commit -q -m x', dir) || {}).reason), /o\.txt:1/);
});

test('review: a cd keeps the scan scoped; a read-only git call on the line scans wide (diff.external can stage)', () => {
  const dir = hiddenAddRepo();
  write(dir, 'd/c', 'changed\n');
  assert.equal(verdict(bash('cd d && git add c && git commit -q -m x', dir)), 'allow');
  assert.match(String((bash('cd d && git add c && git status && git diff && git commit -q -m x', dir) || {}).reason),
    /o\.txt:1/);
});

test('review: a leak already staged is found by a scoped add even after the working copy is cleaned', () => {
  const dir = addRepo();
  write(dir, 'leak.txt', `${HOME}/leak\n`);
  run(dir, 'add', 'leak.txt');
  write(dir, 'leak.txt', 'clean\n'); // the index still holds the leak, and git commit commits the index
  assert.match(String((bash('git add c.txt && git commit -q -m x', dir) || {}).reason), /leak\.txt:1/);
});

test('quoted and $(cat <<\'EOF\') messages and a push after the commit keep the scan scoped', () => {
  const dir = addRepo();
  write(dir, 'c.txt', 'changed\n');
  const msg = (delim) => `git add c.txt && git commit -q -m "$(cat <<${delim}\nfeat: c (x) it's \\ $(y)\n\nbody\nEOF\n)"`;
  for (const cmd of [msg("'EOF'"), `${msg("'EOF'")} && git push`, `${msg("'EOF'")} && git push -u origin main`,
    "git add c.txt && git commit -qm 'feat: c \"x\" $y'", 'git add c.txt && git commit -s -m "feat: c (x)" -m b']) {
    assert.equal(verdict(bash(cmd, dir)), 'allow', cmd);
  }
});

test('any other message form, a second EOF line, a ; or a git call after the push scans the whole tree', () => {
  const dir = addRepo();
  write(dir, 'c.txt', 'changed\n');
  write(dir, 'd/c', 'new\n');
  const msg = (delim) => `git add c.txt && git commit -q -m "$(cat <<${delim}\nfeat: c\nEOF\n)"`;
  for (const cmd of [msg('EOF'), msg('"EOF"'), msg("'END'"), `${msg("'EOF'")} && git push && git tag v1`,
    "git add c.txt && git commit -q -F - <<'EOF'\nfeat: c\nEOF",
    `git add c.txt && git commit -q -m "$(cat <<'EOF'\nEOF\nEOF\n)"`, // bash ends the heredoc at the first EOF
    `${msg("'EOF'")} -m "$(cat <<'EOF'\ntwo\nEOF\n)"`,
    'git add c.txt && git commit -q -m "a $x"', 'git add c.txt && git commit -qam x',
    'git add c.txt && git commit -q -m x c.txt', 'git add c.txt && git commit -q -m x; true',
    'git add c.txt && git commit -q -m x # c', 'cd d; git add c && git commit -q -m x',
    'git add c.txt; git add d/c && git commit -q -m x']) {
    assert.match(String((bash(cmd, dir) || {}).reason), /untracked\.log:3/, cmd);
  }
});

test('the push after a heredoc commit is still judged: an outgoing attribution trailer is denied', () => {
  const dir = addRepo();
  withRemote(dir);
  run(dir, 'commit', '-q', '--allow-empty', '-m', `old\n\n${TRAILER}`);
  write(dir, 'c.txt', 'changed\n');
  const v = bash(`git add c.txt && git commit -q -m "$(cat <<'EOF'\nfeat: c\nEOF\n)" && git push`, dir);
  assert.equal(verdict(v), 'deny');
  assert.match(v.reason, /outgoing commit/);
});

test('any other substitution, heredoc or a push before the commit scans the whole tree', () => {
  const dir = addRepo();
  for (const cmd of [
    'git add c.txt && git commit -q -m "$(cat <<EOF\nmsg $(git add untracked.log)\nEOF\n)"', // unquoted body runs it
    'git add c.txt && git commit -q -m "$(cat <<EOF\nmsg `git add untracked.log`\nEOF\n)"',
    "git add c.txt && git commit -q -m \"$(git add untracked.log; cat <<'EOF'\nmsg\nEOF\n)\"",
    "git add c.txt && git commit -q -m \"$(printf x <<'EOF'\nmsg\nEOF\n)\"",
    "git add c.txt \"$(echo untracked.log)\" && git commit -q -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"",
    "git add \"$(cat <<'EOF'\nuntracked.log\nEOF\n)\" && git commit -q -m x", // the body names the path
    "git add c.txt && cat <<'EOF' | xargs git add && git commit -q -m x\nuntracked.log\nEOF",
    'git push && git add c.txt && git commit -q -m x',
    'git push && git add untracked.log && git commit -q -m x',
    'git tag v1 && git add c.txt && git commit -q -m x',
  ]) {
    assert.match(String((bash(cmd, dir) || {}).reason), /untracked\.log:3/, cmd);
  }
});

// Second adversarial review (2026-11-17): the heredoc model of the line differed from bash's, and git global options
// and repository hooks could stage what the scoped scan did not read. Each line commits o.txt with git.
test('review 2: a quoted or split heredoc word, a git global option or a substitution scans the whole tree', () => {
  const dir = hiddenAddRepo();
  for (const cmd of [
    'git add c.txt && git commit -qm "<<EOF"\ngit add o.txt && git commit -qm y',
    "git add c.txt && git commit -qm '<<EOF'\ngit add o.txt && git commit -qm y",
    'git add c.txt && git commit -qm "fix <<EOF parsing"\ngit add o.txt && git commit -qm y',
    'git add c.txt && git commit -q -F - <<E"OF"\nmsg\nEOF\ngit add o.txt && git commit -qm y',
    'git add c.txt && git commit -q -F - <<"E"OF\nmsg\nEOF\ngit add o.txt && git commit -qm y',
    "git add c.txt && git -c diff.external='git add -A; true' diff HEAD && git commit -qm x",
    "git add c.txt && git -c diff.external='git add -A; true' show --ext-diff HEAD && git commit -qm x",
    'git add c.txt && git -c core.hooksPath=hk commit -qm x',
    "git add c.txt && git commit -qm \"$(sh <<'EOF'\ngit add o.txt; echo msg\nEOF\n)\"",
    "git add c.txt && git commit -qm \"$(sh -c 'git add o.txt; echo m')\"",
    'git add c.txt o.t\\\nxt && git commit -qm x', // the shell joins the continuation into o.txt
  ]) {
    assert.match(String((bash(cmd, dir) || {}).reason), /o\.txt:1/, cmd);
  }
});

test('review 2: a git diff written to a file that is then added scans the whole tree', () => {
  const dir = hiddenAddRepo();
  write(dir, 'c.txt', `clean\n${HOME}/c\n`); // git diff writes this change into d.patch, which the commit adds
  assert.match(String((bash('git diff > d.patch && git add d.patch && git commit -qm x', dir) || {}).reason),
    /c\.txt:2/);
});

test('review 2: a commit hook in the repository or a core.hooksPath scans the whole tree', () => {
  const dir = hiddenAddRepo();
  const hooks = run(dir, 'rev-parse', '--git-path', 'hooks').trim();
  write(dir, path.join(hooks, 'pre-commit'), '#!/bin/sh\ngit add -A\n');
  fs.chmodSync(path.join(dir, hooks, 'pre-commit'), 0o755);
  assert.match(String((bash('git add c.txt && git commit -qm x', dir) || {}).reason), /o\.txt:1/);
  const other = hiddenAddRepo();
  run(other, 'config', 'core.hooksPath', 'hk');
  assert.match(String((bash('git add c.txt && git commit -qm x', other) || {}).reason), /o\.txt:1/);
});

// Third adversarial review (2026-11-17): mutants of hasCommitHooks and of the heredoc terminator survived.
test('review 3: a hooks folder that holds only a post-commit or post-index-change hook scans the whole tree', () => {
  for (const hook of ['post-commit', 'post-index-change']) {
    const dir = addRepo();
    const hooks = run(dir, 'rev-parse', '--git-path', 'hooks').trim();
    write(dir, path.join(hooks, hook), '#!/bin/sh\ngit add -A\n');
    fs.chmodSync(path.join(dir, hooks, hook), 0o755);
    assert.equal(verdict(bash('git add c.txt && git commit -q -m c', dir)), 'ask', hook);
  }
});

test('review 3: a hooks folder that node cannot list, but git can run, scans the whole tree', (t) => {
  if (process.getuid && process.getuid() === 0) return t.skip('root reads any folder');
  const dir = addRepo();
  const hooks = path.join(dir, run(dir, 'rev-parse', '--git-path', 'hooks').trim());
  fs.mkdirSync(hooks, { recursive: true }); // --template= leaves no hooks folder
  fs.chmodSync(hooks, 0o111); // x without r: git can run a hook inside, readdir fails with EACCES
  try {
    assert.equal(verdict(bash('git add c.txt && git commit -q -m c', dir)), 'ask');
  } finally {
    fs.chmodSync(hooks, 0o755);
  }
});

test('review 3: a hook defined in the git configuration scans the whole tree', () => {
  const dir = addRepo();
  assert.equal(verdict(bash('git add c.txt && git commit -q -m c', dir)), 'allow');
  run(dir, 'config', 'hook.x.command', 'true'); // git 2.54 runs it; older git stores the key and ignores it
  assert.equal(verdict(bash('git add c.txt && git commit -q -m c', dir)), 'ask');
});

test('review 3: a heredoc terminator line with a trailing space is not a terminator: whole tree', () => {
  const dir = hiddenAddRepo();
  const cmd = `git add c.txt && git commit -q -m "$(cat <<'EOF'\nmsg\nEOF \n)"\ngit add o.txt && git commit -q -m y`;
  assert.match(String((bash(cmd, dir) || {}).reason), /o\.txt:1/);
  // Alone, the near-miss line leaves the heredoc open to the end of the command, which is not the narrow shape.
  const lone = `git add c.txt && git commit -q -m "$(cat <<'EOF'\nmsg\nEOF \n)"`;
  assert.match(String((bash(lone, addRepo()) || {}).reason), /untracked\.log:3/);
});

test('review 3: a control character in the command scans the whole tree', () => {
  const dir = addRepo();
  const msg = (c) => `git add c.txt && git commit -q -m "$(cat <<'EOF'\nfeat: a${c}b\nEOF\n)"`;
  assert.equal(verdict(bash(msg('x'), dir)), 'allow');
  for (const c of ['\x00', '\r', '\x01', '\x1b', '\x7f']) {
    assert.match(String((bash(msg(c), dir) || {}).reason), /untracked\.log:3/, JSON.stringify(c));
  }
  assert.equal(verdict(bash(msg('\t'), dir)), 'allow'); // a tab is ordinary text
});

// Review of the narrowed scan (2026-11-17): the wide fallback says why, and a git failure never stays narrow.
/** A `git` on PATH that fails every call whose arguments match the shell glob `pattern`, and runs real git otherwise. */
function withFailingGit(pattern, fn) {
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ppg-bin-'));
  const script = `#!/bin/sh\ncase " $* " in ${pattern}) exit 128;; esac\nexec ${real} "$@"\n`;
  fs.writeFileSync(path.join(bin, 'git'), script, { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    return fn();
  } finally {
    process.env.PATH = saved;
  }
}

test('the ask names why the scan was wide: a hook in the repository', () => {
  const dir = hiddenAddRepo();
  const hooks = run(dir, 'rev-parse', '--git-path', 'hooks').trim();
  write(dir, path.join(hooks, 'post-commit'), '#!/bin/sh\ntrue\n');
  const v = bash('git add c.txt && git commit -q -m x', dir);
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /\(scanned the whole tree: repository has hook post-commit\)/);
});

test('the ask names why the scan was wide: the command is not a plain add/commit line', () => {
  const dir = hiddenAddRepo();
  const v = bash('git add c.txt && git commit -q -m x; true', dir);
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /\(scanned the whole tree: command is not a plain add\/commit line\)/);
});

test('the ask names why the scan was wide: core.hooksPath, hook.* config and a control character', () => {
  const dir = hiddenAddRepo();
  run(dir, 'config', 'core.hooksPath', 'hk');
  assert.match(bash('git add c.txt && git commit -q -m x', dir).reason, /scanned the whole tree: core\.hooksPath is set\)/);
  const other = hiddenAddRepo();
  run(other, 'config', 'hook.x.command', 'true');
  assert.match(bash('git add c.txt && git commit -q -m x', other).reason, /scanned the whole tree: hook\.\* config\)/);
  const msg = `git add c.txt && git commit -q -m "$(cat <<'EOF'\nfeat\x00\nEOF\n)"`;
  assert.match(bash(msg, hiddenAddRepo()).reason, /scanned the whole tree: control character in command\)/);
});

test('a narrowed scan has no wide-scan note', () => {
  const dir = hiddenAddRepo();
  write(dir, 'c.txt', `${HOME}/c\n`);
  const v = bash('git add c.txt && git commit -q -m x', dir);
  assert.equal(verdict(v), 'ask');
  assert.doesNotMatch(v.reason, /scanned the whole tree/);
});

test('an added path git cannot diff (outside the repository) falls back to the whole tree, not an empty scan', () => {
  const dir = addRepo();
  const v = bash('git add ../outside && git commit -q -m x', dir);
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /untracked\.log:3/);
  assert.match(v.reason, /scanned the whole tree: git could not diff an added path\)/);
});

test('an added path whose untracked files git cannot list falls back to the whole tree, not an empty scan', () => {
  const dir = hiddenAddRepo();
  const v = withFailingGit('*" ls-files "*" --full-name "*', () => bash('git add c.txt && git commit -q -m x', dir));
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /scanned the whole tree: git could not list untracked files\)/);
  assert.match(v.reason, /o\.txt:1/);
});

test('a repository whose hooks folder does not exist keeps the narrowed scan', () => {
  const dir = addRepo();
  const hooks = path.join(dir, run(dir, 'rev-parse', '--git-path', 'hooks').trim());
  fs.rmSync(hooks, { recursive: true, force: true });
  assert.equal(verdict(bash('git add c.txt && git commit -q -m x', dir)), 'allow'); // untracked.log is not read
});

test('a failing `git config` counts as a possible hook, not as an absent key', () => {
  const dir = addRepo();
  assert.equal(verdict(bash('git add c.txt && git commit -q -m x', dir)), 'allow');
  const v = withFailingGit('*" config "*', () => bash('git add c.txt && git commit -q -m x', dir));
  assert.equal(verdict(v), 'ask');
  assert.match(v.reason, /untracked\.log:3/);
  assert.match(v.reason, /scanned the whole tree: git config failed\)/);
});

test('diff.relative does not hide an added path outside the folder the command runs in', () => {
  const dir = hiddenAddRepo();
  run(dir, 'config', 'diff.relative', 'true');
  write(dir, 'c.txt', `${HOME}/c\n`); // tracked, changed; `git diff` from d/ with diff.relative would omit it
  assert.match(String((bash('cd d && git add ../c.txt && git commit -q -m x', dir) || {}).reason), /c\.txt:1/);
});

// --- 4. Scope ------------------------------------------------------------------------------------------------------
test('ignores other tools, other git commands, and git commit as quoted text', () => {
  const dir = repo();
  write(dir, 'x.txt', `${HOME}/x\n`);
  run(dir, 'add', '.');
  assert.equal(bash('git status && git diff --cached', dir), null);
  assert.equal(bash('echo "remember to git commit and git push"', dir), null);
  assert.equal(decide('Write', { file_path: path.join(dir, 'y'), content: `${HOME}` }, dir), null);
});

test('parses added lines and line numbers from a unified diff', () => {
  const patch = 'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,0 +3,2 @@\n+one\n+two\n@@ -9 +12 @@\n-old\n+new\n';
  assert.deepEqual(addedLines(patch), [
    { file: 'f', line: 3, text: 'one' }, { file: 'f', line: 4, text: 'two' }, { file: 'f', line: 12, text: 'new' },
  ]);
});

test('push targets: remote, refs (HEAD by default, source side of each refspec), tags and value options', () => {
  const dir = repo();
  const t = (args) => { const r = pushTargets(args, dir); return [r.remote, r.refs.join(' ')]; };
  assert.deepEqual(t([]), ['origin', 'HEAD']);
  assert.deepEqual(t(['public']), ['public', 'HEAD']);
  assert.deepEqual(t(['-u', 'origin', 'feature']), ['origin', 'feature']);
  assert.deepEqual(t(['origin', '+wip:main', 'side']), ['origin', 'wip side']);
  assert.deepEqual(t(['-o', 'ci.skip', 'origin', 'main']), ['origin', 'main']);
  assert.deepEqual(t(['origin', 'tag', 'v1']), ['origin', 'refs/tags/v1']);
  assert.deepEqual(t(['--all', 'origin']), ['origin', '--branches']);
  assert.deepEqual(t(['origin', ':gone']), ['origin', '']);
});

test('commit options: message parts, -F files, reuse, and what widens the scan', () => {
  const c = commitArgs(['-qam', 'x', '--trailer=T: v', '--author', 'A <a@b>', '-F', 'm.txt', '-C', 'abc']);
  assert.deepEqual([c.messages, c.files, c.reuse, c.wide], [['x', 'T: v'], ['m.txt'], ['abc'], true]);
  assert.equal(commitArgs(['-m', 'only', '--author', 'A <a@b>']).wide, false);
  assert.equal(commitArgs(['-m', 'x', '--', 'f.txt']).wide, true);
});

// Integration: the real scanner in hooks/lib, no fake. A synthetic "vendor" file lives outside the repo;
// a staged copy of one of its rows must be denied, and a made-up file must pass.
test('integration: the real scanner denies a staged copy of a raw row and allows made-up data', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ppg-raw-'));
  const rows = ['Date,Open,High,Low,Close,Volume'];
  for (let i = 0; i < 400; i += 1) {
    const d = new Date(Date.UTC(2003, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    const v = (k) => (50 + ((i * 7919 + k * 131) % 3000) / 100).toFixed(2);
    rows.push([d, v(0), v(1), v(2), v(3), String(1000000 + i * 37)].join(','));
  }
  write(data, 'raw/prices.csv', rows.join('\n') + '\n');
  process.env.PPG_IT_DATA = data;
  try {
    const dir = repo();
    write(dir, '.licensed-data.json', '{"raw": ["$PPG_IT_DATA/raw/*.csv"]}\n');
    write(dir, 'notes.txt', 'nothing licensed here\n');
    run(dir, 'add', '.');
    assert.equal(verdict(bash('git commit -m clean', dir)), 'allow');
    run(dir, 'commit', '-q', '-m', 'clean');
    write(dir, 'leak.csv', rows[0] + '\n' + rows[123] + '\n');
    run(dir, 'add', 'leak.csv');
    const v = bash('git commit -m leak', dir);
    assert.equal(verdict(v), 'deny');
    assert.match(v.reason, /leak\.csv:2/);
    assert.ok(!v.reason.includes(rows[123]), 'the matched row must not be echoed');
  } finally {
    delete process.env.PPG_IT_DATA;
  }
});

// --- Redirections after a push are not refspecs (2026-11-18: "cannot resolve what this push publishes (main 2> to
// origin)" asked on every `git push origin main 2>&1`) ---------------------------------------------------------------
test('redirections and pipes after a push are not read as refspecs', () => {
  const dir = repo();
  write(dir, 'p.txt', `${HOME}/old\n`);
  run(dir, 'add', '.');
  run(dir, 'commit', '-q', '-m', 'old, already on the remote');
  withRemote(dir);
  run(dir, 'checkout', '-q', '-b', 'br');
  run(dir, 'push', '-q', 'origin', 'br');
  for (const cmd of ['git push 2>&1 | tail -1', 'git push origin main 2>&1', 'git push -u origin br 2>&1',
    'git push origin main 2>/dev/null', 'git push origin main >/dev/null 2>&1', 'git push origin main &>/dev/null',
    'git push origin main > push.log', 'git push origin main >> push.log 2>&1 | tail -1', 'git push origin br 2>&1 >&2']) {
    assert.equal(verdict(bash(cmd, dir)), 'allow', cmd);
  }
});

test('a push with a redirect still judges what it publishes', () => {
  const dir = repo();
  withRemote(dir);
  write(dir, 'a.txt', 'x\n');
  run(dir, 'add', 'a.txt');
  run(dir, 'commit', '-q', '-m', `feat: a\n\n${TRAILER}`);
  assert.equal(verdict(bash('git push origin main 2>&1 | tail -1', dir)), 'deny');
  assert.equal(verdict(bash('git push origin main no-such-branch 2>&1', dir)), 'ask');
});
