# quant-rigor

A Claude Code plugin for statistical rigour in quant research. It replaces code that was written
by hand, again and again, across many research repos.

| Artifact | Type | What it does |
|---|---|---|
| `quant-stats` | skill + `scripts/quant_stats.py` | Sharpe, PSR, DSR, Holm, Diebold-Mariano (HLN, exact t without scipy), purged walk-forward and k-fold splits, block sign-flip test. Standard library + numpy. |
| `quant-prereg-holdout` | skill + `scripts/prereg.py` | Seal a plan and its data hashes, then score the holdout exactly once. |
| `quant-research-auditor` | agent (opus) | Adversarial checklist for a quant research claim: sealed holdout, honest k, lookahead, survivorship, proxy metric. |
| `market-data-fetch` | skill + `manifest.py` + `dolthub_guard.py` | SHA-256 manifest for fetched data; a read-only guard for DoltHub SQL. |
| `/egv-ledger` | command | Scaffold `docs/validation/{claims-ledger,channel-a,channel-b}.md`. |

## Install

```bash
claude plugin marketplace add rajib2k5/claude-staff-kit
claude plugin install quant-rigor@claude-staff-kit
```

## Test

```bash
python3 -m unittest discover -s plugins/quant-rigor/tests -p 'test_*.py'
```

`tests/test_mutants.py` applies one hand-written bug per public function to a temporary copy of
each script and checks that the suite fails on it. Every value the tests pin, and every decision
taken where the old copies disagreed, is in [DESIGN.md](DESIGN.md).

Requires Python 3.11+ (`python3 -P`) and numpy.
