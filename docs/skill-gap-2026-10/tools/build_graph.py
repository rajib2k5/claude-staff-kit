"""Build the cert-concept -> skill knowledge graph with graphify's engine.

Structure edges (cert/domain/concept/feature/task) are EXTRACTED from the derived tag files.
Coverage edges (concept -> existing skill, concept -> proposed skill) are INFERRED: they are
judgements made by the coverage mappers and carry the mapper's confidence_score.

Per-chunk semantic extraction is not used on purpose: it only links entities that share a
chunk, and exam concepts and skills never do, so the coverage edges would never form.

Usage (from docs/skill-gap-2026-10): $(cat graphify-out/.graphify_python) -I tools/build_graph.py
"""
import json
import re
from pathlib import Path

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.export import to_json
from graphify.report import generate

D = Path("derived")
OUT = Path("graphify-out")
CERT_CODE = {"claude-certified-architect-foundations": "CCAR-F", "claude-architect-professional": "CCAR-P",
             "claude-certified-associate-foundations": "CCAO-F", "claude-developer-foundations": "CCDV-F"}


def norm(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


nodes, edges = {}, []


def node(nid, label, ftype, src, **attrs):
    nodes.setdefault(nid, {"id": nid, "label": label, "file_type": ftype, "source_file": src,
                           "source_location": None, **attrs})
    return nid


def edge(a, b, rel, conf, score, src):
    edges.append({"source": a, "target": b, "relation": rel, "confidence": conf,
                  "confidence_score": score, "source_file": src, "source_location": None, "weight": score})


def tag_rows(path, src_kind):
    for line in path.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        cert = node(f"cert_{norm(CERT_CODE[r['cert']])}", CERT_CODE[r["cert"]], "concept", str(path), kind="cert")
        dom = node(f"domain_{norm(CERT_CODE[r['cert']] + ' ' + r['domain'])}",
                   f"{CERT_CODE[r['cert']]}: {r['domain']}", "concept", str(path), kind="domain")
        edge(dom, cert, "references", "EXTRACTED", 1.0, str(path))
        for c in r["concepts"]:
            cid = node(f"concept_{norm(c)}", c, "rationale", str(path), kind="concept")
            nodes[cid].setdefault("evidence", set()).add(src_kind)
            edge(cid, dom, "conceptually_related_to", "EXTRACTED", 1.0, str(path))
            for f in r["features"]:
                fid = node(f"feature_{norm(f)}", f, "concept", str(path), kind="feature")
                edge(cid, fid, "references", "EXTRACTED", 1.0, str(path))


for p in sorted(D.glob("concepts-*.jsonl")):
    tag_rows(p, "practice-question")
if (D / "official_tasks.jsonl").exists():
    tag_rows(D / "official_tasks.jsonl", "official-guide")

catalog = {s["id"]: s for s in json.loads((D / "skill_catalog.json").read_text())}
for row in json.loads((D / "coverage.json").read_text()):
    cid = row["concept_id"]
    if cid not in nodes:
        continue
    for e in row["covered_by"]:
        s = catalog[e["skill_id"]]
        sid = node(s["id"], f"{s['kind']}: {s['name']}", "document", "derived/skill_catalog.json",
                   kind="existing-skill", origin=s["origin"])
        edge(cid, sid, "implements" if e["strength"] == "strong" else "semantically_similar_to",
             "INFERRED", e["confidence_score"], "derived/coverage.json")
    if row["gap"]:
        pid = node(f"proposed_{norm(row['canonical_skill'])}", f"PROPOSED skill: {row['canonical_skill']}",
                   "concept", "derived/coverage.json", kind="proposed-skill")
        edge(cid, pid, "rationale_for", "INFERRED", 0.75, "derived/coverage.json")

for n in nodes.values():
    if isinstance(n.get("evidence"), set):
        n["evidence"] = sorted(n["evidence"])

extraction = {"nodes": list(nodes.values()), "edges": edges, "hyperedges": [], "input_tokens": 0, "output_tokens": 0}
OUT.mkdir(exist_ok=True)
(OUT / ".graphify_extract.json").write_text(json.dumps(extraction, ensure_ascii=False), encoding="utf-8")

G = build_from_json(extraction, root=".", directed=False)
if G.number_of_nodes() == 0:
    raise SystemExit("ERROR: graph is empty")
communities = cluster(G)
cohesion = score_all(G, communities)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)


def community_label(members):
    """Name a community after its dominant proposed skill, else its dominant domain."""
    kinds = [G.nodes[m] for m in members]
    for k in ("proposed-skill", "domain", "cert"):
        hits = [n["label"] for n in kinds if n.get("kind") == k]
        if hits:
            return hits[0].replace("PROPOSED skill: ", "")[:40]
    return f"Community {len(members)}"


labels = {cid: community_label(m) for cid, m in communities.items()}
questions = suggest_questions(G, communities, labels)
detection = {"total_files": len(list(D.glob("*.json*"))), "total_words": 0, "files": {}}
tokens = {"input": 0, "output": 0}
if not to_json(G, communities, str(OUT / "graph.json"), community_labels=labels):
    raise SystemExit("ERROR: graphify refused to shrink graph.json; rebuild with a clean graphify-out/")
report = generate(G, communities, cohesion, labels, gods, surprises, detection, tokens, ".", suggested_questions=questions)
(OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
kinds = {}
for _, a in G.nodes(data=True):
    kinds[a.get("kind", "?")] = kinds.get(a.get("kind", "?"), 0) + 1
print(json.dumps({"nodes": G.number_of_nodes(), "edges": G.number_of_edges(), "communities": len(communities),
                  "by_kind": kinds}, indent=1))
