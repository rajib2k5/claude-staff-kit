# Rule: Definition of Done

"Done" is not "the code is written." Reporting done prematurely is the most expensive available
failure: it moves discovery of the bug to production and removes the person who had the context.

## The gate — every item, or say which you skipped and why

**Correctness**
- [ ] The original problem is **reproduced** and the reproduction now passes (bug work).
- [ ] Tests written for the new behaviour, and observed **failing before** the fix (RED→GREEN).
- [ ] Boundary cases considered explicitly: empty, null, 1, n, n+1, max, negative, duplicate, unicode.
- [ ] Error paths exercised, not just the happy path.

**Verified — executed this session, output seen**
- [ ] Build/compile passes. *Command run and output observed.*
- [ ] Full relevant test suite passes. *Command run and output observed.*
- [ ] Lint and type-check pass with no new suppressions.
- [ ] For data work: the SQL/model actually compiled and ran; row counts and a grain check were
      inspected.

**Operability**
- [ ] Failures are detectable — a log, metric, or alert exists for the way this breaks.
- [ ] Rollback path is known and stated. For T3+ changes, a rollback *plan*, not just a revert.
- [ ] No new unbounded retry, queue, fan-out, or missing timeout introduced.

**Review readiness**
- [ ] Diff contains one logical change. No opportunistic refactoring bundled in.
- [ ] Nothing left behind: debug prints, commented-out code, TODOs without an issue link, skipped
      tests, temporary files.
- [ ] Docs/README/ADR/dbt descriptions updated in the same change if behaviour or contracts moved.
- [ ] Secrets: none added, none logged, none committed.

**Validation (see `adversarial-validation.md`)**
- [ ] Adversarial validation run if the change is T3+, produces a number for a human, touches
      production data, or is security-relevant.
- [ ] Any flagged blocker **empirically reproduced** before being acted on.

## Reporting

State plainly what was verified and how. Name what was **not** done and why. Never use "tests pass",
"verified", "working", or "faster" without a command executed in this session behind it.

---

## Project thresholds

> These are the numbers the gate is enforced against. The values below are **proposed defaults** —
> they are deliberately the one part of this ruleset that should reflect your judgement rather than a
> generic standard, because the right threshold depends on the blast radius of the system.
>
> Edit this block per your preference; it is read as authoritative wherever it disagrees with a
> generic default elsewhere in these rules.

```yaml
thresholds:
  # Review
  max_pr_substantive_lines: 400      # beyond this, defect detection collapses — split the PR
  max_cyclomatic_complexity: 10      # smell; 15 = defect

  # Testing
  coverage_floor_critical_paths: 90  # auth, payment, deletion, anything irreversible
  coverage_floor_overall: 70         # a floor to detect gaps, NOT a target to chase
  flaky_test_tolerance: 0            # a flaky test is a failing test: fix or delete
  mutation_score_critical_modules: 70

  # Data platform
  dbt_pk_test_coverage: 100          # every model: unique + not_null on its PK
  dbt_source_freshness_required: true
  dbt_mart_column_documented: 100    # an undocumented mart column becomes a misread number
  incremental_lookback_days: 3       # minimum late-arrival window on incremental models

  # Snowflake
  warehouse_auto_suspend_seconds: 60
  statement_timeout_seconds: 3600
  min_partition_prune_ratio: 0.90    # investigate any large-table query scanning >10% of partitions
  clustering_key_requires_measured_gain: true

  # Reliability
  slo_review_cadence_days: 30
  alert_must_have_runbook: true
  feature_flag_max_age_days: 90
```
