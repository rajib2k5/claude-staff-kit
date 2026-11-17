// Tests for pre-publish-guard.js. Run: node --test hooks/pre-publish-guard.test.js
//
// Each test builds a throwaway git repository under the OS temp folder. The licensed-data scanner is replaced by a
// fake (opts.scanner) that records its arguments and answers with a chosen exit code, so these tests pin the hook's
// own logic; the real scanner has its own tests in hooks/lib/.

'use strict';

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
  run(dir, 'init', '-q', '-b', 'main');
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
  run(bare, 'init', '-q', '--bare');
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
  run(dir, 'init', '-q', '-b', 'main');
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
