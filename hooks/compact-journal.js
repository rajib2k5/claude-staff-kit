#!/usr/bin/env node
/**
 * Compaction fact journal. No model call: everything here is read from files and git.
 *
 *   PreCompact                 -> writes a Markdown journal of the facts a summary tends to lose:
 *                                 the recent user instructions VERBATIM, the open task list, cwd,
 *                                 git branch and status, open PRs, and decision-like lines.
 *   SessionStart (compact)     -> re-injects that journal as additionalContext right after the
 *                                 compaction, so the summarised session gets the exact words back.
 *
 * Journal: $CLAUDE_COMPACT_JOURNAL_DIR/<session_id>.md, default ~/.claude/compact-journal/. Each
 * PreCompact overwrites the session's journal (the newest state is the one that matters); the
 * previous one is kept as <session_id>.prev.md. Re-injection is capped at MAX_INJECT characters.
 *
 * Fails OPEN on any error (stderr note, exit 0): compaction must never be blocked by this hook.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const N_USER = 10;          // recent user instructions kept verbatim
const MAX_USER_CHARS = 4000; // per instruction; longer ones are cut with a marker
const MAX_INJECT = 30000;    // characters re-injected after compaction
const MAX_STATUS_LINES = 40;

function journalDir(env = process.env) {
  return env.CLAUDE_COMPACT_JOURNAL_DIR || path.join(os.homedir(), '.claude', 'compact-journal');
}
const safeId = (s) => String(s || 'unknown').replace(/[^\w.-]/g, '_');
const journalPath = (sid, env) => path.join(journalDir(env), `${safeId(sid)}.md`);

function parseLines(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* torn line */ }
  }
  return out;
}

// Lines Claude Code writes as type "user" that no human typed: background task results, messages from
// subagents and other sessions, system notes. Kept out of the journal, because the journal is
// re-injected as the user's own words and would let model or web text pose as the user.
const MACHINE_PREFIX = /^(<task-notification|<agent-message|<\\?~agent-message|<cross-session-message|<side-sessions-event|<ci-monitor-event|<system-reminder>|\[SYSTEM NOTIFICATION|\[Request interrupted|Another Claude session sent a message|This session is being continued|Base directory for this skill:)/;

const originKind = (d) => (d && d.origin && typeof d.origin === 'object' ? d.origin.kind : undefined);

/** True when the transcript labels input origins (Claude Code 2.1.29x+): any line has origin.kind "human". */
function hasOriginLabels(lines) {
  return lines.some((d) => d && d.type === 'user' && originKind(d) === 'human');
}

/**
 * The text a human typed in a user line, or null for anything else: tool results, meta lines, hook
 * output, task notifications, agent and session messages. With `labelled` (the transcript marks
 * origins), only origin.kind "human" counts; without it, any non-human origin or machine prefix is out.
 */
function userText(d, labelled = false) {
  if (d.type !== 'user' || d.isMeta || d.isSidechain || d.isCompactSummary || !d.message) return null;
  const kind = originKind(d);
  if (labelled ? kind !== 'human' : kind !== undefined && kind !== 'human') return null;
  const c = d.message.content;
  let text;
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b && b.type === 'tool_result')) return null;
    text = c.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
  } else return null;
  text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  if (!text || /^<(local-command-|command-name>|command-message>|bash-)/.test(text) || MACHINE_PREFIX.test(text)) return null;
  return text;
}

function recentUserInstructions(lines, n = N_USER) {
  const labelled = hasOriginLabels(lines);
  const all = lines.map((d) => userText(d, labelled)).filter(Boolean);
  return all.slice(-n).map((t) => (t.length > MAX_USER_CHARS ? t.slice(0, MAX_USER_CHARS) + '\n[...cut by compact-journal]' : t));
}

/**
 * The latest task list. Understands TodoWrite (whole list), TaskCreate/TaskUpdate (incremental) and
 * the desktop app's update_plan (whole list or advance). Returns [{content, status}].
 */
function openTasks(lines) {
  let list = null;
  const byId = new Map();
  let created = 0;
  for (const d of lines) {
    if (d.type !== 'assistant' || d.isSidechain || !d.message || !Array.isArray(d.message.content)) continue;
    for (const b of d.message.content) {
      if (!b || b.type !== 'tool_use') continue;
      const inp = b.input || {};
      if (b.name === 'TodoWrite' && Array.isArray(inp.todos)) {
        list = inp.todos.map((t) => ({ content: t.content || t.activeForm || '', status: t.status || 'pending' }));
      } else if (/update_plan$/.test(b.name) && Array.isArray(inp.items)) {
        list = inp.items.map((t) => ({ content: t.content || '', status: t.status || 'pending' }));
      } else if (/update_plan$/.test(b.name) && list && inp.advance) {
        const i = list.findIndex((t) => t.status === 'in_progress');
        if (i >= 0) { list[i].status = 'completed'; if (list[i + 1]) list[i + 1].status = 'in_progress'; }
      } else if (b.name === 'TaskCreate') {
        created += 1;
        byId.set(String(inp.id || inp.taskId || created), { content: inp.subject || inp.title || inp.description || '', status: 'pending' });
      } else if (b.name === 'TaskUpdate') {
        const t = byId.get(String(inp.id || inp.taskId));
        if (t && inp.status) t.status = inp.status;
      }
    }
  }
  const tasks = list || [...byId.values()];
  return tasks.filter((t) => t.status !== 'completed' && t.status !== 'deleted');
}

const DECISION_RE = /\b(decided|decision|we will|let's go with|agreed|do not|don't|never|always|must not|instead of|from now on)\b/i;

/** Decision-like sentences from the user's recent words and the assistant's "Decision:" lines. */
function decisions(lines, users) {
  const out = [];
  for (const u of users) {
    for (const s of u.split(/(?<=[.!?])\s+|\n+/)) if (DECISION_RE.test(s) && s.length < 400) out.push(`user: ${s.trim()}`);
  }
  for (const d of lines) {
    if (d.type !== 'assistant' || d.isSidechain || !d.message || !Array.isArray(d.message.content)) continue;
    for (const b of d.message.content) {
      if (!b || b.type !== 'text') continue;
      for (const s of b.text.split('\n')) if (/^\s*(\*\*)?decision(\*\*)?\s*:/i.test(s)) out.push(`assistant: ${s.trim()}`);
    }
  }
  return [...new Set(out)].slice(-30);
}

function run(cmd, args, cwd, timeout = 5000) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function gitFacts(cwd) {
  if (run('git', ['rev-parse', '--is-inside-work-tree'], cwd) !== 'true') return { branch: null };
  // symbolic-ref works before the first commit, where rev-parse --abbrev-ref HEAD fails.
  const branch = run('git', ['symbolic-ref', '--short', '-q', 'HEAD'], cwd) ||
    `(detached at ${run('git', ['rev-parse', '--short', 'HEAD'], cwd) || '?'})`;
  const status = (run('git', ['status', '--short'], cwd) || '').split('\n').filter(Boolean);
  const head = run('git', ['log', '-1', '--format=%h %s'], cwd);
  const prsRaw = run('gh', ['pr', 'list', '--state', 'open', '--author', '@me', '--json', 'number,title,url,headRefName', '--limit', '10'], cwd, 8000);
  let prs = null;
  try { prs = prsRaw ? JSON.parse(prsRaw) : null; } catch { prs = null; }
  return { branch, head, status, prs };
}

function render(p, lines, git, now = new Date()) {
  const users = recentUserInstructions(lines);
  const tasks = openTasks(lines);
  const dec = decisions(lines, users);
  const L = [];
  L.push(`# Compact journal — session ${p.session_id || '?'}`);
  L.push(`Written ${now.toISOString()} by hooks/compact-journal.js before a ${p.trigger || '?'} compaction. Facts only, no model call.`);
  L.push('', '## Where', `- cwd: ${p.cwd || '?'}`);
  if (git.branch) {
    L.push(`- git branch: ${git.branch}`, `- HEAD: ${git.head || '?'}`);
    const st = git.status || [];
    L.push(`- git status: ${st.length ? `${st.length} changed path(s)` : 'clean'}`);
    for (const s of st.slice(0, MAX_STATUS_LINES)) L.push(`    ${s}`);
    if (st.length > MAX_STATUS_LINES) L.push(`    ... ${st.length - MAX_STATUS_LINES} more`);
    if (git.prs === null) L.push('- open PRs: unavailable (gh not reachable)');
    else if (!git.prs.length) L.push('- open PRs: none by @me');
    else for (const pr of git.prs) L.push(`- open PR #${pr.number} [${pr.headRefName}] ${pr.title} — ${pr.url}`);
  } else {
    L.push('- git: not a repository');
  }
  L.push('', '## Open tasks');
  if (tasks.length) for (const t of tasks) L.push(`- [${t.status}] ${t.content}`);
  else L.push('- none recorded');
  if (p.custom_instructions) L.push('', '## /compact instructions', p.custom_instructions);
  L.push('', '## Decision-like lines (heuristic match, check against the instructions below)');
  if (dec.length) for (const d of dec) L.push(`- ${d}`);
  else L.push('- none matched');
  L.push('', `## Last ${users.length} user instruction(s), verbatim, oldest first`);
  users.forEach((u, i) => L.push('', `### ${i + 1}`, '```text', u.replace(/```/g, "'''"), '```'));
  return L.join('\n') + '\n';
}

/** Retention for journals (they hold verbatim user text): settings.cleanupPeriodDays, default 30. */
function retentionDays(settings) {
  const v = settings && settings.cleanupPeriodDays;
  return Number.isFinite(v) && v > 0 ? v : 30;
}

function readSettings(env = process.env) {
  try {
    const dir = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    return JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Deletes journal files (*.md, *.prev.md) not modified in `days` days. Returns how many it removed. */
function pruneJournals(dir, days, now = Date.now()) {
  let n = 0;
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return 0; }
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    const f = path.join(dir, name);
    try {
      if (now - fs.statSync(f).mtimeMs > days * 86400e3) { fs.unlinkSync(f); n += 1; }
    } catch { /* raced with another session */ }
  }
  return n;
}

function onPreCompact(p, env = process.env) {
  const text = p.transcript_path && fs.existsSync(p.transcript_path) ? fs.readFileSync(p.transcript_path, 'utf8') : '';
  const md = render(p, parseLines(text), gitFacts(p.cwd || process.cwd()));
  const jp = journalPath(p.session_id, env);
  fs.mkdirSync(path.dirname(jp), { recursive: true });
  if (fs.existsSync(jp)) fs.copyFileSync(jp, jp.replace(/\.md$/, '.prev.md'));
  fs.writeFileSync(jp, md, { mode: 0o600 });
  pruneJournals(path.dirname(jp), retentionDays(readSettings(env)));
  return jp;
}

/** Short, fixed guidance for the summariser; the journal itself is re-injected after compaction. */
function compactInstructions(jp) {
  return 'In the summary, keep every user instruction and constraint in the user\'s own words, every ' +
    'open task with its state, every decision with its reason, and every file path, branch, PR and ' +
    `command result still needed. A verbatim fact journal was saved to ${jp} and is re-injected ` +
    'after compaction; do not paraphrase what it already records.\n';
}

function onSessionStartCompact(p, env = process.env) {
  const jp = journalPath(p.session_id, env);
  if (!fs.existsSync(jp)) return null;
  let md = fs.readFileSync(jp, 'utf8');
  if (md.length > MAX_INJECT) md = md.slice(0, MAX_INJECT) + '\n[...journal cut at re-injection cap]\n';
  return '<compact-journal>\n' +
    'Facts recorded by a hook just before this session was compacted (no model wrote them). ' +
    'The user instructions below are the user\'s exact words and still apply; the open tasks and git ' +
    `state are as they were at compaction. Full file: ${jp}\n\n` + md + '</compact-journal>';
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const p = raw.trim() ? JSON.parse(raw) : {};
      if (p.hook_event_name === 'PreCompact') {
        // Claude Code uses a PreCompact hook's stdout as instructions for the summary (docs: hooks,
        // PreCompact output; must stay under 10,000 characters).
        process.stdout.write(compactInstructions(onPreCompact(p)));
      } else if (p.hook_event_name === 'SessionStart' && p.source === 'compact') {
        const ctx = onSessionStartCompact(p);
        if (ctx) {
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
          }));
        }
      }
    } catch (err) {
      process.stderr.write(`compact-journal: non-fatal error: ${err && err.message}\n`);
    }
    process.exit(0);
  });
}

if (require.main === module) main();
module.exports = {
  userText, recentUserInstructions, hasOriginLabels, pruneJournals, retentionDays, MAX_INJECT, openTasks, decisions, render, onPreCompact, onSessionStartCompact,
  journalPath, parseLines, gitFacts, compactInstructions,
};
