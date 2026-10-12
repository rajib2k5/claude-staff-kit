#!/usr/bin/env node
/**
 * PreToolUse hook — Destructive Ops Guard.
 *
 * Intercepts irreversible operations across every technology (SQL of any dialect, dbt,
 * Snowflake, git, shell, Python/Node, Terraform, k8s, Docker, cloud CLIs, APIs) and either
 * ASKs the user to confirm or DENYs outright for the catastrophic tier.
 *
 * Contract (Claude Code PreToolUse):
 *   stdin  : JSON { tool_name, tool_input, cwd, ... }
 *   stdout : JSON { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }
 *
 * Design notes:
 *  - Fails OPEN on unexpected error. A buggy guard must not brick the session; it warns on stderr.
 *  - Deliberately narrow on Write/Edit: writing a file that *contains* the word DROP is not
 *    destructive. Only sensitive target paths are flagged. Over-prompting trains people to click
 *    through prompts, which defeats the guard.
 *  - Read-only and dry-run forms are exempted, but each excuses only its own simple command or SQL statement:
 *    `ls && git reset --hard` and `SELECT 1 FROM t; TRUNCATE x` still ask. A commit message or echoed text is only
 *    text, unless something on the same line can run text (a shell, an interpreter, xargs, a database client): then
 *    the whole line is scanned as code with no exemption (adversarial validation, 2026-10-04).
 *  - Scope (owner, 2026-10-03): approval only for the user's real things — a repository, the user's own folders, a
 *    live database (Snowflake or any RDBMS server) and published artifacts. A delete is judged by where it points:
 *    Claude's own session scratchpad, task output and session metadata (INTERNAL below) need no approval; the root,
 *    a home folder, system folders and ~/.claude as a whole are denied; anything else recursive or wildcard asks.
 *    A command that only reads (grep for "DROP DATABASE") or a heredoc that only writes a file runs nothing.
 *
 * Pairs with ~/.claude/skills/destructive-ops-guard/SKILL.md. Tests: evolv-destructive-guard.test.js
 * (node --test ~/.claude/hooks/evolv-destructive-guard.test.js).
 */

'use strict';

const os = require('node:os');
const path = require('node:path');

const BASH_TOOLS = new Set(['Bash', 'BashOutput']);
const EDIT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/**
 * Commands/flags that make an otherwise-scary string safe. Each is tested against ONE simple command or ONE SQL
 * statement, never a whole command line: `ls && git reset --hard` or `SELECT 1 FROM t; TRUNCATE x` must still ask.
 */
const SAFE_SIGNALS = [
  /--dry-run\b/i,
  /--plan\b/i,
  /\bterraform\s+plan\b/i,
  /--check\b/i,
  /\bgit\s+(status|log|diff|show|branch\s*$|remote\s+-v)/i,
  /^\s*(ls|cat|head|tail|grep|rg|find|wc|echo|which|type|jq|awk|sed\s+-n)\b/i,
  /\bEXPLAIN\b/i,
  /^\s*SELECT\b/i, // a read statement
];

/**
 * Catastrophic — DENY. Unrecoverable or system-wide. The user must do these by hand.
 * Each entry: [regex, human reason]
 */
const DENY = [
  // rm, rmdir, unlink, shutil.rmtree and fs.rm are judged by their targets: see deleteVerdict.
  [/\bmkfs\b|\bdd\s+if=.*\bof=\/dev\//, 'filesystem format / raw device write'],
  [/\bDROP\s+DATABASE\b/i, 'DROP DATABASE'],
  [/\bgit\s+push\s+(-f\b|--force\b)(?!-with-lease)[\s\S]*\b(main|master|prod|production)\b/i, 'force-push to a protected branch'],
  [/\bgit\s+(filter-branch|filter-repo)\b/, 'rewriting published git history'],
  [/\bterraform\s+destroy\b/i, 'terraform destroy'],
  [/\bshred\b/, 'shred (unrecoverable overwrite)'],
];

/**
 * Destructive — ASK. Reversible only with effort, or blast radius depends on context.
 */
const ASK = [
  // --- SQL, any dialect -------------------------------------------------
  [/\bDROP\s+(TABLE|SCHEMA|VIEW|INDEX|USER|ROLE|WAREHOUSE|STAGE|STREAM|TASK|FUNCTION|PROCEDURE)\b/i, 'SQL DROP of a database object'],
  [/\bTRUNCATE\s+(TABLE\s+)?\w/i, 'SQL TRUNCATE'],
  [/\bDELETE\s+FROM\b(?![\s\S]*\bWHERE\b)/i, 'DELETE with no WHERE clause (deletes every row)'],
  [/\bUPDATE\s+\w[\w.".]*\s+SET\b(?![\s\S]*\bWHERE\b)/i, 'UPDATE with no WHERE clause (rewrites every row)'],
  [/\bALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN\b/i, 'ALTER TABLE ... DROP COLUMN'],
  [/\bCREATE\s+OR\s+REPLACE\s+(TABLE|DATABASE|SCHEMA)\b/i, 'CREATE OR REPLACE over an existing object'],
  [/\bWHEN\s+NOT\s+MATCHED\s+BY\s+SOURCE\s+THEN\s+DELETE\b/i, 'unbounded MERGE ... DELETE'],
  [/\bREVOKE\b[\s\S]*\bFROM\b/i, 'REVOKE (access removal)'],
  [/\bDATA_RETENTION_TIME_IN_DAYS\s*=\s*0\b/i, 'setting Snowflake Time Travel retention to 0 (removes undo)'],

  // --- dbt --------------------------------------------------------------
  [/\bdbt\s+(run|build)\b[\s\S]*--full-refresh\b/i, 'dbt --full-refresh (rebuilds incremental history)'],
  [/\bdbt\s+run-operation\b/i, 'dbt run-operation (can issue arbitrary DDL)'],

  // --- version control ---------------------------------------------------
  [/\bgit\s+push\s+(-f\b|--force\b)/i, 'git force-push'],
  [/\bgit\s+reset\s+--hard\b/i, 'git reset --hard (discards uncommitted work)'],
  [/\bgit\s+clean\s+-[a-zA-Z]*[fd]/i, 'git clean (deletes untracked files)'],
  [/\bgit\s+branch\s+-D\b/i, 'force-delete a git branch'],
  [/\bgit\s+push\b[\s\S]*\s--delete\b|\bgit\s+push\s+\w+\s+:/i, 'deleting a remote branch'],

  // --- shell / filesystem (rm and friends: see deleteVerdict; system paths: SYSTEM_OVERWRITE) ---------------
  [/\bchmod\s+-R\b|\bchown\s+-R\b/, 'recursive permission/ownership change'],

  // --- application code (shutil.rmtree and fs.rm: see deleteVerdict) -------
  [/\bdrop_all\s*\(/, 'ORM drop_all (drops every table)'],
  [/\bprisma\b[\s\S]*\bdb\s+push\b[\s\S]*--accept-data-loss/i, 'prisma db push --accept-data-loss'],
  [/\b(migrate|manage\.py)\s+reset\b/i, 'migration reset (drops and recreates)'],
  [/\blocalStorage\.clear\s*\(|\bsessionStorage\.clear\s*\(|\bindexedDB\.deleteDatabase\s*\(/, 'clearing browser storage for the whole origin'],

  // --- infrastructure ------------------------------------------------------
  [/\bkubectl\s+delete\b/i, 'kubectl delete'],
  [/\bhelm\s+uninstall\b/i, 'helm uninstall'],
  [/\bdocker\s+(system\s+prune\s+-a|volume\s+rm)\b/i, 'docker prune -a / volume rm'],
  [/\baws\s+s3\s+(rm|rb)\b[\s\S]*--recursive|\baws\s+s3\s+rb\b/i, 'aws s3 recursive delete'],
  [/\b(gcloud|az)\b[\s\S]*\bdelete\b/i, 'cloud resource delete'],
  [/\bterraform\s+apply\b[\s\S]*-auto-approve/i, 'terraform apply -auto-approve (plan not reviewed)'],
  [/\bterraform\s+state\s+rm\b/i, 'terraform state rm'],

  // --- secrets / external effects -------------------------------------------
  [/\b(rotate|revoke)[-_ ](key|secret|token|credential)/i, 'credential rotation/revocation'],
  [/\bgh\s+repo\s+delete\b/i, 'deleting a GitHub repository'],
  [/\bcurl\b[\s\S]*-X\s*DELETE\b/i, 'HTTP DELETE against a live service'],
];

/** A redirect or tee into a system folder writes there whatever command produced the text: always ASK. */
const SYSTEM_OVERWRITE = /(>|\btee\s+(-a\s+)?)\s*\/(etc|usr|var|bin|sbin)\//;

/** Paths whose overwrite is worth a prompt even though Write itself is benign. */
const SENSITIVE_PATHS = [
  [/\.env(\.|$)/, 'environment/secrets file'],
  [/\.claude\/settings\.json$/, 'Claude Code settings'],
  [/\/\.git\/(config|HEAD|refs)/, 'git internals'],
  [/(^|\/)(id_rsa|id_ed25519|\.pem|\.p12|credentials)$/, 'credential material'],
  [/\/etc\//, 'system configuration'],
];

// --- Where a delete points decides whether it needs approval (owner, 2026-10-03) --------------------------------
const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Claude's own session and task files: not the user's data, so deleting them needs no approval. */
const INTERNAL = [
  /^\/private\/tmp\/claude-[^/]*(\/|$)/, // Claude Code's temp root: session scratchpads and task output
  new RegExp(`^${escapeRe(CLAUDE_DIR)}/(session-env|sessions|shell-snapshots|file-history|debug|paste-cache|cache|` +
             'telemetry|ide|todos|tasks|statsig)(/|$)'),
  // A session's folder or transcript under projects/ (never the project's memory/ folder, which is the user's).
  new RegExp(`^${escapeRe(CLAUDE_DIR)}/projects/[^/]+/` +
             '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\\.jsonl)?(/|$)'),
];

/** Deleting one of these (or a parent of the home folder) is never done for the user: DENY. */
const CATASTROPHIC = new Set(['/', '/Users', '/Volumes', '/System', '/Library', '/Applications', '/usr', '/bin',
  '/sbin', '/etc', '/var', '/opt', '/cores', '/private', '/private/var', '/private/etc', '/private/tmp', HOME,
  CLAUDE_DIR]);
const isCatastrophic = (abs) => CATASTROPHIC.has(abs) || HOME.startsWith(`${abs}/`);
const isInternal = (abs) => INTERNAL.some((re) => re.test(abs));
const toAbs = (p, cwd) => path.resolve(cwd, p).replace(/^\/tmp(?=\/|$)/, '/private/tmp');

/** Commands that only read: text they mention (a grep for "DROP DATABASE") is not run. */
const READ_ONLY = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'echo', 'printf',
  'which', 'type', 'stat', 'du', 'df', 'diff', 'cmp', 'sort', 'uniq', 'cut', 'tr', 'nl', 'column', 'file',
  'basename', 'dirname', 'realpath', 'readlink', 'pwd', 'date', 'true', 'false', 'test', 'cd', 'jq', 'less', 'more',
  'xxd', 'od', 'strings', 'shasum', 'sha256sum', 'md5', 'sed', 'awk', 'find', 'git']);
/** A heredoc fed to one of these is data written to a file; fed to anything else it is code. */
const DATA_SINKS = new Set(['cat', 'tee']);
const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'exec', 'nohup', 'time', 'env', 'nice']);

/** Shell words of one simple command, quotes removed. An unmatched quote ends the word. */
function tokenize(s) {
  const words = [];
  let cur = '';
  let started = false;
  let quote = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < s.length) cur += s[(i += 1)];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      started = true;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[(i += 1)];
      started = true;
    } else if (/\s/.test(c)) {
      if (started) words.push(cur);
      cur = '';
      started = false;
    } else {
      cur += c;
      started = true;
    }
  }
  if (started) words.push(cur);
  return words;
}

/** Simple commands of a command line: split on unquoted ; & | newlines and parentheses. */
function splitSegments(text) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < text.length) cur += text[(i += 1)];
    } else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === '\\' && i + 1 < text.length) {
      cur += c + text[(i += 1)];
    } else if (';&|\n()'.includes(c)) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Where the command of a simple command sits, past VAR=value assignments and wrappers such as sudo or env. */
function commandIndex(words) {
  let i = 0;
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || WRAPPERS.has(words[i]) ||
                              (i > 0 && WRAPPERS.has(words[i - 1]) && words[i].startsWith('-')))) i += 1;
  return i;
}

function commandWord(words) {
  const i = commandIndex(words);
  return i < words.length ? path.basename(words[i]) : '';
}

/** The working directory after `cd arg` from dir; null when it cannot be known. */
function nextDir(word, vars, dir) {
  let arg = expandVars(word || '~', vars);
  if (arg === '~' || arg.startsWith('~/')) arg = HOME + arg.slice(1);
  if (/[$`]/.test(arg) || arg.startsWith('~') || arg === '-') return null;
  if (arg.startsWith('/')) return toAbs(arg, '/');
  return dir === null ? null : toAbs(arg, dir);
}

function isReadOnly(segment) {
  const words = tokenize(segment);
  const cmd = commandWord(words);
  if (!READ_ONLY.has(cmd)) return false;
  if (cmd === 'sed') return !words.some((w) => /^-[a-zA-Z]*i/.test(w) || w.startsWith('--in-place'));
  if (cmd === 'awk') return !/\bsystem\s*\(/.test(segment);
  if (cmd === 'find') return !words.some((w) => ['-delete', '-exec', '-execdir', '-ok', '-okdir'].includes(w));
  if (cmd === 'git') return /\bgit\s+(-C\s+\S+\s+)?(status|log|diff|show|rev-parse|ls-files|blame|grep)\b/.test(segment);
  return true;
}

/**
 * Heredocs: the command line without their bodies (shell), the bodies something runs (code), and the bodies that
 * are only text (data). A body fed to cat or tee is data written to a file or a message, unless a pipe hands it on
 * (`cat <<EOF | snowsql` runs it) or the command substitution around it feeds a command that runs text
 * (`bash -c "$(cat <<EOF ... )"`). In `git commit -m "$(cat <<'EOF' ... EOF)"` the body belongs to cat, not git.
 */
function parseHeredocs(command) {
  const lines = command.split('\n');
  const shell = [];
  const code = [];
  const data = [];
  for (let i = 0; i < lines.length; i += 1) {
    shell.push(lines[i]);
    const m = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(lines[i]);
    if (!m) continue;
    const before = lines[i].slice(0, m.index);
    const sub = Math.max(before.lastIndexOf('$('), before.lastIndexOf('`'));
    const inner = sub === -1 ? before : before.slice(sub + (before.startsWith('$(', sub) ? 2 : 1));
    const owner = commandWord(tokenize(splitSegments(inner).pop() || ''));
    const outer = sub === -1 ? '' : commandWord(tokenize(splitSegments(before.slice(0, sub)).pop() || ''));
    const piped = /\|/.test(lines[i].slice(m.index).replace(/'[^']*'|"[^"]*"/g, ''));
    const body = [];
    let j = i + 1;
    for (; j < lines.length && lines[j].replace(/^\t+/, '') !== m[2]; j += 1) body.push(lines[j]);
    const runs = !DATA_SINKS.has(owner) || piped || runsGivenText(outer);
    (runs ? code : data).push(body.join('\n'));
    i = j; // skip the body and its closing delimiter
  }
  return { shell: shell.join('\n'), code, data };
}

/** VAR=value assignments made earlier in the same command line, plus HOME. */
function assignedVariables(text) {
  const vars = { HOME };
  const re = /(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s;&|)]*))/g;
  let m;
  while ((m = re.exec(text))) {
    vars[m[1]] = m[3] !== undefined ? m[3] : expandVars(m[2] !== undefined ? m[2] : m[4], vars);
  }
  return vars;
}

function expandVars(word, vars) {
  return word.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, braced, bare) => {
    const name = braced || bare;
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : all;
  });
}

/** internal | catastrophic | other | unresolved. A glob is judged by its fixed prefix and the folder it lists. */
function classifyTarget(word, vars, cwd) {
  // A target cut from inside an interpreter's string (os.system('rm -rf /')) keeps the closing quote: drop it.
  let p = expandVars(word, vars).replace(/[)'"`\]}]+$/, '');
  if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
  if (/[$`]/.test(p) || p.startsWith('~') || (cwd === null && !p.startsWith('/'))) return 'unresolved';
  const glob = p.search(/[*?[]/);
  if (glob === -1) {
    const abs = toAbs(p, cwd);
    if (isCatastrophic(abs)) return 'catastrophic';
    return isInternal(abs) ? 'internal' : 'other';
  }
  const fixed = p.slice(0, glob);
  const fixedAbs = toAbs(fixed || '.', cwd) + (fixed.endsWith('/') ? '/' : '');
  if (!fixed.includes('..') && isInternal(fixedAbs)) return 'internal';
  return isCatastrophic(toAbs(fixed.slice(0, fixed.lastIndexOf('/') + 1) || '.', cwd)) ? 'catastrophic' : 'other';
}

const RANK = { none: 0, internal: 1, ask: 2, deny: 3 };

/** One delete, from its targets: deny (catastrophic), ask (the user's files, or unknown), internal, or none. */
function judgeTargets(targets, wide, vars, cwd) {
  if (!targets.length) return wide ? { level: 'ask', what: 'targets read from a pipe or another command' } : null;
  let worst = { level: 'none', what: '' };
  for (const t of targets) {
    const kind = classifyTarget(t, vars, cwd);
    const glob = /[*?[]/.test(t);
    let level = 'none';
    if (kind === 'catastrophic' && (wide || glob)) level = 'deny';
    else if (kind === 'internal') level = 'internal';
    else if (wide || glob) level = 'ask';
    if (RANK[level] > RANK[worst.level]) worst = { level, what: t };
  }
  return worst;
}

const RM_COMMANDS = new Set(['rm', 'rmdir', 'unlink']);
/** Commands that run the code they are given (a string, a heredoc): a delete inside it is real. */
const EXECUTORS = /^(bash|sh|zsh|ksh|dash|fish|eval|ssh|su|doas|timeout|watch|parallel|nsenter|docker|podman|kubectl|python[\d.]*|node|deno|bun|ruby|perl|php|osascript)$/;
/** Database clients: SQL handed to them on the command line, on stdin or in a file written by the same line runs. */
const SQL_CLIENTS = /^(snowsql|psql|mysql|mariadb|sqlite3|duckdb|bq|sqlcmd|clickhouse|clickhouse-client|trino|presto|beeline|spark-sql|cockroach|mongosh|mongo|redis-cli|cqlsh)$/;
/** A command that runs text it is given: a shell, an interpreter, a container or remote runner, xargs, a database. */
const runsGivenText = (cmd) => EXECUTORS.test(cmd) || SQL_CLIENTS.test(cmd) || cmd === 'xargs';

/** Git subcommands whose quoted arguments are a message, never run. */
const MESSAGE_GIT = new Set(['commit', 'tag', 'notes', 'stash', 'merge']);

function gitSubcommand(words, i) {
  for (let j = i + 1; j < words.length; j += 1) {
    if (words[j] === '-C' || words[j] === '-c') j += 1;
    else if (!words[j].startsWith('-')) return words[j];
  }
  return '';
}

/** A simple command whose quoted arguments are text it prints, stores or commits: an echo, a printf, a message. */
function isTextCommand(segment) {
  const words = tokenize(segment);
  const i = commandIndex(words);
  const cmd = i < words.length ? path.basename(words[i]) : '';
  return cmd === 'echo' || cmd === 'printf' || (cmd === 'git' && MESSAGE_GIT.has(gitSubcommand(words, i)));
}

const withoutQuotedText = (segment) => segment.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''");

/** SQL statements of a script, split on ; outside quotes, so a read statement cannot excuse a write after it. */
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const c of sql) {
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === ';') {
      if (cur.trim()) out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const worstVerdict = (verdicts) =>
  verdicts.filter(Boolean).reduce((a, b) => (!a || RANK[b.decision] > RANK[a.decision] ? b : a), null);
const worstOf = (found) =>
  found.filter(Boolean).reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a), { level: 'none', what: '' });

/** An rm, rmdir or unlink whose command word is words[start]. */
function rmCall(words, start, vars, dir) {
  const flags = [];
  const targets = [];
  let options = true;
  for (const w of words.slice(start + 1)) {
    if (options && w === '--') options = false;
    else if (options && w.startsWith('-') && w.length > 1) flags.push(w);
    else targets.push(w);
  }
  const wide = flags.some((f) => (/^-[a-zA-Z]*[rR]/.test(f) && !f.startsWith('--')) || f === '--recursive');
  return judgeTargets(targets, wide, vars, dir);
}

/** find … -delete, or find … -exec rm …: everything under the folders it searches. */
function findDeletes(words, start, vars, dir) {
  const deletes = words.includes('-delete') || words.some(
    (w, k) => ['-exec', '-execdir', '-ok', '-okdir'].includes(w) && RM_COMMANDS.has(path.basename(words[k + 1] || '')));
  if (!deletes) return null;
  const roots = [];
  for (const w of words.slice(start + 1)) {
    if (w.startsWith('-') || w === '(' || w === '!') break;
    roots.push(w);
  }
  return judgeTargets(roots.length ? roots : ['.'], true, vars, dir);
}

/** Code an interpreter runs (bash -c "…", python -c "…", a heredoc): rm anywhere in it, rmtree, recursive fs.rm. */
function codeDeletes(code, vars, dir) {
  const found = [];
  const rm = /(^|[\s;&|("'`])(rm|rmdir|unlink)(?=\s)/g;
  let m;
  while ((m = rm.exec(code))) {
    const words = tokenize(splitSegments(code.slice(m.index + m[0].length))[0] || '');
    // A cd inside the code moves where a relative target points, and the guard cannot follow it.
    const here = /\b(cd|pushd)\b/.test(code.slice(0, m.index)) ? null : dir;
    found.push(rmCall(['rm', ...words], 0, vars, here));
  }
  const literalCalls = [
    [/\b(?:shutil\.)?rmtree\s*\(/g,
     /\b(?:shutil\.)?rmtree\s*\(\s*(?:(?:pathlib\.)?Path\s*\(\s*)?[rRbBuU]?(['"])((?:\\.|(?!\1)[^\\])*)\1/g],
    [/\.(?:rmSync|rm|rmdirSync|rmdir)\s*\([^)]*\brecursive\s*:\s*true/g,
     /\.(?:rmSync|rm|rmdirSync|rmdir)\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1[^)]*\brecursive\s*:\s*true/g],
  ];
  for (const [calls, literals] of literalCalls) {
    const hits = [...code.matchAll(literals)];
    if ([...code.matchAll(calls)].length > hits.length) {
      found.push({ level: 'ask', what: 'a recursive delete of a path computed at run time' });
    }
    for (const hit of hits) found.push(judgeTargets([hit[2]], true, vars, dir));
  }
  return found;
}

/**
 * Deletes, judged by target. Only where something runs them: an rm, rmdir or unlink command, xargs rm, find -delete
 * or -exec rm, code given to an interpreter, or a heredoc that is run. An rm inside echo text, a grep pattern or a
 * commit message is not a delete.
 */
function deleteVerdict(shell, code, vars, cwd) {
  const found = [];
  let dir = cwd;
  for (const segment of splitSegments(shell)) {
    const words = tokenize(segment);
    const i = commandIndex(words);
    const cmd = i < words.length ? path.basename(words[i]) : '';
    if (cmd === 'cd' || cmd === 'pushd') {
      dir = nextDir(words[i + 1], vars, dir);
    } else if (RM_COMMANDS.has(cmd)) {
      found.push(rmCall(words, i, vars, dir));
    } else if (cmd === 'xargs') {
      const r = words.findIndex((w, k) => k > i && RM_COMMANDS.has(path.basename(w)));
      if (r !== -1) found.push(rmCall(words, r, vars, dir));
    } else if (cmd === 'find') {
      found.push(findDeletes(words, i, vars, dir));
    } else if (EXECUTORS.test(cmd)) {
      found.push(...codeDeletes(segment, vars, dir));
    }
  }
  for (const body of code) found.push(...codeDeletes(body, vars, dir));
  return worstOf(found);
}

/**
 * The Bash path: reads run nothing; deletes are judged by target; everything else by the pattern scan.
 *
 * When something on the line can run text (a shell, an interpreter, a container or remote runner, xargs or a
 * database client, or a heredoc fed to one), any quoted text or heredoc on the line may reach it, so the whole line
 * is scanned as code and no safe signal excuses any part of it. Otherwise each simple command is scanned on its own:
 * a commit message or an echoed line is only text, and a dry run excuses only its own command.
 */
function decideShell(command, cwd) {
  if (!command.trim()) return null;
  const { shell, code, data } = parseHeredocs(command);
  const segments = splitSegments(shell);
  const runsText = code.length > 0 || segments.some((s) => runsGivenText(commandWord(tokenize(s))));
  const executed = runsText ? [...code, ...data] : [];
  const text = [shell, ...executed].join('\n');
  if (!executed.length && segments.length && segments.every(isReadOnly) && !SYSTEM_OVERWRITE.test(shell)) {
    return null;
  }
  const deletion = deleteVerdict(shell, executed, assignedVariables(text), cwd);
  if (deletion.level === 'deny') {
    return {
      decision: 'deny',
      reason:
        `BLOCKED by destructive-ops-guard: recursive or wildcard delete of ${deletion.what} (the filesystem root, ` +
        `a home folder, a system folder or the whole ~/.claude).\nThis is in the unrecoverable tier. Do not ` +
        `attempt a workaround or a different tool to achieve the same effect — surface it to the user and let them ` +
        `run it themselves if they truly intend it. See ~/.claude/skills/destructive-ops-guard/SKILL.md`,
    };
  }
  const scanned = runsText
    ? scanPatterns(text, { strict: true })
    : worstVerdict(segments.map((s) => scanPatterns(isTextCommand(s) ? withoutQuotedText(s) : s)));
  if (scanned) return scanned;
  if (deletion.level === 'ask') {
    return {
      decision: 'ask',
      reason:
        `Destructive operation detected: recursive or wildcard delete of ${deletion.what}, which is outside ` +
        `Claude's own session and task folders (the user's repository or folders, or a path the guard cannot ` +
        `resolve).\nBefore confirming, state what exactly is deleted (counted, not guessed), how it is recovered, ` +
        `and whether a non-destructive alternative exists. See ~/.claude/skills/destructive-ops-guard/SKILL.md`,
    };
  }
  return null;
}

function decide(toolName, toolInput, cwd = process.cwd()) {
  if (toolName === 'Artifact' && String(toolInput.action || '') === 'delete') {
    return {
      decision: 'ask',
      reason: 'Deleting a published artifact: its link stops working for everyone, and it cannot be undone.',
    };
  }
  if (BASH_TOOLS.has(toolName)) return decideShell(String(toolInput.command || ''), cwd);
  if (/sql|query|snowflake|bigquery|postgres|mysql|duckdb/i.test(toolName)) {
    const sqlText = String(toolInput.query || toolInput.sql || toolInput.statement || toolInput.command || '');
    return worstVerdict(splitStatements(sqlText).map((statement) => scanPatterns(statement)));
  }
  if (EDIT_TOOLS.has(toolName)) {
    const p = String(toolInput.file_path || toolInput.notebook_path || '');
    for (const [re, why] of SENSITIVE_PATHS) {
      if (re.test(p)) {
        return { decision: 'ask', reason: `Writing to ${why}: ${p}` };
      }
    }
    return null; // content of a written file is not an executed statement
  }
  return null;
}

/**
 * DENY and ASK patterns over one simple command or one SQL statement (deletes excluded: see deleteVerdict). With
 * `strict`, the text can be run by something on the same line, so no safe signal excuses it.
 */
function scanPatterns(text, { strict = false } = {}) {
  if (!text.trim()) return null;

  const hasDestructiveVerb = SYSTEM_OVERWRITE.test(text) || [...DENY, ...ASK].some(([re]) => re.test(text));
  if (!hasDestructiveVerb) return null;
  const looksSafe = !strict && SAFE_SIGNALS.some((re) => re.test(text));

  for (const [re, why] of DENY) {
    if (re.test(text)) {
      return {
        decision: 'deny',
        reason:
          `BLOCKED by destructive-ops-guard: ${why}.\n` +
          `This is in the unrecoverable tier. Do not attempt a workaround or a different tool to ` +
          `achieve the same effect — surface it to the user and let them run it themselves if they ` +
          `truly intend it. See ~/.claude/skills/destructive-ops-guard/SKILL.md`,
      };
    }
  }

  const asks = SYSTEM_OVERWRITE.test(text) ? [[SYSTEM_OVERWRITE, 'overwriting a system path']] : [];
  if (looksSafe && !asks.length) return null; // e.g. `terraform plan`, `--dry-run`; never a write to a system path

  for (const [re, why] of [...asks, ...ASK]) {
    if (re.test(text)) {
      return {
        decision: 'ask',
        reason:
          `Destructive operation detected: ${why}.\n` +
          `Before confirming, state: what exactly is destroyed (measured counts, not guesses), ` +
          `how it is recovered (backup/clone/Time Travel/revert — or NO), the blast radius, and ` +
          `whether a non-destructive alternative exists (soft delete, clone-first, new object ` +
          `beside old, expand→contract). See ~/.claude/skills/destructive-ops-guard/SKILL.md`,
      };
    }
  }
  return null;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const payload = raw.trim() ? JSON.parse(raw) : {};
      const verdict = decide(payload.tool_name || '', payload.tool_input || {}, payload.cwd || process.cwd());
      if (verdict) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: verdict.decision,
              permissionDecisionReason: verdict.reason,
            },
          })
        );
      }
      process.exit(0);
    } catch (err) {
      // Fail open: a broken guard must not brick the session.
      process.stderr.write(`destructive-guard: non-fatal error: ${err && err.message}\n`);
      process.exit(0);
    }
  });
}

if (require.main === module) main();
module.exports = { decide };
