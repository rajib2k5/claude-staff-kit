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
 *  - Trivial prompts removed (2026-11-18, from a week of transcripts): Claude's temp root on Linux and under
 *    CLAUDE_CODE_TMPDIR (TMP_BASES), a variable assigned a literal path earlier on the same line
 *    (resolveAssignedVariables), regenerable caches (CACHE_DIRS), `chmod -R u+…`, redirections read as arguments, and
 *    SQL text in a file being written or in a `python3 -` program's source (SQL_RULES).
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
const SQL_DENY = [[/\bDROP\s+DATABASE\b/i, 'DROP DATABASE']];
const DENY = [
  // rm, rmdir, unlink, shutil.rmtree and fs.rm are judged by their targets: see deleteVerdict.
  [/\bmkfs\b|\bdd\s+if=.*\bof=\/dev\//, 'filesystem format / raw device write'],
  ...SQL_DENY,
  [/\bgit\s+push\s+(-f\b|--force\b)(?!-with-lease)[\s\S]*\b(main|master|prod|production)\b/i, 'force-push to a protected branch'],
  [/\bgit\s+(filter-branch|filter-repo)\b/, 'rewriting published git history'],
  [/\bterraform\s+destroy\b/i, 'terraform destroy'],
  // SnowDDL drops every object its config manages. Like terraform destroy, the user runs it by hand.
  [/\bsnowddl(-[\w-]+)?\b[^;&|\n]*\sdestroy\b/i, 'snowddl destroy (drops every object the config manages)'],
  [/\bshred\b/, 'shred (unrecoverable overwrite)'],
];

/**
 * A call that changes staked money: numerapi's stake_* methods, Numerai's GraphQL stake mutations, or a generic
 * stake/unstake/withdraw-stake call. Matched in shell text and in the input of any tool whose name mentions numerai
 * or stake (an MCP GraphQL tool).
 */
const STAKE_CALL = /\b(?:stake[-_](?:increase|decrease|change|drain|set)|set_stake|(?:v2)?(?:Change|Release|Set)Stake|changeStake|releaseStake|setStake|withdraw_?stake|unstake)\b/i;

/** kill fed by pgrep -f (piped to xargs kill, or in $(...)): the same self-kill risk as pkill -f. Whole line. */
const PGREP_KILL = /\bpgrep\b[^;&|\n]*\s-[A-Za-z0-9]*f[\s\S]*\bkill\b|\bkill\b[\s\S]*\bpgrep\b[^;&|\n]*\s-[A-Za-z0-9]*f/;

/** Name of a variable that is never set: `cd "$<it>"` marks where a command substitution starts (see decideShell). */
const SUBST_DIR = '__GUARD_SUBSTITUTION_DIR__';

/**
 * Destructive — ASK. Reversible only with effort, or blast radius depends on context.
 */
const SQL_ASK = [
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
];
/**
 * Rules that only matter when the text reaches a database (see decideShell's skipSql). Ask tier only: DROP DATABASE
 * stays denied in any text the line runs, as it was before skipSql existed.
 */
const SQL_RULES = new Set(SQL_ASK.map(([re]) => re));

const ASK = [
  ...SQL_ASK,

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
  // A mode that only adds owner permissions (u+rwx, u+w,u+x) takes nothing away from anyone and opens nothing to others.
  [/\bchmod\s+-R\b(?!\s+u\+[rwx]+(?:,u\+[rwx]+)*(?=\s|$))|\b(?:chown|chgrp)\s+-R\b/, 'recursive permission/ownership change'],
  // pkill -f matches whole command lines, so its pattern also matches the shell that runs it (numerai-jupiter-nn
  // LEARNINGS §6: it killed its own session). Kill a recorded PID or process group instead.
  [/\bpkill\b[^;&|\n]*\s(?:-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)(?=\s|$)/, 'pkill -f (matches full command lines, including its own shell)'],

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
  // snowddl plan is the review step: show its output to the user before an apply.
  [/\bsnowddl(-[\w-]+)?\b[^;&|\n]*\sapply\b/i, 'snowddl apply (changes the live Snowflake account; run snowddl plan and show it first)'],

  // --- money ------------------------------------------------------------------
  [STAKE_CALL, 'changing a stake (Numerai or other staked money)'],

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
const toAbs = (p, cwd) => path.resolve(cwd, p).replace(/^\/tmp(?=\/|$)/, '/private/tmp');

/**
 * Where Claude Code keeps its temp folders: CLAUDE_CODE_TMPDIR, else os.tmpdir() (TMPDIR), plus /tmp (/private/tmp on
 * macOS). Session scratchpads and task output live in <base>/claude-<uid>/ (CLI 2.1.296: `ym()` returns
 * CLAUDE_CODE_TMPDIR || os.tmpdir(), and the per-uid root is join(ym(), `claude-${uid}`)).
 */
const TMP_BASES = [...new Set(['/tmp', os.tmpdir(), process.env.CLAUDE_CODE_TMPDIR]
  .filter((p) => p && path.isAbsolute(p)).map((p) => toAbs(p, '/')))];

/** Claude's own session and task files: not the user's data, so deleting them needs no approval. */
const INTERNAL = [
  // Inside a claude-* folder of a temp base. The folder itself (the per-uid root, every session's files) still asks.
  ...TMP_BASES.map((base) => new RegExp(`^${escapeRe(base.replace(/\/$/, ''))}/claude-[^/]+/.`)),
  new RegExp(`^${escapeRe(CLAUDE_DIR)}/(session-env|sessions|shell-snapshots|file-history|debug|paste-cache|cache|` +
             'telemetry|ide|todos|tasks|statsig)(/|$)'),
  // A session's folder or transcript under projects/ (never the project's memory/ folder, which is the user's).
  new RegExp(`^${escapeRe(CLAUDE_DIR)}/projects/[^/]+/` +
             '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\\.jsonl)?(/|$)'),
];

/** Deleting one of these (or a parent of the home folder) is never done for the user: DENY. */
const CATASTROPHIC = new Set(['/', '/Users', '/Volumes', '/System', '/Library', '/Applications', '/usr', '/bin',
  '/sbin', '/etc', '/var', '/opt', '/cores', '/private', '/private/var', '/private/etc', '/private/tmp', HOME,
  CLAUDE_DIR, ...TMP_BASES]);
const isCatastrophic = (abs) => CATASTROPHIC.has(abs) || HOME.startsWith(`${abs}/`);
const isInternal = (abs) => INTERNAL.some((re) => re.test(abs));

/** Commands that only read: text they mention (a grep for "DROP DATABASE") is not run. */
const READ_ONLY = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'echo', 'printf',
  'which', 'type', 'stat', 'du', 'df', 'diff', 'cmp', 'sort', 'uniq', 'cut', 'tr', 'nl', 'column', 'file',
  'basename', 'dirname', 'realpath', 'readlink', 'pwd', 'date', 'true', 'false', 'test', 'cd', 'jq', 'less', 'more',
  'xxd', 'od', 'strings', 'shasum', 'sha256sum', 'md5', 'sed', 'awk', 'find', 'git']);
/** A heredoc fed to one of these is data written to a file; fed to anything else it is code. */
const DATA_SINKS = new Set(['cat', 'tee']);
const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'exec', 'nohup', 'time', 'env', 'nice']);

/**
 * Quote state 'A' is bash's ANSI-C string $'...': a backslash escapes the next character, so \' does not end it.
 * Every scanner below knows it, or the guard and bash disagree on where a quote ends (adversarial review, W2).
 */
const ANSI = 'A';

/** An unquoted redirection operator: >, >>, >|, <, <>, <<, <<-, <<<, &>, &>>, >&, <& (an fd number before it is cut). */
const REDIRECT = /^(?:&>>?|<<<|<<-?|<>|>>|>\||>&|<&|>|<)/;

/**
 * Shell words of one simple command, quotes removed. An unmatched quote ends the word. Redirections are not words:
 * `rm -rf x 2>/dev/null` deletes x only, and `>/dev/null rm -rf ~` still runs rm (2026-11-18: `2>` and `2>/dev/null`
 * were read as a delete target and as a push refspec).
 */
function tokenize(s) {
  const words = [];
  let cur = '';
  let started = false;
  let plain = true; // the word so far has no quote or escape (so `2` before `>` is an fd number)
  let dropNext = false; // the next word is a redirection's file or heredoc delimiter
  let quote = null;
  const end = () => {
    if (started && !dropNext) words.push(cur);
    else if (started) dropNext = false;
    cur = '';
    started = false;
    plain = true;
  };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote === ANSI) {
      if (c === "'") quote = null;
      else if (c === '\\' && i + 1 < s.length) cur += s[(i += 1)];
      else cur += c;
    } else if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < s.length) cur += s[(i += 1)];
      else cur += c;
    } else if (c === '$' && s[i + 1] === "'") {
      quote = ANSI;
      started = true;
      plain = false;
      i += 1;
    } else if (c === "'" || c === '"') {
      quote = c;
      started = true;
      plain = false;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[(i += 1)];
      started = true;
      plain = false;
    } else if (c === '<' || c === '>' || (c === '&' && s[i + 1] === '>')) {
      if (started && plain && /^\d+$/.test(cur)) {
        cur = '';
        started = false;
      }
      end();
      const op = REDIRECT.exec(s.slice(i))[0];
      i += op.length - 1;
      const dup = op.endsWith('&') && /^(?:\d+-?|-)(?=$|[\s<>])/.exec(s.slice(i + 1)); // >&2, <&0, >&-
      if (dup) i += dup[0].length;
      else dropNext = true;
    } else if (/\s/.test(c)) {
      end();
    } else {
      cur += c;
      started = true;
    }
  }
  end();
  return words;
}

/**
 * Simple commands of a command line: split on unquoted ; & | newlines and parentheses, but not on the & of a
 * redirection (2>&1, &>file). With `ops`, the separator after each segment is pushed to it ('||' for a double bar).
 */
function splitSegments(text, ops = null) {
  const out = [];
  let cur = '';
  let quote = null;
  const push = (op) => {
    if (!cur.trim()) return;
    out.push(cur.trim());
    if (ops) ops.push(op);
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      cur += c;
      if (c === (quote === ANSI ? "'" : quote)) quote = null;
      else if (c === '\\' && (quote === '"' || quote === ANSI) && i + 1 < text.length) cur += text[(i += 1)];
    } else if (c === '$' && text[i + 1] === "'") {
      quote = ANSI;
      cur += "$'";
      i += 1;
    } else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === '\\' && i + 1 < text.length) {
      cur += c + text[(i += 1)];
    } else if (c === '&' && (text[i - 1] === '>' || text[i - 1] === '<' || text[i + 1] === '>')) {
      cur += c;
    } else if (';&|\n()'.includes(c)) {
      push(c === '|' && text[i + 1] === '|' ? '||' : c);
      cur = '';
    } else {
      cur += c;
    }
  }
  push('');
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
  if (vars.HOME && (arg === '~' || arg.startsWith('~/'))) arg = vars.HOME + arg.slice(1);
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
  const expanding = [];
  const python = [];
  for (let i = 0; i < lines.length; i += 1) {
    shell.push(lines[i]);
    const m = HEREDOC.exec(lines[i]);
    if (!m) continue;
    const before = lines[i].slice(0, m.index);
    const sub = Math.max(before.lastIndexOf('$('), before.lastIndexOf('`'));
    const inner = sub === -1 ? before : before.slice(sub + (before.startsWith('$(', sub) ? 2 : 1));
    const ownerWords = tokenize(splitSegments(inner).pop() || '');
    const owner = commandWord(ownerWords);
    const outer = sub === -1 ? '' : commandWord(tokenize(splitSegments(before.slice(0, sub)).pop() || ''));
    const piped = /\|/.test(lines[i].slice(m.index).replace(/'[^']*'|"[^"]*"/g, ''));
    const body = [];
    let j = i + 1;
    for (; j < lines.length && lines[j].replace(/^\t+/, '') !== m[2]; j += 1) body.push(lines[j]);
    const runs = !DATA_SINKS.has(owner) || piped || runsGivenText(outer);
    (runs ? code : data).push(body.join('\n'));
    // `python3 - <<'EOF'`: the body is the program itself (no -c, -m or script file), not input to one.
    const args = ownerWords.slice(commandIndex(ownerWords) + 1);
    if (/^python[\d.]*$/.test(owner) && !piped && !runsGivenText(outer) &&
        args.every((a) => a === '-' || (/^-[A-Za-z]+$/.test(a) && !/[cmWX]/.test(a)))) {
      python.push(body.join('\n'));
    }
    // An unquoted delimiter (<<EOF, not <<'EOF' or <<\EOF) makes bash expand $(...) in the body, even for cat.
    if (!m[1] && lines[i][m.index + m[0].length - m[2].length - 1] !== '\\') expanding.push(body.join('\n'));
    i = j; // skip the body and its closing delimiter
  }
  return { shell: shell.join('\n'), code, data, expanding, python };
}

/**
 * Every name the text may bind, anywhere (in quotes, loops and functions too), with a count: assignments, prefix
 * assignments, for/select loop variables, read/unset/export/local/declare/... arguments, ${X:=v}, -v X, let and (( )).
 * Over-counting only leaves a variable unresolved, so the patterns are broad.
 */
function bindings(command) {
  const counts = new Map();
  const add = (name) => counts.set(name, (counts.get(name) || 0) + 1);
  const NAME = /(?:^|[^\w$-])([A-Za-z_]\w*)/g;
  for (const m of command.matchAll(/(?:^|[\s;&|(`])([A-Za-z_]\w*)(?:\[[^\]\n]*\])?\+?=/g)) add(m[1]);
  for (const m of command.matchAll(/\b(?:for|select)\s+([A-Za-z_]\w*)/g)) add(m[1]);
  for (const m of command.matchAll(/\$\{([A-Za-z_]\w*):?=/g)) add(m[1]);
  for (const m of command.matchAll(/\s-v\s+([A-Za-z_]\w*)/g)) add(m[1]);
  // Names given to these builtins without `=` (with `=` they were counted above).
  for (const m of command.matchAll(/\b(?:read|unset|export|local|declare|typeset|readonly|getopts|mapfile|readarray)\b([^;&|\n]*)/g)) {
    for (const w of m[1].matchAll(/(?:^|\s)([A-Za-z_]\w*)(?=\s|$)/g)) add(w[1]);
  }
  for (const m of command.matchAll(/\blet\b([^;&|\n]*)|\(\(([^)]*)\)\)/g)) {
    for (const w of (m[1] || m[2] || '').matchAll(NAME)) add(w[1]);
  }
  return counts;
}

/** The heredoc operator parseHeredocs and resolveAssignedVariables both read: <<EOF, <<-'EOF', <<"EOF", not <<<. */
const HEREDOC = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_][\w-]*)\1/;

/** Heredoc bodies by the index where each starts: { end, next, expands, at }, found the way parseHeredocs finds them. */
function heredocBodies(command) {
  const bodies = new Map();
  const lines = command.split('\n');
  let offset = 0;
  for (let k = 0; k < lines.length; k += 1) {
    const line = lines[k];
    const m = HEREDOC.exec(line);
    const lineStart = offset;
    offset += line.length + 1;
    if (!m) continue;
    const start = offset;
    let j = k + 1;
    for (; j < lines.length && lines[j].replace(/^\t+/, '') !== m[2]; j += 1) offset += lines[j].length + 1;
    const end = Math.min(offset, command.length);
    if (j < lines.length) offset += lines[j].length + 1;
    const expands = !m[1] && line[m.index + m[0].length - m[2].length - 1] !== '\\';
    bodies.set(start, { end, next: offset - 1, expands, at: lineStart + m.index });
    k = j;
  }
  return bodies;
}

/**
 * The command line without its heredoc bodies: a body binds nothing in this shell (it is data, or a child's program),
 * unless `source`, `.` or `eval` on the line runs it here, and then the bodies are kept.
 */
function withoutHeredocBodies(command, bodies = heredocBodies(command)) {
  let text = command;
  for (const [start, b] of [...bodies].reverse()) text = text.slice(0, start) + text.slice(b.end);
  return /\b(?:source|eval)\b|(?:^|[;&|(\n])\s*\.\s/.test(text) ? command : text;
}

/** IFS set for the shell itself (not `IFS= read`, which sets it for that one command): word splitting changes. */
function changesIfs(command) {
  const text = withoutHeredocBodies(command);
  return /(?:^|[\s;&|(`])IFS=(?:'[^'\n]*'|"[^"\n]*"|[^\s;&|()'"]*)[ \t]*(?:$|[;&|)\n])/m.test(text) ||
    /\b(?:export|local|declare|typeset|readonly|read|unset|for)\b[^;&|\n]*\sIFS\b/.test(text) || /\$\{IFS:?=/.test(text);
}

/** Names bash itself changes (cd sets PWD) or that change how an expansion splits (IFS): never substituted. */
const SHELL_MANAGED = new Set(['PWD', 'OLDPWD', 'IFS', 'RANDOM', 'SRANDOM', 'SECONDS', 'LINENO', 'BASHPID', 'PPID',
  'REPLY', 'OPTIND', 'OPTARG', 'PIPESTATUS', 'HISTCMD', 'EPOCHSECONDS', 'EPOCHREALTIME', 'CDPATH']);
const OPENERS = new Set(['if', 'case', 'for', 'while', 'until', 'select', 'function', '{']);
const CLOSERS = new Set(['fi', 'esac', 'done', '}']);
/** NAME=value words (after an optional export) where every value is literal: no expansion, quote, operator or #. */
const ASSIGNMENT = /([A-Za-z_]\w*)=(?:'([^'\n]*)'|"([^"\n]*)"|([^\s'"]*))(?=\s|$)/y;
const LITERAL = /^[^$`'"\\;&|()<>#\n]*$/;

/**
 * The command line with each use of a variable replaced by its value, where that is certain to be what bash expands:
 * the variable is bound once on the whole line, by a top-level `VAR=literal` (or `export VAR=literal`) that is not in
 * a loop, a conditional block, a function, a subshell, a pipeline or a background job; the use comes after it, outside
 * single quotes and quoted heredocs (where only an inner shell would expand it); and the assignment has run when the
 * use runs: it starts its and-or list (after ; newline & or the line start), or it and the use are in one && chain.
 * Anything else stays a variable, which the guard cannot resolve, so it asks. Never reads the real environment.
 */
function resolveAssignedVariables(command) {
  const bodies = heredocBodies(command);
  const bound = bindings(withoutHeredocBodies(command, bodies));
  if (changesIfs(command)) return command; // a changed IFS splits a value differently from the text the guard reads
  const elements = []; // top-level simple commands and compound words, in order
  const uses = []; // { name, start, end, el }
  const stack = []; // 'dq' | 'sub' | 'bq' | 'par'
  const background = new Set();
  let el = { start: 0, opBefore: '', list: 0, allAnd: true };
  const close = (end, op) => {
    elements.push({ ...el, end });
    let { list, allAnd } = el;
    if (op === '&') background.add(list);
    if ([';', ';;', '\n', '&'].includes(op)) {
      list += 1;
      allAnd = true;
    } else if (op === '||') allAnd = false;
    el = { start: end + op.length, opBefore: op, list, allAnd };
  };
  const useAt = (i) => {
    const braced = /^\$\{([A-Za-z_]\w*)\}/.exec(command.slice(i)) || /^\$([A-Za-z_]\w*)/.exec(command.slice(i));
    if (braced) uses.push({ name: braced[1], start: i, end: i + braced[0].length, el: elements.length });
    if (braced || command[i + 1] !== '{') return braced ? braced[0].length - 1 : 0;
    // ${m%%|*}, ${x:-a b}: one expansion, never an operator or a separator. Skip to its closing brace.
    let depth = 0;
    for (let j = i + 1; j < command.length; j += 1) {
      if (command[j] === '\\') j += 1;
      else if (command[j] === '{') depth += 1;
      else if (command[j] === '}' && (depth -= 1) === 0) return j - i;
    }
    return command.length - i;
  };
  for (let i = 0; i < command.length; i += 1) {
    const body = bodies.get(i);
    if (body) {
      if (body.expands) {
        const owner = elements.findIndex((e) => body.at >= e.start && body.at < e.end);
        for (const m of command.slice(i, body.end).matchAll(/\\.|\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/gs)) {
          if (m[0][0] === '\\') continue;
          uses.push({ name: m[1] || m[2], start: i + m.index, end: i + m.index + m[0].length,
            el: owner === -1 ? elements.length : owner });
        }
      }
      if (el.start === i) el.start = body.next; // the body is not part of the command after it
      i = body.next - 1; // the newline after the delimiter line still separates commands
      continue;
    }
    const c = command[i];
    const top = stack[stack.length - 1];
    if (top === 'dq') {
      if (c === '\\') i += 1;
      else if (c === '"') stack.pop();
      else if (c === '$' && command[i + 1] === '(') { stack.push('sub'); i += 1; }
      else if (c === '`') stack.push('bq');
      else if (c === '$') i += useAt(i);
    } else if (c === '\\') {
      i += 1;
    } else if (c === '#' && (i === 0 || /[\s;&|()]/.test(command[i - 1]))) {
      const nl = command.indexOf('\n', i);
      i = (nl === -1 ? command.length : nl) - 1;
    } else if (c === "'" || (c === '$' && command[i + 1] === "'")) {
      let j = c === '$' ? i + 2 : i + 1;
      while (j < command.length && command[j] !== "'") j += c === '$' && command[j] === '\\' ? 2 : 1;
      if (j >= command.length) return command; // unmatched quote: resolve nothing
      i = j;
    } else if (c === '"') {
      stack.push('dq');
    } else if (c === '$' && command[i + 1] === '(') {
      stack.push('sub');
      i += 1;
    } else if (c === '`') {
      if (top === 'bq') stack.pop();
      else stack.push('bq');
    } else if (c === '(') {
      stack.push('par');
    } else if (c === ')') {
      if (top === 'sub' || top === 'par') stack.pop();
    } else if (c === '$') {
      i += useAt(i);
    } else if (!stack.length) {
      const two = command.slice(i, i + 2);
      if (two === '&&' || two === '||' || two === ';;') { close(i, two); i += 1; }
      else if (c === '&' && !/[<>]/.test(command[i - 1] || '') && command[i + 1] !== '>') close(i, '&');
      else if (c === '|' || c === ';' || c === '\n') close(i, c);
    }
  }
  if (stack.length) return command;
  elements.push({ ...el, end: command.length });

  let depth = 0;
  for (const e of elements) {
    let text = command.slice(e.start, e.end);
    let opens = 0;
    const header = /^\s*[\w.:-]+\s*\(\s*\)\s*\{?/.exec(text); // `name() {`: a function body starts
    if (header) {
      opens += 1;
      text = text.slice(header[0].length);
    }
    const words = tokenize(text);
    let w = 0;
    for (; ['do', 'then', 'else', 'elif', '!', 'time', '{'].includes(words[w]); w += 1) { // `do if …`, `{ for …`
      if (words[w] === '{') opens += 1;
    }
    const first = words[w] || '';
    if (OPENERS.has(first)) opens += 1;
    e.top = depth === 0 && w === 0 && !opens;
    depth += opens;
    if (CLOSERS.has(first) && (depth -= 1) < 0) return command;
  }
  if (depth) return command;

  const values = new Map(); // name -> { value, index, chain }
  elements.forEach((e, index) => {
    const opAfter = index + 1 < elements.length ? elements[index + 1].opBefore : '';
    if (!e.top || e.opBefore === '|' || e.opBefore === '||' || opAfter === '|' || background.has(e.list)) return;
    if (e.opBefore === '&&' && !e.allAnd) return;
    const text = command.slice(e.start, e.end).trim().replace(/^export\s+/, '');
    const found = [];
    let pos = 0;
    while (pos < text.length) {
      ASSIGNMENT.lastIndex = pos;
      const m = ASSIGNMENT.exec(text);
      if (!m) return;
      const value = m[2] ?? m[3] ?? m[4];
      const tilde = m[4] !== undefined && /^~(\/|$)/.test(value) && !bound.has('HOME');
      if (!LITERAL.test(value) || (value.includes('~') && !tilde)) return;
      found.push([m[1], tilde ? HOME + value.slice(1) : value]);
      pos = m.index + m[0].length;
      while (/\s/.test(text[pos] || '')) pos += 1;
    }
    for (const [name, value] of found) {
      if (bound.get(name) === 1 && !SHELL_MANAGED.has(name)) values.set(name, { value, index, chain: e.opBefore === '&&' });
    }
  });

  let out = '';
  let last = 0;
  for (const u of uses.sort((a, b) => a.start - b.start)) {
    const v = values.get(u.name);
    if (!v || u.el <= v.index) continue;
    const at = elements[u.el];
    if (v.chain && (!at || at.list !== elements[v.index].list || !at.allAnd)) continue;
    out += command.slice(last, u.start) + v.value;
    last = u.end;
  }
  return out + command.slice(last);
}

function expandVars(word, vars) {
  return word.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, braced, bare) => {
    const name = braced || bare;
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : all;
  });
}

/** internal | catastrophic | other | unresolved. A glob is judged by its fixed prefix and the folder it lists. */
// A target cut from inside an interpreter's string (os.system('rm -rf /')) keeps the closing quote: drop it.
const targetPath = (word, vars) => expandVars(word, vars).replace(/[)'"`\]}]+$/, '');

function classifyTarget(word, vars, cwd) {
  let p = targetPath(word, vars);
  if (vars.HOME && (p === '~' || p.startsWith('~/'))) p = vars.HOME + p.slice(1);
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

/** Regenerable caches: deleting one (named exactly) loses nothing a rerun does not rebuild. .venv, node_modules and
 * .tox are not here: rebuilding them is slow and can pull different versions. */
const CACHE_DIRS = new Set(['__pycache__', '.pytest_cache', '.hypothesis', '.mypy_cache', '.ruff_cache']);

/** A target whose last part is a cache folder (or node_modules/.cache). Unresolved, a trailing / or .. : not one. */
function isCacheDir(word, vars) {
  const p = targetPath(word, vars);
  if (/[$`]/.test(p) || p.endsWith('/')) return false;
  const parts = p.split('/');
  const last = parts[parts.length - 1];
  return CACHE_DIRS.has(last) || (last === '.cache' && parts[parts.length - 2] === 'node_modules');
}

/** One delete, from its targets: deny (catastrophic), ask (the user's files, or unknown), internal, or none. */
function judgeTargets(targets, wide, vars, cwd) {
  if (!targets.length) return wide ? { level: 'ask', what: 'targets read from a pipe or another command' } : null;
  let worst = { level: 'none', what: '' };
  for (const t of targets) {
    if (isCacheDir(t, vars)) continue;
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
/** A database client named anywhere on the line: SQL text in a file or heredoc on that line may reach a database. */
const SQL_RUNNERS = new RegExp(`\\b(?:${SQL_CLIENTS.source.slice(2, -2)})\\b|\\b(?:dolt|snow|sf)\\s+sql\\b`);
/** Python (or other) source that talks to a database or starts a process, so SQL text in it may run. */
const DB_CALL = new RegExp([
  String.raw`\b(?:execute\w*|exec_driver_sql|read_sql\w*|cursor|connect|query|sql|run_query)\s*\(`,
  String.raw`\b(?:sqlite3|psycopg2?|pymysql|MySQLdb|mysql|snowflake|duckdb|sqlalchemy|pyodbc|asyncpg|aiosqlite|cx_Oracle|oracledb|bigquery|clickhouse\w*|trino|databricks|pyspark|pymongo|redis|cassandra|peewee|django|subprocess|psql)\b`,
  String.raw`\bos\.(?:system|popen|exec\w*|spawn\w*)\b|\bPopen\b`,
].join('|'));

/** Git subcommands whose quoted arguments are a message, never run. */
const MESSAGE_GIT = new Set(['commit', 'tag', 'notes', 'stash', 'merge']);

function gitSubcommand(words, i) {
  for (let j = i + 1; j < words.length; j += 1) {
    if (words[j] === '-C' || words[j] === '-c') j += 1;
    else if (!words[j].startsWith('-')) return words[j];
  }
  return '';
}

/** gh command groups whose quoted arguments are a title, a body, notes or a comment, never run. */
const MESSAGE_GH = new Set(['pr', 'issue', 'release', 'gist', 'discussion']);

function ghSubcommand(words, i) {
  for (let j = i + 1; j < words.length; j += 1) {
    if (words[j] === '-R' || words[j] === '--repo') j += 1;
    else if (!words[j].startsWith('-')) return words[j];
  }
  return '';
}

/**
 * A simple command whose quoted arguments are text it prints, stores, commits or posts: an echo, a printf, a commit
 * message, a gh PR or issue body. Regression (2026-11-09): `gh pr create --body "...rm -rf /..."` was denied because
 * the PR text was scanned as if it ran.
 */
function isTextCommand(segment) {
  const words = tokenize(segment);
  const i = commandIndex(words);
  const cmd = i < words.length ? path.basename(words[i]) : '';
  // VAR="..." before the command is not text: GIT_SSH_COMMAND, EDITOR or GH_EDITOR name a command that runs.
  if (words.slice(0, i).some((w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w))) return false;
  return cmd === 'echo' || cmd === 'printf' || (cmd === 'git' && MESSAGE_GIT.has(gitSubcommand(words, i))) ||
    (cmd === 'gh' && MESSAGE_GH.has(ghSubcommand(words, i)));
}

const withoutQuotedText = (segment) => segment.replace(/\$'(?:[^'\\]|\\.)*'|'[^']*'|"(?:[^"\\]|\\.)*"/g, "''");

/**
 * Bodies of command substitutions, $(…) and `…`, outside single quotes, nested ones too. They run even inside a
 * double-quoted message (`git commit -m "$(rm -rf ~)"`), so they are judged as commands of their own.
 */
function substitutions(text) {
  const out = [];
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = null;
    } else if (quote === ANSI) {
      if (c === '\\') i += 1;
      else if (c === "'") quote = null;
    } else if (c === '\\') {
      i += 1;
    } else if (c === '$' && text[i + 1] === "'" && !quote) {
      quote = ANSI;
      i += 1;
    } else if (c === "'" && !quote) {
      quote = "'";
    } else if (c === '"') {
      quote = quote === '"' ? null : '"';
    } else if (c === '`') {
      const end = text.indexOf('`', i + 1);
      const body = text.slice(i + 1, end === -1 ? text.length : end);
      out.push(body, ...substitutions(body));
      i = end === -1 ? text.length : end;
    } else if (c === '$' && text[i + 1] === '(') {
      let depth = 1;
      let q = null;
      let j = i + 2;
      for (; j < text.length && depth; j += 1) {
        const d = text[j];
        if (q) {
          if (d === q) q = null;
          else if (d === '\\' && q === '"') j += 1;
        } else if (d === "'" || d === '"') q = d;
        else if (d === '\\') j += 1;
        else if (d === '(') depth += 1;
        else if (d === ')') depth -= 1;
      }
      const body = text.slice(i + 2, depth ? j : j - 1);
      out.push(body, ...substitutions(body));
      i = j - 1;
    }
  }
  return out.filter((s) => s.trim());
}

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

const FIND_EXEC = ['-exec', '-execdir', '-ok', '-okdir'];

/** The folders a find searches: the words before its first test. */
function findRoots(words, start) {
  const roots = [];
  for (const w of words.slice(start + 1)) {
    if (w.startsWith('-') || w === '(' || w === '!') break;
    roots.push(w);
  }
  return roots.length ? roots : ['.'];
}

/**
 * A find that can only reach cache folders (CACHE_DIRS): no !, -not, -o, -or, comma or parentheses (only implicit
 * AND), at least one -name, every -name a cache folder, and each delete (-delete, or -exec rm with {} as its only
 * target) after a -name. With `printsOnly`, nothing but tests, -prune, -print and -print0, so what it prints for a
 * pipe is the matched paths.
 */
function onlyFindsCaches(words, start, printsOnly = false) {
  let names = 0;
  for (let k = start + 1; k < words.length; k += 1) {
    const w = words[k];
    if (['!', '-not', '-o', '-or', ',', '(', ')'].includes(w)) return false;
    if (w === '-name') {
      if (!CACHE_DIRS.has(words[k + 1])) return false;
      names += 1;
      k += 1;
    } else if (w === '-delete') {
      if (printsOnly || !names) return false;
    } else if (FIND_EXEC.includes(w)) {
      let end = k + 1;
      while (end < words.length && words[end] !== ';' && words[end] !== '+') end += 1;
      const run = words.slice(k + 1, end);
      if (printsOnly || !RM_COMMANDS.has(path.basename(run[0] || ''))) return false;
      const args = run.slice(1).filter((a) => !/^-[a-zA-Z]+$/.test(a) && a !== '--');
      if (!names || args.length !== 1 || args[0] !== '{}') return false;
      k = end;
    } else if (printsOnly && /^-(f?print|fls|ls|printf|fprintf)/.test(w) && !['-print', '-print0'].includes(w)) {
      return false;
    }
  }
  return names > 0;
}

/** Roots a cache-only find may search: resolved, and not a catastrophic folder (those keep their deny). */
const cacheRootsOk = (roots, vars, dir) => roots.every((r) => ['internal', 'other'].includes(classifyTarget(r, vars, dir)));

/** find … -delete, or find … -exec rm …: everything under the folders it searches. */
function findDeletes(words, start, vars, dir) {
  const deletes = words.includes('-delete') || words.some(
    (w, k) => FIND_EXEC.includes(w) && RM_COMMANDS.has(path.basename(words[k + 1] || '')));
  if (!deletes) return null;
  const roots = findRoots(words, start);
  if (onlyFindsCaches(words, start) && cacheRootsOk(roots, vars, dir)) return null;
  return judgeTargets(roots, true, vars, dir);
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
function deleteVerdict(shell, code, vars, cwd, pwdBound = false) {
  const found = [];
  let dir = cwd;
  const ops = [];
  const segments = splitSegments(shell, ops);
  let prev = { words: [], i: 0, cmd: '', vars };
  segments.forEach((segment, n) => {
    const words = tokenize(segment);
    const i = commandIndex(words);
    const cmd = i < words.length ? path.basename(words[i]) : '';
    // $PWD is the folder the guard tracks for relative paths, unless the line assigns PWD itself.
    const here = dir !== null && !pwdBound ? { ...vars, PWD: dir } : vars;
    if (cmd === 'cd' || cmd === 'pushd') {
      dir = nextDir(words[i + 1], here, dir);
    } else if (RM_COMMANDS.has(cmd)) {
      found.push(rmCall(words, i, here, dir));
    } else if (cmd === 'xargs') {
      const r = words.findIndex((w, k) => k > i && RM_COMMANDS.has(path.basename(w)));
      // `find … -name __pycache__ | xargs rm -rf`: the only targets are what a cache-only find prints.
      const fromCacheFind = r !== -1 && n > 0 && ops[n - 1] === '|' && prev.cmd === 'find' &&
        onlyFindsCaches(prev.words, prev.i, true) && cacheRootsOk(findRoots(prev.words, prev.i), prev.vars, dir) &&
        !words.slice(i + 1, r).some((w) => /^-[A-Za-z0-9]*a/.test(w) || w.startsWith('--arg-file')) &&
        words.slice(r + 1).every((w) => w.startsWith('-'));
      if (r !== -1 && !fromCacheFind) found.push(rmCall(words, r, here, dir));
    } else if (cmd === 'find') {
      found.push(findDeletes(words, i, here, dir));
    } else if (EXECUTORS.test(cmd)) {
      found.push(...codeDeletes(segment, vars, dir));
    }
    prev = { words, i, cmd, vars: here };
  });
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
 *
 * One exception to the whole-line scan: SQL in a heredoc written to a file (cat, tee) or in the source of a
 * `python3 - <<'EOF'` program is text, unless the line names a database client or the body calls a database or a
 * subprocess (SQL_RUNNERS, DB_CALL). It is still scanned for every other rule.
 */
function decideShell(rawCommand, cwd) {
  if (!rawCommand.trim()) return null;
  const bound = bindings(withoutHeredocBodies(rawCommand));
  let command = rawCommand;
  for (let k = 0, prev = null; k < 8 && command !== prev; k += 1) [prev, command] = [command, resolveAssignedVariables(command)];
  // HOME and PWD are known unless the line rebinds them, or IFS (which would split their values differently).
  const ifs = changesIfs(rawCommand);
  const vars = bound.has('HOME') || ifs ? {} : { HOME };
  const parsed = parseHeredocs(command);
  const { code, data } = parsed;
  // Each substitution runs where it appears, not after the line's last cd: the cd to an unknown folder in front of
  // it makes a relative target unresolved (ask) instead of judged against a later cd.
  const subs = [parsed.shell, ...parsed.expanding].flatMap(substitutions);
  const shell = [parsed.shell, ...subs.map((s) => `cd "$${SUBST_DIR}"\n${s}`)].join('\n');
  const segments = splitSegments(shell);
  const runsText = code.length > 0 || segments.some((s) => runsGivenText(commandWord(tokenize(s))));
  const executed = runsText ? [...code, ...data] : [];
  const sqlText = new Set(SQL_RUNNERS.test(command) ? [] : [...data, ...parsed.python].filter((b) => !DB_CALL.test(b)));
  const text = [shell, ...executed.filter((b) => !sqlText.has(b))].join('\n');
  if (!executed.length && segments.length && segments.every(isReadOnly) && !SYSTEM_OVERWRITE.test(shell)) {
    return null;
  }
  const deletion = deleteVerdict(shell, executed, vars, cwd, bound.has('PWD') || ifs);
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
  const selfKill = PGREP_KILL.test(withoutQuotedText(shell))
    ? { decision: 'ask', reason: 'Destructive operation detected: kill fed by pgrep -f, which matches full command ' +
        'lines, including the shell that runs it. Kill a PID or process group you recorded instead.' }
    : null;
  const scanned = worstVerdict([selfKill, runsText
    ? worstVerdict([scanPatterns(text, { strict: true }),
      scanPatterns(executed.filter((b) => sqlText.has(b)).join('\n'), { strict: true, skipSql: true })])
    : worstVerdict(segments.map((s) => scanPatterns(isTextCommand(s) ? withoutQuotedText(s) : s)))]);
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
  const toolAction = toolName.slice(toolName.lastIndexOf('__') + 2); // mcp__numerai__set_stake -> set_stake
  if (/numerai|(^|_)stake/i.test(toolName) &&(STAKE_CALL.test(toolAction) || STAKE_CALL.test(JSON.stringify(toolInput)))) {
    return {
      decision: 'ask',
      reason:
        `Changing a stake through ${toolName}: this moves the user's money. State the model, the current stake, ` +
        'the new stake and when it takes effect, and let the user confirm. The user places stakes, not Claude.',
    };
  }
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
function scanPatterns(text, { strict = false, skipSql = false } = {}) {
  if (!text.trim()) return null;
  const rules = (list) => (skipSql ? list.filter(([re]) => !SQL_RULES.has(re)) : list);

  const hasDestructiveVerb = SYSTEM_OVERWRITE.test(text) || [...rules(DENY), ...rules(ASK)].some(([re]) => re.test(text));
  if (!hasDestructiveVerb) return null;
  const looksSafe = !strict && SAFE_SIGNALS.some((re) => re.test(text));

  for (const [re, why] of rules(DENY)) {
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

  for (const [re, why] of [...asks, ...rules(ASK)]) {
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
// The shell parser is shared with pre-publish-guard.js, so both hooks read a command line the same way.
module.exports = { decide, shell: { tokenize, splitSegments, parseHeredocs, commandIndex, substitutions } };
