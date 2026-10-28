"""Merge the two coverage halves, normalise proposed skill names to one canonical set,
and print gap counts weighted by exam domain.

Usage (from docs/skill-gap-2026-10): python3 -I tools/merge_coverage.py
"""
import collections
import json
from pathlib import Path

D = Path("derived")
CERT_CODE = {"claude-certified-architect-foundations": "CCAR-F", "claude-architect-professional": "CCAR-P",
             "claude-certified-associate-foundations": "CCAO-F", "claude-developer-foundations": "CCDV-F"}

# Mapper-proposed names -> canonical new skill. Both mapper halves invented names
# independently; this table is the single place that reconciles them.
CANONICAL = {
    "claude-prompt-engineering-patterns": "claude-prompt-engineering",
    "claude-prompt-engineering": "claude-prompt-engineering",
    # CCA-F pairs structured output with prompting in one domain (D4), so one skill.
    "claude-structured-output": "claude-prompt-engineering",
    "claude-tool-and-mcp-design": "claude-tool-and-mcp-design",
    "claude-tool-design": "claude-tool-and-mcp-design",
    "mcp-server-design": "claude-tool-and-mcp-design",
    "claude-agent-orchestration": "claude-agent-orchestration",
    "agent-sdk-orchestration": "claude-agent-orchestration",
    "human-in-the-loop-escalation-design": "claude-agent-orchestration",
    "claude-context-management": "claude-context-management",
    "claude-code-config-permissions-and-scopes": "claude-code-config",
    "claude-code-config": "claude-code-config",
    "claude-code-headless-and-ci": "claude-code-config",
    "claude-code-core-workflows": "claude-code-config",
    "claude-eval-and-success-criteria": "claude-evals",
    "claude-evals": "claude-evals",
    "claude-output-verification-and-fact-checking": "claude-evals",
    "claude-api-advanced-features": "claude-api-ops",
    "claude-api-ops": "claude-api-ops",
    "claude-model-selection": "claude-api-ops",
    "claude-rag-and-citations": "claude-rag-and-citations",
    "claude-project-knowledge": "claude-rag-and-citations",
    "claude-governance": "claude-governance",
    "claude-platform-ops-and-governance": "claude-governance",
    "claude-workflow-adoption": "claude-solution-design",
    "claude-ai-workflow-and-research-features": "claude-solution-design",
}

concepts = {c["id"]: c for c in json.loads((D / "concept_catalog.json").read_text())}
rows = json.loads((D / "coverage_part1.json").read_text()) + json.loads((D / "coverage_part2.json").read_text())
unmapped = sorted({r["proposed_skill"] for r in rows if r["gap"] and r["proposed_skill"] not in CANONICAL})
if unmapped:
    raise SystemExit(f"unmapped proposed_skill names, add them to CANONICAL: {unmapped}")

for r in rows:
    r["canonical_skill"] = CANONICAL[r["proposed_skill"]] if r["gap"] else None
(D / "coverage.json").write_text(json.dumps(rows, indent=0))

by_skill = collections.defaultdict(lambda: {"concepts": 0, "certs": collections.Counter(), "labels": []})
for r in rows:
    if r["gap"]:
        s = by_skill[r["canonical_skill"]]
        s["concepts"] += 1
        s["certs"].update(concepts[r["concept_id"]]["certs"])
        if len(s["labels"]) < 6:
            s["labels"].append(concepts[r["concept_id"]]["label"])

print(f"rows {len(rows)}  gaps {sum(r['gap'] for r in rows)}  strong-covered {sum(not r['gap'] for r in rows)}")
for name, s in sorted(by_skill.items(), key=lambda kv: -kv[1]["concepts"]):
    certs = ", ".join(f"{CERT_CODE[k]}:{v}" for k, v in s["certs"].most_common())
    print(f"{s['concepts']:4}  {name:28} [{certs}]  e.g. {'; '.join(s['labels'][:4])}")
covered = collections.Counter(e["skill_id"] for r in rows if not r["gap"] for e in r["covered_by"] if e["strength"] == "strong")
print("strong coverers:", covered.most_common(10))
