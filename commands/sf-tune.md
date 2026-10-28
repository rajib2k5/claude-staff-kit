---
description: Tune a slow or expensive Snowflake query from the Query Profile — pruning, then spill, then idle compute
argument-hint: [query, query_id, or model name]
---

Invoke the `data-snowflake-tune` skill.

If the Snowflake MCP server is unavailable, run every query with the `snowflake-sql` skill (`~/.claude/skills/snowflake-sql/sf.py`; the PAT comes from the environment variable named in its `config.json`, and it is read-only by default).

Target: $ARGUMENTS

Diagnose **in this order** — the order matters because the wrong lever costs money and fixes nothing:
1. **Pruning** — `partitions scanned / partitions total`. Check for non-sargable filters first
   (`TO_DATE(ts) = ...`, `UPPER(col) = ...`) — they defeat pruning entirely.
2. **Spill** — bytes spilled to remote storage. But **rule out an exploding join first**: a fan-out looks
   exactly like an undersized warehouse, and sizing up to absorb it pays credits forever for wrong rows.
3. **Idle / queueing** — size up fixes spilling; scale out fixes queueing.

Doubling warehouse size is cost-neutral only if the query gets ≥2× faster. **Measure it.**

Report before/after elapsed time, credits, partitions scanned/total, and spill — each with the window and
warehouse it was measured on.
