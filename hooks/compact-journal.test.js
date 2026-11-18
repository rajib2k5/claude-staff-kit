// Tests for compact-journal.js. Run: node --test hooks/compact-journal.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const J = require('./compact-journal.js');

const HOOK = path.join(__dirname, 'compact-journal.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cj-'));

const user = (content, extra = {}) => ({ type: 'user', ...extra, message: { role: 'user', content } });
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const say = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

test('user text is kept verbatim; tool results, meta lines, reminders and command echoes are not instructions', () => {
  assert.equal(J.userText(user('Use  the  W4 worktree.\nNever print the PAT.')), 'Use  the  W4 worktree.\nNever print the PAT.');
  assert.equal(J.userText(user([{ type: 'text', text: 'hi' }, { type: 'image' }])), 'hi');
  assert.equal(J.userText(user([{ type: 'tool_result', content: 'x' }])), null);
  assert.equal(J.userText(user('x', { isMeta: true })), null);
  assert.equal(J.userText(user('<system-reminder>noise</system-reminder>')), null);
  assert.equal(J.userText(user('<local-command-stdout>ok</local-command-stdout>')), null);
  assert.equal(J.userText(user('sub', { isSidechain: true })), null);
});

test('only the last N instructions are kept, oldest first, and long ones are cut with a marker', () => {
  const lines = Array.from({ length: 12 }, (_, i) => user(`msg ${i}`));
  const got = J.recentUserInstructions(lines, 3);
  assert.deepEqual(got, ['msg 9', 'msg 10', 'msg 11']);
  const long = J.recentUserInstructions([user('x'.repeat(5000))]);
  assert.match(long[0], /\[\.\.\.cut by compact-journal\]$/);
  assert.ok(long[0].length < 4100);
});

test('open tasks follow the latest TodoWrite list and drop completed items', () => {
  const lines = [
    tool('TodoWrite', { todos: [{ content: 'old', status: 'pending' }] }),
    tool('TodoWrite', { todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'pending' }] }),
  ];
  assert.deepEqual(J.openTasks(lines).map((t) => t.content), ['b', 'c']);
});

test('update_plan items and advance moves are followed', () => {
  const lines = [
    tool('mcp__ccd_turn__update_plan', { items: [{ content: 'one', status: 'in_progress' }, { content: 'two', status: 'pending' }] }),
    tool('mcp__ccd_turn__update_plan', { advance: true }),
  ];
  assert.deepEqual(J.openTasks(lines), [{ content: 'two', status: 'in_progress' }]);
});

test('TaskCreate / TaskUpdate are followed when no whole-list tool was used', () => {
  const lines = [tool('TaskCreate', { subject: 'write hook' }), tool('TaskCreate', { subject: 'test hook' }), tool('TaskUpdate', { taskId: '1', status: 'completed' })];
  assert.deepEqual(J.openTasks(lines).map((t) => t.content), ['test hook']);
});

test('decision-like user sentences and assistant "Decision:" lines are collected', () => {
  const users = ['Branch off main. Do not touch hooks/pre-publish-guard*.'];
  const d = J.decisions([say('Plan.\nDecision: hold the 10% threshold for the user.')], users);
  assert.ok(d.includes('user: Do not touch hooks/pre-publish-guard*.'));
  assert.ok(d.includes('assistant: Decision: hold the 10% threshold for the user.'));
  assert.ok(!d.some((x) => x.includes('Branch off main')));
});

test('render puts cwd, git, tasks and verbatim instructions in the journal', () => {
  const md = J.render(
    { session_id: 's1', trigger: 'auto', cwd: '/w' },
    [user('Keep the ``` fence safe'), tool('TodoWrite', { todos: [{ content: 'ship', status: 'pending' }] })],
    { branch: 'feat', head: 'abc fix', status: [' M a.js'], prs: [{ number: 7, title: 'T', url: 'u', headRefName: 'feat' }] },
  );
  assert.match(md, /- cwd: \/w/);
  assert.match(md, /- git branch: feat/);
  assert.match(md, /1 changed path/);
  assert.match(md, /open PR #7 \[feat\]/);
  assert.match(md, /- \[pending\] ship/);
  assert.match(md, /Keep the ''' fence safe/);
});

test('process: PreCompact writes the journal and prints summary instructions; SessionStart compact re-injects it', () => {
  const jd = tmp();
  const repo = tmp();
  execFileSync('git', ['init', '-q', '-b', 'trunk'], { cwd: repo });
  const tp = path.join(jd, 't.jsonl');
  fs.writeFileSync(tp, [user('Never print the Kaggle token.'), tool('TodoWrite', { todos: [{ content: 'live check', status: 'in_progress' }] })]
    .map((x) => JSON.stringify(x)).join('\n'));
  const env = { ...process.env, CLAUDE_COMPACT_JOURNAL_DIR: jd, PATH: process.env.PATH };
  const pre = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreCompact', session_id: 'abc', transcript_path: tp, cwd: repo, trigger: 'auto' }), env, encoding: 'utf8',
  });
  assert.equal(pre.status, 0, pre.stderr);
  assert.match(pre.stdout, /user's own words/);
  assert.ok(pre.stdout.length < 10000);
  const md = fs.readFileSync(path.join(jd, 'abc.md'), 'utf8');
  assert.match(md, /Never print the Kaggle token\./);
  assert.match(md, /git branch: trunk/);
  assert.match(md, /\[in_progress\] live check/);

  const post = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact', session_id: 'abc' }), env, encoding: 'utf8',
  });
  const out = JSON.parse(post.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /<compact-journal>[\s\S]*Never print the Kaggle token\.[\s\S]*<\/compact-journal>/);
});

test('process: a second PreCompact keeps the previous journal as .prev.md', () => {
  const jd = tmp();
  const env = { ...process.env, CLAUDE_COMPACT_JOURNAL_DIR: jd };
  const go = () => spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: 'PreCompact', session_id: 'p', cwd: jd }), env, encoding: 'utf8' });
  go(); go();
  assert.ok(fs.existsSync(path.join(jd, 'p.md')));
  assert.ok(fs.existsSync(path.join(jd, 'p.prev.md')));
});

test('process: SessionStart for startup, or with no journal, prints nothing', () => {
  const jd = tmp();
  fs.writeFileSync(path.join(jd, 'x.md'), '# journal for x\n'); // present, but startup must not inject it
  const env = { ...process.env, CLAUDE_COMPACT_JOURNAL_DIR: jd };
  for (const p of [{ hook_event_name: 'SessionStart', source: 'startup', session_id: 'x' }, { hook_event_name: 'SessionStart', source: 'compact', session_id: 'none' }]) {
    const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(p), env, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});

test('process: bad input fails open', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: '{', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /non-fatal/);
});
