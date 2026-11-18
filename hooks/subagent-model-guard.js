#!/usr/bin/env node
/**
 * PreToolUse guard for subagent launches (tool `Agent`; `Task` is the older name of the same tool).
 *
 * Denies a launch that does not state an explicit `model`, or an explicit `effort`, so that every
 * subagent is routed by the orchestrator on purpose instead of inheriting the session's model and
 * effort. The deny reason carries the routing rubric, so the orchestrator can retry at once.
 *
 *   - `subagent_type: "fork"` is exempt: a fork always runs on the parent's model and effort, and the
 *     Agent tool ignores both fields for it.
 *   - `effort` is required by default. Set CLAUDE_AGENT_GUARD_REQUIRE_EFFORT=0 on a Claude Code build
 *     whose Agent tool has no `effort` field; then only `model` is required.
 *   - An unknown model or effort value is denied too, so a typo does not silently fall back.
 *   - `subagent_type: "adversarial-reviewer"` must run on opus: a weaker validator manufactures false
 *     confidence (rules/agent-models.md). This holds even with the effort requirement switched off.
 *
 * Fails OPEN on unparseable input (stderr note, exit 0): a broken guard must not brick the session.
 */
'use strict';

const MODELS = new Set(['opus', 'sonnet', 'haiku', 'fable']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const AGENT_TOOLS = new Set(['Agent', 'Task']);
// Subagent types that must never be downgraded from opus.
const OPUS_ONLY = new Set(['adversarial-reviewer']);

const RUBRIC = [
  'Choose from the rubric (skills/cost-conscious-orchestration, section 1a):',
  '  very simple lookup / transcription        -> model "sonnet", effort "low"',
  '  simple-moderate mechanical, tests to oracle -> model "sonnet", effort "medium"',
  '  complex design / unknown root cause / money -> model "opus",   effort "high"',
  '  adversarial validation (when routed)        -> model "opus",   effort "high" (never downgraded)',
  '  hardest open-ended debugging or design      -> model "opus",   effort "xhigh"',
  'Re-issue the same Agent call with both fields set.',
].join('\n');

function requireEffort(env = process.env) {
  const v = String(env.CLAUDE_AGENT_GUARD_REQUIRE_EFFORT ?? '1').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'no' || v === 'off');
}

/**
 * The Agent tool's `model` is an enum of aliases (CLI 2.1.296 schema: sonnet|opus|haiku|fable); a full
 * claude-* id is valid only in agent frontmatter, so it is refused here with a clear reason.
 */
function validModel(m) {
  return typeof m === 'string' && MODELS.has(m.trim());
}

/**
 * Pure decision. Returns null to allow, or { decision: 'deny', reason } to block.
 * @param {string} toolName
 * @param {object} input  the tool_input of the Agent call
 * @param {object} env
 */
function decide(toolName, input, env = process.env) {
  if (!AGENT_TOOLS.has(toolName)) return null;
  const inp = input && typeof input === 'object' ? input : {};
  if (inp.subagent_type === 'fork') return null;

  const problems = [];
  const model = typeof inp.model === 'string' ? inp.model.trim() : inp.model;
  if (model === undefined || model === null || model === '') {
    problems.push('no explicit `model`');
  } else if (!validModel(model)) {
    problems.push(`unknown model ${JSON.stringify(inp.model)} (the Agent tool takes an alias: opus|sonnet|haiku|fable)`);
  } else if (OPUS_ONLY.has(inp.subagent_type) && model !== 'opus') {
    problems.push(`model ${JSON.stringify(model)}, but adversarial-reviewer runs on opus, never downgraded`);
  }
  if (requireEffort(env)) {
    const effort = typeof inp.effort === 'string' ? inp.effort.trim() : inp.effort;
    if (effort === undefined || effort === null || effort === '') {
      problems.push('no explicit `effort`');
    } else if (!EFFORTS.has(effort)) {
      problems.push(`unknown effort ${JSON.stringify(inp.effort)} (use low|medium|high|xhigh|max)`);
    }
  }
  if (problems.length === 0) return null;
  const who = inp.subagent_type ? ` (subagent_type "${inp.subagent_type}")` : '';
  return {
    decision: 'deny',
    reason: `subagent-model-guard: this launch${who} has ${problems.join(' and ')}. ` +
      'Every subagent is routed on purpose, never inherited.\n' + RUBRIC,
  };
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let payload;
    try {
      payload = raw.trim() ? JSON.parse(raw) : {};
    } catch (err) {
      process.stderr.write(`subagent-model-guard: unparseable input, allowing: ${err.message}\n`);
      return process.exit(0);
    }
    const v = decide(payload.tool_name, payload.tool_input);
    if (v) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: v.decision,
          permissionDecisionReason: v.reason,
        },
      }));
    }
    process.exit(0);
  });
}

if (require.main === module) main();
module.exports = { decide, validModel, requireEffort, RUBRIC, MODELS, EFFORTS, OPUS_ONLY };
