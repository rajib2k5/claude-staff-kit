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
 *  - Second round (2026-11-18, 13 asks after the update). Only a delete that would ask is reread (textOnlyDeletes);
 *    a deny and the SQL scan are unchanged. Python code is judged by its real calls (Python's ast, pythonFacts),
 *    node code with its strings and comments removed (jsFacts); if either cannot be read, the text rule asks. A `<<`
 *    in quotes or a comment is no longer read as a heredoc (quoteMasker).
 *  - Narrowed after its adversarial review (2026-11-18). Interpreter code and a heredoc that cat or tee writes to a
 *    file are relaxed only when every other command on the line is a read-only command from a short allowlist
 *    (readOnlyAllowed) and nothing on the line writes a startup or autorun file (autorunPath): the guard cannot see a
 *    script that imports or sources a file. A plain rm of a glob is allowed only when its last part starts with a
 *    literal stem (`_probe*.py`, not `*.py`) and its real folder is in a git work tree (namesProjectFiles). A comment
 *    ends at its newline, and a quote in a substitution inside double quotes is the substitution's own.
 *  - Third round, after the second review (2026-11-19). The three parsers read a backslash-newline as bash does
 *    (removed, the word start kept; joinContinuations), a backquoted string to its first unescaped backquote, and a
 *    `$'EOF'` delimiter decoded; a delimiter that cannot be read for certain asks. Only space, tab, newline and
 *    ;&|()<> start a word, so a CR before `#` starts no comment. The glob allowance needs a certain folder (globFolder:
 *    no cd, or one leading `cd <literal> &&`; a subshell, pushd, popd, eval, source, exec, env/sudo -C/--chdir or a
 *    second cd asks), a stem that names files (stemNamesFiles), no dot folder below the home folder or the work tree
 *    root, no bare repository, and no guard file (evolv-*) that the stem matches. `test -v`, `[ -v` and `printf -v`
 *    are not readers; a file written by any redirect that shadows an installed Python module, and more autorun names,
 *    keep the text rule. Python code with git clean/reset, extractall, getmembers or getattr used as a value, and
 *    node code with process.kill, keep the old verdict. Code that writes a file by a plain name (not an autorun
 *    file, not a module it or Python on the line could import) is data, as `cat > file` is; a write to a computed
 *    name, a copy or a move, and a file another command on the line could load keep the text rule.
 *
 * Pairs with ~/.claude/skills/destructive-ops-guard/SKILL.md. Tests: evolv-destructive-guard.test.js
 * (node --test ~/.claude/hooks/evolv-destructive-guard.test.js).
 */

'use strict';

const fs = require('node:fs');
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

/**
 * bash's metacharacters: a word ends at one, and a # right after one (or at the start) begins a comment. A CR, a
 * vertical tab or a no-break space is a word character to bash: `a\r# ; rm -rf ~` has no comment (third review round).
 */
const META = new Set([' ', '\t', '\n', ';', '&', '|', '(', ')', '<', '>']);
/**
 * Runs of characters that tokenize and splitSegments only copy: they are read a run at a time, not one by one (a
 * long quoted text after each rm in codeDeletes made both parsers the hot path, third review round). Outside quotes
 * a run has no metacharacter; in quotes it stops at whatever can end the quote or start a substitution.
 */
const SPLIT_RUN = /[^`#$'"\\&|;\n()<> \t]+/y;
const WORD_RUN = /[^\s\\#`$'"<>&]+/y;
const QUOTED_RUN = { "'": /[^']+/y, '"': /[^"\\`$]+/y, [ANSI]: /[^'\\]+/y };
/** The run of `re` (one of the above) that starts at text[i], or ''. */
function runAt(re, text, i) {
  re.lastIndex = i;
  const m = re.exec(text);
  return m ? m[0] : '';
}

/** An unquoted redirection operator: >, >>, >|, <, <>, <<, <<-, <<<, &>, &>>, >&, <& (an fd number before it is cut). */
const REDIRECT = /(?:&>>?|<<<|<<-?|<>|>>|>\||>&|<&|>|<)/y;
/** What may follow >& or <& to duplicate or close a descriptor (>&2, <&0, >&-) instead of naming a file. */
const FD_DUP = /(?:\d+-?|-)(?=$|[\s<>])/y;

/**
 * Shell words of one simple command, quotes removed. An unmatched quote ends the word. Redirections are not words:
 * `rm -rf x 2>/dev/null` deletes x only, and `>/dev/null rm -rf ~` still runs rm (2026-11-18: `2>` and `2>/dev/null`
 * were read as a delete target and as a push refspec). A # at the start of a word, outside quotes, starts a comment
 * that ends at the newline (a quote in it opens nothing). In double quotes, $(…) and `…` are read whole (substitutionEnd),
 * and so is `…` outside quotes. A backslash-newline outside single quotes is removed, as bash does (third review round).
 */
function tokenize(s) {
  const words = [];
  let cur = '';
  let started = false;
  let plain = true; // the word so far has no quote or escape (so `2` before `>` is an fd number)
  let dropNext = false; // the next word is a redirection's file or heredoc delimiter
  let quote = null;
  let afterMeta = true; // the last character was a metacharacter (or there was none): a # here begins a comment
  const end = () => {
    if (started && !dropNext) words.push(cur);
    else if (started) dropNext = false;
    cur = '';
    started = false;
    plain = true;
  };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '\n' && quote !== "'" && quote !== ANSI) {
      i += 1; // a continuation: the word, and whether a # may start a comment, go on as before it
      continue;
    }
    const run = runAt(quote ? QUOTED_RUN[quote] : WORD_RUN, s, i);
    if (run) {
      cur += run;
      i += run.length - 1;
      if (!quote) started = true;
      afterMeta = false;
      continue;
    }
    const commentMayStart = afterMeta && !started;
    afterMeta = !quote && META.has(c);
    if (quote === ANSI) {
      if (c === "'") quote = null;
      else if (c === '\\' && i + 1 < s.length) cur += s[(i += 1)];
      else cur += c;
    } else if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < s.length) cur += s[(i += 1)];
      else if (quote === '"' && (c === '`' || (c === '$' && s[i + 1] === '('))) {
        const end = c === '`' ? backquoteEnd(s, i) : substitutionEnd(s, i);
        cur += s.slice(i, end);
        i = end - 1;
      } else cur += c;
    } else if (c === '#' && commentMayStart) {
      const newline = s.indexOf('\n', i);
      if (newline === -1) break;
      i = newline - 1;
    } else if (c === '`') {
      const close = backquoteEnd(s, i);
      cur += s.slice(i, close);
      i = close - 1;
      started = true;
      plain = false;
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
 * A comment (a # that starts a word, outside quotes) stays in its segment but ends at the newline: before 2026-11-18,
 * the apostrophe in `# it's⏎rm -rf ~` opened a quote that hid the rm (second adversarial review). In double quotes,
 * $(…) and `…` are read whole, so the quote in x="$(echo "'")" is the substitution's own; `…` outside quotes too, as
 * bash ends it at the first unescaped backquote (`#'` in it is a comment). A backslash-newline outside single quotes
 * is removed and leaves the word-start state as it was: `ls \⏎# x` is a comment, `a\⏎#b` is a word (third round).
 * The separator && is pushed to `ops` as '&&', a single & as '&'.
 */
function splitSegments(text, ops = null, max = Infinity) {
  const out = [];
  let cur = '';
  let quote = null;
  let wordStart = true; // the next character starts a word: a # there begins a comment
  const push = (op) => {
    if (!cur.trim()) return;
    out.push(cur.trim());
    if (ops) ops.push(op);
  };
  for (let i = 0; i < text.length && out.length < max; i += 1) {
    const c = text[i];
    if (c === '\\' && text[i + 1] === '\n' && quote !== "'" && quote !== ANSI) {
      i += 1;
      continue;
    }
    const run = runAt(quote ? QUOTED_RUN[quote] : SPLIT_RUN, text, i);
    if (run) {
      cur += run;
      i += run.length - 1;
      wordStart = false;
      continue;
    }
    if (!quote && c === '`') {
      const end = backquoteEnd(text, i);
      cur += text.slice(i, end);
      i = end - 1;
    } else if (quote === '"' && (c === '`' || (c === '$' && text[i + 1] === '('))) {
      const end = c === '`' ? backquoteEnd(text, i) : substitutionEnd(text, i);
      cur += text.slice(i, end);
      i = end - 1;
    } else if (quote) {
      cur += c;
      if (c === (quote === ANSI ? "'" : quote)) quote = null;
      else if (c === '\\' && (quote === '"' || quote === ANSI) && i + 1 < text.length) cur += text[(i += 1)];
    } else if (c === '#' && wordStart) {
      const newline = text.indexOf('\n', i);
      const stop = newline === -1 ? text.length : newline;
      cur += text.slice(i, stop);
      i = stop - 1;
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
      push(c === '|' && text[i + 1] === '|' ? '||' : c === '&' && text[i + 1] === '&' ? '&&' : c);
      cur = '';
    } else {
      cur += c;
    }
    wordStart = !quote && META.has(c);
  }
  if (out.length < max) push('');
  return out;
}

/**
 * Index just past the `)` that closes the `$(` at text[i], read as bash reads it: quotes, escapes, comments and nested
 * $(…), "…" and `…` inside; text.length + 1 when it is not closed. Iterative, so deep nesting cannot overflow the
 * stack (the hook fails open on an exception). `case … in a)` is not followed: decideShell asks on such a line.
 */
function substitutionEnd(text, i) {
  const stack = [{ depth: 0 }]; // frames: { depth } for $(…) code, or 'sq' | 'dq' | 'ansi' | 'bq'
  let wordStart = true;
  for (let j = i + 2; j < text.length; j += 1) {
    const c = text[j];
    const top = stack[stack.length - 1];
    if (typeof top === 'string') {
      wordStart = false;
      if (top === 'sq') {
        if (c === "'") stack.pop();
      } else if (c === '\\') {
        j += 1;
      } else if (top === 'ansi' || top === 'bq') {
        if (c === (top === 'bq' ? '`' : "'")) stack.pop();
      } else if (c === '"') {
        stack.pop();
      } else if (c === '`') {
        stack.push('bq');
      } else if (c === '$' && text[j + 1] === '(') {
        stack.push({ depth: 0 });
        j += 1;
        wordStart = true;
      }
      continue;
    }
    if (c === '\\' && text[j + 1] === '\n') {
      j += 1; // a continuation: removed, the word-start state stays
      continue;
    }
    if (c === '#' && wordStart) {
      const newline = text.indexOf('\n', j);
      if (newline === -1) return text.length + 1;
      j = newline - 1;
      wordStart = true;
      continue;
    }
    if (c === '\\') j += 1;
    else if (c === "'") stack.push('sq');
    else if (c === '"') stack.push('dq');
    else if (c === '`') stack.push('bq');
    else if (c === '$' && (text[j + 1] === "'" || text[j + 1] === '(')) {
      stack.push(text[j + 1] === "'" ? 'ansi' : { depth: 0 });
      j += 1;
    } else if (c === '(') top.depth += 1;
    else if (c === ')' && top.depth > 0) top.depth -= 1;
    else if (c === ')') {
      stack.pop();
      if (!stack.length) return j + 1;
    }
    wordStart = META.has(c);
  }
  return text.length + 1;
}

/** Index just past the backquote that closes the one at text[i] (a backslash escapes); text.length + 1 if none. */
function backquoteEnd(text, i) {
  for (let j = i + 1; j < text.length; j += 1) {
    if (text[j] === '\\') j += 1;
    else if (text[j] === '`') return j + 1;
  }
  return text.length + 1;
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
 * `bodies` has each body in order with what it is fed to: { text, runs, quoted, owner (the words of its command),
 * plain (no pipe, no substitution around it, the only heredoc on its line), files (where cat or tee writes it) }.
 */
function parseHeredocs(command) {
  const lines = command.split('\n');
  const shell = [];
  const code = [];
  const data = [];
  const expanding = [];
  const bodies = [];
  const mask = quoteMasker();
  for (let i = 0; i < lines.length; i += 1) {
    shell.push(lines[i]);
    let j = i + 1; // the bodies of a line's heredocs follow it one after another: `cmd <<A <<B`
    const ops = heredocOperators(lines[i], mask(lines[i]));
    for (const op of ops) {
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
      // The owner's simple command: its words before the operator and after it, up to the next separator.
      const after = lines[i].slice(op.index + op.length);
      const raw = `${splitSegments(inner).pop() || ''} ${/^\s*[|;&)]/.test(after) ? '' : splitSegments(after, null, 1)[0] || ''}`;
      const words = tokenize(raw);
      const plain = !piped && sub === -1 && ops.length === 1;
      const files = !plain ? [] : owner === 'cat' ? stdoutFiles(raw)
        : owner === 'tee' ? [...words.slice(commandIndex(words) + 1).filter((w) => !w.startsWith('-')), ...stdoutFiles(raw)] : [];
      bodies.push({ text: body.join('\n'), runs, quoted: op.quoted, owner: words, raw, plain, files });
    }
    i = j - 1; // skip the bodies and their closing delimiters
  }
  return { shell: shell.join('\n'), code, data, expanding, bodies };
}

/** `s` with every character inside quotes (and after a backslash) replaced by _, so operators in quotes are not read. */
function maskQuoted(s) {
  let out = '';
  let quote = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < s.length) { out += '_'; i += 1; }
      out += c === quote || quote === null ? c : '_';
    } else if (c === "'" || c === '"') {
      quote = c;
      out += c;
    } else if (c === '\\' && i + 1 < s.length) {
      out += '__';
      i += 1;
    } else {
      out += c;
    }
  }
  return out;
}

const STDOUT_REDIRECT = /(?:^|[^\d&>])(?:1|&)?(?:>>|>\||>)(?!&)[ \t]*/g;
const REDIRECT_WORD = /(?:[^\s'"\\;&|<>()]|\\.|'[^']*'|"(?:[^"\\]|\\.)*")+/y;
/** Files a simple command's standard output goes to (> f, >> f, >| f, &> f, 1> f), quotes removed; not 2> or >&2. */
function stdoutFiles(segment) {
  const files = [];
  for (const m of maskQuoted(segment).matchAll(STDOUT_REDIRECT)) {
    REDIRECT_WORD.lastIndex = m.index + m[0].length;
    const word = REDIRECT_WORD.exec(segment);
    files.push(word ? tokenize(word[0])[0] || '' : '');
  }
  return files;
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

/**
 * Reads the lines of a command line in order and returns each with its quoted text and comments masked (replaced by
 * _, same length): there bash sees no operator. A quote may span lines; inside $(…) and `…` it is code again, also
 * within double quotes. Heredoc bodies are not given to it. 2026-11-18: `cat "<<EOF" > f⏎rm -rf ~⏎EOF` read the rm
 * as a heredoc body, and the code of `node -e '…"<<EOF\n…"…'` was cut at that line the same way.
 */
function quoteMasker() {
  // frames: 'sq' | 'dq' | 'ansi' | { depth } for $(…) | { inner } for `…`, whose text a masker of its own reads
  const stack = [];
  let carry = null; // the word-start state before a backslash-newline that ended the last line
  /**
   * After each call, mask.continues says whether the line ended with a backslash-newline that bash removes: outside
   * quotes, in $(…) or `…`, or in "…" (not in '…', $'…' or a comment). The next line then goes on the same word.
   */
  const mask = (line) => {
    let out = '';
    const lineStart = carry === null ? true : carry;
    carry = null;
    mask.continues = false;
    const wordStart = () => (out.length === 0 ? lineStart : META.has(out[out.length - 1]));
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      const top = stack[stack.length - 1];
      if (top && top.inner) {
        // `…` ends at the first backquote that no backslash escapes, whatever quotes are in it (bash, POSIX); the
        // text before it is a script of its own. Third review round: `#'` in it is a comment, not an open quote.
        let j = i;
        while (j < line.length && line[j] !== '`') j += line[j] === '\\' ? 2 : 1;
        out += top.inner(line.slice(i, Math.min(j, line.length)));
        if (j >= line.length) {
          mask.continues = top.inner.continues;
          break;
        }
        stack.pop();
        out += '`';
        i = j;
      } else if (top === 'sq' || top === 'ansi' || top === 'dq') {
        if (c === '\\' && top !== 'sq') {
          if (i + 1 >= line.length && top === 'dq') mask.continues = true;
          out += i + 1 < line.length ? '__' : '_';
          i += 1;
        } else if (c === (top === 'dq' ? '"' : "'")) {
          stack.pop();
          out += c;
        } else if (top === 'dq' && (c === '`' || (c === '$' && line[i + 1] === '('))) {
          stack.push(c === '`' ? { inner: quoteMasker() } : { depth: 0 });
          out += c === '`' ? c : line.slice(i, (i += 1) + 1);
        } else {
          out += '_';
        }
      } else if (c === '\\') {
        if (i + 1 >= line.length) {
          carry = wordStart();
          mask.continues = true;
        }
        out += i + 1 < line.length ? '\\_' : '\\';
        i += 1;
      } else if (c === '#' && wordStart()) {
        // At the start of a word only: the masked text, not the raw one, says so (`a\ #b` is one word, review claim 6).
        out += '_'.repeat(line.length - i);
        break;
      } else if (c === "'" || c === '"') {
        stack.push(c === "'" ? 'sq' : 'dq');
        out += c;
      } else if (c === '$' && (line[i + 1] === "'" || line[i + 1] === '(')) {
        stack.push(line[i + 1] === "'" ? 'ansi' : { depth: 0 });
        out += line.slice(i, (i += 1) + 1);
      } else if (c === '`') {
        stack.push({ inner: quoteMasker() });
        out += c;
      } else {
        if (top && c === '(') top.depth += 1;
        else if (top && c === ')' && (top.depth -= 1) < 0) stack.pop();
        out += c;
      }
    }
    return out;
  };
  return mask;
}

/**
 * A line's heredoc operators in order: { index, length (of the operator and its delimiter word), delim (quotes
 * removed), quoted (any quote stops expansion), uncertain }. With `masked` (the line from quoteMasker), a << in quoted
 * text or a comment is not one. bash ends <<$'EOF' and <<$"EOF" at EOF (third review round: the guard waited for
 * $EOF); a $'…' or $"…" delimiter with an escape or expansion in it is `uncertain`.
 */
function heredocOperators(line, masked = line) {
  const ops = [];
  for (const m of line.matchAll(HEREDOC)) {
    if (/^\d/.test(m[1]) || masked.slice(m.index, m.index + 2) !== '<<') continue;
    const delim = m[1].replace(/\$'([^']*)'|\$"([^"]*)"|'([^']*)'|"([^"]*)"|\\(.)/g,
      (all, ansi, locale, single, double, escaped) => ansi ?? locale ?? single ?? double ?? escaped);
    const uncertain = /\$'[^']*\\|\$"[^"]*[\\$`]/.test(m[1]);
    ops.push({ index: m.index, length: m[0].length, delim, quoted: /['"\\]/.test(m[1]), uncertain });
  }
  return ops;
}

/** A body line of an unquoted heredoc that bash joins to the next: it ends with an odd number of backslashes. */
const JOINS_NEXT = /(?:^|[^\\])(?:\\\\)*\\$/;

/**
 * The command line with every backslash-newline that bash removes taken out: outside single quotes, ANSI-C quotes
 * and comments (also inside "…", $(…) and `…`), and in the body of a heredoc whose delimiter is unquoted, where bash
 * also compares the joined line with the delimiter (bash 5.2: `EO\⏎F` ends <<EOF). A quoted body is kept as it is.
 * The heredoc operators of a continued line are read on the whole line, and its bodies follow that line (bash:
 * `cat <<EOF \⏎> f` writes f). Null when a delimiter cannot be read for certain (heredocOperators). Third review
 * round, 2026-11-19: `ls -la \⏎# don't⏎rm -rf ~` ran the rm and was allowed.
 */
function joinContinuations(command) {
  if (!command.includes('\\\n') && !command.includes("$'") && !command.includes('$"')) return command;
  const lines = command.split('\n');
  const out = [];
  const mask = quoteMasker();
  for (let i = 0; i < lines.length; i += 1) {
    let raw = '';
    let masked = '';
    for (;;) {
      const m = mask(lines[i]);
      if (!mask.continues || i + 1 >= lines.length) {
        raw += lines[i];
        masked += m;
        break;
      }
      raw += lines[i].slice(0, -1);
      masked += m.slice(0, -1);
      i += 1;
    }
    out.push(raw);
    const ops = heredocOperators(raw, masked);
    if (ops.some((op) => op.uncertain)) return null;
    for (const op of ops) {
      // The body: as parseHeredocs reads it, up to a line that is the delimiter once leading tabs are cut.
      for (i += 1; i < lines.length; i += 1) {
        let line = lines[i];
        while (!op.quoted && JOINS_NEXT.test(line) && i + 1 < lines.length) line = line.slice(0, -1) + lines[(i += 1)];
        out.push(line);
        if (line.replace(/^\t+/, '') === op.delim) break;
      }
    }
  }
  return out.join('\n');
}

/** Heredoc bodies by the index where each starts: { end, next, expands, at }, found the way parseHeredocs finds them. */
function heredocBodies(command) {
  const bodies = new Map();
  const lines = command.split('\n');
  const starts = [0]; // where each line starts; one past the end for the line after the last
  for (const line of lines) starts.push(starts[starts.length - 1] + line.length + 1);
  const mask = quoteMasker();
  for (let k = 0; k < lines.length; k += 1) {
    let j = k + 1;
    for (const op of heredocOperators(lines[k], mask(lines[k]))) {
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

/** A path as it is on this disk: toAbs writes /tmp as /private/tmp (macOS), which Linux does not have. */
const onDisk = (p) => (p.startsWith('/private/tmp') && !fs.existsSync('/private/tmp') ? p.slice('/private'.length) : p);

/** The real path of a folder, through every symlink; null when it cannot be resolved (missing, no permission). */
function realFolder(p) {
  try {
    return fs.realpathSync.native(onDisk(p));
  } catch {
    return null;
  }
}

/**
 * A literal stem that names files rather than a kind of file (third review round, 2026-11-19): 3 or more characters,
 * not starting with a dot, with `_`, `-` or a digit in it or 4 or more characters. `_probe`, `out_`, `r26m_` and
 * `main` pass; `te`, `ma`, `20`, `tmp`, `.env` and `.gi` do not.
 */
const stemNamesFiles = (stem) => stem.length >= 3 && !stem.startsWith('.') && (/[-_\d]/.test(stem) || stem.length >= 4);

/** A bare git repository: a folder with HEAD, objects and refs in it (e2e_remote.git inside a work tree). */
const isBareRepo = (dir) => ['HEAD', 'objects', 'refs'].every((name) => fs.existsSync(path.join(dir, name)));

/**
 * Whether the stem matches a guard file (evolv-*) in the folder: this hook's own folder, or any copy of the hooks (the
 * live hook is a symlink into a work tree). A folder that cannot be read counts as one that has them.
 */
function matchesGuardFiles(real, stem) {
  try {
    return fs.readdirSync(real).some((name) => name.startsWith('evolv-') && name.startsWith(stem));
  } catch {
    return true;
  }
}

/**
 * Whether the files a glob stem matches in `folder` are project files: the folder, resolved through symlinks (a
 * folder that cannot be resolved fails), is in a git work tree (a .git file or folder in it or above it) whose root is
 * not /, the home folder or above it; it is not under a .git folder or a bare repository below that root; no folder
 * below the home folder or below the work tree root starts with a dot (~/.config, .private, .github); and no guard
 * file (evolv-*) in the folder starts with the stem.
 */
function inProjectWorkTree(folder, stem) {
  // The raw path, not path.resolve: the kernel follows link/.. through the link, a lexical resolve does not.
  const real = realFolder(folder);
  if (real === null || real.split('/').includes('.git') || isCatastrophic(toAbs(real, '/')) || underSystemDir(real)) {
    return false;
  }
  let root = real;
  while (!fs.existsSync(path.join(root, '.git'))) {
    if (root === '/' || isBareRepo(root)) return false;
    root = path.dirname(root);
  }
  if (isBareRepo(root)) return false;
  const home = realFolder(HOME) || HOME;
  if (root === '/' || root === home || home.startsWith(`${root}/`)) return false;
  const below = (base) => {
    const rel = path.relative(base, real);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split('/') : [];
  };
  if ([...below(home), ...below(root)].some((part) => part.startsWith('.'))) return false;
  return !matchesGuardFiles(real, stem);
}

/**
 * A glob that names specific files in a project (_probe*.py, out_*.log, r26m_*; 2026-11-18 asks). The second review
 * found the first rule (2 literal characters anywhere, any folder that is not a home or system one) let `*.py`, `*.db`,
 * `.git/ind*`, `~/.aws/cred*` and globs through a symlink to the home folder pass, and the third round `te*`,
 * `.env*`, `.private/ke*` and globs in a nested bare repo. Now the wildcard is only in the last part, which starts
 * with a stem that names files (stemNamesFiles), no part of the path as written starts with a dot, and the folder is
 * in a project work tree (inProjectWorkTree). A relative path is resolved against each folder in `dirs` (where the rm
 * may run, from globFolder), and fails without one.
 */
function namesProjectFiles(word, vars, dirs) {
  let p = targetPath(word, vars);
  if (vars.HOME && (p === '~' || p.startsWith('~/'))) p = vars.HOME + p.slice(1);
  if (/[$`{}()!@+]/.test(p) || p.startsWith('~')) return false;
  const folder = p.slice(0, p.lastIndexOf('/') + 1);
  const name = p.slice(folder.length);
  const stem = name.slice(0, Math.max(0, name.search(/[*?[]/)));
  if (/[*?[]/.test(folder) || !stemNamesFiles(stem)) return false;
  if (folder.split('/').some((part) => part.startsWith('.') && part !== '.' && part !== '..')) return false;
  const folders = p.startsWith('/') ? [folder] : (dirs || []).map((d) => (d === null ? null : `${d}/${folder || '.'}`));
  return folders.length > 0 && folders.every((f) => f !== null && inProjectWorkTree(f, stem));
}

/**
 * One delete, from its targets: deny (catastrophic), ask (the user's files, or unknown), internal, or none. With
 * `named` ({ dirs }, a plain rm, not recursive), a glob that names project files (namesProjectFiles) is not a wide
 * delete; `dirs` are the folders a relative one is resolved against.
 */
function judgeTargets(targets, wide, vars, cwd, named = null) {
  if (!targets.length) return wide ? { level: 'ask', what: 'targets read from a pipe or another command' } : null;
  let worst = { level: 'none', what: '' };
  for (const t of targets) {
    if (isCacheDir(t, vars)) continue;
    const kind = classifyTarget(t, vars, cwd);
    const glob = /[*?[]/.test(t);
    let level = 'none';
    if (kind === 'catastrophic' && (wide || glob)) level = 'deny';
    else if (kind === 'internal') level = 'internal';
    else if (wide || (glob && !(named && namesProjectFiles(t, vars, named.dirs)))) level = 'ask';
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

/**
 * An rm, rmdir or unlink whose command word is words[start]. `named` ({ dirs }: a plain rm typed on the command line,
 * not one fed by xargs or find, nor one inside an interpreter's text) lets a glob that names project files pass.
 */
function rmCall(words, start, vars, dir, named = null) {
  const flags = [];
  const targets = [];
  let options = true;
  for (const w of words.slice(start + 1)) {
    if (options && w === '--') options = false;
    else if (options && w.startsWith('-') && w.length > 1) flags.push(w);
    else targets.push(w);
  }
  const wide = flags.some((f) => (/^-[a-zA-Z]*[rR]/.test(f) && !f.startsWith('--')) || f === '--recursive');
  return judgeTargets(targets, wide, vars, dir, named);
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

// --- Code that only mentions a delete in its text (2026-11-18: 13 asks in a day, none of them a delete) -------------
// codeDeletes reads text, so a delete named in a string asked: test cases in node -e, a python script that edits a
// source file by s.replace(), a heredoc written to a file. Only when that rule would ask, a second pass looks at the
// code itself. Anything it cannot read for certain keeps the text rule. Only deletes are relaxed: SQL and the other
// patterns in the same text are still scanned (scanPatterns), as the 2026-11-18 review asked.

const PYTHON = /^python[\d.]*$/;
const NODE_CODE_FLAGS = new Set(['-e', '--eval', '-p', '--print', '-pe', '-ep']);
/** node options that take a value or load other code: what node then runs is not known, so no relaxation. */
const NODE_UNKNOWN = /^(?:-r|--require|--import|--loader|--experimental-loader|-C|--conditions|--env-file|--input-type)(?:=|$)|^--(?:eval|print)=/;

/**
 * What a python or node command runs: { lang, code } (python -c, node -e/-p), { lang, stdin } (python -, node -, or
 * no script), { lang, script } (a file), each with `at`, the index of that word. Null for anything else: another
 * command, python -m or an unknown option, node -r, --import or --test with no file.
 */
function interpreterRun(words) {
  let i = commandIndex(words);
  if (words[i] === 'timeout') {
    for (i += 1; i < words.length && words[i].startsWith('-'); i += 1) if (words[i] === '-s' || words[i] === '-k') i += 1;
    i += 1; // the duration
    i += commandIndex(words.slice(i));
  }
  const cmd = path.basename(words[i] || '');
  const lang = PYTHON.test(cmd) ? 'python' : cmd === 'node' ? 'node' : null;
  if (!lang) return null;
  let testRunner = false;
  for (let k = i + 1; k < words.length; k += 1) {
    const w = words[k];
    if (lang === 'python') {
      if (w === '-') return { lang, stdin: true, at: k };
      if (/^-[BIOSEsuqbdvR]*c$/.test(w)) return k + 1 < words.length ? { lang, code: words[k + 1], at: k + 1 } : null;
      if (/^-[BIOSEsuqbdvR]+$/.test(w)) continue;
      if (w === '-W' || w === '-X') { k += 1; continue; }
      if (w.startsWith('-')) return null;
    } else {
      if (NODE_CODE_FLAGS.has(w)) return k + 1 < words.length ? { lang, code: words[k + 1], at: k + 1 } : null;
      if (w === '-') return { lang, stdin: true, at: k };
      if (NODE_UNKNOWN.test(w)) return null;
      if (w === '--test') testRunner = true;
      if (w.startsWith('-')) continue;
    }
    return { lang, script: w, at: k };
  }
  return testRunner ? null : { lang, stdin: true, at: words.length };
}

/** Whether bash expands something in a raw word ($X, $(…), `…`, $'…'), outside single quotes and escapes. */
function shellExpands(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (quote === "'") {
      if (c === "'") quote = null;
    } else if (c === '\\') {
      i += 1;
    } else if (c === '"') {
      quote = quote ? null : '"';
    } else if (c === "'" && !quote) {
      quote = "'";
    } else if (c === '$' || c === '`') {
      return true;
    }
  }
  return false;
}

/** The raw text (quotes kept) of the word after `flag` whose value is `value`, in a simple command; null if not found. */
function rawWordAfter(segment, flag, value) {
  const raw = segment.match(RAW_WORD) || [];
  for (let k = 0; k + 1 < raw.length; k += 1) {
    if (tokenize(raw[k])[0] === flag && tokenize(raw[k + 1])[0] === value) return raw[k + 1];
  }
  return null;
}

/**
 * Python code, read with Python's own parser (ast) and never run. Prints {"parsed": false} when it does not parse,
 * is not UTF-8, or has a coding cookie other than utf-8 or ascii (python3 decodes a utf-7 file or stdin by its cookie,
 * ast.parse of a str does not: second review, 2026-11-18). Else the names that can delete, run text as code or a
 * command, reach a module or method by a computed name (operator.methodcaller, yaml.load, getattr passed as a value,
 * inspect.getmembers), run SQL, run git (GitPython: import git, any .git, .clean or .reset attribute), unpack an
 * archive or kill a process ("danger"), and whether it writes a file ("writes"). Third review round, 2026-11-19:
 * `git.Repo('.').git.clean('-fdx')  # rm -rf build` and `functools.reduce(getattr, …)` were relaxed.
 */
const PY_CHECKER = String.raw`
import ast, json, re, sys
STRONG = {"exec", "eval", "compile", "__import__", "importlib", "import_module", "globals", "vars", "locals",
  "builtins", "__builtins__", "__dict__", "__globals__", "__subclasses__", "__getattribute__", "__code__", "__class__",
  "__bases__", "__base__", "__mro__", "__loader__", "__spec__", "__reduce__", "__reduce_ex__", "modules", "subprocess",
  "pty", "ctypes", "cffi", "system", "popen", "Popen", "posix_spawn", "posix_spawnp", "startfile", "execute",
  "executemany", "executescript", "exec_driver_sql", "create_subprocess_exec", "create_subprocess_shell",
  "send2trash", "run_code", "load_module", "exec_module", "FunctionType", "CodeType", "commands", "methodcaller",
  "attrgetter", "unsafe_load", "unsafe_load_all", "full_load", "full_load_all", "UnsafeLoader", "FullLoader",
  "runpy", "run_module", "run_path", "extractall", "unpack_archive", "getmembers", "getmembers_static"}
ATTRIBUTES = {"git", "clean", "reset"}
YAML_LOADS = {"load", "load_all", "Loader"}
NAME_ONLY = {"exec", "eval", "compile"}
MODULES = {"code", "codeop", "timeit", "cProfile", "profile", "pdb", "trace", "sh", "plumbum", "pexpect", "paramiko",
  "fabric", "invoke", "pickle", "cPickle", "_pickle", "marshal", "shelve", "dill", "cloudpickle", "git", "os"}
DELETE = re.compile(r"(?:^|_)(?:rm|rmtree|remove|removedirs|unlink|rmdir|delete|drop|truncate|purge|destroy|wipe|"
  r"kill|killpg|terminate|erase|spawn[lv]p?e?|exec[lv]p?e?)(?:_|$)", re.I)
WRITES = {"write", "writelines", "write_text", "write_bytes", "dump", "copy", "copy2", "copyfile", "copytree",
  "copyfileobj", "move", "rename", "renames", "symlink", "symlink_to", "hardlink_to", "link", "link_to", "mkfifo",
  "chmod", "fdopen"}
# Writes to a file object: where it goes is its open() call, which is judged there.
FILE_OBJECT_WRITES = {"write", "writelines", "dump"}
PATHS = {"Path", "PurePath", "PosixPath"}
OPENERS = {"io", "gzip", "bz2", "lzma", "codecs", "tarfile"}
COOKIE = re.compile(r"^[ \t\f]*#.*?coding[:=][ \t]*([-\w.]+)")
try:
    source = sys.stdin.buffer.read().decode("utf-8")
    for line in source.split("\n")[:2]:
        cookie = COOKIE.match(line)
        if cookie and cookie.group(1).lower().replace("_", "-") not in ("utf-8", "utf8", "ascii", "us-ascii"):
            raise ValueError("coding cookie")
    tree = ast.parse(source)
except Exception:
    print(json.dumps({"parsed": False}))
    sys.exit(0)
danger, writes, seen, imported, targets = set(), False, set(), set(), []
called = {id(c.func) for c in ast.walk(tree) if isinstance(c, ast.Call)}
# A name bound once, at the top level, to a string constant: open(p, "w") then names that file.
stores, literal = {}, {}
for n in ast.walk(tree):
    bound = [n.id] if isinstance(n, ast.Name) and not isinstance(n.ctx, ast.Load) else \
        [n.name] if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) else \
        [n.arg] if isinstance(n, ast.arg) else list(n.names) * 2 if isinstance(n, (ast.Global, ast.Nonlocal)) else \
        [(a.asname or a.name).split(".")[0] for a in n.names] if isinstance(n, (ast.Import, ast.ImportFrom)) else []
    for name in bound:
        stores[name] = stores.get(name, 0) + 1
for n in tree.body:
    if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) and \
            isinstance(n.value, ast.Constant) and isinstance(n.value.value, str):
        literal[n.targets[0].id] = n.value.value
def lit(e):
    if isinstance(e, ast.Constant) and isinstance(e.value, str):
        return e.value
    if isinstance(e, ast.Name) and stores.get(e.id) == 1:
        return literal.get(e.id)
    return None
def path_of(e):
    """The literal file of Path("x"), or None."""
    if isinstance(e, ast.Call) and len(e.args) == 1 and not e.keywords and \
            ((isinstance(e.func, ast.Name) and e.func.id in PATHS) or
             (isinstance(e.func, ast.Attribute) and e.func.attr in PATHS)):
        return lit(e.args[0])
    return None
def target(name):
    """A file the code writes: a literal name is listed and judged by the hook, any other write blocks."""
    global writes
    if name is None:
        writes = True
    else:
        targets.append(name)
def check(name, attribute=False):
    seen.add(name)
    if (name in STRONG and not (attribute and name in NAME_ONLY)) or DELETE.search(name):
        danger.add(name)
def mode_writes(m):
    return not (isinstance(m, ast.Constant) and isinstance(m.value, str)) or bool(re.search("[wax+]", m.value))
for n in ast.walk(tree):
    if isinstance(n, ast.Name):
        check(n.id)
        if n.id == "getattr" and id(n) not in called:
            danger.add("getattr as a value")
    elif isinstance(n, ast.Attribute):
        check(n.attr, True)
        if n.attr in ATTRIBUTES:
            danger.add(n.attr)
        if n.attr in ("write_text", "write_bytes"):
            target(path_of(n.value))
        elif n.attr in WRITES - FILE_OBJECT_WRITES or (n.attr == "replace" and isinstance(n.value, ast.Name)
                                                       and n.value.id == "os"):
            writes = True
    elif isinstance(n, (ast.Import, ast.ImportFrom)):
        parts = (n.module or "").split(".") if isinstance(n, ast.ImportFrom) else []
        for a in n.names:
            parts += a.name.split(".")
        for p in parts:
            check(p)
            imported.add(p)
            if p in MODULES - {"os"}:
                danger.add(p)
    elif isinstance(n, ast.Call):
        f = n.func
        name = f.id if isinstance(f, ast.Name) else f.attr if isinstance(f, ast.Attribute) else None
        if name is None:
            danger.add("a call of a computed function")
        elif name == "getattr" and not (len(n.args) > 1 and isinstance(n.args[1], ast.Constant)
                                        and isinstance(n.args[1].value, str) and not DELETE.search(n.args[1].value)
                                        and n.args[1].value not in STRONG):
            danger.add("getattr")
        elif name == "open":
            modes = [k.value for k in n.keywords if k.arg in ("mode", "flags")]
            files = [k.value for k in n.keywords if k.arg in ("file", "name")]
            if isinstance(f, ast.Attribute) and path_of(f.value) is not None:
                if any(mode_writes(m) for m in n.args[:1] + modes):
                    target(path_of(f.value))
            elif isinstance(f, ast.Attribute) and not (isinstance(f.value, ast.Name) and f.value.id in OPENERS):
                os_open = isinstance(f.value, ast.Name) and f.value.id == "os"
                if os_open or any(mode_writes(m) for m in n.args[1:] + modes) or any(
                        isinstance(m, ast.Constant) and isinstance(m.value, str) and re.search("[wax+]", m.value)
                        for m in n.args[:1]):
                    writes = True
            elif any(mode_writes(m) for m in n.args[1:2] + modes):
                target(lit((n.args[:1] + files or [None])[0]))
# yaml.load builds any Python object a tag names (!!python/object/apply:os.system): with yaml imported, load is a call.
if "yaml" in imported and seen & YAML_LOADS:
    danger.add("yaml.load")
print(json.dumps({"parsed": True, "danger": sorted(danger), "writes": writes, "targets": targets,
                  "imports": sorted(imported)}))
`;

/**
 * Above this many characters the code is not parsed and the text rule applies: the review measured a 1000-line body
 * at twice the old time, and a hook that times out must not decide.
 */
const PY_MAX_CODE = 64 * 1024;

/** python3 from PATH: only ast.parse runs, in an isolated interpreter (-I), with a time limit. */
function pythonFacts(code) {
  if (code.length > PY_MAX_CODE) return { ok: false };
  try {
    const r = require('node:child_process').spawnSync('python3', ['-I', '-B', '-c', PY_CHECKER], {
      input: code, encoding: 'utf8', timeout: 3000, cwd: os.tmpdir(), maxBuffer: 1024 * 1024 });
    if (r.error || r.status !== 0) return { ok: false };
    const facts = JSON.parse(r.stdout);
    return { ok: facts.parsed === true, danger: facts.danger.length > 0, writes: facts.writes === true,
      targets: facts.targets || [], imports: facts.imports || [] };
  } catch {
    return { ok: false };
  }
}

/** Keywords after which a / starts a regular expression, not a division. */
const JS_REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await']);
/**
 * Names that delete, run a command or text as code, reach a function by a computed name, or signal processes
 * (process.kill(-1) signals every process of the user). `exec` is also a RegExp method: code that calls it keeps the
 * text rule.
 */
const JS_DANGER = new Set(['child_process', 'exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync',
  'fork', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync', 'remove', 'removeSync', 'emptyDir',
  'emptyDirSync', 'rimraf', 'del', 'deleteSync', 'deleteAsync', 'truncate', 'truncateSync', 'ftruncate',
  'ftruncateSync', 'eval', 'Function', 'constructor', 'import', 'binding', '_linkedBinding', 'dlopen', '_load', 'vm',
  'runInNewContext', 'runInThisContext', 'runInContext', 'compileFunction', 'Script', 'Worker', 'worker_threads',
  'globalThis', 'global', 'mainModule', '__proto__', 'getBuiltinModule', 'Reflect', 'Proxy', '$', 'shell', 'execa',
  'execaSync', 'kill']);
/** A string naming one of those APIs and nothing else: never a plain word such as 'eval', 'exec' or 'rm'. */
const JS_API_NAME = /^(?:\w+Sync|child_process|node:child_process|worker_threads|node:worker_threads|rimraf|runInNewContext|runInThisContext|runInContext|compileFunction|_linkedBinding|getBuiltinModule|mainModule|dlopen|_load|execFile|execa)$/;
const JS_DANGER_MODULE = /^(?:node:)?(?:child_process|vm|worker_threads|cluster|repl|inspector|module|v8|wasi|process)$|^(?:shelljs|execa|cross-spawn|zx|rimraf|del|fs-extra|trash|graceful-fs)$/;
const JS_WRITES = new Set(['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'createWriteStream',
  'copyFileSync', 'copyFile', 'cpSync', 'cp', 'renameSync', 'rename', 'symlinkSync', 'symlink', 'linkSync', 'link',
  'openSync', 'open', 'outputFile', 'outputFileSync', 'writeJson', 'writeJsonSync', 'move', 'moveSync', 'copy',
  'copySync', 'chmodSync', 'chmod']);
/** Writes whose first argument names the file: with a plain string there, the hook judges that file. */
const JS_NAMED_WRITES = new Set(['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'createWriteStream',
  'outputFile', 'outputFileSync', 'writeJson', 'writeJsonSync']);

/**
 * Tokens of JavaScript source: identifiers, string values, template and regex markers, punctuators. Comments are
 * dropped; the text of strings, templates and regexes is kept out of the code, the ${…} parts of a template are code.
 * Also returns a skeleton (the source with that text emptied), which must compile like the source: a misread quote
 * or regex would not. Throws on anything it cannot read (an escape in a name, an open string or comment).
 */
function lexJs(src) {
  const tokens = [];
  let skeleton = '';
  let i = 0;
  const fail = () => {
    throw new Error('unreadable JavaScript');
  };
  const regexStarts = () => {
    const p = tokens[tokens.length - 1];
    if (!p) return true;
    if (p.t === 'id') return JS_REGEX_AFTER.has(p.v);
    // After ) or } a / is a regex (`if (x) /re/`, a block) or a division (`(a) / b`, an object), and after ++ or --
    // either: V8 knows which, this lexer does not (second review: `if (1) /\`/` hid the next lines). It gives up.
    const q = tokens[tokens.length - 2];
    if (p.v === ')' || p.v === '}' || ((p.v === '+' || p.v === '-') && q && q.v === p.v)) fail();
    return p.t === 'p' && p.v !== ']';
  };
  const quoted = (q) => {
    let v = '';
    for (i += 1; i < src.length; i += 1) {
      const c = src[i];
      if (c === q) {
        i += 1;
        return v;
      }
      if (c === '\n') fail();
      if (c === '\\') v += c + (src[(i += 1)] || '');
      else v += c;
    }
    return fail();
  };
  const regex = () => {
    let cls = false;
    for (i += 1; i < src.length && (cls || src[i] !== '/'); i += 1) {
      if (src[i] === '\n') fail();
      if (src[i] === '\\') i += 1;
      else if (src[i] === '[') cls = true;
      else if (src[i] === ']') cls = false;
    }
    if (i >= src.length) fail();
    for (i += 1; /[a-z]/i.test(src[i] || ''); i += 1);
    tokens.push({ t: 're' });
    skeleton += '/x/';
  };
  const NAME = /[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/uy;
  const NUMBER = /[0-9.][0-9A-Za-z_.]*/y;
  let template;
  const code = (inExpression) => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      const next = src[i + 1];
      if (c === '}' && inExpression && depth === 0) return;
      NAME.lastIndex = i;
      NUMBER.lastIndex = i;
      const name = NAME.exec(src);
      if (/\s/.test(c)) {
        skeleton += c;
        i += 1;
      } else if (c === '/' && next === '/') {
        while (i < src.length && src[i] !== '\n') i += 1;
      } else if (c === '/' && next === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end === -1) fail();
        i = end + 2;
        skeleton += ' ';
      } else if (c === '"' || c === "'") {
        tokens.push({ t: 'str', v: quoted(c) });
        skeleton += '""';
      } else if (c === '`') {
        template();
      } else if (c === '/' && regexStarts()) {
        regex();
      } else if (c === '\\') {
        fail(); // eval is eval
      } else if (name) {
        tokens.push({ t: 'id', v: name[0] });
        skeleton += name[0];
        i += name[0].length;
      } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(next || ''))) {
        const number = NUMBER.exec(src)[0];
        tokens.push({ t: 'num' });
        skeleton += number;
        i += number.length;
      } else {
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        tokens.push({ t: 'p', v: c });
        skeleton += c;
        i += 1;
      }
    }
    if (inExpression) fail();
  };
  template = () => {
    skeleton += '`';
    for (i += 1; i < src.length;) {
      if (src[i] === '`') {
        i += 1;
        skeleton += '`';
        tokens.push({ t: 'tpl' });
        return;
      }
      if (src[i] === '\\') {
        i += 2;
      } else if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        skeleton += '${';
        code(true);
        i += 1;
        skeleton += '}';
      } else {
        i += 1;
      }
    }
    fail();
  };
  code(false);
  return { tokens, skeleton };
}

/**
 * Node code, read by lexJs and compiled (never run) by V8: { ok, danger, writes }, like pythonFacts. Code with a line
 * end lexJs does not know (U+2028, U+2029, a lone CR) or an HTML-like comment (<!--, -->) is not read: V8 ends or
 * starts a comment there and lexJs does not (second review, 2026-11-18).
 */
function jsFacts(code) {
  const src = code.replace(/^#![^\n]*/, '');
  if (/[\u2028\u2029]|\r(?!\n)|<!--|-->/.test(src)) return { ok: false };
  let lexed;
  try {
    lexed = lexJs(src);
    const vm = require('node:vm');
    vm.compileFunction(src);
    vm.compileFunction(lexed.skeleton);
  } catch {
    return { ok: false };
  }
  const t = lexed.tokens;
  // A string that is an API name can reach it (fs[name]); a label such as 'eval' or 'rm' in a test table is text.
  let danger = t.some((x) => (x.t === 'id' && JS_DANGER.has(x.v)) || (x.t === 'str' && JS_API_NAME.test(x.v)));
  for (let k = 0; k < t.length && !danger; k += 1) {
    const prev = t[k - 1];
    if (t[k].t === 'id' && t[k].v === 'require' && t[k + 1] && t[k + 1].v === '(') {
      // require of a literal name only: require(S + '/x.js') could name any module.
      const name = t[k + 2];
      danger = !name || name.t !== 'str' || name.v.includes('\\') || JS_DANGER_MODULE.test(name.v) || !t[k + 3] ||
        t[k + 3].v !== ')';
    } else if (t[k].v === '[' && prev && (prev.t === 'str' || prev.t === 'tpl' || prev.v === ')' || prev.v === ']' ||
               (prev.t === 'id' && !JS_REGEX_AFTER.has(prev.v)))) {
      // A computed member: x["a" + "b"] or x[`…`] can name any method.
      const inner = [];
      for (let depth = 0, j = k + 1; j < t.length; j += 1) {
        if (t[j].v === '[') depth += 1;
        else if (t[j].v === ']' && (depth -= 1) < 0) break;
        inner.push(t[j]);
      }
      danger = inner.some((x) => x.t === 'tpl') || (inner.some((x) => x.t === 'str') && inner.length > 1) ||
        (inner.length === 1 && inner[0].t === 'str' && JS_DANGER.has(inner[0].v));
    }
  }
  // A write of a plain string file name lists it; any other write, or one beside a require of a relative or
  // absolute path (the code could require the file it wrote), blocks.
  const targets = [];
  let writes = false;
  t.forEach((x, k) => {
    if (x.t !== 'id' || !JS_WRITES.has(x.v)) return;
    const [open, name, after] = [t[k + 1], t[k + 2], t[k + 3]];
    if (JS_NAMED_WRITES.has(x.v) && open && open.v === '(' && name && name.t === 'str' && !name.v.includes('\\') &&
        after && (after.v === ',' || after.v === ')')) targets.push(name.v);
    else writes = true;
  });
  const requiresPath = t.some((x, k) => x.t === 'id' && x.v === 'require' && t[k + 2] && t[k + 2].t === 'str' &&
    /^[./]/.test(t[k + 2].v));
  return { ok: true, danger, writes: writes || (targets.length > 0 && requiresPath), targets, imports: [] };
}

/**
 * Read-only commands that can neither run a file another command on the line wrote nor copy it somewhere that runs.
 * Interpreter code and heredoc data are relaxed only when every other command on the line is one of these: the
 * second review (2026-11-18) showed that "nothing on the line names the file" misses a script that imports, sources
 * or finds it. cat may not take a heredoc; sed, mkdir, node and python3 only in the forms readOnlyAllowed accepts.
 */
const READERS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'echo', 'printf', 'stat', 'diff', 'cmp', 'cd',
  'true', 'test', '[']);
/** A sed -n script that only prints: addresses (a number, $ or /regex/) and p. GNU sed's e and w run or write. */
const SED_PRINT = /^(?:(?:\d+|\$|\/[^/\\\n]*\/)(?:,(?:\d+|\$|\/[^/\\\n]*\/))?)?p(?:;(?:(?:\d+|\$|\/[^/\\\n]*\/)(?:,(?:\d+|\$|\/[^/\\\n]*\/))?)?p)*$/;

/**
 * Whether one simple command is an allowlisted reader: no assignment or wrapper in front (PYTHONPATH=. changes what
 * runs), the command named without a folder (./ls is not ls), and only sed -n …p, mkdir -p, node --check and
 * python3 -B -m py_compile of those that can do more. Literal assignments alone (W=/x) and a bare comment pass.
 * `test -v`, `[ -v ]`, `[ -R ]` and `printf -v` evaluate an array subscript, and $(…) in it runs (third review round).
 */
function readOnlyAllowed(segment, words) {
  if (words.every((w) => /^[A-Za-z_]\w*=/.test(w))) return true;
  const [cmd, ...args] = words;
  const options = args.filter((w) => w.startsWith('-'));
  if (cmd === 'cat') return heredocOperators(segment, quoteMasker()(segment)).length === 0;
  if ((cmd === 'test' || cmd === '[') && args.some((w) => w === '-v' || w === '-R')) return false;
  if (cmd === 'printf' && args.some((w) => w.startsWith('-v'))) return false;
  if (READERS.has(cmd)) return true;
  if (cmd === 'sed') return args[0] === '-n' && SED_PRINT.test(args[1] || '') && args.slice(2).every((w) => !w.startsWith('-'));
  if (cmd === 'mkdir') return options.some((o) => o.includes('p')) && options.every((o) => /^-[pv]+$/.test(o));
  if (cmd === 'node') {
    return (args[0] === '--check' || args[0] === '-c') && args.length > 1 && args.slice(1).every((w) => !w.startsWith('-'));
  }
  if (/^python3(?:\.\d+)?$/.test(cmd)) {
    return args[0] === '-B' && args[1] === '-m' && args[2] === 'py_compile' && args.length > 3 &&
      args.slice(3).every((w) => w === '-q' || !w.startsWith('-'));
  }
  return false;
}

/**
 * Files that run when a shell, a desktop session, git, a build or test tool, Python, a container, an MCP client
 * (.mcp.json), yarn (yarnPath in .yarnrc.yml), lefthook or GitLab CI starts.
 */
const AUTORUN_NAME = /^(?:\.(?:bashrc|bash_profile|bash_login|bash_logout|bash_aliases|profile|zshrc|zprofile|zshenv|zlogin|zlogout|kshrc|cshrc|tcshrc|xprofile|xsession|xinitrc|inputrc|envrc|env|npmrc|yarnrc|yarnrc\.ya?ml|mcp\.json|justfile|gitlab-ci\.ya?ml|gitconfig|gitattributes|pre-commit-config\.ya?ml)|\.?lefthook(?:-local)?\.ya?ml|crontab|[Mm]akefile|GNUmakefile|[Jj]ustfile|package\.json|pyproject\.toml|setup\.py|setup\.cfg|tox\.ini|noxfile\.py|tasks\.py|conftest\.py|sitecustomize\.py|usercustomize\.py|Dockerfile|Containerfile|(?:docker-)?compose\.ya?ml|Taskfile\.ya?ml|[^/]*\.(?:pth|service|timer|socket|desktop))$/;
/** Folders whose files git, an editor, CI, Claude Code or the system runs, a virtualenv's activate, system folders. */
const AUTORUN_DIR = /(?:^|\/)(?:\.git|\.husky|\.githooks|\.github|\.gitlab|\.vscode|\.idea|\.devcontainer|\.claude|\.direnv)(?:\/|$)|\/bin\/activate[^/]*$|^\/(?:etc|usr|var|bin|sbin|lib|lib32|lib64|opt|boot|dev|proc|sys|run|root|srv|Library|System|private\/etc|private\/var)(?:\/|$)/;

/** A path in a dot folder or a dotfile of the home folder (~/.bashrc, ~/.config/…, ~/.local/bin/…, ~/.claude/…). */
function inHomeDot(p) {
  return [HOME, realFolder(HOME)].some((home) => {
    const rel = home ? path.relative(home, p) : '..';
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && rel.split('/')[0].startsWith('.');
  });
}

/** The path and each path its symlinks lead to, a dangling one too: a write through a link lands at its target. */
function diskPaths(abs) {
  const out = [abs];
  let p = onDisk(abs);
  for (let hop = 0; hop < 40; hop += 1) {
    const folder = realFolder(path.dirname(p));
    if (folder === null) break;
    const real = path.join(folder, path.basename(p));
    out.push(real);
    let link;
    try {
      link = fs.readlinkSync(real);
    } catch {
      break; // not a symlink, or not there yet
    }
    p = path.resolve(folder, link);
    out.push(p);
  }
  return out;
}

/**
 * Whether a write to `file` (a heredoc's target, a redirection) may run later with nothing else on the line: a
 * startup, hook, build, test or autorun file, anything in a home dot folder or a system folder, also through a
 * symlink, or a path the guard cannot resolve (a variable, a glob, ~user, a relative path after an unknown cd).
 * `dir` is where the command runs. /dev/null is not one.
 */
function autorunPath(file, vars, dir) {
  let p = expandVars(file, vars);
  if (vars.HOME && (p === '~' || p.startsWith('~/'))) p = vars.HOME + p.slice(1);
  if (!p || /[$`*?[{~]/.test(p) || (!p.startsWith('/') && dir === null)) return true;
  const abs = path.resolve(p.startsWith('/') ? '/' : dir, p);
  if (abs === '/dev/null') return false;
  return diskPaths(abs).some((q) => AUTORUN_NAME.test(path.basename(q)) || AUTORUN_DIR.test(q) || inHomeDot(q));
}

const ANY_REDIRECT = /(?:^|[^<>&])(?:\d+|&)?(?:>>|>\||<>|>&(?=[^\d\s-])|>(?![&(]))[ \t]*/g;
/** Every file a simple command writes by a redirection (> f, 2>> f, &> f, 3<> f, >& f), quotes removed. */
function redirectTargets(segment) {
  const files = [];
  for (const m of maskQuoted(segment).matchAll(ANY_REDIRECT)) {
    REDIRECT_WORD.lastIndex = m.index + m[0].length;
    const word = REDIRECT_WORD.exec(segment);
    files.push(word ? tokenize(word[0])[0] || '' : '');
  }
  return files;
}

/** Settings that make python or node load other code first: on such a line the code is not judged alone. */
const LOADS_CODE_ENV = /(?:^|[^\w$])(?:PYTHONPATH|PYTHONSTARTUP|PYTHONHOME|PYTHONINSPECT|PYTHONUSERBASE|NODE_OPTIONS|NODE_PATH|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_\w+)=/;

/** Prints the names of Python's standard modules (3.10+) and of the modules installed on its path and user site. */
const PY_MODULE_NAMES = String.raw`
import os, pkgutil, site, sys
paths = [p for p in sys.path if p] + [site.getusersitepackages()] + os.environ.get("PYTHONPATH", "").split(os.pathsep)
names = set(sys.stdlib_module_names) | set(sys.builtin_module_names)
names |= {m.name for m in pkgutil.iter_modules([p for p in paths if p and os.path.isdir(p)])}
print("\n".join(sorted(names)))
`;

let moduleNames;
/** The module names python3 can import from outside the working folder, or null when python3 cannot say. */
function pythonModules() {
  if (moduleNames === undefined) {
    try {
      const r = require('node:child_process').spawnSync('python3', ['-I', '-c', PY_MODULE_NAMES], {
        encoding: 'utf8', timeout: 3000, cwd: os.tmpdir(), maxBuffer: 4 * 1024 * 1024 });
      moduleNames = r.error || r.status !== 0 ? null : new Set(r.stdout.split('\n').filter(Boolean));
    } catch {
      moduleNames = null;
    }
  }
  return moduleNames;
}

/**
 * Whether a written file could be imported in place of a standard or installed module: python3 -m puts its folder
 * first on the path, so `argparse.py` or `traceback/__init__.py` would run when py_compile imports that module.
 */
function shadowsModule(file) {
  const names = pythonModules();
  const base = path.basename(file);
  return !names || names.has(base === '__init__.py' ? path.basename(path.dirname(file)) : base.split('.')[0]);
}

/**
 * The relaxed pass of deleteVerdict for one command line (`shell`, as deleteVerdict reads it): which interpreter code
 * and which heredoc bodies only mention a delete. `bodies` are the executed bodies in deleteVerdict's order, `subs`
 * the command substitutions, `vars` and `cwd` what decideShell knows, `rawCommand` the line as given.
 */
function textOnlyDeletes(shell, parsed, subs, bodies, vars, cwd, rawCommand) {
  if (LOADS_CODE_ENV.test(rawCommand)) return { segment: () => false, body: () => false };
  const ops = [];
  const segments = splitSegments(shell, ops);
  const words = segments.map(tokenize);
  const fromSubst = [];
  segments.forEach((s, n) => fromSubst.push(n > 0 && (fromSubst[n - 1] || s === `cd "$${SUBST_DIR}"`)));
  // Where each simple command runs: a cd moves it, and after one to an unknown folder it is null.
  const dirs = [];
  segments.reduce((dir, s, n) => {
    dirs.push(dir);
    const i = commandIndex(words[n]);
    return words[n][i] === 'cd' || words[n][i] === 'pushd' ? nextDir(words[n][i + 1], vars, dir) : dir;
  }, cwd);
  /** The output of segment n is piped to a command that does more than read it. */
  const pipesOn = (n) => {
    for (let k = n; ops[k] === '|'; k += 1) if (!segments[k + 1] || !isReadOnly(segments[k + 1])) return true;
    return false;
  };
  const writesOk = (n) => redirectTargets(segments[n]).every((f) => !autorunPath(f, vars, dirs[n]));
  // Python anywhere on the line (py_compile, -c, stdin) imports from its folder first, so no redirect may write a
  // module it could import instead (`> argparse.py`, `> json.py`).
  const runsPython = words.some((w) => w.some((x) => PYTHON.test(path.basename(x))));
  const shadows = runsPython && segments.some((s) => redirectTargets(s).some(shadowsModule));
  /** Every command on the line but segment n is an allowlisted reader, and none redirects into an autorun file. */
  const othersRead = (n) => !shadows && segments.every((s, k) => writesOk(k) && (k === n || readOnlyAllowed(s, words[k])));
  /**
   * Another command on the line writes a file the code could load: Python imports a .py, .pyc, .so or .pth from its
   * folder (`> helper.py`, `> json/__init__.py`), and node's require runs a file of any name as JavaScript.
   */
  const writesLoadable = (lang, n) => segments.some((s, k) => k !== n && redirectTargets(s).some((f) =>
    f !== '/dev/null' && (lang === 'node' || /\.(?:py[cdw]?|so|pth)$/.test(f))));
  /**
   * A file the code writes by a plain name is data, as with `cat > file` (coordinator, 2026-11-19: `s.replace("rm -f
   * a_*", …)` then `open("t.js", "w").write(s)`): not a startup or autorun file where the code runs, not a module
   * Python on the line could import, and for Python not a module the code itself imports.
   */
  const writtenOk = (lang, file, n, imports) => {
    if (autorunPath(file, vars, dirs[n]) || (runsPython && shadowsModule(file))) return false;
    if (lang !== 'python' || !/\.(?:py[cdw]?|so)$/.test(file)) return true;
    const base = path.basename(file);
    const module = base.startsWith('__init__.') ? path.basename(path.dirname(file)) : base.split('.')[0];
    return !imports.includes(module);
  };
  /**
   * Code that deletes nothing, runs no text, writes no file but plain named data files, and that nothing else on the
   * line can reach. The other commands are readers only, so nothing on the line runs a file the code writes.
   */
  const clean = (lang, code, n) => {
    if (pipesOn(n) || !othersRead(n) || writesLoadable(lang, n)) return false;
    const facts = lang === 'python' ? pythonFacts(code) : jsFacts(code);
    return facts.ok && !facts.danger && !facts.writes &&
      facts.targets.every((file) => writtenOk(lang, file, n, facts.imports));
  };
  // The owner of each heredoc body: the k-th segment with a heredoc operator, when its words are the owner's words.
  const withHeredoc = [];
  segments.forEach((s, n) => {
    const mask = quoteMasker();
    const count = s.split('\n').reduce((sum, line) => sum + heredocOperators(line, mask(line)).length, 0);
    for (let c = fromSubst[n] ? 0 : count; c > 0; c -= 1) withHeredoc.push(n);
  });
  const ownerOf = (body) => {
    const n = withHeredoc[parsed.bodies.indexOf(body)];
    return n !== undefined && words[n].join(' ') === body.owner.join(' ') ? n : -1;
  };

  return {
    /** Segment n is python -c or node -e/-p whose code only mentions deletes, and bash expands nothing in it. */
    segment(n, segment) {
      const run = interpreterRun(words[n]);
      if (fromSubst[n] || !run || run.code === undefined) return false;
      const raw = rawWordAfter(segment, words[n][run.at - 1], run.code);
      return raw !== null && !shellExpands(raw) && clean(run.lang, run.code, n);
    },
    /**
     * Executed body k: data cat or tee writes to a file, as the Write tool would (not a startup or autorun file, not
     * a module Python on the line could import, only allowlisted readers on the line), or code python or node reads
     * on stdin that only mentions deletes.
     */
    body(k) {
      const body = bodies[k];
      const n = ownerOf(body);
      if (!body.plain || n === -1) return false;
      if (!body.runs) {
        return body.files.length > 0 && body.files.every((f) => !autorunPath(f, vars, dirs[n])) &&
          !(runsPython && body.files.some(shadowsModule)) && othersRead(n);
      }
      // bash expands an unquoted body ($X, `…`, \): the text the guard reads is not the text that runs.
      const literal = body.quoted || !/[$`\\]/.test(body.text);
      const run = interpreterRun(body.owner);
      return literal && !!run && run.stdin === true && clean(run.lang, body.text, n);
    },
  };
}

/** Words that change the folder in a way the guard does not follow, or run text that can (eval, source, exec). */
const FOLDER_CHANGERS = new Set(['pushd', 'popd', 'eval', 'source', 'exec']);
/** A cd argument that is a literal path: no expansion, glob, brace, escape or option. */
const LITERAL_DIR = /^(?:[^\s$`'"\\;&|()<>*?[\]{}!#]|'[^'\n]*'|"[^"\n$`\\!]*")+$/;

/**
 * Where a plain rm on this line runs, for rule A's relative globs (third review round, 2026-11-19: with a session at
 * home, `(cd dev/proj && make); rm -f .ba*`, `false && cd dev/proj; rm -f .ba*` and `eval cd ~; rm -f .ba*` were
 * allowed). { dir: null } when nothing on the line changes folder; { dir } when the line starts with one plain
 * `cd <literal path> &&` and has no other cd; null when the folder is not certain: any other cd (a cd after another
 * command, behind || or in $(…)), pushd, popd, eval, source, `.`, exec, env -C or --chdir, sudo -D, CDPATH, or a
 * subshell. Words are read with quotes and escapes removed, so c\d and 'c'd count as cd.
 */
function globFolder(command, cwd, vars) {
  const text = withoutHeredocBodies(command);
  if (/\bCDPATH\b/.test(text)) return null;
  const mask = quoteMasker();
  // A subshell: a ( that is not $( <( >( =( or (( — none of those changes the folder unless a cd is in it.
  if (/(?:^|[^$<>=(\\])\((?!\()/m.test(text.split('\n').map((line) => mask(line)).join('\n'))) return null;
  let cds = 0;
  for (const segment of splitSegments([text, ...substitutions(text)].join('\n'))) {
    const words = tokenize(segment);
    if (commandWord(words) === '.') return null;
    for (const w of words) {
      if (w === 'cd') cds += 1;
      else if (FOLDER_CHANGERS.has(w) || /^--chdir(?:=|$)/.test(w)) return null;
    }
    if (['env', 'sudo'].some((wrapper) => words.includes(wrapper)) && words.some((w) => /^-[A-Za-z]*[CD]/.test(w))) {
      return null;
    }
  }
  if (cds === 0) return { dir: null };
  if (cds > 1) return null;
  const ops = [];
  const first = splitSegments(text, ops, 1)[0] || '';
  const raw = first.match(RAW_WORD) || [];
  if (ops[0] !== '&&' || raw.length !== 2 || raw[0] !== 'cd' || !LITERAL_DIR.test(raw[1])) return null;
  const arg = tokenize(raw[1])[0] || '';
  // A relative path is looked up in CDPATH first when that is set; the guard does not read the shell's CDPATH.
  if (arg.startsWith('-') || (process.env.CDPATH && !/^(?:\/|~|\.\.?(?:\/|$))/.test(arg))) return null;
  const dir = nextDir(arg, vars, cwd);
  return dir === null ? null : { dir };
}

/**
 * Deletes, judged by target. Only where something runs them: an rm, rmdir or unlink command, xargs rm, find -delete
 * or -exec rm, code given to an interpreter, or a heredoc that is run. An rm inside echo text, a grep pattern or a
 * commit message is not a delete. `vars` are known in this shell; code run by another program gets `codeVars`.
 * With `relax` (textOnlyDeletes), code whose text would ask is dropped when the code itself deletes nothing. `memo`
 * keeps codeDeletes results between the two passes, so a long body is not read twice (second review: 2x the time).
 * `folder` (globFolder) is where a plain rm's relative glob may run; null when that is not certain.
 */
function deleteVerdict(shell, code, vars, cwd, codeVars = vars, relax = null, memo = new Map(), folder = null) {
  const found = [];
  const deletesIn = (text, where) => {
    const key = `${where}\0${text}`;
    if (!memo.has(key)) memo.set(key, codeDeletes(text, codeVars, where));
    return memo.get(key);
  };
  let dir = cwd;
  const ops = [];
  const segments = splitSegments(shell, ops);
  let prev = { words: [], i: 0, cmd: '' };
  // Rule A: a relative glob is resolved where the rm runs: the session folder, or the folder of the line's leading
  // cd while only && joins them; after any other separator the cd may have failed, so both must pass.
  let fromCd = true;
  const named = (here) => ({ dirs: here === null || !folder ? null
    : folder.dir === null ? [cwd] : fromCd ? [folder.dir] : [folder.dir, cwd] });
  segments.forEach((segment, n) => {
    const words = tokenize(segment);
    const i = commandIndex(words);
    const cmd = i < words.length ? path.basename(words[i]) : '';
    if (n > 0 && ops[n - 1] !== '&&') fromCd = false;
    if (cmd === 'cd' || cmd === 'pushd') {
      dir = nextDir(words[i + 1], vars, dir);
    } else if (RM_COMMANDS.has(cmd)) {
      found.push(rmCall(words, i, vars, dir, cmd === 'rm' ? named(dir) : null));
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
      const deletes = deletesIn(segment, dir);
      if (!(relax && worstOf(deletes).level === 'ask' && relax.segment(n, segment))) found.push(...deletes);
    }
    prev = { words, i, cmd };
  });
  code.forEach((body, k) => {
    const deletes = deletesIn(body, dir);
    if (!(relax && worstOf(deletes).level === 'ask' && relax.body(k))) found.push(...deletes);
  });
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
 * A line with `case` and a substitution ($(…) or `…`) asks unless it is denied: the ) after a case pattern does not
 * end the substitution, no scanner here follows that, and a quote after it hid the next lines (second review,
 * 2026-11-18: x="$(case a in a) echo "'";; esac)"⏎rm -rf ~ was allowed).
 *
 * The line is judged as bash reads it, with its backslash-newlines removed (joinContinuations). A heredoc delimiter
 * the guard cannot read for certain makes an allowed line ask.
 */
function decideShell(rawCommand, cwd) {
  const joined = joinContinuations(rawCommand);
  const command = joined === null ? rawCommand : joined;
  const verdict = judgeShell(command, cwd);
  if (joined === null && (!verdict || verdict.decision === 'allow')) {
    return {
      decision: 'ask',
      reason: "Destructive operation check: a heredoc delimiter written as $'…' or $\"…\" with an escape or expansion " +
        'in it, which the guard cannot read for certain, so it cannot tell where the heredoc ends. Confirm what the ' +
        "whole command runs, or use a plain quoted delimiter such as <<'EOF'. See ~/.claude/skills/destructive-ops-guard/SKILL.md",
    };
  }
  if (!/\bcase\b/.test(command) || !/\$\(|`/.test(command) || (verdict && verdict.decision !== 'allow')) {
    return verdict;
  }
  return {
    decision: 'ask',
    reason: 'Destructive operation check: a case statement inside a command substitution, which the guard cannot ' +
      'read reliably (the text after a case pattern can hide the next lines). Confirm what the whole command runs, ' +
      'or move the case out of the substitution. See ~/.claude/skills/destructive-ops-guard/SKILL.md',
  };
}

/** decideShell without the case check. */
function judgeShell(rawCommand, cwd) {
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
  const memo = new Map();
  const folder = globFolder(command, cwd, vars);
  const deletion = deleteVerdict(shell, executed, shellVars, cwd, vars, null, memo, folder);
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
  if (deletion.level !== 'ask') return null;
  // Only a delete would ask: look again at the code itself, whose text may only mention one (textOnlyDeletes).
  const bodies = runsText ? [...parsed.bodies.filter((b) => b.runs), ...parsed.bodies.filter((b) => !b.runs)] : [];
  const relax = textOnlyDeletes(shell, parsed, subs, bodies, shellVars, cwd, rawCommand);
  const relaxed = deleteVerdict(shell, executed, shellVars, cwd, vars, relax, memo, folder);
  if (RANK[relaxed.level] >= RANK.ask) {
    return {
      decision: 'ask',
      reason:
        `Destructive operation detected: recursive or wildcard delete of ${relaxed.what}, which is outside ` +
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
