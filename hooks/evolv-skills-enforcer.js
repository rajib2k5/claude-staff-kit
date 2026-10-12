#!/usr/bin/env node
/**
 * Enforcement hook for the three mandatory local skills.
 *
 * Handles two events from one file (branches on hook_event_name):
 *
 *   SessionStart  -> injects the standing policy so EVERY project/session loads the skills,
 *                    not just the one they were created in.
 *   Stop          -> if the turn claimed completion/verification without evidence of an
 *                    executed command, reminds that evidence-gated-validation governs the
 *                    claim. Advisory (never blocks) — the goal is to catch the
 *                    "tests pass" / "verified" reflex before it reaches the user.
 *
 * Skills enforced:
 *   1. evidence-gated-validation     (public source: github.com/rajib2k5/evidence-gated-validation, MIT)
 *   2. cost-conscious-orchestration  (model routing, subagents, todo verification)
 *   3. destructive-ops-guard         (paired with evolv-destructive-guard.js at PreToolUse)
 *
 * Fails open on any error — a broken hook must not brick the session.
 */

'use strict';

const POLICY = `<mandatory-skills-policy>
Three local skills are ACTIVE for this session and every project. They are not optional.

1. destructive-ops-guard — nothing irreversible happens on inference.
   Before a DROP/TRUNCATE/DELETE-without-WHERE, a recursive delete, a force-push, terraform
   destroy, kubectl delete or a credential rotation that touches the user's real things — a
   repository, the user's own folders, a live database (Snowflake or any RDBMS server) or a
   published artifact — in ANY technology (SQL of any dialect, dbt, git, shell, Python, React/TS,
   Docker, k8s, Terraform, cloud CLI, REST API) — stop and ask the user to confirm, naming what
   is destroyed (measured, not guessed), how it is recovered, the blast radius, and the
   non-destructive alternative. Claude's own session scratchpad, task output and session
   metadata (/private/tmp/claude-*, the session folders under ~/.claude) need no confirmation.
   A PreToolUse hook backstops this and may ASK or DENY; if it denies, do not route around it.

2. cost-conscious-orchestration — cheapest model that can do the job correctly.
   BUDGET: the user is on a personal Claude Max MONTHLY plan; capacity is a shared rolling
   allowance and exhausting it stops all work. Default to sonnet; escalate to opus
   deliberately, not "to be safe". DO NOT ask permission for spend — only destructive
   operations warrant a prompt. For a large or opus-heavy wave: state the rough cost, pause
   ~30 seconds for the user to interject, then proceed. Report measured spend after a wave.
   Adversarial validation stays opus regardless.
   Every subagent is dispatched with an EXPLICIT model, never inherited: simple/mechanical ->
   sonnet; complex/synthesis/tradeoffs -> opus; adversarial validation -> opus, never
   downgraded. Use model version 5 or higher. Prefer auto mode for the main thread. Delegate
   read-many/report-little work to subagents to protect context and cost; launch independent
   agents in parallel in one message. Track every multi-step task on a todo list, one task in
   progress at a time, and mark complete ONLY when its verification was executed this session.
   Run the completion sweep (task -> command executed -> output seen) before reporting done.

3. evidence-gated-validation — claims are REJECTED until evidence flips them.
   For AI-generated code, ML/algorithm implementations, API/kwarg existence, and any
   "it's fixed" claim: decompose into atomic falsifiable claims and audit through two
   independent channels (A: primary documentation; B: executed runtime probes). Accept only
   on convergence. Tier it: Tier 0 deterministic gates always; Tier 1 Channel B for routine
   changes; Tier 2 full dual-channel for unfamiliar libraries, ML correctness, and anything
   whose wrongness is silent.

Reserved language: never write "tests pass", "the build is green", "verified", "confirmed
working", or "faster" without a command executed in THIS session, with its output.
</mandatory-skills-policy>`;

/** Phrases that assert verification. Cheap heuristic — advisory only. */
const CLAIM_RE =
  /\b(tests? (?:all )?pass(?:ed|ing)?|build is green|verified|confirmed working|it works now|fully working|all green)\b/i;

/** Evidence that a command was actually executed in the transcript tail. */
const EVIDENCE_RE =
  /(\$ |npm run|pytest|vitest|cargo |go test|make |PASS|FAIL|passed \(|Tests\s+\d|exit code|✓|✗)/;

function readTail(transcriptPath, maxBytes = 60000) {
  try {
    const fs = require('fs');
    const stat = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Plugin mode (staff-kit installed via `claude plugin install`): the skills, agents, and commands
 * refer to the library by its dotfiles paths (`~/.claude/rules/...`, `~/.claude/contexts/...`).
 * Claude Code sets CLAUDE_PLUGIN_ROOT for plugin hooks, so tell the session where those files
 * actually live. Empty string in dotfiles mode, where the paths are literal.
 */
function pluginRootHint() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (!root) return '';
  return (
    `\n<staff-kit-root>\n` +
    `staff-kit is installed as a plugin at: ${root}\n` +
    `Wherever a skill, agent, command, or rule says ~/.claude/rules/, ~/.claude/contexts/, ` +
    `~/.claude/agents/, ~/.claude/skills/, or ~/.claude/commands/, read the same path under ` +
    `${root}/ if the ~/.claude path does not exist. The rules index is ${root}/rules/README.md.\n` +
    `</staff-kit-root>`
  );
}

/**
 * The policy above quotes the forbidden phrases ("tests pass", "verified"), and the SessionStart
 * output is saved in the transcript. Scanning the raw tail therefore matched the policy itself and
 * warned on turns that made no claim at all (observed: 39 warnings in one real transcript). Strip
 * this hook's own blocks before testing. A tail that begins mid-block (cut by the byte window)
 * leaves only a closing tag; drop everything up to it.
 */
function stripOwnBlocks(tail) {
  return String(tail || '')
    .replace(/<mandatory-skills-policy>[\s\S]*?<\/mandatory-skills-policy>/g, '')
    .replace(/<staff-kit-root>[\s\S]*?<\/staff-kit-root>/g, '')
    .replace(/^[\s\S]*?<\/mandatory-skills-policy>/, '')
    .replace(/^[\s\S]*?<\/staff-kit-root>/, '');
}

/** True when the tail asserts verification and shows no executed command. */
function shouldWarn(tail) {
  const text = stripOwnBlocks(tail);
  return Boolean(text) && CLAIM_RE.test(text) && !EVIDENCE_RE.test(text);
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const payload = raw.trim() ? JSON.parse(raw) : {};
      const event = payload.hook_event_name || '';

      if (event === 'SessionStart') {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'SessionStart',
              additionalContext: POLICY + pluginRootHint(),
            },
          })
        );
        return process.exit(0);
      }

      if (event === 'Stop') {
        // Claude Code sets this when the Stop hook's own advice is what is being acted on; a second
        // warning there would loop. Exit quietly.
        if (payload.stop_hook_active) return process.exit(0);
        const tail = payload.transcript_path ? readTail(payload.transcript_path) : '';
        // Look only at the recent tail: did we assert verification without executing anything?
        if (shouldWarn(tail)) {
          process.stdout.write(
            JSON.stringify({
              hookSpecificOutput: {
                hookEventName: 'Stop',
                additionalContext:
                  'evidence-gated-validation: a verification claim appears in this turn with no ' +
                  'executed command in the transcript tail. Either cite the command and its output, ' +
                  'or restate the claim as unverified.',
              },
            })
          );
        }
        return process.exit(0);
      }

      process.exit(0);
    } catch (err) {
      process.stderr.write(`skills-enforcer: non-fatal error: ${err && err.message}\n`);
      process.exit(0);
    }
  });
}

if (require.main === module) main();
module.exports = { CLAIM_RE, EVIDENCE_RE, pluginRootHint, stripOwnBlocks, shouldWarn };
