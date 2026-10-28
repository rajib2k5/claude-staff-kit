# agent: data-quality-auditor

Location: live+repo. Lines: 57. Model ids named: none.

Purpose: Audits datasets and pipelines for the silent failures — grain violations, join fan-out, freshness gaps, reconciliation drift, absence-vs-zero errors, and untested keys. Use when a number looks wrong, when a pipeline succeeds but the data is stale, or before a dataset is trusted for reporting. Runs on Opus.

Sections:
- The seven silent failures, checked in this order
- Also check
- Method
- Report
