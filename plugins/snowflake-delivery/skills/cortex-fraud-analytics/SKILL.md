---
name: cortex-fraud-analytics
description: Analyse card and account fraud in Snowflake with eight query workflows - pattern analysis, transaction investigation, reporting, risk scoring, velocity, impossible travel, time-of-day patterns and device or IP sharing - over customers, accounts, transactions, merchants, fraud labels and alerts. Use when someone asks to find, investigate or report fraud in a transactions dataset. Triggers - fraud analysis, suspicious transactions, fraud rate by channel, velocity attack, impossible travel, night fraud, device fingerprint, shared IP, fraud report.
---

# Fraud analytics on Snowflake

Ported from a Cortex Code lab skill. The queries live in `references/queries.md`. This file says which workflow to
run, what to ask first, and what goes wrong.

Run SQL with the `snowflake-sql` skill. This skill reads data only. Do not create or change objects.

## Expected data

A database and schema with `CUSTOMERS`, `ACCOUNTS`, `TRANSACTIONS`, `MERCHANTS`, `FRAUD_LABELS`, `ALERTS`. The lab
used synthetic data from `cortex-synthetic-data-demo` (domain `financial_fraud`). Confirm the names and grain of each
table with `DESCRIBE TABLE` before you run anything. Replace `<DB>.<SCHEMA>` in the queries with the real location.

## Procedure

1. **Pick the workflow** from the table.
2. **Confirm parameters** with the user before you run queries: time window (default 30 days), thresholds, scope
   (all customers, a segment or one customer). State the defaults you will use if they do not answer.
3. **Check the tables first.** Row counts, and that `TRANSACTION_ID` is unique in `TRANSACTIONS` and `FRAUD_LABELS`.
   A duplicate key makes every rate wrong.
4. **Run the queries** from `references/queries.md`, one workflow at a time. Show the first results and check they
   make sense before you go deeper.
5. **Reconcile.** The transaction count in any report must equal `COUNT(*)` on the same window and filters.
6. **Present** findings, the rule or threshold you recommend, and the caveats below.

| Intent | Words that signal it | Workflow in `queries.md` |
|---|---|---|
| Patterns | fraud patterns, trends, by channel or country | 1 Fraud Pattern Analysis |
| Investigation | investigate, look into a transaction or customer | 2 Transaction Investigation |
| Reporting | report, summary, metrics | 3 Fraud Reporting |
| Risk | risk score, high-risk merchants or customers | 4 Risk Assessment |
| Velocity | rapid, burst, many in an hour | 5 Velocity Analysis |
| Geography | impossible travel, location, country | 6 Geographic Anomaly Detection |
| Time | night, weekend, hourly | 7 Time-Based Pattern Analysis |
| Device | device, IP, shared IP | 8 Device Fingerprint Analysis |

Pause and confirm with the user before running queries, after the first findings, before producing a report for
others, and before you flag named customers.

## Traps

- **Join fan-out.** The lab's executive summary and customer risk queries joined `ALERTS` and `TRANSACTIONS` to the
  same row and inflated counts. The versions in `queries.md` aggregate each side first. When you write new queries,
  prove the grain of every join (`GROUP BY key HAVING COUNT(*) > 1` returns nothing).
- **Labelled-only rates.** Inner joins to `FRAUD_LABELS` drop unlabelled transactions. Say which denominator you used.
- **Small groups.** A 100 percent rate on 3 transactions is not a finding. The queries use `HAVING COUNT(*) >= n`
  thresholds. Keep them and report the group size.
- **Thresholds are examples.** Risk weights, velocity limits (5 in an hour), travel windows (60 minutes) and hour
  bands come from the lab. They are starting points. Calibrate them against labelled data before anyone acts on them.
- **Time zones.** Hour-of-day and day-of-week results depend on the stored time zone. Say which one you used (default
  UTC).
- **Window frames not run.** The `RANGE BETWEEN INTERVAL ... PRECEDING` frames were not executed in this port. See
  the note at the top of `queries.md`.
- **Personal data.** Customer names and IP addresses are personal data. Show IDs by default. Share names only when
  the user asks and is allowed to see them.
- **Correlation is not a rule.** A high fraud rate in one hour or city may be driven by one actor. Check
  `COUNT(DISTINCT customer)` before recommending a blanket rule.

## Sample questions

Fraud rate by channel this month. Compare this month with last month. Investigate customer X. Weekly fraud report.
Merchants with the highest fraud rate. Customers with more than 5 transactions in an hour. Cross-country travel within
2 hours. Night against day fraud. IPs shared by several customers.

## Report

Give: the workflow and parameters used, the time window, the SQL that produced each number, row counts and the
denominator for every rate, group sizes, the caveats that apply, and recommended rules marked as proposals with the
data behind them. Say which queries you did not run.
