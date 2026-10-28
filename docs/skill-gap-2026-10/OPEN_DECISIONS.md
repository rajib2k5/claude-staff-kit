# Open decisions — skill-gap study (2026-10-28)

Each item shows the default in effect until the owner decides.

| # | Decision | Default in effect | Why it is the owner's call |
|---|---|---|---|
| D1 | Vendor the live-only `snowflake-sql` skill into the kit, and sync the six one-line pointers to it (data-cost, data-snowflake-audit, data-snowflake-tune, snowflake-architect, sf-audit, sf-tune)? | Not vendored, not synced. The repo keeps its portable versions. | The skill is account-specific: it names the default role and notes that the token reaches ACCOUNTADMIN. The repo may go public. |
| D2 | Ten loose `~/.claude/skills/*.md` files (api-design, code-review, data-model, data-pipeline, debug, security-check, sql-optimize, system-design, test-gen, v0-prompt): convert to skill folders, or delete? | Left in place, untouched. | Deleting is destructive. Converting changes what triggers. |
| D3 | `snowflake-sql` references a `scripts/sf_deploy.py` that does not exist. | Reported only. | It is a live, user-owned skill outside the repo. |
| D4 | Push branch `feat/cert-skill-gap-2026-10-28` and open a PR? | Committed locally, not pushed. | Pushing is outward-facing. |
| D5 | Install the new skills into live `~/.claude/skills`? | Installed as additive copies, only where no skill of that name exists. | Live config affects every session. |
