---
description: Report AI spend (Snowflake Cortex, AWS Bedrock, Claude API, local Claude Code) for a window, one subtotal per USD basis
argument-hint: [--days N | --since YYYY-MM-DD --until YYYY-MM-DD] [sources: local anthropic snowflake bedrock | all]
---

Invoke the `ai-spend` skill.

Arguments: $ARGUMENTS  (no window: `--days 7`; no sources: `local` only, because it is free and needs no credentials)

1. Parse the window and the sources from the arguments. Pass the same window to every fetcher.
2. Before you run `anthropic`, `snowflake` or `bedrock`, check that its credential is set (see the skill's
   Credentials table) and tell the user what the run costs: Cost Explorer charges USD 0.01 per request, and the
   Snowflake queries use warehouse time. Run them only when the user asked for those sources.
3. Write each source document to a new scratch folder, never into a repository, then run `report.py` on them.
4. Show the report. Say for each source its status and fetched time. Keep every figure with its `usd_basis` label;
   never add two bases, and never report UNKNOWN or an unpriced model as 0.
