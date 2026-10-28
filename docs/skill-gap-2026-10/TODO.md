# Skill-gap study — task list (2026-10-28)

Status key: [x] done with executed evidence · [~] in progress · [ ] pending

- [x] T1 Fetch certsafari public practice pages for all 4 Anthropic certs → 140 Qs in `.cache/` (gitignored). Evidence: curl 200s, questions.jsonl n=140.
- [x] T2 Concept tags → derived/concepts-*.jsonl (140 rows, 70+70, schema-checked; collision checked, intact). Corpus notes in corpus/exam-concepts-*.md.
- [x] T3 Inventory → derived/inventory.json (222 items, 141 first-party unique, 279 plugin skills, 6 drifted). Evidence: inventory.py run output.
- [x] T4 Graph built with tools/build_graph.py (practice Qs + official tasks + coverage). Rebuild after the lesson digest; community labels need review.
- [x] T5 Gap analysis: 251/313 concepts uncovered (tools/merge_coverage.py).
- [x] T6 Staleness audit: model table, 8 drifted pairs, 10 loose files (see report).
- [x] T7 EGV Mode 1: 106 claims; 18 ACCEPTED, 1 REJECTED (fixed), 1 SPLIT (fixed), 86 UNRESOLVED (tools/egv_gate.py).
- [x] T8 Report SKILL_GAP_REPORT.md, CHANGELOG 1.1.0, committed on branch (not pushed).
- [x] T9 Lessons fetched (167) and routed per skill into author briefs (tools/build_briefs.py) instead of a separate digest.
- [x] T10 10 skills authored (5 sonnet agents). Tier 0: validate.sh "ok 35 skills … all checks passed". Copyright gate: 4 residual 8-word factual overlaps, none prose.
- [x] T11 Model table updated (repo+live, diff -q equal); 10 skills installed to ~/.claude additively. D1–D3 left as open decisions.
- [ ] T12 User TODO: implement question_key() in tools/import_saved_pages.py (dedupe identity; options may reshuffle).
