// Tests for subagent-cost-ledger.js and cost-statusline.js. Run: node --test hooks/subagent-cost-ledger.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const L = require('./subagent-cost-ledger.js');
const S = require('./cost-statusline.js');

const HOOK = path.join(__dirname, 'subagent-cost-ledger.js');
const STATUS = path.join(__dirname, 'cost-statusline.js');
const PRICES = {
  as_of: '2026-11-17', source: 'test',
  models: {
    'claude-opus-5-5': { input: 4, cache_write_5m: 5, cache_write_1h: 8, cache_read: 0.2, output: 20 },
    'claude-sonnet-5-5': { input: 2, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.1, output: 10 },
  },
};

/** One assistant transcript line, the shape Claude Code 2.1.296 writes. */
// Every real line carries its own uuid, so a dedup keyed on uuid would count each content block again.
let seq = 0;
function aline(id, model, u, extra = {}) {
  seq += 1;
  return JSON.stringify({ type: 'assistant', uuid: `u-${seq}`, ...extra, message: { id, model, usage: u, content: [] } });
}
const U = (i, o, cr, cw, cw1h = 0) => ({
  input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw,
  cache_creation: { ephemeral_1h_input_tokens: cw1h, ephemeral_5m_input_tokens: cw - cw1h },
});

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'scl-')); }

test('usage repeated across content-block lines of one message is counted once (last line wins)', () => {
  const text = [
    aline('m1', 'claude-sonnet-5-5', U(10, 5, 100, 50)),
    aline('m1', 'claude-sonnet-5-5', U(10, 40, 100, 50)),
    aline('m2', 'claude-sonnet-5-5', U(1, 2, 3, 4)),
  ].join('\n');
  const t = L.sumUsage(text)['claude-sonnet-5-5'];
  assert.deepEqual(t, { input: 11, output: 42, cache_read: 103, cache_write_5m: 54, cache_write_1h: 0 });
});

test('1h cache writes are split out from the 5m ones', () => {
  const t = L.sumUsage(aline('m', 'claude-opus-5-5', U(0, 0, 0, 100, 30)))['claude-opus-5-5'];
  assert.equal(t.cache_write_1h, 30);
  assert.equal(t.cache_write_5m, 70);
});

test('the sidechain filter keeps main-thread and subagent tokens apart; synthetic lines are ignored', () => {
  const text = [
    aline('a', 'claude-opus-5-5', U(1, 1, 0, 0)),
    aline('b', 'claude-opus-5-5', U(100, 0, 0, 0), { isSidechain: true }),
    aline('c', '<synthetic>', U(999, 999, 0, 0)),
  ].join('\n');
  assert.equal(L.sumUsage(text, { sidechain: false })['claude-opus-5-5'].input, 1);
  assert.equal(L.sumUsage(text, { sidechain: true })['claude-opus-5-5'].input, 100);
  assert.equal(L.sumUsage(text)['<synthetic>'], undefined);
});

test('USD uses every price column: 1M of each token kind on opus is 4+20+0.2+5+8 = 37.2', () => {
  const t = { input: 1e6, output: 1e6, cache_read: 1e6, cache_write_5m: 1e6, cache_write_1h: 1e6 };
  assert.equal(L.usd('claude-opus-5-5', t, PRICES), 37.2);
});

test('price lookup matches dated ids and [1m] suffixes, and never guesses an unknown model', () => {
  assert.equal(L.priceKey('claude-sonnet-5-5-20261001', PRICES), 'claude-sonnet-5-5');
  assert.equal(L.priceKey('claude-opus-5-5[1m]', PRICES), 'claude-opus-5-5');
  assert.equal(L.priceKey('claude-opus-5', PRICES), null);
  assert.equal(L.usd('claude-opus-5', { input: 1, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0 }, PRICES), null);
});

test('the shipped price table is dated, sourced, and prices every current model', () => {
  const p = L.loadPrices();
  assert.match(p.as_of, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(p.source, /^https:\/\/platform\.claude\.com\//);
  for (const m of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2']) {
    assert.ok(p.models[m], m);
    for (const k of ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h']) assert.equal(typeof p.models[m][k], 'number');
  }
});

test('the subagent transcript path falls back to <session>/subagents/agent-<id>.jsonl', () => {
  assert.equal(L.agentTranscript({ agent_transcript_path: '/x/a.jsonl', transcript_path: '/p/s.jsonl', agent_id: 'q' }), '/x/a.jsonl');
  assert.equal(L.agentTranscript({ transcript_path: '/p/s1.jsonl', agent_id: 'q' }), '/p/s1/subagents/agent-q.jsonl');
});

test('process: SubagentStop appends one ledger line with model, tokens, USD and the price source', () => {
  const dir = tmp();
  const at = path.join(dir, 'agent-x.jsonl');
  fs.writeFileSync(at, aline('m', 'claude-sonnet-5-5', U(1000, 1000, 0, 0), { isSidechain: true }) + '\n');
  const lp = path.join(dir, 'ledger.jsonl');
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'SubagentStop', session_id: 's', agent_id: 'x', agent_type: 'implementer', agent_transcript_path: at }),
    env: { ...process.env, CLAUDE_COST_LEDGER: lp }, encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  const lines = fs.readFileSync(lp, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.model, 'claude-sonnet-5-5');
  assert.equal(rec.agent_type, 'implementer');
  assert.deepEqual(rec.tokens, { input: 1000, output: 1000, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0 });
  assert.equal(rec.usd_api_equivalent, 0.012); // 1000*2/1e6 + 1000*10/1e6
  assert.match(rec.price_table.source, /pricing/);
});

test('a resumed agent gets a second cumulative line; the session view keeps only the last per agent', () => {
  const dir = tmp();
  const lp = path.join(dir, 'l.jsonl');
  const mk = (agent, input) => JSON.stringify({ session_id: 's', agent_id: agent, tokens: { input }, usd_api_equivalent: input });
  fs.writeFileSync(lp, [mk('a', 1), mk('a', 5), mk('b', 2), '{torn', JSON.stringify({ session_id: 'other', agent_id: 'z' })].join('\n'));
  const got = L.sessionAgents('s', lp).map((r) => [r.agent_id, r.tokens.input]).sort();
  assert.deepEqual(got, [['a', 5], ['b', 2]]);
});

test('Stop reports the session total once, then stays quiet until it moves', () => {
  const dir = tmp();
  const lp = path.join(dir, 'l.jsonl');
  const tp = path.join(dir, 's.jsonl');
  fs.writeFileSync(tp, aline('m', 'claude-opus-5-5', U(1000, 0, 0, 0)) + '\n');
  const p = { hook_event_name: 'Stop', session_id: 's', transcript_path: tp };
  const first = L.onStop(p, PRICES, lp);
  assert.match(first, /API-equivalent \$0\.00/);
  assert.match(first, /main 1\.0k/);
  assert.equal(L.onStop(p, PRICES, lp), null);
  fs.appendFileSync(tp, aline('m2', 'claude-opus-5-5', U(0, 1000, 0, 0)) + '\n');
  assert.match(L.onStop(p, PRICES, lp), /main 2\.0k/);
  assert.equal(L.onStop({ ...p, stop_hook_active: true }, PRICES, lp), null);
});

test('process: bad input fails open', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: '{nope', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /non-fatal/);
});

test('regression: a line written before the transcript flushed (zero tokens) is repaired at Stop', () => {
  const dir = tmp();
  const lp = path.join(dir, 'l.jsonl');
  const at = path.join(dir, 'agent-z.jsonl');
  fs.writeFileSync(at, '');
  L.onSubagentStop({ session_id: 's', agent_id: 'z', agent_type: 'Explore', agent_transcript_path: at }, PRICES, lp, { settle: false });
  assert.equal(L.sessionAgents('s', lp)[0].tokens.output, 0);
  assert.equal(L.sessionAgents('s', lp)[0].tokens_known, false);
  fs.writeFileSync(at, aline('m', 'claude-sonnet-5-5', U(2, 52, 0, 0), { isSidechain: true }) + '\n'); // the late flush
  assert.equal(L.repairZeroLines('s', PRICES, lp), 1);
  const r = L.sessionAgents('s', lp)[0];
  assert.equal(r.tokens.output, 52);
  assert.equal(r.repaired, true);
  assert.equal(r.tokens_known, true);
  assert.equal(L.repairZeroLines('s', PRICES, lp), 0);
});

test('regression: the SubagentStop settle wait picks up a write that lands after the hook starts', () => {
  const dir = tmp();
  const at = path.join(dir, 'agent-w.jsonl');
  fs.writeFileSync(at, '{"type":"user"}\n');
  // The late write lands 150 ms after the hook starts reading, as in the live race.
  require('node:child_process').spawn(process.execPath, ['-e',
    `setTimeout(()=>require('fs').appendFileSync(${JSON.stringify(at)}, ${JSON.stringify(aline('m', 'claude-sonnet-5-5', U(1, 7, 0, 0)) + '\n')}),150)`],
    { stdio: 'ignore' });
  const rec = L.ledgerRecord({ agent_id: 'w', agent_transcript_path: at }, PRICES, new Date(), { settle: true, quietMs: 400, maxMs: 3000 });
  assert.equal(rec.tokens.output, 7);
});

test('regression: priceKey accepts only an exact id or an 8-digit date suffix; newer versions are unpriced', () => {
  const P = { models: { 'claude-opus-5': {}, 'claude-sonnet-5': {}, 'claude-opus-5-5': {} } };
  assert.equal(L.priceKey('claude-opus-5-6', P), null);
  assert.equal(L.priceKey('claude-sonnet-5-6', P), null);
  assert.equal(L.priceKey('claude-opus-5-20260101', P), 'claude-opus-5');
  assert.equal(L.priceKey('claude-opus-5-5-20261001', P), 'claude-opus-5-5');
  assert.equal(L.priceKey('claude-opus-5-2026', P), null);
  assert.equal(L.priceKey('claude-opus-5-5[1m]', P), 'claude-opus-5-5');
});

test('regression: a ledger line for a transcript not yet on disk keeps its path, and Stop re-counts it later', () => {
  const dir = tmp();
  const lp = path.join(dir, 'l.jsonl');
  const at = path.join(dir, 'agent-late.jsonl'); // does not exist at SubagentStop
  const rec = L.onSubagentStop({ session_id: 's', agent_id: 'late', agent_transcript_path: at }, PRICES, lp, { settle: false });
  assert.equal(rec.transcript, at);
  assert.equal(rec.tokens_known, false);
  fs.writeFileSync(at, aline('m', 'claude-sonnet-5-5', U(3, 9, 0, 0), { isSidechain: true }) + '\n');
  assert.equal(L.repairZeroLines('s', PRICES, lp), 1);
  assert.equal(L.sessionAgents('s', lp)[0].tokens.output, 9);
});

test('a model whose price row has a prompt-size tier is flagged when one call exceeds it', () => {
  const P = { as_of: 'x', source: 'x', models: { 'claude-haiku-5-5': { input: 1, output: 1, cache_read: 1, cache_write_5m: 1, cache_write_1h: 1, tier_max_prompt_tokens: 100000 } } };
  const dir = tmp();
  const small = path.join(dir, 'a.jsonl');
  const big = path.join(dir, 'b.jsonl');
  fs.writeFileSync(small, aline('m1', 'claude-haiku-5-5', U(1000, 10, 99000, 0)) + '\n');
  fs.writeFileSync(big, aline('m1', 'claude-haiku-5-5', U(1000, 10, 99000, 1)) + '\n');
  assert.deepEqual(L.ledgerRecord({ agent_transcript_path: small }, P).price_tier_exceeded, []);
  assert.deepEqual(L.ledgerRecord({ agent_transcript_path: big }, P).price_tier_exceeded, ['claude-haiku-5-5']);
});

test('the shipped Haiku 5.5 row carries its 100k prompt tier', () => {
  assert.equal(L.loadPrices().models['claude-haiku-5-5'].tier_max_prompt_tokens, 100000);
});

// --- status line -------------------------------------------------------------------------------

test('status line shows model, used_percentage, API-equivalent cost and subagents', () => {
  const dir = tmp();
  const lp = path.join(dir, 'l.jsonl');
  fs.writeFileSync(lp, JSON.stringify({ session_id: 's', agent_id: 'a', tokens: { input: 1500, output: 500 } }) + '\n');
  const out = S.render({
    session_id: 's', model: { display_name: 'Opus 5.5' }, cost: { total_cost_usd: 3.456 },
    context_window: { used_percentage: 12.4, context_window_size: 1000000 },
  }, lp);
  assert.equal(out, 'Opus 5.5 | ctx 12% of 1M | $3.46 API-eq | 1 subagent 2.0k tok');
});

test('status line falls back to the transcript when used_percentage is null', () => {
  const dir = tmp();
  const tp = path.join(dir, 't.jsonl');
  fs.writeFileSync(tp, [aline('a', 'claude-opus-5-5', U(1, 0, 0, 0)), aline('b', 'claude-opus-5-5', U(10000, 0, 30000, 10000)),
    aline('c', 'claude-opus-5-5', U(99999, 0, 0, 0), { isSidechain: true })].join('\n'));
  assert.equal(S.contextPart({ transcript_path: tp, context_window: { used_percentage: null, context_window_size: 200000 } }), 'ctx 25% of 200k');
  assert.equal(S.contextPart({}), 'ctx ?');
});

test('process: status line never prints an empty line on bad input', () => {
  const r = spawnSync(process.execPath, [STATUS], { input: 'garbage', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'status ?');
});

test('status line skips a trailing <synthetic> line when it reads context from the transcript', () => {
  const dir = tmp();
  const tp = path.join(dir, 't.jsonl');
  fs.writeFileSync(tp, [aline('b', 'claude-opus-5-5', U(10000, 0, 30000, 10000)), aline('s', '<synthetic>', U(0, 0, 0, 0))].join('\n'));
  assert.equal(S.contextPart({ transcript_path: tp, context_window: { used_percentage: null, context_window_size: 200000 } }), 'ctx 25% of 200k');
});

test('status line shows how far the session is toward the auto-compact point', () => {
  const s = { model: { id: 'claude-opus-5-5[1m]' }, context_window: { used_percentage: 12, context_window_size: 1000000 } };
  // 120k used of a 300k compact point = 40%.
  assert.equal(S.contextPart(s, { autoCompactWindow: 300000 }), 'ctx 12% of 1M, 40% to compact at 300k');
  // A per-model window wins over the top-level one.
  assert.equal(S.contextPart(s, { autoCompactWindow: 300000, modelSettings: { 'claude-opus-5-5': { autoCompactWindow: 200000 } } }),
    'ctx 12% of 1M, 60% to compact at 200k');
  // No setting, or one at/above the window: the compact point is the window itself, shown once.
  assert.equal(S.contextPart(s, {}), 'ctx 12% of 1M');
  assert.equal(S.contextPart(s, { autoCompactWindow: 2000000 }), 'ctx 12% of 1M');
});

test('render passes the settings through to the context part', () => {
  const out = S.render({ model: { display_name: 'Opus 5.5', id: 'claude-opus-5-5' }, cost: { total_cost_usd: 1 },
    context_window: { used_percentage: 15, context_window_size: 1000000 } }, undefined, { autoCompactWindow: 300000 });
  assert.equal(out, 'Opus 5.5 | ctx 15% of 1M, 50% to compact at 300k | $1.00 API-eq');
});
