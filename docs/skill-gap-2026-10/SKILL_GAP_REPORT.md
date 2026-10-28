# Skill-gap report: the four Anthropic certifications vs. the staff-kit library (2026-10-28)

## Result

The study mapped 313 exam concepts against 412 installed skills, agents, rules and plugin skills.
251 concepts (80%) had no skill that strongly covers them. Ten new `claude-*` skills now close those
gaps. Two existing files are updated. The evidence gate accepted 18 of 106 claims and left 86
unresolved. It rejected 1 claim and split 1. The fixes for the rejected and split claims are in the skills.

## What was added and updated

| Change | Item | Closes / why | Cert focus |
|---|---|---|---|
| **Added** | `claude-agent-orchestration` | 43 gap concepts: coordinator/subagent design, escalation, sessions | CCAR-F, CCDV-F |
| **Added** | `claude-prompt-engineering` | 41: prompt structure, criteria, few-shot, structured output | all four |
| **Added** | `claude-governance` | 35: data handling, oversight, bias, enterprise controls | CCAO-F, CCAR-P |
| **Added** | `claude-api-ops` | 32: model tier, stop_reason, retries, caching, batches, cost | CCDV-F |
| **Added** | `claude-evals` | 22: success criteria, graders, regression evals, fact-checks | CCAO-F, CCAR-P |
| **Added** | `claude-code-config` | 21: config placement, permission modes, headless CI | CCAR-F, CCAR-P |
| **Added** | `claude-solution-design` | 21: problem framing, product surface, rollout | CCAO-F |
| **Added** | `claude-rag-and-citations` | 17: grounding, citations, retrieval vs long context | CCAO-F |
| **Added** | `claude-tool-and-mcp-design` | 13: tool granularity, descriptions, errors, MCP servers | CCDV-F, CCAR-F |
| **Added** | `claude-context-management` | 6 gaps + 24 official tasks: context budget, compaction, memory | CCAR-F D5 |
| **Updated** | `rules/agent-models.md` | Model table moved from the 5.0 generation to 5.5 | — |
| **Updated** | `skills/cost-conscious-orchestration` | Same model table | — |
| **Version** | `staff-kit` 1.0.0 → 1.1.0 | `plugin.json`, `marketplace.json`, `CHANGELOG.md` | — |

All ten new skills are in the repo and in live `~/.claude/skills`, where they were copied in
additively; no skill of the same name existed. The two updates are applied to both copies, which
were identical before the edit and identical after it.

## Outdated or in need of refactoring

| Item | Finding | Evidence | Action |
|---|---|---|---|
| `rules/agent-models.md`, `cost-conscious-orchestration` | Named `claude-opus-5`, `claude-sonnet-5`, Haiku 4.5 as latest | S3: Channel B CONFIRMED (grep); Channel A: docs list them as legacy | **Fixed** |
| 6 Snowflake items (`data-cost`, `data-snowflake-audit`, `data-snowflake-tune`, `snowflake-architect`, `sf-audit`, `sf-tune`) | Live is ahead of the repo by 1–2 lines that point to the live-only `snowflake-sql` skill | S4: Channel B measured the diffs | Open decision D1 |
| `hooks/evolv-skills-enforcer.js` | Repo is ahead of live: the repo holds the Stop-hook fix and live still lacks it | S4: Channel B (live 137 lines, repo 180) | Run `scripts/install.sh --force` when ready |
| 10 loose `~/.claude/skills/*.md` | Never loaded as skills: only a folder with `SKILL.md` loads | S1: Channel B probe + falsifier; Channel A: the loose form is undocumented | Open decision D2 |
| `graphify` (live only, third-party) | 793 lines, over the 500-line guidance for a SKILL.md | S6: `wc -l` | Upstream skill; leave it |
| `snowflake-sql` `sf_deploy.py` reference | **Not broken.** The reference is to the DQ accelerator's own script, and that file exists | S5: the original probe checked the wrong folder | No action. The first finding was wrong |

## How it was built

1. **Sources, inside each site's stated limits.** certsafari publishes 140 sample questions (JSON-LD),
   4 overview pages, 12 notes and experience pages, and 167 lessons from its lessons sitemap.
   `robots.txt` and `llms.txt` reserve `/quiz/` for people, so no quiz page was automated. Other sources:
   Anthropic's four official exam guides (123 tasks), current product docs, and about 29 community and
   prep sources. Sites that sell real exam questions were excluded.
2. **Copyright.** Raw text stays in `.cache/`, which is gitignored. Everything committed is in the
   agents' own words. An overlap gate ran on every committed file. It found no copied prose: only
   model-id lists, domain/weight tables and phrases under 15 words.
3. **Knowledge graph.** `tools/build_graph.py` runs graphify's engine. Structure edges are EXTRACTED and
   coverage edges are INFERRED with the mapper's confidence score. Result: 957 nodes, 2,128 edges,
   31 communities. The top hub is the built-in `claude-api` skill (46 edges); the next hubs are the
   proposed skills (32–43 edges each).
4. **Authoring.** 5 Sonnet agents worked from per-skill briefs (`tools/build_briefs.py`). The rule:
   identifiers only from the checked docs facts, written for model 5 and later.
5. **Evidence gate (Mode 1).** Channel A: Opus, docs only, 41 fetches. Channel B: Opus
   adversarial-validator, probes only. Neither saw the other's work or the authors' sources.
   The comparison is mechanical (`tools/egv_gate.py`).

## Evidence-gate outcome (106 claims)

| Gate | Count | Meaning |
|---|---|---|
| ACCEPTED | 18 | Docs and runtime agree |
| REJECTED | 1 | K-orch-6. **Fixed**: subagents are continued with `SendMessage(to: agentId)`, and a subagent inherits the parent's `bypassPermissions` |
| SPLIT | 1 | P4. Resolved by the split: the model sees `Agent`, and the `system:init` list says `Task`. **Fixed** in the skill |
| UNRESOLVED | 86 | One channel could not decide. See below |

Why so many are unresolved: Channel A cannot see local files. Channel B could not reach the API,
because no API key exists and the CLI's OAuth session had expired (`claude -p` returned rc=1,
"OAuth session expired"). Channel B therefore probed the real 2.1.287 CLI against a local mock API.
Server-side claims, such as accepted model ids, removed sampling parameters and beta headers, are
**docs-confirmed but not runtime-verified**. The skills cite a doc URL for each one.

Other findings from the gate:
- Haiku 5.5 needs Claude Code v2.1.293 or later. This machine runs 2.1.287, where the `haiku` alias still resolves to Haiku 4.5. Both updated files now say this.
- Opus 5.5 has independent runtime evidence: this session runs on `claude-opus-5-5`.
- `-p` already starts in the default (manual) mode on 2.1.287. The docs date this to v2.1.302.

## Not done, and why

- **Not pushed. No PR.** Pushing is outward-facing (decision D4).
- **API-level claims are not runtime-verified.** Sign in again (`claude` interactively), or set an API key, then re-run Channel B on the UNRESOLVED rows.
- **Lessons were not digested whole** (683k words). Each skill author read up to 25k words of the most relevant lessons.
- **Community evidence for CCAR-P, CCDV-F and CCAO-F is thin.** Reddit could not be reached through search.

## Files

`OPEN_DECISIONS.md` · `TODO.md` · `validation/` (ledger, channel-a/b, gate) · `graphify-out/graph.html` ·
`derived/` (tags, coverage, briefs) · `corpus/` (graph inputs) · `tools/` (every script, re-runnable).
