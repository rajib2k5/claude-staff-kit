---
name: semantic-view-authoring
description: Turn a discovery-call transcript or an ERD or DDL into a Snowflake semantic view, a Cortex Agent bound to it, and verification queries that reconcile semantic-view answers to plain SQL on the base tables. Use when building or reviewing a CREATE SEMANTIC VIEW or CREATE AGENT script, or when metric definitions must be traced to what the business said. Triggers - semantic view, cortex analyst, cortex agent, metric definitions from a transcript, text to sql semantic model, verify semantic view.
---

# Semantic view authoring

The `semantic-model-author` agent loads this skill. It holds the method, the syntax references and a worked example.

Files:

- `references/semantic-view-syntax.md`: the semantic view clauses, with UNVERIFIED marks.
- `references/agent-spec.md`: the agent specification keys.
- `references/example-retail.sql`: a complete retail example (base tables, view, agent, verification). Domain is
  invented. Use it for shape only.

Official docs: https://docs.snowflake.com/en/sql-reference/sql/create-semantic-view and
https://docs.snowflake.com/en/sql-reference/sql/create-agent. Read them when a clause is not in the references.

## Procedure

1. **Extract the tables.** From the transcript or DDL list every table, its grain ("one row per ..."), its primary
   key, and how it joins to the others. Where the source does not say, write it as an open question.
2. **Check the keys before modelling.** For each table the declared key must be unique:
   `SELECT <key>, COUNT(*) FROM <t> GROUP BY <key> HAVING COUNT(*) > 1` returns no rows. A comment that says "one row
   per payment" next to a key of `LOAN_ID` is a red flag: one loan has many payments. Fix the key or the comment.
3. **Decide the relationships.** Each foreign key points at the parent's primary key. Follow what the data owner says
   about the path (a child that belongs to a contract joins to the contract, not straight to the customer). Never
   join on a non-key column.
4. **Classify each number** the business names.
   - Raw event table, countable or summable: a **fact** plus a **metric**.
   - Pre-aggregated rollup: a **metric** at the rollup grain. Rates and ratios use `AVG`, never `SUM`.
   - Descriptive attribute or date: a **dimension**.
   Write the exact quote that grounds each metric. If the business did not define a term, list it as an open
   question. Do not invent a definition.
5. **Write the view** in clause order: TABLES, RELATIONSHIPS, FACTS, DIMENSIONS, METRICS, COMMENT. Every table has a
   key, synonyms and a grain comment. Every dimension comment lists its allowed values. Every metric comment names
   its grain and filters.
6. **Write the agent** bound to the view and a warehouse. Use the sample questions from the transcript.
7. **Write the verification queries** (next section). They are part of the deliverable.
8. **Run nothing against a live account unless asked.** When asked, use the `snowflake-sql` skill, run in a sandbox,
   and paste the output.

## Verification set

Produce all four kinds:

1. **Key checks.** One query per table: duplicate keys return zero rows.
2. **Orphan checks.** Each foreign key has no child without a parent (anti-join returns zero rows).
3. **Fan-out checks.** For each relationship, row count of the child equals row count of child joined to parent.
   For each metric that crosses a relationship, the total through the semantic view equals the total on the base
   table.
4. **Question reconciliation.** For each sample question, a `SEMANTIC_VIEW(...)` query and a plain SQL query over the
   base tables, compared with `EXCEPT` in both directions. The comparison returns zero rows when they agree. If it
   returns rows, the view or the plain SQL is wrong. Find out which before you change either.

Expected values: compute a few by hand on a small seed and write them next to the query.

## Traps

- **Wrong key, silent wrong answers.** A non-unique primary key does not fail at creation. It fails as inflated
  metrics. Check keys first.
- **Fan-out through a many-to-many link.** Joining a rollup to a dimension on a column such as a region name
  multiplies rows. Keep the rollup unlinked and query it on its own dimensions.
- **Summing rates.** A rate, ratio or average must use `AVG` (or be recomputed from a numerator and denominator).
- **Unit drift.** Transcript says "per month", comment says "per quarter". Pick the transcript and flag the mismatch.
  The source lab had one of these.
- **Raw metric next to a business metric.** Two metrics that both look like "application volume" make the agent
  guess. Give the business name to one and mark the other "(raw)" in its synonym.
- **Invented definitions.** If the transcript does not define a term, the metric does not ship. List it as an open
  question.
- **Unverified syntax.** Mark any clause you did not run. See the references for the current list.
- **Privileges.** The agent's role needs access to the view, base tables and warehouse. A "does not exist or not
  authorized" error is usually a missing grant.
- **Names.** Use neutral names and no real customer data in comments, synonyms or sample questions.

## Report

State: the files written, each table with its grain and key, each metric with its grounding quote, the open
questions, which verification queries you ran and their output (or "not run"), and which syntax is unverified.
