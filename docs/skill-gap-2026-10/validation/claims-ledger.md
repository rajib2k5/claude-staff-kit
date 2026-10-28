# Claims ledger — pre-registered 2026-10-28 (frozen before Channel A or B runs)

Mode: dual-subagent (Mode 1). Channel A = primary docs only. Channel B = executed probes only.
Every material claim starts REJECTED. Env pin: `env-pin.txt`.

## Part 1 — staleness and refactor claims (registered before the graph was built)

| ID | Cat | Mat | Claim (one sentence) | Channel B probe (command → pass condition; falsifier) |
|---|---|---|---|---|
| S1 | Environmental | material | Claude Code loads a personal skill only from a directory `~/.claude/skills/<name>/` that holds `SKILL.md`, so a loose `~/.claude/skills/<name>.md` file is never loaded. | In a throwaway project dir (amended pre-run: a fresh CLAUDE_CONFIG_DIR has no login), create `.claude/skills/probe-dir/SKILL.md` and `.claude/skills/probe-loose.md`, cd there, and ask `claude -p` to list the skill names it has → pass if `probe-dir` is listed and `probe-loose` is not. Falsifier: rename `probe-loose.md` to `probe-loose/SKILL.md` → it must then be listed. |
| S2 | API | material | The model ids `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5` are accepted by the installed Claude Code CLI. | `claude -p --model <id> "Reply with OK"` for each id → pass if exit 0 and output contains OK. Falsifier: `--model claude-haiku-9-9` → must fail. |
| S3 | Semantic | material | `rules/agent-models.md` and `skills/cost-conscious-orchestration/SKILL.md` name an older generation (`claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`) as "latest". | `grep -n` for the "latest" lines in both files (repo and live) → pass if the lines pair "latest" with those ids. Falsifier: run the same grep against a temp copy where the ids are replaced → it must not match. |
| S4 | Environmental | material | Six first-party items differ between the repo and live `~/.claude`, and in every case the live copy is the newer one. | `diff -q` for each of the 6 pairs + `git log -1 --format=%cs` for the repo file → pass if all 6 differ and the repo commit date is older than the live mtime. Falsifier: `diff -q` a pair that is listed as identical (`staff-tdd`) → must report no difference. |
| S5 | Environmental | material | The live `snowflake-sql` skill references `scripts/sf_deploy.py`, and that file does not exist. | `grep -n sf_deploy` in SKILL.md and `test -e scripts/sf_deploy.py` → pass if grep hits and the file is absent. Falsifier: `test -e SKILL.md` in the same dir → must succeed. |
| S6 | Semantic | minor | The live `graphify` SKILL.md (794 lines) exceeds Anthropic's guidance to keep a SKILL.md body under 500 lines. | `wc -l` → pass if > 500. Falsifier: `wc -l` on `staff-tdd/SKILL.md` → must be < 500. |

## Part 2 — platform-currency claims the new skills rely on (registered 2026-10-28, before any skill draft was read)

Source of the claims: the docs-map agent's report (`derived/docs_feature_map.json`). Probe constraint: no `ANTHROPIC_API_KEY` exists in this
environment (checked: length 0 in the process env and in a login zsh), so a direct Messages API probe is impossible. API-only claims get
Channel B = UNVERIFIABLE by construction, and the gate leaves them UNRESOLVED. They must ship labelled "per docs, not runtime-verified".

| ID | Cat | Mat | Claim | Channel B probe (command → pass; falsifier) |
|---|---|---|---|---|
| P1 | API | material | `claude-fable-5-1` is a current model id accepted by the CLI (extends S2). | `claude -p --model claude-fable-5-1 "Reply with OK"` → exit 0 + OK. Falsifier: `--model claude-fable-9-9` must fail. |
| P2 | Semantic | material | Claude Code's permission modes include `manual`, and `claude -p` runs start in it by default. | `claude --help` lists `manual`; `claude -p --output-format json "Run: touch /tmp/claude-502/egv-p2"` without `--permission-mode` → the write is NOT performed (file absent). Falsifier: the same with `--permission-mode acceptEdits`/`bypassPermissions` → file present. |
| P3 | API | material | `claude -p --json-schema <schema> --output-format json` returns output that validates against the schema. | Run with a 2-field schema → parse JSON, check `structured_output` (or result) matches. Falsifier: a schema requiring a field the prompt cannot produce → must fail validation or error. |
| P4 | Semantic | material | In current Claude Code the subagent-spawning tool is named `Agent`, not `Task`. | `claude -p --output-format stream-json --verbose "List the exact names of the tools you can call, comma separated"` → the init event's tool list contains `Agent` and not `Task`. Falsifier: run the identical "contains Agent and not Task" assertion on a synthetic tool list `["Bash","Task","Read"]` → the assertion must fail. |
| P5 | API | material | Messages API version `2026-10-21` removes `temperature`, `top_p` and `top_k`. | UNVERIFIABLE by construction (no API key). |
| P6 | API | material | Structured outputs use `output_config.format` with no beta header. | UNVERIFIABLE by construction (no API key). |
| P7 | API | material | Compaction is a beta behind `compact-2026-09-04`; context editing uses `context-management-2025-06-27`. | UNVERIFIABLE by construction (no API key). |
| P8 | Environmental | minor | Sonnet 4.5 retires on 2026-11-30. | UNVERIFIABLE by construction (a future date; docs-only). |

## Part 3 — claims extracted from the authored skills

Frozen 2026-10-28 after the drafts existed and before either channel ran: `part3_claims.json`, 92 claims with ids `K-<skill>-<n>`.
Each one is one bullet from a skill's "Current platform facts" section. All are material: a wrong identifier ships in a skill.
Channel B probes what the installed CLI can show (`claude --help`, `claude -p`, project-scope files). Anything that only the
Messages API or a cloud console can show is UNVERIFIABLE by construction.
