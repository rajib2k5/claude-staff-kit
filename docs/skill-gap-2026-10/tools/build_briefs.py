"""Build one author brief per proposed skill: gap concepts, official tasks, current-docs
facts, and the lesson files whose titles match the skill's topic.

Usage (from docs/skill-gap-2026-10): python3 -I tools/build_briefs.py
"""
import json
import re
from pathlib import Path

D = Path("derived")
LESSONS = Path("../../.cache/certsafari/lessons_txt")

# Topic routing. Lesson and task matching is keyword based on purpose: it is cheap,
# deterministic, and the author agent judges relevance when it reads the files.
SKILLS = {
    "claude-agent-orchestration": (r"agent|subagent|orchestrat|multi-agent|handoff|escalat|human-in-the-loop|workflow pattern",
                                   ["Subagents", "Agent SDK"]),
    "claude-prompt-engineering": (r"prompt|few-shot|structured output|json|schema|xml|system prompt|instruction",
                                  ["Structured outputs", "Models and deprecations"]),
    "claude-governance": (r"governance|safety|risk|responsible|complian|privacy|security|enterprise|admin|policy|bias",
                          ["Admin and enterprise"]),
    "claude-api-ops": (r"batch|cach|cost|rate limit|latency|model selection|choosing (a|the) model|token|stop.reason|stream|retry|error",
                       ["Prompt caching, batches, token counting", "Models and deprecations", "Messages API tool use"]),
    "claude-evals": (r"eval|test|success criteria|grader|judge|quality|validat|verif|benchmark",
                     []),
    "claude-code-config": (r"claude code|claude\.md|hook|permission|settings|headless|\bci\b|slash|plugin|skill",
                           ["Claude Code config", "Hooks", "Skills and plugins", "Headless / CLI"]),
    "claude-solution-design": (r"solution design|business problem|use case|stakeholder|lifecycle|adoption|integration|architecture|product",
                               []),
    "claude-rag-and-citations": (r"\brag\b|retriev|citation|knowledge|search|embedding|ground|document",
                                 ["Citations and search results"]),
    "claude-tool-and-mcp-design": (r"tool|mcp|function call",
                                   ["MCP (Claude Code and API)", "Messages API tool use"]),
    "claude-context-management": (r"context|compaction|memory|long-running|window",
                                  ["Context management"]),
}
MAX_LESSONS, MAX_LESSON_WORDS = 8, 25000


def title_of(path):
    return path.stem.split("__")[-1].replace("-", " ")


concepts = {c["id"]: c for c in json.loads((D / "concept_catalog.json").read_text())}
coverage = json.loads((D / "coverage.json").read_text())
tasks = [json.loads(l) for l in (D / "official_tasks.jsonl").read_text().splitlines()]
docs = json.loads((D / "docs_feature_map.json").read_text())
lesson_files = sorted(p for p in LESSONS.glob("*.txt") if "__learn__" in p.name)

out = D / "briefs"
out.mkdir(exist_ok=True)
for skill, (pattern, doc_topics) in SKILLS.items():
    rx = re.compile(pattern, re.I)
    gap = [concepts[r["concept_id"]] for r in coverage if r["canonical_skill"] == skill]
    mine = [t for t in tasks if rx.search(t["task"] + " " + " ".join(t["concepts"]) + " " + t["domain"])]
    picked, words = [], 0
    for p in sorted(lesson_files, key=lambda p: -len(rx.findall(title_of(p)))):
        if not rx.search(title_of(p)) or len(picked) >= MAX_LESSONS:
            continue
        w = len(p.read_text().split())
        if words + w > MAX_LESSON_WORDS:
            continue
        picked.append(str(p.resolve()))
        words += w
    brief = {
        "skill": skill,
        "gap_concepts": [{"label": c["label"], "certs": c["certs"], "competencies": c["competencies"]} for c in gap],
        "official_tasks": mine,
        "docs_facts": [d for d in docs if d["topic"] in doc_topics],
        "lesson_files": picked,
        "lesson_words": words,
    }
    (out / f"{skill}.json").write_text(json.dumps(brief, indent=1))
    print(f"{skill:28} gaps={len(gap):3} tasks={len(mine):3} docs={len(brief['docs_facts']):3} "
          f"lessons={len(picked):2} words={words}")
