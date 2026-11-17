# CREATE SEMANTIC VIEW: the clauses this skill uses

Official reference: https://docs.snowflake.com/en/sql-reference/sql/create-semantic-view

This page lists only the clauses that appear in the source hands-on lab scripts. Anything else (extra clauses,
options, privileges) is in the official reference. Do not invent clauses. Items marked **UNVERIFIED** were not
executed against an account when this was written.

## Clause order

```
CREATE OR REPLACE SEMANTIC VIEW <db>.<schema>.<view_name>
  TABLES        ( ... )
  RELATIONSHIPS ( ... )
  FACTS         ( ... )
  DIMENSIONS    ( ... )
  METRICS       ( ... )
  COMMENT = '...'
;
```

## TABLES

One entry per logical table. Alias first, then the physical table.

```
<ALIAS> AS <db>.<schema>.<table>
  PRIMARY KEY (<col> [, <col> ...])
  WITH SYNONYMS ('<phrase>', '<phrase>')
  COMMENT = '<grain and role of the table>'
```

- `PRIMARY KEY` is required by this skill on every table. The key must be unique in the data. Check it before you
  create the view (see `example-retail.sql`, section 2).
- A composite key is a list: `PRIMARY KEY (DEALER_ID, PERIOD)`.
- Put the grain in the `COMMENT`: "One row per ...".

## RELATIONSHIPS

```
<REL_NAME> AS <CHILD_ALIAS> (<child_col>) REFERENCES <PARENT_ALIAS> (<parent_col>)
```

- The child is the "many" side. The parent column must be the parent's primary key.
- Name relationships `<CHILD>_TO_<PARENT>`.
- Join a table to the entity it belongs to by the key it truly carries. In the source lab the data owner said the
  servicing table joins to funded contracts (not straight to the dealer), so the dealer attribution flows through
  the contract and an agent can trace a loan back to its application.
- Do not link a table on a column that is not the parent's key (for example a region name). It fans out. Query such
  a table on its own dimensions and say so in a comment.

## FACTS

Row-level values that metrics aggregate. Optional computed expression.

```
<TABLE>.<FACT_NAME> AS <column_or_expression>
  WITH SYNONYMS ('...')
  COMMENT = '...'
```

Source example: `FUNDING_EVENTS.DAYS_TO_FUND AS DATEDIFF('day', CONTRACT_DATE, FUNDED_DATE)`.
**UNVERIFIED:** an operator expression in parentheses, as in `AS (QUANTITY * UNIT_PRICE - DISCOUNT_AMOUNT)`
(used in `example-retail.sql`). The lab only used a function call and plain columns.

## DIMENSIONS

Attributes to group and filter by.

```
<TABLE>.<DIM_NAME> AS <column>
  WITH SYNONYMS ('...')
  COMMENT = '...'
```

Rules from the lab: list every category value in the comment ("Prime, Near_Prime, or Subprime"); say what null means
for dates ("Null if not yet funded"); put the unit in the comment for numeric attributes.

## METRICS

Aggregations. The table prefix names the table whose grain the metric lives at.

```
<TABLE>.<METRIC_NAME> AS <aggregate expression>
  WITH SYNONYMS ('...')
  COMMENT = '...'
```

Source examples: `COUNT(APPLICATION_EVENTS.APPLICATION_ID)`, `SUM(IFF(APPLICATION_EVENTS.DECISION = 'Booked', 1, 0))`,
`AVG(DEALER_PERFORMANCE.LOOK_TO_BOOK)`.

Rules:
- Rates and ratios use `AVG`, never `SUM`. Say "average, never sum" in the comment.
- Counts use `COUNT` on the table's primary key.
- Name metrics so a raw count and a rolled-up figure do not look alike. The lab named raw event counts with
  "(raw)" in the synonym and kept the business-facing metric on the pre-aggregated table.
- Every metric comment states the grain it is computed at and any filter built into it.

## Querying a semantic view (for verification)

**UNVERIFIED** (taken from the Snowflake docs, not the lab scripts):

```
SELECT *
FROM SEMANTIC_VIEW(
    <db>.<schema>.<view_name>
    DIMENSIONS <TABLE>.<DIM> [, <TABLE>.<DIM> ...]
    METRICS    <TABLE>.<METRIC> [, <TABLE>.<METRIC> ...]
);
```

Check the exact form, including whether a `WHERE` clause goes inside or outside the parentheses, against the docs
page above before you rely on it. The result columns carry the dimension and metric names.

## Inspect after creating

```
SHOW SEMANTIC VIEWS IN SCHEMA <db>.<schema>;
DESCRIBE SEMANTIC VIEW <db>.<schema>.<view_name>;
```
**UNVERIFIED** here; both appear in the Snowflake docs. If either fails, use `GET_DDL('SEMANTIC_VIEW', '<name>')`
only after confirming it in the docs.

## Common errors to expect

| Symptom | Likely cause |
|---|---|
| "does not exist or not authorized" | the role lacks `SELECT` on a base table, or the base table name is wrong |
| key or relationship rejected | the parent column is not declared `PRIMARY KEY` on its table |
| revenue is a multiple of the base total | a relationship links a table on a non-key column, or a many-to-many join |
| rate looks huge | a rate metric uses `SUM` |
