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
 *    (resolveAssignedVariables), regenerable caches (CACHE_DIRS), `chmod -R u+…` on a project folder (riskyChmod)
 *    and redirections read as arguments. SQL text in a heredoc is judged as before: the guard cannot know which
 *    program reads a file, so a list of SQL clients was a hole (adversarial review, 2026-11-18).
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

/** A recursive chmod. Not a plain regex rule: scanPatterns asks only when riskyChmod finds a risky one. */
const CHMOD_R = /\bchmod\s+-R\b/;

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
  // CHMOD_R is judged by riskyChmod: an owner-add mode on project folders does not ask.
  [CHMOD_R, 'recursive permission change'],
  [/\b(?:chown|chgrp)\s+-R\b/, 'recursive ownership change'],
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
const SYSTEM_OVERWRITE = /(>\|?|\btee\s+(-a\s+)?)\s*\/(etc|usr|var|bin|sbin)\//;

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
  // Inside the claude-<uid> folder of a temp base (a number: /tmp/claude-backups is not Claude's). The folder itself
  // (every session's files) still asks.
  ...TMP_BASES.map((base) => new RegExp(`^${escapeRe(base.replace(/\/$/, ''))}/claude-\\d+/.`)),
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
const REDIRECT = /(?:&>>?|<<<|<<-?|<>|>>|>\||>&|<&|>|<)/y;
/** What may follow >& or <& to duplicate or close a descriptor (>&2, <&0, >&-) instead of naming a file. */
const FD_DUP = /(?:\d+-?|-)(?=$|[\s<>])/y;

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
      REDIRECT.lastIndex = i;
      const op = REDIRECT.exec(s)[0];
      i += op.length - 1;
      FD_DUP.lastIndex = i + 1;
      const dup = op.endsWith('&') && FD_DUP.exec(s);
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
 * redirection (2>&1, &>file) or the | of >|. With `ops`, the separator after each segment is pushed to it ('||' for a
 * double bar). With `max`, stops after that many segments (the first command of a long text, read in linear time).
 */
function splitSegments(text, ops = null, max = Infinity) {
  const out = [];
  let cur = '';
  let quote = null;
  const push = (op) => {
    if (!cur.trim()) return;
    out.push(cur.trim());
    if (ops) ops.push(op);
  };
  for (let i = 0; i < text.length && out.length < max; i += 1) {
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
    } else if ((c === '&' && (text[i - 1] === '>' || text[i - 1] === '<' || text[i + 1] === '>')) ||
               (c === '|' && text[i - 1] === '>' && text[i - 2] !== '\\')) {
      cur += c;
    } else if (';&|\n()'.includes(c)) {
      push(c === '|' && text[i + 1] === '|' ? '||' : c);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (out.length < max) push('');
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
  for (let i = 0; i < lines.length; i += 1) {
    shell.push(lines[i]);
    let j = i + 1; // the bodies of a line's heredocs follow it one after another: `cmd <<A <<B`
    for (const op of heredocOperators(lines[i])) {
      const before = lines[i].slice(0, op.index);
      const sub = Math.max(before.lastIndexOf('$('), before.lastIndexOf('`'));
      const inner = sub === -1 ? before : before.slice(sub + (before.startsWith('$(', sub) ? 2 : 1));
      const owner = commandWord(tokenize(splitSegments(inner).pop() || ''));
      const outer = sub === -1 ? '' : commandWord(tokenize(splitSegments(before.slice(0, sub)).pop() || ''));
      const piped = /\|/.test(lines[i].slice(op.index).replace(/'[^']*'|"[^"]*"/g, ''));
      const body = [];
      for (; j < lines.length && lines[j].replace(/^\t+/, '') !== op.delim; j += 1) body.push(lines[j]);
      j += 1; // past the closing delimiter
      const runs = !DATA_SINKS.has(owner) || piped || runsGivenText(outer);
      (runs ? code : data).push(body.join('\n'));
      // An unquoted delimiter (<<EOF, not <<'EOF' or <<\EOF) makes bash expand $(...) in the body, even for cat.
      if (!op.quoted) expanding.push(body.join('\n'));
    }
    i = j - 1; // skip the bodies and their closing delimiters
  }
  return { shell: shell.join('\n'), code, data, expanding };
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

/**
 * The heredoc operators parseHeredocs and resolveAssignedVariables both read: <<EOF, <<-'EOF', <<"E O", <<\EOF,
 * <<EOF. and the like, never <<<. The delimiter word may mix quoted and plain parts. One that starts with a digit is
 * skipped, so the shift in $((1<<2)) is not read as a heredoc.
 */
const HEREDOC = /(?<!<)<<(?!<)-?[ \t]*((?:'[^'\n]*'|"[^"\n]*"|\\.|[^\s;&|<>()'"\\])+)/g;

/** A line's heredoc operators in order: { index, delim (quotes removed), quoted (any quote stops expansion) }. */
function heredocOperators(line) {
  const ops = [];
  for (const m of line.matchAll(HEREDOC)) {
    if (/^\d/.test(m[1])) continue;
    const delim = m[1].replace(/'([^']*)'|"([^"]*)"|\\(.)/g, (all, single, double, escaped) => single ?? double ?? escaped);
    ops.push({ index: m.index, delim, quoted: /['"\\]/.test(m[1]) });
  }
  return ops;
}

/** Heredoc bodies by the index where each starts: { end, next, expands, at }, found the way parseHeredocs finds them. */
function heredocBodies(command) {
  const bodies = new Map();
  const lines = command.split('\n');
  const starts = [0]; // where each line starts; one past the end for the line after the last
  for (const line of lines) starts.push(starts[starts.length - 1] + line.length + 1);
  for (let k = 0; k < lines.length; k += 1) {
    let j = k + 1;
    for (const op of heredocOperators(lines[k])) {
      j = Math.min(j, lines.length);
      const first = j;
      while (j < lines.length && lines[j].replace(/^\t+/, '') !== op.delim) j += 1;
      bodies.set(starts[Math.min(first, lines.length)], { end: Math.min(starts[j], command.length),
        next: starts[Math.min(j + 1, lines.length)] - 1, expands: !op.quoted, at: starts[k] + op.index });
      j += 1;
    }
    k = Math.max(k, j - 1);
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
/** Builtins that run text in this shell or set variables from input or later: never parsed for what they bind. */
const REBINDERS = new Set(['eval', 'source', '.', 'trap']);
/**
 * Builtins that take variable names, with the letters of their options that take a value (`read -p prompt name`).
 * printf and wait take names only after -v and -p.
 */
const NAME_TAKERS = new Map([['read', 'adinNptu'], ['mapfile', 'dnOsuCc'], ['readarray', 'dnOsuCc'], ['declare', ''],
  ['typeset', ''], ['local', ''], ['export', ''], ['readonly', ''], ['printf', ''], ['wait', '']]);
/** One shell word as written, quotes kept. */
const RAW_WORD = /(?:[^\s'"\\]|\\.|'[^']*'|"(?:[^"\\]|\\.)*")+/g;

/** Whether every name the builtin `cmd` is given (raw words, quotes kept) is a plain word that bindings() counts. */
function namesArePlain(cmd, args) {
  const valued = NAME_TAKERS.get(cmd);
  for (let k = 0; k < args.length; k += 1) {
    const a = args[k];
    const option = /^-([A-Za-z]+)$/.exec(a);
    if (/^\d*(?:[<>]|&>)/.test(a)) {
      if (/^\d*[<>&|-]+$/.test(a)) k += 1; // a redirection and its file, written apart
    } else if (cmd === 'printf') {
      if (a.startsWith('-v') && (a !== '-v' || !/^[A-Za-z_]\w*$/.test(args[k + 1] || ''))) return false;
    } else if (cmd === 'wait') {
      if (option && option[1].includes('p')) return false; // wait -p NAME: bindings() does not count it
    } else if (option) {
      if (!valued && option[1].includes('n')) return false; // declare -n, local -n: a nameref
      if (valued.includes(option[1].slice(-1))) k += 1; // the option's value
    } else if (!/^[A-Za-z_]\w*(?:\[[^\]]*\])?(?:\+?=[\s\S]*)?$/.test(a)) {
      return false; // a quoted or expanded name: "S=x", $V=x, 'S'
    }
  }
  return true;
}

/**
 * Whether something on the line may set a variable where bindings() cannot see it, so no variable is resolved: eval,
 * source, ., trap; read, mapfile, declare, export, printf -v, wait -p and the like given a quoted or expanded name
 * ("S", $V) or a nameref (-n); or a {VAR}> redirection, which stores a file descriptor number in VAR. decideShell also
 * asks it of the resolved line, so a command word that expands to one of these (X=eval; $X "S=…") counts too.
 */
function hidesAssignments(command) {
  const text = withoutHeredocBodies(command);
  if (/(?:^|[\s;&|(])\{[A-Za-z_]\w*\}[<>]/m.test(text)) return true;
  return splitSegments(text).some((segment) => {
    const words = tokenize(segment);
    const cmd = words[commandIndex(words)] || '';
    if (REBINDERS.has(path.basename(cmd))) return true;
    if (!NAME_TAKERS.has(cmd)) return false;
    const raw = segment.match(RAW_WORD) || [];
    return !namesArePlain(cmd, raw.slice(raw.indexOf(cmd) + 1));
  });
}

/**
 * The longest a resolved command line may grow: 8x the original, at least 16 KB (a long scratch path used many times
 * in a short line), never more than 64 KB. Past it no variable is resolved, so a delete through one asks.
 */
const RESOLVE_MIN_BUDGET = 16 * 1024;
const RESOLVE_MAX_LENGTH = 64 * 1024;

/** A use of a variable at a given index (sticky: no copy of the rest of the line per `$`). */
const BRACED_USE = /\$\{([A-Za-z_]\w*)\}/y;
const BARE_USE = /\$([A-Za-z_]\w*)/y;
const USE = /\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/g;

/**
 * The command line with each use of a variable replaced by its value, where that is certain to be what bash expands:
 * the variable is bound once on the whole line, by a top-level `VAR=literal` (or `export VAR=literal`, or a value
 * built from variables resolved the same way, as in `B=$A/x`; one pass, never re-parsed) that is not in
 * a loop, a conditional block, a function, a subshell, a pipeline or a background job; the use comes after it, outside
 * single quotes and quoted heredocs (where only an inner shell would expand it); and the assignment has run when the
 * use runs: it starts its and-or list (after ; newline & or the line start), or it and the use are in one && chain.
 * Anything else stays a variable, which the guard cannot resolve, so it asks. Never reads the real environment.
 * Returns null when the result would be longer than maxLength (a chain such as B=$A$A$A grows the text geometrically).
 */
function resolveAssignedVariables(command, maxLength = Infinity) {
  const bodies = heredocBodies(command);
  const bound = bindings(withoutHeredocBodies(command, bodies));
  if (changesIfs(command)) return command; // a changed IFS splits a value differently from the text the guard reads
  const elements = []; // top-level simple commands and compound words, in order
  const uses = []; // { name, start, end, el }
  const stack = []; // 'dq' | 'sub' | 'bq' | 'par'
  const background = new Set();
  let el = { start: 0, opBefore: '', list: 0, allAnd: true };
  const blank = (end) => !command.slice(el.start, end).replace(/(^|\s)#[^\n]*/g, '').trim(); // nothing but comments
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
    BRACED_USE.lastIndex = i;
    BARE_USE.lastIndex = i;
    const braced = BRACED_USE.exec(command) || BARE_USE.exec(command);
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
      if (blank(i)) el.start = body.next; // the body is not part of the command after it
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
      // A newline right after && || or | continues the list (`false &&⏎S=x` assigns only if false succeeds).
      else if (c === '\n' && ['&&', '||', '|'].includes(el.opBefore) && blank(i)) continue;
      else if ((c === '|' && command[i - 1] !== '>') || c === ';' || c === '\n') close(i, c);
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
  // A value is usable at element `at` when it was assigned in an earlier element and, if in a && chain, `at` is in
  // that chain too.
  const usable = (v, at) => v && v.index < at && (!v.chain || (elements[at] &&
    elements[at].list === elements[v.index].list && elements[at].allAnd));
  // B=$A/x or B="${A}y": a value built from variables this pass already resolved, substituted here. The result is
  // never parsed again, so a value that reads like an assignment or an operator stays text (X=S; $X=/tmp/x does
  // not bind S). Null when a part is not resolved, or the value outgrows maxLength (B=$A$A$A grows geometrically).
  let over = false;
  const chainValue = (value, at) => {
    if (!LITERAL.test(value.replace(USE, ''))) return null;
    let out = '';
    let last = 0;
    for (const m of value.matchAll(USE)) {
      const v = values.get(m[1] || m[2]);
      if (!usable(v, at)) return null;
      out += value.slice(last, m.index) + v.value;
      last = m.index + m[0].length;
      if (out.length > maxLength) {
        over = true;
        return null;
      }
    }
    return out + value.slice(last);
  };
  elements.forEach((e, index) => {
    const opAfter = index + 1 < elements.length ? elements[index + 1].opBefore : '';
    if (over || !e.top || e.opBefore === '|' || e.opBefore === '||' || opAfter === '|' || background.has(e.list)) return;
    if (e.opBefore === '&&' && !e.allAnd) return;
    const text = command.slice(e.start, e.end).trim().replace(/^export\s+/, '');
    const found = [];
    let pos = 0;
    while (pos < text.length) {
      ASSIGNMENT.lastIndex = pos;
      const m = ASSIGNMENT.exec(text);
      if (!m) return;
      const raw = m[2] ?? m[3] ?? m[4];
      const tilde = m[4] !== undefined && /^~(\/|$)/.test(raw) && !bound.has('HOME');
      if (raw.includes('~') && !tilde) return;
      // Single quotes keep a $ as text: only a double-quoted or bare value can be a chain.
      const value = m[2] === undefined ? chainValue(tilde ? HOME + raw.slice(1) : raw, index) : raw;
      if (value === null || !LITERAL.test(value)) return;
      found.push([m[1], value]);
      pos = m.index + m[0].length;
      while (/\s/.test(text[pos] || '')) pos += 1;
    }
    for (const [name, value] of found) {
      if (bound.get(name) === 1 && !SHELL_MANAGED.has(name)) values.set(name, { value, index, chain: e.opBefore === '&&' });
    }
  });
  if (over) return null;

  let out = '';
  let last = 0;
  for (const u of uses.sort((a, b) => a.start - b.start)) {
    const v = values.get(u.name);
    if (!usable(v, u.el)) continue;
    out += command.slice(last, u.start) + v.value;
    last = u.end;
    if (out.length > maxLength) return null;
  }
  out += command.slice(last);
  return out.length > maxLength ? null : out;
}

function expandVars(word, vars) {
  return word.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, braced, bare) => {
    const name = braced || bare;
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : all;
  });
}

/**
 * A target cut from inside an interpreter's string (os.system('rm -rf /')) keeps the closing quote: drop it. Not in a
 * word with a {: bash expands ~/dev{,/__pycache__} or {a,/} into several words, so the } stays and the word is
 * judged unresolved (the guard does not expand braces).
 */
const targetPath = (word, vars) => {
  const p = expandVars(word, vars);
  return p.includes('{') ? p : p.replace(/[)'"`\]}]+$/, '');
};

/** internal | catastrophic | other | unresolved. A glob is judged by its fixed prefix and the folder it lists. */
function classifyTarget(word, vars, cwd) {
  let p = targetPath(word, vars);
  if (vars.HOME && (p === '~' || p.startsWith('~/'))) p = vars.HOME + p.slice(1);
  if (/[$`{]/.test(p) || p.startsWith('~') || (cwd === null && !p.startsWith('/'))) return 'unresolved';
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

/** A target whose last part is a cache folder (or node_modules/.cache). Unresolved, a brace, a trailing / or .. : not one. */
function isCacheDir(word, vars) {
  const p = targetPath(word, vars);
  if (/[$`{]/.test(p) || p.endsWith('/')) return false;
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

/** Folders of the system, not of a project: a recursive chmod under one asks even when it only adds owner bits. */
const SYSTEM_DIRS = ['/etc', '/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/libx32', '/var', '/opt', '/boot',
  '/root', '/srv', '/snap', '/proc', '/sys', '/dev', '/System', '/Library', '/Applications', '/private/etc',
  '/private/var'];
const underSystemDir = (abs) => SYSTEM_DIRS.some((d) => abs === d || abs.startsWith(`${d}/`));
/** A mode that only adds owner permissions (u+rwx, u+w,u+X): it takes nothing away and opens nothing to others. */
const OWNER_ADD = /^u\+[rwxX]+(?:,u\+[rwxX]+)*$/;
const CHMOD_R_ALL = new RegExp(CHMOD_R.source, 'g');

/** A chmod target that needs approval: unresolved, catastrophic, or in a system folder (a glob: its fixed part). */
function chmodTargetRisky(word, vars, cwd) {
  const kind = classifyTarget(word, vars, cwd);
  if (kind !== 'other') return kind !== 'internal';
  let p = targetPath(word, vars);
  if (vars.HOME && (p === '~' || p.startsWith('~/'))) p = vars.HOME + p.slice(1);
  const glob = p.search(/[*?[]/);
  return underSystemDir(toAbs(glob === -1 ? p : p.slice(0, glob) || '.', cwd));
}

/**
 * Whether some `chmod -R` in the text needs approval. Only `chmod -R <owner-add mode> <targets>` does not, and only
 * when no target is unresolved (a variable, a brace word, a relative path after a cd), the root, a home folder,
 * another catastrophic folder or a system folder, no other option follows (--reference copies another file's mode),
 * and nothing on the line runs it as another user (sudo, doas, su). `cwd` is null when the folder is not known.
 */
function riskyChmod(text, { cwd = null, vars = { HOME } } = {}) {
  const asUser = /\b(?:sudo|doas|su|pkexec|run0)\b/.test(text);
  for (const m of text.matchAll(CHMOD_R_ALL)) {
    if (asUser) return true;
    const [mode, ...targets] = tokenize(splitSegments(text.slice(m.index + m[0].length), null, 1)[0] || '');
    if (!OWNER_ADD.test(mode || '') || !targets.length) return true;
    if (targets.some((t) => t.startsWith('-') || chmodTargetRisky(t, vars, cwd))) return true;
  }
  return false;
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

/**
 * The folders a find searches (the words before its first test, after -H, -L, -P, -D and -O, which come first:
 * `find -L / …` searches /) and where its expression starts.
 */
function findParts(words, start) {
  let k = start + 1;
  while (k < words.length && (/^-(?:[HLP]+|O\d*)$/.test(words[k]) || words[k] === '-D')) k += words[k] === '-D' ? 2 : 1;
  const roots = [];
  for (; k < words.length && !words[k].startsWith('-') && words[k] !== '(' && words[k] !== '!'; k += 1) roots.push(words[k]);
  return { roots: roots.length ? roots : ['.'], expr: k };
}

/** find tests that take one argument and only narrow what an implicit AND matches. */
const FIND_NARROWING = new Set(['-type', '-xtype', '-path', '-ipath', '-wholename', '-iwholename', '-iname', '-maxdepth',
  '-mindepth']);
/** find words with no argument that neither widen the match nor write a file. */
const FIND_PLAIN = new Set(['-prune', '-depth', '-xdev', '-mount', '-print', '-print0', '-quit']);

/**
 * A find expression that can only reach cache folders (CACHE_DIRS). An allowlist: every word is a -name of a cache
 * folder, a narrowing test, a plain word, or (unless `printsOnly`) a delete after a -name: -delete, or -exec rm with
 * {} as its only target. Anything else (-o, !, parentheses, a comma, -fprint, -newer …) is not only caches.
 */
function onlyFindsCaches(words, expr, printsOnly = false) {
  let names = 0;
  for (let k = expr; k < words.length; k += 1) {
    const w = words[k];
    if (w === '-name') {
      if (!CACHE_DIRS.has(words[k + 1])) return false;
      names += 1;
      k += 1;
    } else if (FIND_NARROWING.has(w)) {
      if (k + 1 >= words.length) return false;
      k += 1;
    } else if (FIND_PLAIN.has(w)) {
      // matches nothing more, writes nothing
    } else if (w === '-delete' && !printsOnly && names) {
      // deletes what the -name before it matched
    } else if (FIND_EXEC.includes(w) && !printsOnly && names) {
      let end = k + 1;
      while (end < words.length && words[end] !== ';' && words[end] !== '+') end += 1;
      const run = words.slice(k + 1, end);
      if (!RM_COMMANDS.has(path.basename(run[0] || ''))) return false;
      const args = run.slice(1).filter((a) => !/^-[a-zA-Z]+$/.test(a) && a !== '--');
      if (args.length !== 1 || args[0] !== '{}') return false;
      k = end;
    } else {
      return false;
    }
  }
  return names > 0;
}

/** Roots a cache-only find may search: resolved, and not a catastrophic folder (those keep their deny). */
const cacheRootsOk = (roots, vars, dir) => roots.every((r) => ['internal', 'other'].includes(classifyTarget(r, vars, dir)));

/**
 * xargs options (before its command) that split its input on NUL only: -0 or --null, plus options that change
 * nothing about which words reach the command. -d, -a, -I, -E and anything else return false.
 */
function xargsSplitsOnNul(options) {
  let nul = false;
  for (let k = 0; k < options.length; k += 1) {
    const o = options[k];
    if (o === '--null' || /^-[0rt]+$/.test(o)) nul = nul || o === '--null' || o.includes('0');
    else if (o === '--no-run-if-empty' || o === '--verbose' || /^-[nP]\d+$/.test(o)) continue;
    else if ((o === '-n' || o === '-P') && /^\d+$/.test(options[k + 1] || '')) k += 1;
    else return false;
  }
  return nul;
}

/** find … -delete, or find … -exec rm …: everything under the folders it searches. */
function findDeletes(words, start, vars, dir) {
  const deletes = words.includes('-delete') || words.some(
    (w, k) => FIND_EXEC.includes(w) && RM_COMMANDS.has(path.basename(words[k + 1] || '')));
  if (!deletes) return null;
  const { roots, expr } = findParts(words, start);
  if (onlyFindsCaches(words, expr) && cacheRootsOk(roots, vars, dir)) return null;
  return judgeTargets(roots, true, vars, dir);
}

/** Code an interpreter runs (bash -c "…", python -c "…", a heredoc): rm anywhere in it, rmtree, recursive fs.rm. */
function codeDeletes(code, vars, dir) {
  const found = [];
  const rm = /(^|[\s;&|("'`])(rm|rmdir|unlink)(?=\s)/g;
  let m;
  while ((m = rm.exec(code))) {
    const words = tokenize(splitSegments(code.slice(m.index + m[0].length), null, 1)[0] || '');
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
 * commit message is not a delete. `vars` are known in this shell; code run by another program gets `codeVars`.
 */
function deleteVerdict(shell, code, vars, cwd, codeVars = vars) {
  const found = [];
  let dir = cwd;
  const ops = [];
  const segments = splitSegments(shell, ops);
  let prev = { words: [], i: 0, cmd: '' };
  segments.forEach((segment, n) => {
    const words = tokenize(segment);
    const i = commandIndex(words);
    const cmd = i < words.length ? path.basename(words[i]) : '';
    if (cmd === 'cd' || cmd === 'pushd') {
      dir = nextDir(words[i + 1], vars, dir);
    } else if (RM_COMMANDS.has(cmd)) {
      found.push(rmCall(words, i, vars, dir));
    } else if (cmd === 'xargs') {
      const r = words.findIndex((w, k) => k > i && RM_COMMANDS.has(path.basename(w)));
      // `find … -name __pycache__ -print0 | xargs -0 rm -rf`: the only targets are the paths a cache-only find
      // matched. Newline-separated output is split on blanks and quotes too, so it needs -print0 and -0.
      const finder = prev.cmd === 'find' ? findParts(prev.words, prev.i) : null;
      const fromCacheFind = r !== -1 && n > 0 && ops[n - 1] === '|' && finder &&
        onlyFindsCaches(prev.words, finder.expr, true) && cacheRootsOk(finder.roots, vars, dir) &&
        prev.words.slice(finder.expr).includes('-print0') && !prev.words.slice(finder.expr).includes('-print') &&
        xargsSplitsOnNul(words.slice(i + 1, r)) &&
        words.slice(r + 1).every((w) => /^-[A-Za-z]+$/.test(w) || ['--recursive', '--force', '--verbose'].includes(w));
      if (r !== -1 && !fromCacheFind) found.push(rmCall(words, r, vars, dir));
    } else if (cmd === 'find') {
      found.push(findDeletes(words, i, vars, dir));
    } else if (EXECUTORS.test(cmd)) {
      found.push(...codeDeletes(segment, codeVars, dir));
    }
    prev = { words, i, cmd };
  });
  for (const body of code) found.push(...codeDeletes(body, codeVars, dir));
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
function decideShell(rawCommand, cwd) {
  if (!rawCommand.trim()) return null;
  const bound = bindings(withoutHeredocBodies(rawCommand));
  let hidden = hidesAssignments(rawCommand);
  let command = rawCommand;
  // One pass resolves a whole chain (B=$A/x). A chain that grows the text past the budget (B=$A$A$A…, geometric) is
  // not resolved at all, so it asks instead of exhausting memory (adversarial review, 2026-11-18). A resolved line
  // that now hides assignments (X=eval; $X "S=…") is judged unresolved too.
  const budget = Math.min(RESOLVE_MAX_LENGTH, Math.max(8 * rawCommand.length, RESOLVE_MIN_BUDGET));
  if (!hidden) {
    const next = resolveAssignedVariables(rawCommand, budget);
    if (next !== null && hidesAssignments(next)) hidden = true;
    else if (next !== null) command = next;
  }
  // HOME is known unless the line rebinds it or IFS (which would split it differently). Kept on a `hidden` line, so
  // `eval "rm -rf ~"` is still denied.
  const ifs = changesIfs(rawCommand);
  const vars = bound.has('HOME') || ifs ? {} : { HOME };
  // $PWD is the working directory only on a line that cannot change folder: a cd that fails, one in a subshell, or
  // pushd then popd leaves $PWD elsewhere than a tracked folder would say. Code run by another program never gets it.
  const changesDir = /\b(?:cd|pushd|popd)\b/.test(`${rawCommand}\n${command}`) || hidden;
  const shellVars = changesDir || ifs || bound.has('PWD') ? vars : { ...vars, PWD: cwd };
  // A recursive chmod's relative targets are judged against cwd only when nothing on the line changes folder.
  const where = { cwd: changesDir ? null : cwd, vars };
  const parsed = parseHeredocs(command);
  const { code, data } = parsed;
  // Each substitution runs where it appears, not after the line's last cd: the cd to an unknown folder in front of
  // it makes a relative target unresolved (ask) instead of judged against a later cd.
  const subs = [parsed.shell, ...parsed.expanding].flatMap(substitutions);
  const shell = [parsed.shell, ...subs.map((s) => `cd "$${SUBST_DIR}"\n${s}`)].join('\n');
  const segments = splitSegments(shell);
  const runsText = code.length > 0 || segments.some((s) => runsGivenText(commandWord(tokenize(s))));
  const executed = runsText ? [...code, ...data] : [];
  const text = [shell, ...executed].join('\n');
  if (!executed.length && segments.length && segments.every(isReadOnly) && !SYSTEM_OVERWRITE.test(shell)) {
    return null;
  }
  const deletion = deleteVerdict(shell, executed, shellVars, cwd, vars);
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
    ? scanPatterns(text, { strict: true, ...where })
    : worstVerdict(segments.map((s) => scanPatterns(isTextCommand(s) ? withoutQuotedText(s) : s, where)))]);
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
 * `strict`, the text can be run by something on the same line, so no safe signal excuses it. `cwd` (null when unknown)
 * and `vars` are where a recursive chmod's targets are judged (riskyChmod).
 */
function scanPatterns(text, { strict = false, cwd = null, vars = { HOME } } = {}) {
  if (!text.trim()) return null;
  const matches = (re) => (re === CHMOD_R ? CHMOD_R.test(text) && riskyChmod(text, { cwd, vars }) : re.test(text));

  const hasDestructiveVerb = SYSTEM_OVERWRITE.test(text) || [...DENY, ...ASK].some(([re]) => matches(re));
  if (!hasDestructiveVerb) return null;
  const looksSafe = !strict && SAFE_SIGNALS.some((re) => re.test(text));

  for (const [re, why] of DENY) {
    if (matches(re)) {
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
    if (matches(re)) {
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
