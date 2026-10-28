"""Apply the evidence-gated-validation convergence gate to channel-a.json and channel-b.json.

Gate (per claim):  A CONFIRMED + B CONFIRMED -> ACCEPTED
                   A REFUTED   + B REFUTED   -> REJECTED (fix required)
                   any divergence             -> SPLIT (decompose and re-run both channels)
                   any UNVERIFIABLE           -> UNRESOLVED (blocks; ship only with an explicit label)
PROBE_INVALID never enters the gate: it counts as Channel B UNVERIFIABLE.
The two channels are never reconciled by discussion; this script is the only comparison.

Usage (from docs/skill-gap-2026-10): python3 -I tools/egv_gate.py
"""
import collections
import json
from pathlib import Path

V = Path("validation")


def load(name):
    return {r["id"]: r for r in json.loads((V / name).read_text())}


a, b = load("channel-a.json"), load("channel-b.json")
ids = sorted(set(a) | set(b), key=lambda i: (i[0], i))
missing = {"A": sorted(set(b) - set(a)), "B": sorted(set(a) - set(b))}


def gate(va, vb):
    vb = "UNVERIFIABLE" if vb == "PROBE_INVALID" else vb
    if va == vb == "CONFIRMED":
        return "ACCEPTED"
    if va == vb == "REFUTED":
        return "REJECTED"
    if "UNVERIFIABLE" in (va, vb):
        return "UNRESOLVED"
    return "SPLIT"


rows = []
for i in ids:
    va = a.get(i, {}).get("verdict", "MISSING")
    vb = b.get(i, {}).get("verdict", "MISSING")
    g = "UNRESOLVED" if "MISSING" in (va, vb) else gate(va, vb)
    rows.append({"id": i, "A": va, "B": vb, "gate": g,
                 "a_note": (a.get(i, {}).get("note") or "")[:160],
                 "b_note": (b.get(i, {}).get("note") or "")[:160]})

(V / "gate.json").write_text(json.dumps(rows, indent=1))
counts = collections.Counter(r["gate"] for r in rows)
lines = ["# Convergence gate", "", f"Claims: {len(rows)}. " + ", ".join(f"{k} {v}" for k, v in counts.most_common()), "",
         "| ID | A | B | Gate | A note | B note |", "|---|---|---|---|---|---|"]
order = {"REJECTED": 0, "SPLIT": 1, "UNRESOLVED": 2, "ACCEPTED": 3}
for r in sorted(rows, key=lambda r: (order[r["gate"]], r["id"])):
    lines.append(f"| {r['id']} | {r['A']} | {r['B']} | **{r['gate']}** | {r['a_note']} | {r['b_note']} |".replace("\n", " "))
(V / "gate.md").write_text("\n".join(lines) + "\n")
print(json.dumps({"claims": len(rows), "gate": dict(counts), "missing_from": missing}, indent=1))
for r in rows:
    if r["gate"] in ("REJECTED", "SPLIT"):
        print(f"{r['gate']:9} {r['id']:34} A={r['A']:12} B={r['B']:12} | {r['a_note'][:90]} || {r['b_note'][:90]}")
