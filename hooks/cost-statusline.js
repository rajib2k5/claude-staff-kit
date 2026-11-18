#!/usr/bin/env node
/**
 * Status line: model, context used, session cost (API-equivalent), and subagent count/tokens.
 *
 *   Opus 5.5 | ctx 18% of 1M, 60% to compact at 300k | $3.41 API-eq | 4 subagents 812k tok
 *
 * Reads the status-line JSON Claude Code writes on stdin. Context %: `context_window.used_percentage`
 * when present; otherwise the last main-thread message's input-side tokens (input + cache read + cache
 * write) over `context_window.context_window_size`. The compact point is `autoCompactWindow` from
 * ~/.claude/settings.json (per model under modelSettings.<id>, else top level); it is shown only when it
 * is below the window, since otherwise the window itself is the compact point. Cost: `cost.total_cost_usd` (Claude Code's own
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

/** autoCompactWindow for this model: modelSettings.<id> first, then the top-level setting. */
function compactWindow(settings, modelId) {
  const st = settings || {};
  const id = String(modelId || '').replace(/\[.*\]$/, '');
  const per = st.modelSettings && st.modelSettings[id] && st.modelSettings[id].autoCompactWindow;
  const v = Number(per || st.autoCompactWindow);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function readSettings(env = process.env) {
  try {
    const dir = env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude');
    return JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  } catch {
    return {};
  }
}

function contextPart(s, settings = {}) {
  const cw = s.context_window || {};
  const size = Number(cw.context_window_size) || null;
  let pct = typeof cw.used_percentage === 'number' ? cw.used_percentage : null;
  if (pct === null && size && s.transcript_path) {
    const used = lastContextTokens(s.transcript_path);
    if (used !== null) pct = (100 * used) / size;
  }
  if (pct === null) return 'ctx ?';
  let out = `ctx ${Math.round(pct)}%${size ? ` of ${fmtWin(size)}` : ''}`;
  const cwin = compactWindow(settings, s.model && s.model.id);
  if (size && cwin && cwin < size) {
    out += `, ${Math.round((pct * size) / cwin)}% to compact at ${fmtWin(cwin)}`;
  }
  return out;
}

function render(s, lp, settings = {}) {
  const parts = [];
  parts.push((s.model && (s.model.display_name || s.model.id)) || 'model ?');
  parts.push(contextPart(s, settings));
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
      process.stdout.write(render(raw.trim() ? JSON.parse(raw) : {}, ledger ? ledger.ledgerPath() : undefined, readSettings()));
    } catch {
      process.stdout.write('status ?');
    }
  });
}

if (require.main === module) main();
module.exports = { render, contextPart, lastContextTokens, compactWindow };
