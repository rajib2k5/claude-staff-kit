// Tests for subagent-model-guard.js. Run: node --test hooks/subagent-model-guard.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { decide } = require('./subagent-model-guard.js');

const HOOK = path.join(__dirname, 'subagent-model-guard.js');
const ON = { CLAUDE_AGENT_GUARD_REQUIRE_EFFORT: '1' };
const OFF = { CLAUDE_AGENT_GUARD_REQUIRE_EFFORT: '0' };

function runHook(payload, env = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('a launch with no model is denied, and the reason carries the rubric', () => {
  const v = decide('Agent', { prompt: 'x', subagent_type: 'implementer', effort: 'medium' }, ON);
  assert.equal(v.decision, 'deny');
  assert.match(v.reason, /no explicit `model`/);
  assert.match(v.reason, /model "sonnet", effort "low"/);
});

test('a launch with a model but no effort is denied when effort is required', () => {
  const v = decide('Agent', { prompt: 'x', model: 'sonnet' }, ON);
  assert.equal(v.decision, 'deny');
  assert.match(v.reason, /no explicit `effort`/);
  assert.doesNotMatch(v.reason, /no explicit `model`/);
});

test('effort is not required when CLAUDE_AGENT_GUARD_REQUIRE_EFFORT=0', () => {
  assert.equal(decide('Agent', { prompt: 'x', model: 'sonnet' }, OFF), null);
  assert.equal(decide('Agent', { prompt: 'x' }, OFF).decision, 'deny');
});

test('model and effort both set is allowed', () => {
  assert.equal(decide('Agent', { model: 'opus', effort: 'high' }, ON), null);
  assert.equal(decide('Agent', { model: 'fable', effort: 'xhigh' }, ON), null);
});

test('a full model id is refused: the Agent tool takes aliases only', () => {
  assert.match(decide('Agent', { model: 'claude-sonnet-5-5', effort: 'low' }, ON).reason, /takes an alias/);
});

test('the older tool name Task is guarded the same way', () => {
  assert.equal(decide('Task', { prompt: 'x' }, ON).decision, 'deny');
});

test('a fork launch is exempt even with neither field', () => {
  assert.equal(decide('Agent', { subagent_type: 'fork', prompt: 'x' }, ON), null);
});

test('unknown model and effort values are denied (a typo must not fall back silently)', () => {
  assert.match(decide('Agent', { model: 'opsu', effort: 'high' }, ON).reason, /unknown model "opsu"/);
  assert.match(decide('Agent', { model: 'opus', effort: 'huge' }, ON).reason, /unknown effort "huge"/);
  assert.match(decide('Agent', { model: '  ', effort: 'high' }, ON).reason, /no explicit `model`/);
});

test('other tools are never touched', () => {
  assert.equal(decide('Bash', { command: 'ls' }, ON), null);
  assert.equal(decide('Workflow', {}, ON), null);
});

test('process: deny is emitted as PreToolUse permissionDecision JSON, exit 0', () => {
  const r = runHook({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { prompt: 'x' } }, ON);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.out);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('process: an allowed launch prints nothing', () => {
  const r = runHook({ tool_name: 'Agent', tool_input: { model: 'sonnet', effort: 'low' } }, ON);
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});

test('process: unparseable input fails open with a stderr note', () => {
  const r = runHook('{not json', ON);
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.match(r.err, /allowing/);
});

test('an adversarial-reviewer launch on any model but opus is denied', () => {
  for (const m of ['sonnet', 'haiku', 'fable']) {
    const v = decide('Agent', { prompt: 'x', subagent_type: 'adversarial-reviewer', model: m, effort: 'high' }, ON);
    assert.equal(v && v.decision, 'deny', m);
    assert.match(v.reason, /adversarial-reviewer runs on opus/);
  }
  assert.equal(decide('Agent', { prompt: 'x', subagent_type: 'adversarial-reviewer', model: 'opus', effort: 'high' }, ON), null);
  assert.equal(decide('Agent', { prompt: 'x', subagent_type: 'adversarial-reviewer', model: ' opus ', effort: 'high' }, ON), null);
});

test('the opus rule for adversarial-reviewer holds even when effort is not required', () => {
  const v = decide('Agent', { prompt: 'x', subagent_type: 'adversarial-reviewer', model: 'sonnet' }, OFF);
  assert.equal(v && v.decision, 'deny');
  assert.equal(decide('Agent', { prompt: 'x', subagent_type: 'implementer', model: 'sonnet' }, OFF), null);
});

test('regression: the opus-only rule holds for namespaced, mixed-case and padded subagent types', () => {
  for (const t of ['staff-kit:adversarial-reviewer', 'Adversarial-Reviewer', '  adversarial-reviewer ', 'my.plugin-2:ADVERSARIAL-REVIEWER']) {
    const v = decide('Agent', { prompt: 'x', subagent_type: t, model: 'sonnet', effort: 'high' }, ON);
    assert.equal(v && v.decision, 'deny', t);
    assert.equal(decide('Agent', { prompt: 'x', subagent_type: t, model: 'opus', effort: 'high' }, ON), null, t);
  }
  // A different agent whose name only contains the word is not caught.
  assert.equal(decide('Agent', { prompt: 'x', subagent_type: 'adversarial-reviewer-notes', model: 'sonnet', effort: 'high' }, ON), null);
});

test('process: a null or non-object payload exits 0 with no output', () => {
  for (const p of ['null', '42', '"x"', '[]']) {
    const r = runHook(p);
    assert.equal(r.code, 0, `${p}: ${r.err}`);
    assert.equal(r.out, '', p);
  }
});
