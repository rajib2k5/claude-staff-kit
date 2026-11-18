#!/usr/bin/env node
/**
 * PreToolUse hook — Pre-publish Guard.
 *
 * Runs on every `git commit`, `git push`, `git tag` and `git merge` that Claude starts through the Bash tool, and
 * stops three kinds of leak that each forced a history rewrite on 2026-11-09 (4 repositories):
 *
 *   1. AI attribution in a commit or tag message: a `Co-Authored-By:` trailer naming Claude or Anthropic, the
 *      `noreply@anthropic.com` address, or a "Generated with Claude Code" line.                       -> DENY
 *   2. Licensed vendor data: when the repository has a `.licensed-data.json` at its root, the merged scanner
 *      (hooks/lib/scan_licensed_rows.py) compares what is being committed or pushed with the raw files the
 *      config names, and prints only `file:line`.                                                       -> DENY
 *   3. The user's home-directory path (for example /home/<user>/... or /Users/<user>/...) in an added line.
 *      Sometimes intended, so the user decides.                                                         -> ASK
 *
 * What is scanned:
 *   - commit: the message as git writes it (each -m, --trailer, heredoc bodies on the line including `-F -` on
 *     stdin, the -F file, the message reused by -C/-c/--reuse-message), then the staged diff. A staging call earlier
 *     on the line has not run yet when this hook runs. When the raw command is exactly
 *     `[cd <path> && ]... git add <paths> && [git add <paths> && ]... git commit -m <message> [&& git push ...]`
 *     (see NARROW), has no control character other than newline and tab, and the repository has no commit hook (no
 *     core.hooksPath, no `hook.*` configuration, no hook file, a readable hooks folder), the scan is the full staged
 *     diff plus each added path's working-tree change against HEAD (the empty tree in a new repository) and its
 *     untracked files. Any other line, or a commit with -a, a pathspec or -o/-i, scans the whole working-tree change
 *     against HEAD; after a staging call, plus every untracked file not ignored. When a line with a staging call is
 *     scanned wide, an ASK says why: "(scanned the whole tree: <reason>)".
 *   - push: every commit the push publishes that the DESTINATION remote does not have
 *     (`git rev-list <refs> --not --remotes=<remote>`), message and patch, one by one: history already on another
 *     remote is still published to a new one, and a path added in one commit and removed in the next is still in
 *     the history. --all, --mirror, several refspecs and `tag <name>` are resolved; annotated tag messages are
 *     checked. A push whose refs cannot be resolved ASKs.
 *   - tag, merge: the message only.
 *
 * Contract (Claude Code PreToolUse): stdin JSON { tool_name, tool_input, cwd }; stdout JSON hookSpecificOutput with
 * permissionDecision deny|ask, or nothing. Fails OPEN on an unexpected error (warns on stderr), like the destructive
 * guard; a git error inside one check ASKs instead, because the guard then cannot say the change is clean. Known
 * gaps: a message built by an editor or by `$(cat file)`, binary files; an untracked symlink is read through its
 * target (git commits the link text), and a link whose text holds the home path is missed; CDPATH and bash's
 * physical-path fallback for `cd` (the folder the hook resolves can differ from the shell's); clean/smudge filters
 * (they can change what `git add` stages); the wide scan skips ignored files that `git add -f` stages, and reads the
 * working tree, not the index, so a leak staged and then cleaned in the working copy is missed there. The push check
 * re-reads every outgoing commit message and patch, so a commit-time gap is caught there.
 *
 * Tests: pre-publish-guard.test.js (node --test hooks/pre-publish-guard.test.js).
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { shell: sh } = require('./evolv-destructive-guard.js');

const SCANNER = path.join(__dirname, 'lib', 'scan_licensed_rows.py');
const CONFIG = '.licensed-data.json';
const SCAN_TIMEOUT_MS = 60000;
const GIT_TIMEOUT_MS = 30000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Lines that attribute a commit to Claude or another AI. Trailers only count at the start of a line. */
const ATTRIBUTION = [
  /^[ \t]*Co-Authored-By:[^\n]*\b(claude|anthropic)\b/im,
  /noreply@anthropic\.com/i,
  /Generated with \[?Claude Code/i,
  /^[ \t]*🤖 Generated with/m,
];
const attributed = (text) => ATTRIBUTION.some((re) => re.test(text));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The user's own home path in any of its spellings: the real HOME, and /home/<user>, /Users/<user>, C:\Users\<user>. */
function homePattern(home = os.homedir(), user = safeUser()) {
  const alts = [escapeRe(home)];
  if (user) {
    const u = escapeRe(user);
    alts.push(`/home/${u}`, `/Users/${u}`, `[A-Za-z]:\\\\{1,2}Users\\\\{1,2}${u}`);
  }
  return new RegExp(`(?:${alts.join('|')})(?![\\w.-])`);
}

function safeUser() {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER || '';
  }
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

/** The subcommand of a git invocation and the folder it runs in (after -C). */
function gitCall(words, i, dir) {
  let here = dir;
  for (let j = i + 1; j < words.length; j += 1) {
    const w = words[j];
    if (w === '-C') {
      here = here === null ? null : path.resolve(here, words[(j += 1)] || '.');
    } else if (w === '-c' || w === '--git-dir' || w === '--work-tree') {
      j += 1;
    } else if (!w.startsWith('-')) {
      return { sub: w, args: words.slice(j + 1), dir: here };
    }
  }
  return null;
}

const STAGING = new Set(['add', 'stage', 'rm', 'mv', 'apply']);
const JUDGED = new Set(['commit', 'push', 'tag', 'merge']);

/*
 * The one command shape whose scan is narrowed to the paths it adds. It is matched against the raw command string,
 * so nothing here depends on how a parser models the shell; a line that does not match exactly is scanned wide:
 *
 *   (cd P && )* (git add|stage [-vfN]... [--] P... && )+ git commit [-q|-v|-s|--no-verify]... MSG...
 *   ( && git push [-u|P]...)?
 *
 * P is a literal word: letters, digits and _ . / @ + -, not starting with -, so no quote, glob, $, ~, redirection
 * or separator. MSG is -m (or -qm) followed by P, '<no single quote>', "<no \ $ ` or double quote>", or
 * "$(cat <<'EOF'\n<body>\nEOF\n)" whose body has no line equal to EOF. That heredoc is the only newline allowed.
 * So there is no ;, |, single &, ||, comment, backslash, substitution, git global option (-c, -C, --git-dir ...),
 * commit -a or pathspec, and no other command: each `git add` is the only thing that changes the index before the
 * commit, in the folder the cd commands lead to.
 */
const P = String.raw`(?!-)[A-Za-z0-9_./@+-]+`;
const MSG = String.raw`-q?m[ \t]+(?:${P}|'[^'\n]*'|"[^"\\$\x60\n]*"|"\$\(cat <<'EOF'\n(?:[^\n]*\n)*?EOF\n\)")`;
const ADD = String.raw`git[ \t]+(?:add|stage)(?:[ \t]+-[vfN]+)*(?:[ \t]+--)?(?:[ \t]+${P})+`;
const NARROW = new RegExp(String.raw`^[ \t]*((?:cd[ \t]+${P}[ \t]*&&[ \t]*)*)((?:${ADD}[ \t]*&&[ \t]*)+)` +
  String.raw`git[ \t]+commit(?:[ \t]+(?:-[qvs]|--no-verify))*(?:[ \t]+${MSG})+` +
  String.raw`(?:[ \t]*&&[ \t]*git[ \t]+push(?:[ \t]+(?:-u|${P}))*)?[ \t]*$`);

/** The value of a git config key, or null when the key is absent (exit 1). Throws when git itself fails. */
function configGet(args, dir) {
  try {
    return git(['config', ...args], dir);
  } catch (err) {
    if (err.status === 1) return null;
    throw err;
  }
}

/**
 * Why the repository may run a commit hook (which may stage more), or null when it cannot: core.hooksPath, a hook
 * defined in the configuration (`hook.<name>.command`, git 2.54 and later; older git stores the key and ignores it),
 * a non-sample hook file, or a hooks folder that cannot be read. A missing hooks folder holds no hook; a failing
 * `git config` is not "key absent".
 */
function hasCommitHooks(dir) {
  try {
    if (configGet(['--get', 'core.hooksPath'], dir) !== null) return 'core.hooksPath is set';
    if ((configGet(['--get-regexp', '^hook\\.'], dir) || '').trim()) return 'hook.* config';
  } catch {
    return 'git config failed';
  }
  const hooks = tryGit(['rev-parse', '--git-path', 'hooks'], dir);
  if (hooks === null) return 'hooks folder unreadable';
  try {
    const hook = fs.readdirSync(path.resolve(dir, hooks.trim())).find((f) => !f.endsWith('.sample'));
    return hook ? `repository has hook ${hook}` : null;
  } catch (err) {
    return err.code === 'ENOENT' ? null : 'hooks folder unreadable';
  }
}

/**
 * The paths the line stages, { scope: [{ dir, specs, force }] }, when the raw command matches NARROW, the delimiter
 * line EOF appears at most once, and the repository has no commit hook; otherwise { reason } and the commit is
 * scanned wide.
 */
function narrowScope(command, cwd) {
  const m = NARROW.exec(command);
  if (!m) return { reason: 'command is not a plain add/commit line' };
  if (cwd === null) return { reason: 'cannot tell which folder the command runs in' };
  // A control character other than newline and tab (NUL, CR, ...) is read differently by bash and by this regex.
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(command)) return { reason: 'control character in command' };
  if (command.split('\n').filter((l) => l === 'EOF').length > 1) return { reason: 'more than one EOF line' };
  let dir = cwd;
  for (const [, to] of m[1].matchAll(new RegExp(`cd[ \\t]+(${P})`, 'g'))) dir = path.resolve(dir, to);
  const hooks = hasCommitHooks(dir);
  if (hooks) return { reason: hooks };
  return {
    scope: m[2].split('&&').filter((s) => s.trim()).map((add) => {
      const words = add.trim().split(/[ \t]+/).slice(2);
      const flags = words.filter((w) => w.startsWith('-'));
      return { dir, specs: words.filter((w) => !w.startsWith('-')), force: flags.some((w) => w.includes('f')) };
    }),
  };
}

/** Every judged git call on the command line, with the folder it runs in and whether something staged before it. */
function publishCalls(command, cwd) {
  const { shell, data, code } = sh.parseHeredocs(command);
  const calls = [];
  let dir = cwd;
  let addedBefore = false;
  const narrow = narrowScope(command, cwd);
  for (const segment of sh.splitSegments([shell, ...sh.substitutions(shell)].join('\n'))) {
    const words = sh.tokenize(segment);
    const i = sh.commandIndex(words);
    const cmd = i < words.length ? path.basename(words[i]) : '';
    if (cmd === 'cd' || cmd === 'pushd') {
      const to = (words[i + 1] || '~').replace(/^~(?=\/|$)/, os.homedir());
      dir = /[$`]/.test(to) || dir === null ? null : path.resolve(dir, to);
    } else if (cmd === 'git') {
      const call = gitCall(words, i, dir);
      if (!call) continue;
      if (STAGING.has(call.sub)) addedBefore = true;
      if (JUDGED.has(call.sub)) calls.push({ ...call, addedBefore, addScope: narrow.scope || null, wideReason: narrow.reason });
    }
  }
  // Every heredoc body on the line may be a message: `-m "$(cat <<'EOF' ...)"` (data) or `-F - <<'EOF'` (code).
  return { calls, heredocs: [...data, ...code] };
}

/** Added lines of a unified diff: [{ file, line, text }]. */
function addedLines(patch) {
  const out = [];
  let file = null;
  let line = 0;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw === '+++ /dev/null' ? null : raw.slice(4).replace(/^b\//, '');
    } else if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw);
      line = m ? Number(m[1]) : 0;
    } else if (file && raw.startsWith('+')) {
      out.push({ file, line, text: raw.slice(1) });
      line += 1;
    } else if (file && raw.startsWith(' ')) {
      line += 1;
    }
  }
  return out;
}

const DIFF = ['--no-color', '--no-ext-diff', '--unified=0', '--no-renames'];

/**
 * Untracked, not ignored text files, as added lines (a `git add -A` on the same line will commit them). With a scope
 * from narrowScope, only those under its pathspecs, ignored ones too after -f; null when git cannot list them.
 */
function untrackedLines(top, scope = null) {
  const out = [];
  let listed;
  if (scope) {
    const args = ['ls-files', '-o', '-z', '--full-name', ...(scope.force ? [] : ['--exclude-standard'])];
    listed = tryGit([...args, '--', ...scope.specs], scope.dir);
    if (listed === null) return null;
  } else {
    listed = tryGit(['ls-files', '-o', '--exclude-standard', '-z'], top) || '';
  }
  for (const name of listed.split('\0').filter(Boolean)) {
    const p = path.join(top, name);
    let blob;
    try {
      const st = fs.statSync(p);
      if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
      blob = fs.readFileSync(p);
    } catch {
      continue;
    }
    if (blob.subarray(0, 8192).includes(0)) continue;
    blob.toString('utf8').split('\n').forEach((text, k) => out.push({ file: name, line: k + 1, text }));
  }
  return out;
}

/** git commit options that take the next word as their value. */
const COMMIT_VALUE_OPTS = new Set(['-m', '--message', '-F', '--file', '-C', '--reuse-message', '-c',
  '--reedit-message', '--author', '--date', '-t', '--template', '--trailer', '--fixup', '--squash', '--cleanup',
  '--pathspec-from-file']);

/** A commit's options: message parts, files to read, reused commits, and whether it commits more than the index. */
function commitArgs(args) {
  const out = { messages: [], files: [], reuse: [], wide: false };
  for (let k = 0; k < args.length; k += 1) {
    const a = args[k];
    const next = () => args[(k += 1)] || '';
    const eq = /^(--[\w-]+)=(.*)$/s.exec(a);
    const [name, value] = eq ? [eq[1], eq[2]] : [a, null];
    if (name === '--') { out.wide = out.wide || k + 1 < args.length; break; }
    if (name === '-m' || name === '--message') out.messages.push(value ?? next());
    else if (/^-m./s.test(a)) out.messages.push(a.slice(2));
    else if (/^-[a-zA-Z]*m$/.test(a) && a.length > 2) { out.messages.push(next()); if (a.includes('a')) out.wide = true; }
    else if (name === '--trailer') out.messages.push(value ?? next());
    else if (name === '-F' || name === '--file') out.files.push(value ?? next());
    else if (['-C', '--reuse-message', '-c', '--reedit-message'].includes(name)) out.reuse.push(value ?? next());
    else if (name === '--pathspec-from-file') { out.wide = true; if (value === null) next(); }
    else if (COMMIT_VALUE_OPTS.has(name)) { if (value === null) next(); }
    else if (['-a', '--all', '-o', '--only', '-i', '--include'].includes(name)) out.wide = true;
    else if (/^-[a-zA-Z]+$/.test(a) && a.includes('a')) out.wide = true; // -qa, -av
    else if (!a.startsWith('-')) out.wide = true; // a pathspec: commits those files from the working tree
  }
  return out;
}

const hasHead = (top) => tryGit(['rev-parse', '--verify', '--quiet', 'HEAD'], top) !== null;

/**
 * What the index plus the paths named by earlier `git add`s would commit: the staged diff, each pathspec's
 * working-tree change against base, and its untracked files. { lines }, or { reason } when any part cannot be read in
 * this repository (a part git fails on is never treated as empty).
 */
function scopedLines(scope, base, top) {
  const lines = addedLines(git(['diff', '--cached', ...DIFF], top));
  for (const s of scope) {
    if ((tryGit(['rev-parse', '--show-toplevel'], s.dir) || '').trim() !== top) {
      return { reason: 'an added path is outside this repository' };
    }
    const patch = tryGit(['diff', base, ...DIFF, '--no-relative', '--', ...s.specs], s.dir);
    if (patch === null) return { reason: 'git could not diff an added path' };
    const untracked = untrackedLines(top, s);
    if (untracked === null) return { reason: 'git could not list untracked files' };
    lines.push(...addedLines(patch), ...untracked);
  }
  const seen = new Set();
  return {
    lines: lines.filter((l) => {
      const key = `${l.file}:${l.line}:${l.text}`;
      return seen.has(key) ? false : seen.add(key);
    }),
  };
}

/** What a commit would add, and, when a staging call on the line was scanned wide, why it was not narrowed. */
function commitLines(opts, call, top) {
  const wide = opts.wide || call.addedBefore;
  const base = hasHead(top) ? 'HEAD' : EMPTY_TREE;
  let reason = call.addedBefore ? call.wideReason || null : null;
  // The licensed-data scanner still gets the working tree (wide) after any git add: it cannot take pathspecs.
  if (!opts.wide && call.addedBefore && call.addScope) {
    const scoped = scopedLines(call.addScope, base, top);
    if (scoped.lines) return { lines: scoped.lines, wide, reason: null };
    reason = scoped.reason;
  }
  const lines = addedLines(wide ? git(['diff', base, ...DIFF], top) : git(['diff', '--cached', ...DIFF], top));
  if (call.addedBefore) lines.push(...untrackedLines(top));
  return { lines, wide, reason };
}

/** The message parts of a commit, tag or merge, as git would write them. */
function messageParts(call, heredocs, top) {
  const opts = commitArgs(call.args);
  const parts = [...heredocs, ...opts.messages];
  for (const f of opts.files) {
    if (!f || f === '-') continue; // stdin: a heredoc on the line, already in heredocs
    try {
      parts.push(fs.readFileSync(path.resolve(call.dir, f), 'utf8'));
    } catch {
      /* unreadable: git itself will fail */
    }
  }
  for (const rev of opts.reuse) parts.push(tryGit(['log', '-1', '--format=%B', rev], top) || '');
  return { parts, opts };
}

/** git push options that take the next word as their value. */
const PUSH_VALUE_OPTS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

/** What a push publishes: the destination remote, the local refs or rev-list selectors, and whether tags go too. */
function pushTargets(args, top) {
  const positional = [];
  const flags = new Set();
  let repoOpt = null;
  for (let k = 0; k < args.length; k += 1) {
    const a = args[k];
    if (PUSH_VALUE_OPTS.has(a)) {
      if (a === '--repo') repoOpt = args[k + 1];
      k += 1;
    } else if (a.startsWith('--repo=')) repoOpt = a.slice(7);
    else if (a.startsWith('-')) flags.add(a.split('=')[0]);
    else positional.push(a);
  }
  const branch = (tryGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], top) || '').trim();
  const configured = (key) => (tryGit(['config', '--get', key], top) || '').trim();
  const remote = positional[0] || repoOpt || (branch && configured(`branch.${branch}.pushRemote`)) ||
    configured('remote.pushDefault') || (branch && configured(`branch.${branch}.remote`)) || 'origin';
  const specs = positional.slice(1);
  const refs = [];
  const tags = [];
  for (let k = 0; k < specs.length; k += 1) {
    if (specs[k] === 'tag' && specs[k + 1]) {
      refs.push(`refs/tags/${specs[(k += 1)]}`);
      tags.push(refs[refs.length - 1]);
      continue;
    }
    const src = specs[k].replace(/^\+/, '').split(':')[0];
    if (src) refs.push(src); // an empty source (:branch) deletes; it publishes nothing
  }
  const all = flags.has('--all') || flags.has('--branches') || flags.has('--mirror');
  const allTags = flags.has('--tags') || flags.has('--follow-tags') || flags.has('--mirror');
  if (all) refs.push('--branches');
  if (allTags) refs.push('--tags');
  if (!refs.length && !specs.length) refs.push('HEAD');
  return { remote, refs, tags, allTags };
}

/** Annotated tag messages a push publishes. */
function tagMessages(t, top) {
  const names = [...t.tags];
  if (t.allTags) names.push(...(tryGit(['for-each-ref', '--format=%(refname)', 'refs/tags'], top) || '').split('\n'));
  for (const r of t.refs) if (!r.startsWith('--') && tryGit(['cat-file', '-t', r], top) === 'tag\n') names.push(r);
  const out = [];
  for (const n of new Set(names.filter(Boolean))) {
    if ((tryGit(['cat-file', '-t', n], top) || '').trim() !== 'tag') continue;
    out.push({ name: n, message: tryGit(['for-each-ref', '--format=%(contents)', n], top) || '' });
  }
  return out;
}

/** Outgoing commits of a push, oldest first, each with its message and added lines; null when refs do not resolve. */
function pushCommits(t, top) {
  const selectors = [...t.refs, '--not', `--remotes=${t.remote}`];
  if (tryGit(['rev-list', '--max-count=1', ...selectors], top) === null) return null;
  // One git process for every commit (message and first-parent patch), so a long history stays fast.
  const log = git(['log', '--reverse', '--format=%x01%H%x02%B%x03', '-p', '--diff-merges=first-parent', ...DIFF,
    ...selectors], top);
  return log.split('\x01').filter(Boolean).map((chunk) => {
    const sha = chunk.slice(0, chunk.indexOf('\x02'));
    const message = chunk.slice(chunk.indexOf('\x02') + 1, chunk.indexOf('\x03'));
    return { sha, message, lines: addedLines(chunk.slice(chunk.indexOf('\x03') + 1)) };
  });
}

/** Run the licensed-data scanner. Returns null when the repository has no config. */
function runScanner(top, modeArgs, scanner) {
  if (!fs.existsSync(path.join(top, CONFIG))) return null;
  if (!fs.existsSync(scanner)) {
    return { status: 'error', detail: `scanner not found at ${scanner}` };
  }
  const r = spawnSync('python3', ['-B', scanner, '--repo', top, ...modeArgs], {
    cwd: top,
    encoding: 'utf8',
    timeout: SCAN_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = (r.stdout || '').trim();
  if (r.error || r.signal) return { status: 'error', detail: r.error ? r.error.message : `killed by ${r.signal}` };
  if (r.status === 0) return { status: 'clean', detail: out };
  if (r.status === 1) return { status: 'flagged', detail: out };
  if (r.status === 2) return { status: 'skipped', detail: (r.stderr || out).trim() };
  return { status: 'error', detail: (r.stderr || out).trim().split('\n').slice(-3).join(' ') };
}

function scannerModeForPush(commits, top) {
  if (!commits.length) return null;
  const tip = commits[commits.length - 1].sha;
  const base = tryGit(['rev-parse', '--verify', '--quiet', `${commits[0].sha}^`], top);
  return base ? ['--range', `${base.trim()}..${tip}`] : ['--rev', tip];
}

const firstLines = (items, n = 10) =>
  items.slice(0, n).join('\n') + (items.length > n ? `\n... and ${items.length - n} more` : '');

const ATTRIBUTION_REASON = 'AI attribution in the message (a Co-Authored-By trailer naming Claude or Anthropic, ' +
  'noreply@anthropic.com, or "Generated with Claude Code"). Commits and tags carry no Claude or AI attribution: ' +
  'remove it.';

/** Judge one git call. Returns { deny: [], ask: [], warn: [] }. */
function judgeCall(call, heredocs, opts) {
  const found = { deny: [], ask: [], warn: [] };
  if (call.dir === null) {
    found.warn.push(`pre-publish-guard: cannot tell which folder git ${call.sub} runs in; not scanned`);
    return found;
  }
  const topOut = tryGit(['rev-parse', '--show-toplevel'], call.dir);
  if (topOut === null) return found; // not a repository: git itself will fail
  const top = topOut.trim();
  const home = opts.homePattern || homePattern();

  let lines = [];
  let scanMode = null;
  let wideReason = null;
  if (call.sub === 'push') {
    const t = pushTargets(call.args, top);
    const commits = pushCommits(t, top);
    if (commits === null) {
      found.ask.push(`cannot resolve what this push publishes (${t.refs.join(' ')} to ${t.remote}); ` +
        'the guard cannot say it is clean.');
      return found;
    }
    const bad = commits.filter((c) => attributed(c.message)).map((c) => c.sha.slice(0, 8));
    const badTags = tagMessages(t, top).filter((g) => attributed(g.message)).map((g) => g.name);
    if (bad.length || badTags.length) {
      found.deny.push(`AI attribution in outgoing ${[bad.length && `commit(s) ${bad.join(', ')}`,
        badTags.length && `tag(s) ${badTags.join(', ')}`].filter(Boolean).join(' and ')}. Reword them without it ` +
        '(an interactive rebase is the user\'s to run) before pushing.');
    }
    lines = commits.flatMap((c) => c.lines.map((l) => ({ ...l, file: `${c.sha.slice(0, 8)}:${l.file}` })));
    scanMode = scannerModeForPush(commits, top);
  } else {
    // Message first: a failure while reading the content must not skip it.
    const { parts, opts: copts } = messageParts(call, heredocs, top);
    if (parts.some(attributed)) found.deny.push(ATTRIBUTION_REASON);
    if (call.sub !== 'commit') return found;
    try {
      const c = commitLines(copts, call, top);
      lines = c.lines;
      wideReason = c.reason;
      scanMode = c.wide ? [] : ['--staged'];
    } catch (err) {
      found.ask.push(`could not read what this commit adds (${err.message.split('\n')[0]}); not scanned.`);
      return found;
    }
  }

  const homeHits = lines.filter((l) => home.test(l.text)).map((l) => `${l.file}:${l.line}`);
  if (homeHits.length) {
    found.ask.push(`home-directory path in ${homeHits.length} added line(s) (a personal path would be published):\n` +
      `${firstLines(homeHits)}\nReplace it with ~, $HOME or a relative path unless the user wants it published.` +
      (wideReason ? ` (scanned the whole tree: ${wideReason})` : ''));
  }

  if (scanMode) {
    const r = runScanner(top, scanMode, opts.scanner || SCANNER);
    if (r && r.status === 'flagged') {
      found.deny.push(`licensed vendor data: the scanner flagged these lines against the raw files in ${CONFIG} ` +
        `(file:line only):\n${firstLines(r.detail.split('\n'), 15)}\nReplace them with made-up values.`);
    } else if (r && r.status === 'error') {
      found.ask.push(`the licensed-data scanner failed (${r.detail}); the guard cannot say this ${call.sub} is clean.`);
    } else if (r && r.status === 'skipped') {
      found.warn.push(`pre-publish-guard: licensed-data scan skipped: ${r.detail}`);
    }
  }
  return found;
}

function decide(toolName, toolInput, cwd = process.cwd(), opts = {}) {
  if (toolName !== 'Bash') return null;
  const command = String(toolInput.command || '');
  if (!/\bgit\b/.test(command) || !/\b(commit|push|tag|merge)\b/.test(command)) return null;
  const { calls, heredocs } = publishCalls(command, cwd);
  if (!calls.length) return null;
  const all = { deny: [], ask: [], warn: [] };
  for (const call of calls) {
    const f = judgeCall(call, heredocs, opts);
    for (const k of Object.keys(all)) all[k].push(...f[k]);
  }
  if (all.deny.length) {
    return { decision: 'deny', reason: `BLOCKED by pre-publish-guard:\n- ${[...all.deny, ...all.ask].join('\n- ')}`, warn: all.warn };
  }
  if (all.ask.length) {
    return { decision: 'ask', reason: `pre-publish-guard:\n- ${all.ask.join('\n- ')}`, warn: all.warn };
  }
  return all.warn.length ? { decision: null, warn: all.warn } : null;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const payload = raw.trim() ? JSON.parse(raw) : {};
      const v = decide(payload.tool_name || '', payload.tool_input || {}, payload.cwd || process.cwd());
      if (v) {
        const out = {};
        if (v.warn && v.warn.length) out.systemMessage = v.warn.join('\n');
        if (v.decision) {
          out.hookSpecificOutput = {
            hookEventName: 'PreToolUse',
            permissionDecision: v.decision,
            permissionDecisionReason: v.reason,
          };
        }
        process.stdout.write(JSON.stringify(out));
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`pre-publish-guard: non-fatal error: ${err && err.message}\n`);
      process.exit(0);
    }
  });
}

if (require.main === module) main();
module.exports = { decide, homePattern, addedLines, pushTargets, commitArgs, ATTRIBUTION };
