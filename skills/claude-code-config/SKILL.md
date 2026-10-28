---
name: claude-code-config
description: Decide where each piece of Claude Code configuration belongs — CLAUDE.md scope, settings file, permission rule, hook, skill, subagent or slash command — and run Claude Code safely in CI. Use when setting up Claude Code for a team, when a rule is being ignored, or when a pipeline runs `claude -p`. Triggers - where does this config go, CLAUDE.md or hook, permission mode for CI, claude -p json output, why is my teammate not getting these rules, plan mode or just do it.
---

# Claude Code configuration placement

The judgement this skill adds: every instruction has a right home, and the home depends on whether
the instruction must be **obeyed** or only **considered**. Prompt text is considered. Hooks, deny rules
and permission modes are obeyed. Most configuration bugs are a hard rule written as prompt text, or a
shared convention stored in a personal scope.

## When to use / when not

- Use to choose a mechanism, trace why configuration did not apply, or design a CI invocation.
- To edit `settings.json` or add a hook to it, use `update-config`.
- To write a hook script (events, matchers, exit codes, JSON), use `plugin-dev:hook-development`.
  This skill only says **when** a hook is the right tool.
- To author a skill file, use `plugin-dev:skill-development`. To package a bundle, use `plugin-dev:plugin-structure`.
- For a command that deletes, drops or force-pushes, use `destructive-ops-guard`.
- For SDK or Messages API code, use `claude-api` or `agent-sdk-dev:new-sdk-app`.
- For model and subagent spend, use `cost-conscious-orchestration`.
- For MCP server entries and tool design, use `claude-tool-and-mcp-design`.

## Decision rules

1. **Hard rule: use a deny rule or a PreToolUse hook, never CLAUDE.md.** CLAUDE.md is context that the
   model may weigh against other text. Only the harness can refuse a call.
2. **Prefer a deny rule over a hook when a pattern match is enough.** `Bash(rm *)` needs no script.
   Use a hook when the decision needs logic: parse the input, call a service, rewrite arguments.
3. **Know the evaluation order: deny, then ask, then allow, first match wins.** A deny from any scope
   beats an allow. A hook `allow` does not override a deny or ask rule. Design around this, not against it.
4. **`allowedTools` approves; it does not restrict.** To remove a tool, use `--tools` or a deny rule.
   A bare tool name in a deny rule removes the tool from context. A scoped deny keeps the tool and blocks matches.
5. **Skill `allowed-tools` has the same limit.** It pre-approves tools for that turn. It is not a sandbox.
   Use `disallowed-tools` or a deny rule to take a tool away.
6. **Put side-effecting skills behind the user.** Set `disable-model-invocation: true` on deploy, publish and
   delete skills. Claude then cannot trigger them and their description leaves the per-turn listing.
7. **Choose the mechanism by who triggers it and what it must guarantee.**
   - Always true, every turn, advisory: CLAUDE.md or a rule.
   - Must happen or must not happen, deterministic: hook or permission rule.
   - Procedure loaded only when relevant: skill.
   - Verbose work whose raw output should stay out of the main context: subagent.
   - User-typed shortcut: skill with `disable-model-invocation`. Commands have merged into skills.
   - Shared bundle across repos: plugin.
8. **Scope instructions by audience.** Personal taste: `~/.claude/CLAUDE.md`. Team convention: committed
   `./CLAUDE.md` or `.claude/rules/`. Personal per-repo notes: `CLAUDE.local.md`. Org mandate: managed policy.
   Team rules in user scope never reach a fresh clone. That is the usual "teammate gets nothing" cause.
9. **Load by path when the rule applies to a file type.** Use `.claude/rules/` with `paths` globs for
   conventions on scattered files, such as tests in many directories. A directory CLAUDE.md fits only one subtree.
10. **Keep CLAUDE.md short.** Imports do not reduce cost; they expand into context. Split by topic into rules
    and skills. Remove anything the code or a linter already enforces.
11. **Use plan mode when the design is undecided.** Explore and compare options before edits. Skip it when
    the diff is small and obvious. Use the Explore subagent so discovery output stays out of the main context.
12. **Pick the CI permission mode that fails closed.** `dontAsk` denies anything not allowed. Never use
    `bypassPermissions` in CI; allow rules do nothing there and the blast radius is the whole runner.
13. **Make CI output machine-readable.** Use `--output-format json` plus `--json-schema`. Parse
    `structured_output`, and treat its absence as failure. Do not scrape prose.
14. **Isolate and bound every unattended run.** Set `--max-turns` and `--max-budget-usd`. Consider `--bare`
    for reproducibility. Run review in a fresh session, not the one that wrote the code.
15. **Choose built-in tools by what you need back.** Glob returns paths by name pattern. Grep returns
    matching content. Read opens a known file. Edit needs a unique anchor; when it is not unique, read
    the file and write it back. Use Bash for what no dedicated tool covers.

## Procedure

1. **Classify the instruction**: must-obey, should-consider, procedure, or isolation. Check: you can state
   the consequence of Claude ignoring it. If the consequence is unacceptable, it is must-obey.
2. **Pick the scope**: who needs it, and does a fresh clone need it. Check: clone the repo to a scratch
   directory and run `/status`; the expected files and settings appear.
3. **Write the smallest mechanism that fits** (rule 7). Check: for a deny rule or hook, trigger the
   forbidden call on purpose and see it refused with a reason.
4. **Check for a winning conflict**: another scope, a managed deny, or a hook may override yours. Check:
   `/status` and `/config` show the effective values; read the deny rules before the allow rules.
5. **For CI**, run the exact command locally with the same flags. Check: exit code, the `structured_output`
   field, and `permission_denials` in the JSON. A denial there means the allow list is too small.
6. **Record the config in the repo** with a one-line reason per rule. Check: a reviewer can answer "why is
   this denied" from the diff.

## Anti-patterns

- "Never edit `.env`" in CLAUDE.md with no deny rule. The model can still be persuaded to try.
- Treating `allowed-tools` or `--allowedTools` as a whitelist. Other tools stay available.
- Granting `bypassPermissions` to make a CI step stop prompting. Allow rules fix prompts; the mode does not.
- Putting team conventions in `~/.claude/CLAUDE.md`, then wondering why a teammate's Claude ignores them.
- One 600-line CLAUDE.md for every task. Always-loaded text taxes every turn; move procedures to skills.
- Using a hook for a plain pattern block, or prompt text for a logic check. Match the tool to the decision.
- Reading `result` in CI and regex-parsing it, instead of using a schema.
- Planning every one-line fix, or skipping planning on a cross-cutting refactor.
- A hand-made `.claude/settings.local.json` that is not gitignored.
- Assuming a project `settings.json` can turn on `bypassPermissions`. It is ignored there.

## Current platform facts (checked 2026-10-28)

- CLAUDE.md files concatenate from the tree above the working directory (root first); subdirectory files load
  on demand. Imports use `@path/to/import`, max four hops. `/init` bootstraps one. `claudeMdExcludes` skips files.
  `AGENTS.md` can be read in place of CLAUDE.md. Source: https://code.claude.com/docs/en/memory
- Scopes: `~/.claude/CLAUDE.md`, `./CLAUDE.md` or `./.claude/CLAUDE.md`, `./CLAUDE.local.md`, managed
  `/etc/claude-code/CLAUDE.md` (Linux/WSL). Same page.
- `.claude/settings.local.json` outranks `.claude/settings.json` and `~/.claude/settings.json`; only `--settings`
  and managed settings outrank it. Since v2.1.211 it sits at the repository root in a git repo.
  Source: https://code.claude.com/docs/en/settings
- Permission modes: `default` (alias `manual`), `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`.
  Set by `--permission-mode`, Shift+Tab (not `dontAsk`) or `permissions.defaultMode`.
  Source: https://code.claude.com/docs/en/permission-modes
- Interactive default is `auto` on v2.1.283 and later. A `-p` run with no mode set starts in Manual on v2.1.302
  and later, and denies calls that need approval. Project-level `auto` and `bypassPermissions` defaults are ignored. Same page.
- `bypassPermissions`: deny and explicit ask rules still apply; allow rules have no effect. Org switch:
  `permissions.disableBypassPermissionsMode`. Same page.
- Plan mode: `--permission-mode plan`, `/plan`, `ExitPlanMode`. A PreToolUse hook allow does not approve edits there. Same page.
- `--disallowedTools` / `--allowedTools` / `--tools`; settings keys `permissions.allow`, `permissions.deny`,
  `permissions.ask`. Sources: https://code.claude.com/docs/en/cli-reference and https://code.claude.com/docs/en/permissions
- PreToolUse input fields: `tool_name`, `tool_input`, `tool_use_id`. Exit code 2 blocks. `permissionDecision`
  values: `allow`, `deny`, `ask`, `defer`. `updatedInput` rewrites arguments.
  Source: https://code.claude.com/docs/en/hooks
- Skill frontmatter: `allowed-tools`, `disallowed-tools`, `disable-model-invocation`, `user-invocable`,
  `context` (fork), `agent`, `paths`, `argument-hint`. Keep SKILL.md under 500 lines.
  Source: https://code.claude.com/docs/en/skills
- Print mode: `-p`, `--bare` (needs `ANTHROPIC_API_KEY`), `--max-turns`, `--max-budget-usd`,
  `--no-session-persistence`, `--resume`, `--append-system-prompt`. Source: https://code.claude.com/docs/en/headless
- `--output-format` takes `text`, `json`, `stream-json` (needs `--verbose`). JSON carries `result`, `session_id`,
  `usage`, `total_cost_usd` with a per-model breakdown, and `permission_denials`. Same page.
- `--json-schema` with `--output-format json` fills `structured_output`; absent if the run ends without valid output. Same page.
- Glob, Read and Grep are built-in tool names. Their limits and semantics: confirm in docs.
- Telemetry exporter variables, resumed-session model fallback order, and managed-hook conflict rules: confirm in docs.

## Exam-era vs current

- Older material says `default` prompts everywhere and `-p` is permissive. Today interactive sessions default to
  `auto` and bare `-p` denies unapproved calls. Check the version before predicting behaviour.
- `bypassPermissions` used to take effect from any settings file. It no longer does from project or local files.
- The hook event list is much longer now, and `defer` is a fourth `permissionDecision`.
- Custom commands are merged into skills. Exam items may still treat them as separate.
- Answer exam items by the blueprint. Build by the current docs.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-F | Claude Code Configuration & Workflows | CLAUDE.md scopes, path rules, skills vs CLAUDE.md, plan mode, CI with JSON output |
| CCAR-F | Tool Design & MCP Integration | Built-in tool choice (Glob, Grep, Read, Edit) |
| CCAR-F | Agentic Architecture & Orchestration | Hooks for deterministic interception |
| CCAR-P | Integration; Developer Productivity | Capability bloat, least privilege, team configuration, CI permission modes |
| CCDV-F | Claude Code; Applications and Integration | Settings, rules, skills, headless mode, hooks as guardrails |
