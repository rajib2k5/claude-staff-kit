#!/usr/bin/env node
/**
 * Status line: model, context used, session cost (API-equivalent), and subagent count/tokens.
 *
 *   Opus 5.5 | ctx 18% of 1M, 60% of 300k compact point | $3.41 API-eq | 4 subagents 812k tok
 *
 * Reads the status-line JSON Claude Code writes on stdin. Context %: `context_window.used_percentage`
 * when present; otherwise the last main-thread message's input-side tokens (input + cache read + cache
 * write) over `context_window.context_window_size`. The compact point is `autoCompactWindow` (per model
 * under modelSettings.<id>, else top level) from the user, project, local and managed settings files, or
 * CLAUDE_CODE_AUTO_COMPACT_WINDOW. When those disagree, or CLAUDE_AUTOCOMPACT_PCT_OVERRIDE is set, it shows
 * "compact point ?" instead of guessing. It is shown only when below the window, since otherwise the window
 * itself is the compact point. Cost: `cost.total_cost_usd` (Claude Code's own
 * API-equivalent figure for the session). Subagents: the ledger written by subagent-cost-ledger.js.
 *
 * Never throws: on any error it prints a short fallback so the status line is never blank.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let ledger = null;
try { ledger = require(path.join(__dirname, 'subagent-cost-ledger.js')); } catch { /* ledger optional */ }

/** Input-side tokens of the last main-thread assistant message, from the transcript tail. */
function lastContextTokens(transcriptPath, maxBytes = 400000) {
  try {
    const st = fs.statSync(transcriptPath);
    const start = Math.max(0, st.size - maxBytes);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const line of lines) {
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      const u = d && d.type === 'assistant' && !d.isSidechain && d.message && d.message.usage;
      if (!u || d.message.model === '<synthetic>') continue;
      return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    }
  } catch { /* no transcript yet */ }
  return null;
}

const fmtWin = (n) => (n >= 1e6 ? `${n / 1e6}M` : `${Math.round(n / 1e3)}k`);

/** autoCompactWindow in one settings object for this model: modelSettings.<id> first, then top level. */
function compactWindow(settings, modelId) {
  const st = settings || {};
  const id = String(modelId || '').replace(/\[.*\]$/, '');
  const per = st.modelSettings && st.modelSettings[id] && st.modelSettings[id].autoCompactWindow;
  const v = Number(per || st.autoCompactWindow);
  return Number.isFinite(v) && v > 0 ? v : null;
}

const MANAGED_PATHS = {
  linux: ['/etc/claude-code/managed-settings.json'],
  darwin: ['/Library/Application Support/ClaudeCode/managed-settings.json'],
  win32: ['C:\\Program Files\\ClaudeCode\\managed-settings.json'],
};

function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

/** Every settings file that can set the compact point: user, project, local, managed. Missing or broken files are skipped. */
function settingsSources(s, env = process.env, managed = MANAGED_PATHS[process.platform] || []) {
  const userDir = env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude');
  const proj = (s && s.workspace && s.workspace.project_dir) || (s && s.cwd) || null;
  const files = [path.join(userDir, 'settings.json')];
  if (proj) files.push(path.join(proj, '.claude', 'settings.json'), path.join(proj, '.claude', 'settings.local.json'));
  files.push(...managed);
  return files.map(readJson).filter((x) => x && typeof x === 'object');
}

/**
 * The compact point in tokens, or 'unknown', or null (not set: the window itself).
 * Claude Code's precedence between files and env vars is not reproduced here, so when two sources
 * disagree, or the percent override is set (not modelled), the answer is 'unknown' rather than a guess.
 */
function resolveCompactPoint(modelId, sources, env = {}) {
  const list = Array.isArray(sources) ? sources : [sources || {}];
  const envs = [env, ...list.map((x) => (x && x.env) || {})];
  if (envs.some((e) => e.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE !== undefined && e.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE !== '')) return 'unknown';
  const values = new Set();
  for (const st of list) {
    const v = compactWindow(st, modelId);
    if (v) values.add(v);
  }
  for (const e of envs) {
    const v = Number(e.CLAUDE_CODE_AUTO_COMPACT_WINDOW);
    if (e.CLAUDE_CODE_AUTO_COMPACT_WINDOW !== undefined && Number.isFinite(v) && v > 0) values.add(v);
  }
  if (values.size > 1) return 'unknown';
  return values.size ? [...values][0] : null;
}

function contextPart(s, sources = {}, env = {}) {
  const cw = s.context_window || {};
  const size = Number(cw.context_window_size) || null;
  let pct = typeof cw.used_percentage === 'number' ? cw.used_percentage : null;
  if (pct === null && size && s.transcript_path) {
    const used = lastContextTokens(s.transcript_path);
    if (used !== null) pct = (100 * used) / size;
  }
  if (pct === null) return 'ctx ?';
  let out = `ctx ${Math.round(pct)}%${size ? ` of ${fmtWin(size)}` : ''}`;
  const cp = resolveCompactPoint(s.model && s.model.id, sources, env);
  if (cp === 'unknown') out += ', compact point ?';
  else if (size && cp && cp < size) out += `, ${Math.round((pct * size) / cp)}% of ${fmtWin(cp)} compact point`;
  return out;
}

function render(s, lp, sources = {}, env = {}) {
  const parts = [];
  parts.push((s.model && (s.model.display_name || s.model.id)) || 'model ?');
  parts.push(contextPart(s, sources, env));
  const c = s.cost && typeof s.cost.total_cost_usd === 'number' ? s.cost.total_cost_usd : null;
  parts.push(c === null ? '$? API-eq' : `$${c.toFixed(2)} API-eq`);
  if (ledger && s.session_id) {
    const agents = ledger.sessionAgents(s.session_id, lp);
    if (agents.length) {
      const tok = agents.reduce((n, a) => n + Object.values(a.tokens || {}).reduce((x, y) => x + y, 0), 0);
      parts.push(`${agents.length} subagent${agents.length === 1 ? '' : 's'} ${ledger.fmtTok(tok)} tok`);
    }
  }
  return parts.join(' | ');
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const s = raw.trim() ? JSON.parse(raw) : {};
      process.stdout.write(render(s, ledger ? ledger.ledgerPath() : undefined, settingsSources(s), process.env));
    } catch {
      process.stdout.write('status ?');
    }
  });
}

if (require.main === module) main();
module.exports = { render, contextPart, lastContextTokens, compactWindow, resolveCompactPoint, settingsSources };
