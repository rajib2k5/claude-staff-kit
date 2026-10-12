---
description: Audit a dbt project — layering violations, untested keys, unsafe incrementals, missing contracts, undocumented marts
argument-hint: [optional model selector or path]
---

Invoke the `data-dbt-audit` skill.

Scope: $ARGUMENTS  (if empty, audit the whole project)

Execute the checks — do not read model code and infer. In particular:
- `grep -r "source(" models/ --include=*.sql | grep -v "models/staging"` — every hit is a layering violation.
- List every model whose primary key lacks **both** `unique` and `not_null`.
- For every incremental model, verify the five required declarations, especially the **lookback window** —
  a strict `>` against `max(updated_at)` silently drops late-arriving rows forever.
- **Diff a full refresh against an incremental run.** Almost nobody checks this; it is where the real bugs are.

Rank findings by whether they could put a **wrong number in front of a decision-maker**, then by silent-
failure risk, then operability, then hygiene. Paste the actual `dbt build` output.
