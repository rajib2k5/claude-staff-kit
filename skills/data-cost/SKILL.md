---
name: data-cost
description: Investigate and reduce warehouse or cloud spend — establish unit economics, find idle and oversized resources, cut data scanned, and quantify savings as validated ranges. Use for any cost investigation or savings estimate. Triggers - reduce costs, snowflake bill, cloud spend, cost optimization, why is our bill so high.
---

# Cost investigation

Read `~/.claude/rules/performance-and-cost.md` and `snowflake-standards.md`.
If the Snowflake MCP server is unavailable, run every query with the `snowflake-sql` skill (`~/.claude/skills/snowflake-sql/sf.py`; the PAT comes from the environment variable named in its `config.json`, and it is read-only by default).

The output is a number a decision-maker will act on, which makes accuracy the whole job. An optimistic
saving that does not materialise costs more credibility than finding nothing.

## Step 1 — unit economics before anything else

A total monthly figure is not actionable. **Cost per request / per tenant / per pipeline run / per GB
scanned** is, because it tells you whether the problem is volume, efficiency, or waste — three different
fixes. Compute it first.

Then attribute: tags, labels, `QUERY_TAG`. Untagged spend cannot be optimised or defended, and
"unattributed" is usually the largest line item in a neglected account.

## Step 2 — the wins, in this order

1. **Turn off what nobody uses.** Idle environments, orphaned volumes, zombie warehouses, hourly-refreshing
   dashboards nobody opens, retained logs nobody queries. Almost always the largest win and the lowest risk.
2. **Right-size what is over-provisioned.** Measure utilisation first. For warehouses: high uptime with low
   utilisation. Remember **size up fixes spilling, scale out fixes queueing** — the wrong lever spends money
   and fixes nothing.
3. **Stop scanning data you do not need.** Pruning, sargable filters, projection, incremental instead of
   full refresh, materialising a repeatedly-recomputed aggregate.
4. **Commit or reserve genuinely steady usage** — last, because a commitment made before steps 1–3 is a
   commitment to your own waste.

Always check the surprising line items: **egress, cross-region traffic, NAT, log ingestion, per-file
ingest charges, Time Travel and snapshot storage.**

## Step 3 — rigour on every figure

- Quote the **exact window** each measurement covers, and use one source consistently.
  `ACCOUNT_USAGE` (≤45 min latency) vs `INFORMATION_SCHEMA` (real-time) mixed together produces a fake
  discrepancy that will eat an afternoon.
- Separate **measured current spend** from **projected saving**. Label the projection, state its
  assumptions, and give a **range**, not a point estimate.
- Check seasonality before extrapolating. A month-end batch or quarterly close makes a one-week sample
  misleading.
- State the **cost of the change** — engineering time, reclustering credits, migration risk, lost headroom.
  A saving that ignores its own cost is not a saving.

## Step 4 — mandatory validation

Dispatch `cost-optimizer` (Opus) for the analysis, then **run `staff-validate`** on every figure before
presenting it. A wrong number in front of a decision-maker is the top-priority defect class in this
environment.

## Report

Ranked by (annualised saving ÷ risk). Per item: measured current cost with its window · the change ·
projected saving as a labelled range · the risk · how to verify it worked afterwards.
