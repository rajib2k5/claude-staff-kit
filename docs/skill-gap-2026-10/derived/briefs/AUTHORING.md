# Authoring contract for the new claude-* skills (2026-10-28)

You write skills for the `claude-staff-kit` repo at `/Users/rajibbahar/dev/claude-staff-kit`.
Each skill closes a gap that the four Anthropic certifications test (CCAR-F, CCAR-P, CCAO-F,
CCDV-F) and that no existing skill covers. Write for practitioners working on **Claude model
generation 5 or later**. That is the current platform, not the exam-era platform.

## Inputs (per skill)

`docs/skill-gap-2026-10/derived/briefs/<skill>.json` holds:
- `gap_concepts`: what is missing, with the competency each one demands.
- `official_tasks`: Anthropic's exam-guide task statements, paraphrased. These are authoritative on scope.
- `docs_facts`: current platform facts with doc URLs, retrieved 2026-10-28. These are authoritative on identifiers.
- `lesson_files`: lesson text. It is third-party and copyrighted. Read it for ideas only.

Also read once: `docs/skill-gap-2026-10/corpus/certsafari-study-notes.md` (Cross-cert best practices)
and `docs/skill-gap-2026-10/corpus/community-research.md` (Skill ideas; Conflicts and staleness).

## Output

`skills/<skill>/SKILL.md` only. Create no other files. Match the house style of
`skills/staff-validate/SKILL.md` and `skills/staff-design/SKILL.md`: read both first.

```
---
name: <skill>
description: <what it does, one sentence>. Use when <situations>. Triggers - <5-8 short user phrases>.
---
```

Body, 90-160 lines, in this order:
1. `# <Title>`: one paragraph on the judgement this skill adds.
2. `## When to use / when not`: name the neighbouring skills to use instead. Examples:
   `claude-api` (built-in SDK reference), `plugin-dev:hook-development`, `plugin-dev:mcp-integration`,
   `agent-sdk-dev:new-sdk-app`, `staff-validate`, `evidence-gated-validation`, `cost-conscious-orchestration`.
   Link to them. Never duplicate them.
3. `## Decision rules`: numbered, imperative, and each one with its reason. This is the core of the skill.
4. `## Procedure`: the steps a practitioner follows, with the check that proves each step worked.
5. `## Anti-patterns`: the traps the exams and the community reports warn about.
6. `## Current platform facts (checked 2026-10-28)`: identifiers, flags, field names and model ids.
   Use ONLY values that appear in your brief's `docs_facts`, and give the doc URL for each one.
   If a value is not in `docs_facts`, describe the behaviour generically and write "confirm in docs".
   Never fill in an identifier from memory.
7. `## Exam-era vs current`: where the 4.x-era exam framing differs from today's platform
   (use the `exam_era_risk` fields). Tell the reader to answer exam items by the blueprint and to
   build by current docs.
8. `## Blueprint coverage`: a compact table | cert | domain | what this skill covers |.

## Hard rules

- Use model ids only from `docs_facts`. Never recommend a 4.x model as a default.
- Copyright: write everything in your own words. Quote at most 15 consecutive words from any lesson, guide
  or doc. Never reproduce lesson structure or question text.
- No sales claims, no filler, and no invented numbers. Every number has a source or is removed.
- Imperative mood. Short sentences. One idea per bullet.
- Do not edit any file outside `skills/<skill>/`. Do not run git. Do not touch `~/.claude`.

## Self-check (run it, paste the output in your reply)

```bash
cd /Users/rajibbahar/dev/claude-staff-kit
for s in <skill-1> <skill-2>; do f=skills/$s/SKILL.md; echo "$s $(wc -l < $f) lines"; \
  head -4 $f | grep -c -E '^(name|description):'; \
  grep -n -E 'claude-(opus|sonnet|haiku)-4|claude-3' $f || echo "no 4.x ids"; done
bash scripts/validate.sh 2>&1 | grep -E 'frontmatter|ok [0-9]+ skills|FAIL|needs' | head -5
```

Reply in under 150 words: for each skill, its line count, the number of decision rules, and
every identifier you put in "Current platform facts" that you could NOT find in `docs_facts`
(this should be none).
