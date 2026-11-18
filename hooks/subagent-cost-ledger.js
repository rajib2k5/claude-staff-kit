#!/usr/bin/env node
/**
 * Subagent cost ledger. One file, two events (branches on hook_event_name):
 *
 *   SubagentStop -> reads the finished subagent's own transcript, sums its tokens per model
 *                   (input, output, cache read, cache write 5m / 1h) and appends ONE JSON line to the
 *                   ledger: who ran, on which model, how many tokens, and the API-equivalent USD.
 *   Stop         -> prints a one-line session total (main thread + subagents) as a systemMessage,
 *                   but only when the total moved since the last report, so idle turns stay quiet.
 *
 * Dollars are "API-equivalent": what the same tokens would cost at the public per-token API price in
 * hooks/lib/model-prices.json (dated, with its source). On a Max plan nothing is billed per token;
 * the tokens are the real budget, so the line always shows tokens first.
 *
 * Ledger: $CLAUDE_COST_LEDGER, default ~/.claude/cost-ledger/subagents.jsonl. A subagent that is
 * resumed (SendMessage) stops again and gets a second, cumulative line; readers take the LAST line per
 * (session_id, agent_id). Transcript lines repeat one API message per content block, so usage is
 * counted once per message.id.
 *
 * Fails OPEN on any error (stderr note, exit 0): cost reporting must never block work.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PRICES_PATH = path.join(__dirname, 'lib', 'model-prices.json');

function ledgerPath(env = process.env) {
  return env.CLAUDE_COST_LEDGER || path.join(os.homedir(), '.claude', 'cost-ledger', 'subagents.jsonl');
}

function loadPrices(p = PRICES_PATH) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Map a model id (claude-opus-5-5, claude-sonnet-5-5-20261001, opus[1m]) to a price-table key. */
function priceKey(model, prices) {
  if (!model) return null;
  const m = String(model).replace(/\[.*\]$/, '');
  const keys = Object.keys(prices.models).sort((a, b) => b.length - a.length);
  return keys.find((k) => m === k || m.startsWith(k + '-')) || null;
}

const ZERO = () => ({ input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0 });

/**
 * Sum usage from transcript JSONL text, once per API message id.
 * @param {string} text
 * @param {{sidechain?: boolean|null}} opts  true: only isSidechain lines; false: only main-thread lines; null: all
 * @returns {Object<string, ReturnType<ZERO>>} tokens per model
 */
function sumUsage(text, opts = {}) {
  const want = opts.sidechain === undefined ? null : opts.sidechain;
  const byMsg = new Map();
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.type !== 'assistant' || !d.message || !d.message.usage) continue;
    if (want !== null && Boolean(d.isSidechain) !== want) continue;
    const model = d.message.model || 'unknown';
    if (model === '<synthetic>') continue;
    const id = d.message.id || `${d.requestId || ''}:${d.uuid || byMsg.size}`;
    byMsg.set(id, { model, u: d.message.usage }); // last line for an id wins: it carries the final output count
  }
  const out = {};
  for (const { model, u } of byMsg.values()) {
    const t = (out[model] ||= ZERO());
    const cc = u.cache_creation || {};
    const w1h = Number(cc.ephemeral_1h_input_tokens) || 0;
    const wAll = Number(u.cache_creation_input_tokens) || 0;
    t.input += Number(u.input_tokens) || 0;
    t.output += Number(u.output_tokens) || 0;
    t.cache_read += Number(u.cache_read_input_tokens) || 0;
    t.cache_write_1h += w1h;
    t.cache_write_5m += Math.max(0, wAll - w1h);
  }
  return out;
}

/** API-equivalent USD for one model's tokens; null when the model has no price row. */
function usd(model, t, prices) {
  const k = priceKey(model, prices);
  if (!k) return null;
  const p = prices.models[k];
  const per = 1e6;
  const v = (t.input * p.input + t.output * p.output + t.cache_read * p.cache_read +
    t.cache_write_5m * p.cache_write_5m + t.cache_write_1h * p.cache_write_1h) / per;
  return Math.round(v * 1e4) / 1e4;
}

function totals(byModel) {
  const t = ZERO();
  for (const v of Object.values(byModel)) for (const k of Object.keys(t)) t[k] += v[k];
  return t;
}

function sumUsd(byModel, prices) {
  let s = 0;
  let unpriced = [];
  for (const [m, t] of Object.entries(byModel)) {
    const v = usd(m, t, prices);
    if (v === null) unpriced.push(m); else s += v;
  }
  return { usd: Math.round(s * 1e4) / 1e4, unpriced };
}

/** Where the subagent's transcript is: the payload field, else <session dir>/subagents/agent-<id>.jsonl. */
function agentTranscript(p) {
  if (p.agent_transcript_path) return p.agent_transcript_path;
  if (p.transcript_path && p.agent_id) {
    const dir = path.join(path.dirname(p.transcript_path), path.basename(p.transcript_path, '.jsonl'), 'subagents');
    return path.join(dir, `agent-${p.agent_id}.jsonl`);
  }
  return null;
}

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Claude Code writes transcripts asynchronously, so at SubagentStop the last assistant line may not be
 * on disk yet (observed live on 2.1.296: the hook read the file 60 ms before its final write and
 * recorded zero tokens). Wait until the size is unchanged for `quietMs`, at most `maxMs`.
 */
function waitForSettle(fp, quietMs = 300, maxMs = 4000) {
  const size = () => { try { return fs.statSync(fp).size; } catch { return -1; } };
  const t0 = Date.now();
  let last = size();
  while (Date.now() - t0 < maxMs) {
    sleepMs(quietMs);
    const now = size();
    if (now === last && now > 0) return;
    last = now;
  }
}

/** Build the ledger record for a SubagentStop payload. Pure apart from reading the transcript. */
function ledgerRecord(p, prices, now = new Date(), opts = {}) {
  const tp = agentTranscript(p);
  if (tp && opts.settle) waitForSettle(tp, opts.quietMs, opts.maxMs);
  const text = tp && fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : '';
  const byModel = sumUsage(text, { sidechain: null });
  const models = Object.keys(byModel);
  const { usd: total, unpriced } = sumUsd(byModel, prices);
  return {
    ts: now.toISOString(),
    session_id: p.session_id || null,
    agent_id: p.agent_id || null,
    agent_type: p.agent_type || null,
    model: models.length === 1 ? models[0] : models.length ? models : null,
    tokens: totals(byModel),
    by_model: byModel,
    usd_api_equivalent: total,
    unpriced_models: unpriced,
    price_table: { as_of: prices.as_of, source: prices.source },
    transcript: tp && fs.existsSync(tp) ? tp : null,
    // Absence is not zero: no transcript, or one with no usage yet, means the tokens are UNKNOWN.
    tokens_known: models.length > 0,
  };
}

/** Last ledger line per (session, agent) for one session. */
function sessionAgents(sessionId, lp = ledgerPath()) {
  if (!fs.existsSync(lp)) return [];
  const last = new Map();
  for (const line of fs.readFileSync(lp, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.session_id === sessionId) last.set(r.agent_id, r);
    } catch { /* a torn line from a crash is skipped, not fatal */ }
  }
  return [...last.values()];
}

const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const allTok = (t) => t.input + t.output + t.cache_read + t.cache_write_5m + t.cache_write_1h;

/** Session summary: main thread from the session transcript, subagents from the ledger. */
function sessionSummary(p, prices, lp = ledgerPath()) {
  const text = p.transcript_path && fs.existsSync(p.transcript_path) ? fs.readFileSync(p.transcript_path, 'utf8') : '';
  const main = sumUsage(text, { sidechain: false });
  const mainT = totals(main);
  const mainUsd = sumUsd(main, prices).usd;
  const agents = sessionAgents(p.session_id, lp);
  const subT = ZERO();
  let subUsd = 0;
  for (const a of agents) {
    for (const k of Object.keys(subT)) subT[k] += (a.tokens && a.tokens[k]) || 0;
    subUsd += a.usd_api_equivalent || 0;
  }
  return {
    main_tokens: allTok(mainT), main_usd: mainUsd,
    sub_tokens: allTok(subT), sub_usd: Math.round(subUsd * 1e4) / 1e4, subagents: agents.length,
  };
}

function summaryLine(s) {
  const total = Math.round((s.main_usd + s.sub_usd) * 100) / 100;
  return `Session tokens: main ${fmtTok(s.main_tokens)}, ${s.subagents} subagent(s) ${fmtTok(s.sub_tokens)}. ` +
    `API-equivalent $${total.toFixed(2)} (main $${s.main_usd.toFixed(2)}, subagents $${s.sub_usd.toFixed(2)}; ` +
    'Max plan: tokens are the budget, not dollars).';
}

/** State file so Stop reports only when the total moved. */
function statePath(sessionId, lp = ledgerPath()) {
  return path.join(path.dirname(lp), `.last-report-${String(sessionId).replace(/[^\w.-]/g, '_')}`);
}

/**
 * Re-count any of this session's ledger lines that recorded zero tokens while their transcript now has
 * usage (the SubagentStop race above, if the settle wait was not enough). Appends a corrected line;
 * readers take the last line per agent. Returns the number repaired.
 */
function repairZeroLines(sessionId, prices, lp = ledgerPath()) {
  let n = 0;
  for (const r of sessionAgents(sessionId, lp)) {
    const t = r.tokens || {};
    if (!r.transcript || Object.values(t).some((v) => v > 0)) continue;
    const fixed = ledgerRecord({ session_id: r.session_id, agent_id: r.agent_id, agent_type: r.agent_type,
      agent_transcript_path: r.transcript }, prices);
    if (Object.values(fixed.tokens).some((v) => v > 0)) {
      fixed.repaired = true;
      fs.appendFileSync(lp, JSON.stringify(fixed) + '\n');
      n += 1;
    }
  }
  return n;
}

function onStop(p, prices, lp = ledgerPath()) {
  if (p.stop_hook_active || !p.session_id) return null;
  repairZeroLines(p.session_id, prices, lp);
  const s = sessionSummary(p, prices, lp);
  const key = `${s.main_tokens}:${s.sub_tokens}:${s.subagents}`;
  const sp = statePath(p.session_id, lp);
  let prev = '';
  try { prev = fs.readFileSync(sp, 'utf8'); } catch { /* first report */ }
  if (prev === key || (s.main_tokens === 0 && s.subagents === 0)) return null;
  fs.mkdirSync(path.dirname(sp), { recursive: true });
  fs.writeFileSync(sp, key);
  return summaryLine(s);
}

function onSubagentStop(p, prices, lp = ledgerPath(), opts = { settle: true }) {
  const rec = ledgerRecord(p, prices, new Date(), opts);
  fs.mkdirSync(path.dirname(lp), { recursive: true });
  fs.appendFileSync(lp, JSON.stringify(rec) + '\n');
  return rec;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const p = raw.trim() ? JSON.parse(raw) : {};
      const prices = loadPrices();
      if (p.hook_event_name === 'SubagentStop') onSubagentStop(p, prices);
      else if (p.hook_event_name === 'Stop') {
        const line = onStop(p, prices);
        if (line) process.stdout.write(JSON.stringify({ systemMessage: line }));
      }
    } catch (err) {
      process.stderr.write(`subagent-cost-ledger: non-fatal error: ${err && err.message}\n`);
    }
    process.exit(0);
  });
}

if (require.main === module) main();
module.exports = {
  sumUsage, usd, priceKey, totals, ledgerRecord, agentTranscript, sessionAgents, sessionSummary,
  summaryLine, onStop, onSubagentStop, loadPrices, ledgerPath, fmtTok, repairZeroLines, waitForSettle,
};
