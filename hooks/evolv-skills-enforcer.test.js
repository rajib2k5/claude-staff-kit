#!/usr/bin/env node
/**
 * Tests for evolv-skills-enforcer.js.
 *   node --test hooks/evolv-skills-enforcer.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { shouldWarn, stripOwnBlocks, pluginRootHint } = require('./evolv-skills-enforcer.js');

const HOOK = path.join(__dirname, 'evolv-skills-enforcer.js');

function runHook(stdin, env = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: stdin,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: '', ...env },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const POLICY_IN_TRANSCRIPT =
  '{"type":"system","content":"<mandatory-skills-policy>\\nNever write \\"tests pass\\" or ' +
  '\\"verified\\" without a command executed in THIS session.\\n</mandatory-skills-policy>"}\n';

// --- shouldWarn / stripOwnBlocks ------------------------------------------------------------

test('the policy text alone does not trigger a warning (regression: it quotes "tests pass")', () => {
  const tail = POLICY_IN_TRANSCRIPT + '{"type":"assistant","content":"What would you like to do next?"}';
  assert.equal(shouldWarn(tail), false);
});

test('a tail that starts mid-policy (cut by the byte window) is cleaned up to the closing tag', () => {
  const tail = 'without a command. "tests pass"\\n</mandatory-skills-policy>"}\n{"type":"assistant","content":"Done."}';
  assert.equal(stripOwnBlocks(tail).includes('tests pass'), false);
  assert.equal(shouldWarn(tail), false);
});

test('a verification claim with no executed command warns', () => {
  const tail = POLICY_IN_TRANSCRIPT + '{"type":"assistant","content":"All tests pass and the build is green."}';
  assert.equal(shouldWarn(tail), true);
});

test('a verification claim backed by command output does not warn', () => {
  const tail =
    POLICY_IN_TRANSCRIPT +
    '{"type":"tool_result","content":"$ npm test\\nTests 12 passed (12)"}\n' +
    '{"type":"assistant","content":"Tests pass: 12/12."}';
  assert.equal(shouldWarn(tail), false);
});

test('empty tail never warns', () => {
  assert.equal(shouldWarn(''), false);
  assert.equal(shouldWarn(undefined), false);
});

// --- pluginRootHint ---------------------------------------------------------------------------

test('pluginRootHint is empty without CLAUDE_PLUGIN_ROOT and names the root with it', () => {
  const saved = process.env.CLAUDE_PLUGIN_ROOT;
  delete process.env.CLAUDE_PLUGIN_ROOT;
  assert.equal(pluginRootHint(), '');
  process.env.CLAUDE_PLUGIN_ROOT = '/x/kit';
  assert.match(pluginRootHint(), /<staff-kit-root>[\s\S]*\/x\/kit\/rules\/README\.md[\s\S]*<\/staff-kit-root>/);
  if (saved === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
  else process.env.CLAUDE_PLUGIN_ROOT = saved;
});

// --- process contract (fail open, valid JSON) -------------------------------------------------

test('SessionStart emits the policy as additionalContext and exits 0', () => {
  const r = runHook(JSON.stringify({ hook_event_name: 'SessionStart' }));
  assert.equal(r.code, 0);
  const out = JSON.parse(r.out);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /<mandatory-skills-policy>/);
  assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /<staff-kit-root>/);
});

test('SessionStart under a plugin root adds the root hint', () => {
  const r = runHook(JSON.stringify({ hook_event_name: 'SessionStart' }), { CLAUDE_PLUGIN_ROOT: '/tmp/kitroot' });
  assert.equal(r.code, 0);
  assert.match(JSON.parse(r.out).hookSpecificOutput.additionalContext, /\/tmp\/kitroot\/rules\/README\.md/);
});

test('Stop with stop_hook_active exits 0 and says nothing', () => {
  const r = runHook(JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true, transcript_path: '/nonexistent' }));
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});

test('Stop with an unreadable transcript exits 0 and says nothing', () => {
  const r = runHook(JSON.stringify({ hook_event_name: 'Stop', transcript_path: '/nonexistent/transcript.jsonl' }));
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});

test('empty and malformed stdin exit 0 (fail open)', () => {
  assert.equal(runHook('').code, 0);
  assert.equal(runHook('{not json').code, 0);
  assert.equal(runHook('null').code, 0);
});
