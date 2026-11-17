---
name: quant-prereg-holdout
description: Pre-register a quant research claim and test it on a sealed holdout exactly once with prereg.py - seal the plan (hypothesis, proxy label, k trials, alpha, block length, window) and the data hashes, then score once with a block sign-flip test, Holm over k and a max-statistic family-wise p. Use before anyone looks at holdout data for an "A beats B" or "this signal works" claim on per-date metrics. Triggers - pre-register, preregistration, sealed holdout, one-shot holdout, score the holdout, out of sample test, A beats B, did we overfit, holdout was peeked.
---

# quant-prereg-holdout

`${CLAUDE_PLUGIN_ROOT}/scripts/prereg.py` puts the pre-registered one-shot holdout procedure of
the evidence-gated-validation skill (`references/complementary-methods.md` sections 4-5) into
code. Standard library only; `score` loads `quant_stats.py` from its own folder by path.

## Procedure

1. **Before anyone opens the holdout,** write `PLAN.json`:
   ```json
   {"schema": "quant-rigor/prereg-plan/1", "id": "2026-11-20-har-vs-naive",
    "hypothesis": "HAR beats the naive forecast on QLIKE",
    "metric": {"name": "QLIKE", "is_proxy": true, "decision_metric": "PnL of the vol-targeted book"},
    "candidates": ["har", "har_j"], "k": 7,
    "orientation": "d = metric(benchmark) - metric(candidate); d > 0 favours the candidate",
    "alpha": 0.05, "sidedness": "greater", "correction": "holm",
    "test": {"name": "block_signflip", "block": 21,
             "block_rationale": "sweep on the training window: SE stable from 21 to 42 (<10%)",
             "draws": 10000, "seed": 20261120},
    "holdout": {"start": "2024-01-02", "end": "2025-12-31", "n_periods": 501},
    "amends": null}
   ```
   `k` is every comparison tried, not the survivors. Measure the block length on training data.
   Dates are plain `YYYY-MM-DD`. `correction: "maxstat"` is allowed only when `k` equals the number
   of candidates (the max over the scored rows says nothing about trials not scored); otherwise use
   `holm`.
2. **Write the data file** into the holdout directory: UTF-8 CSV without a byte-order mark,
   `date,<candidate>,...`, one row per holdout period, values already oriented (d > 0 favours
   the candidate). `seal` checks the header, row count and dates (no value column is read), so a
   layout mistake is refused before the window can be spent.
3. **Seal and commit at once:**
   ```bash
   python3 -P "${CLAUDE_PLUGIN_ROOT}/scripts/prereg.py" seal --plan PLAN.json --data d.csv --dir holdout/
   git add holdout/ && git commit -m "Seal holdout plan <id>"
   ```
4. **Score once:**
   ```bash
   python3 -P "${CLAUDE_PLUGIN_ROOT}/scripts/prereg.py" score --id <id> --dir holdout/
   ```
   Commit `<id>.result.json` and `spent.jsonl` immediately. `verify` re-checks the hashes and
   writes nothing.
5. **Changed your mind?** Seal a new id with `"amends": "<sealed_sha256 of the old record>"`. The
   old window stays spent; an overlapping window is refused.

## Traps

| Trap | What the script does |
|---|---|
| Plan, data or scorer edited after the seal | exit 3 (integrity) |
| Second scoring, reseal, or a new id on an overlapping window | exit 4 (one-shot) |
| Crash or a non-numeric/non-finite value during scoring | the window was marked spent first, so it stays spent |
| numpy or quant_stats.py cannot be loaded | fails before the window is spent (exit 1); fix the environment and score again |
| Fewer than 8 blocks | every decision UNRESOLVED (exit 0: that is a finding) |
| maxstat with k > candidates | refused at seal (exit 5) |
| Windows given as datetimes or with time zones | refused; plain dates compare exactly |
| Proxy metric | `metric.is_proxy` is required; the report names the decision metric |
| `python3 -I` | drops user site-packages, where numpy may live; use `-P` (Python 3.11+) |

These are tripwires, not a sandbox: deleting `spent.jsonl` or looking before sealing defeats them.
Git history is the record, so commit the seal before scoring.

## Report

Quote `ID.result.json`: per candidate obs mean, p_raw, p_holm, p_fw_maxstat, decision, and the
Newey-West t (informational: it always has the sign of the mean, so it is not a check); nb,
exact or Monte Carlo, the smallest attainable p, k, alpha, the seal hash and numpy version. Say
REJECT / NOT_REJECTED / UNRESOLVED exactly as written. Hand the result to the
`quant-research-auditor` agent for the procedure attack. Exit codes: 0 ok, 2 usage, 3 integrity,
4 one-shot, 5 invalid plan or data.
