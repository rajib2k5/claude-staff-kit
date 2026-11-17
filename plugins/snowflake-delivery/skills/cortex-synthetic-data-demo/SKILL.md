---
name: cortex-synthetic-data-demo
description: Generate a synthetic relational dataset (CSV), load it into a Snowflake sandbox schema and deploy a Streamlit-in-Snowflake dashboard over it, using bundled generator scripts for four predefined domains and a design recipe for any other domain. Use when a demo, workshop or prototype needs realistic fake data in Snowflake with a dashboard on top. Triggers - generate synthetic data, demo dataset, sample data dashboard, fake data for a demo, test data in Snowflake, synthetic data Streamlit.
---

# Synthetic data and dashboard demo

Ported from a Cortex Code skill. It makes CSV files, loads them into Snowflake and deploys a dashboard. It is for
sandbox and demo accounts only. Never point it at a database that holds real data.

Read `cortex-streamlit-in-snowflake` before deploying the dashboard. Ready-made prompts are in
`references/demo-prompts.md`. The custom-domain recipe, bilingual dashboards and troubleshooting are in
`references/custom-domain.md`.

## Prerequisites

- `uv` (runs the scripts) and the Snowflake CLI `snow` (v3.14.0 or later).
- A `snow` connection that can create a database or schema in a sandbox. Check with `snow connection test -c <name>`.
- Run Snowflake SQL through the `snowflake-sql` skill when you need to check state. Use `snow` only for stage upload
  and Streamlit deploy.

## Procedure

1. **Parse the request.** Get dataset domain, record count (default 10,000), output directory and languages
   (default `["en"]`). If both domain and directory are missing, ask once. Otherwise use defaults.
2. **Write the config** to `<OUTPUT_DIR>/synthetic_data_config.json`:
   ```json
   {"dataset_type": "ecommerce", "num_records": 10000, "output_dir": "<OUTPUT_DIR>",
    "database": "<DB>", "schema": "<SCHEMA>", "warehouse": "<WH>", "languages": ["en"]}
   ```
   `dataset_type` is one of `financial_fraud`, `logistics`, `healthcare`, `ecommerce`, or anything else for a custom
   domain. The scripts read `num_records` (or `record_count`). They read `database`, `schema` and `warehouse` either at
   the top level or under a `snowflake` key.
3. **Predefined domain: run the scripts** in this order:
   ```bash
   uv run --project <SKILL_DIR> python <SKILL_DIR>/scripts/generate_schema.py    --config <CONFIG> --output-dir <OUTPUT_DIR>
   uv run --project <SKILL_DIR> python <SKILL_DIR>/scripts/generate_data.py      --config <CONFIG> --output-dir <OUTPUT_DIR>
   uv run --project <SKILL_DIR> python <SKILL_DIR>/scripts/generate_streamlit.py --config <CONFIG> --output-dir <OUTPUT_DIR>
   ```
   Output: `schema.md`, `schema.json`, `load_data.sql`, `data/*.csv`, and `streamlit_app/` (app, `snowflake.yml`,
   `environment.yml`).
   **Custom domain:** follow `references/custom-domain.md` to design the schema, write a Faker script and write the
   dashboard by hand.
4. **Confirm the target.** Show the user the database and schema the load will create or replace. Stop if the target
   already exists and holds data you did not create.
5. **Load, in this order, one statement at a time:** create database (`IF NOT EXISTS`), create schema
   (`IF NOT EXISTS`), create the CSV file format (`SKIP_HEADER = 1`, `FIELD_OPTIONALLY_ENCLOSED_BY = '"'`), create the
   stage that uses that file format, create each table, `snow stage copy` each CSV to the stage with `--overwrite`,
   then `COPY INTO` each table. `load_data.sql` has the statements for predefined domains.
6. **Check the load.** Row counts per table equal the CSV row counts. Primary keys are unique. Every foreign key
   resolves (an anti-join returns zero rows). Do this before deploying.
7. **Deploy.** Apply the checklist in `cortex-streamlit-in-snowflake`, then
   `cd <OUTPUT_DIR>/streamlit_app && snow streamlit deploy --replace`. Return the app URL.

## Traps

- **Creation order matters.** A file format or stage created before its schema, or a stage before its file format,
  fails with "does not exist or not authorized". Do not run these statements in parallel.
- **Generated app and Plotly.** The lab reported that `px.*` charts on `.to_pandas()` data plot the index and not the
  values, and that the fix is `go.Figure(go.Bar(...))` with `astype(...)` and `.tolist()`. This port could not
  reproduce that without a Snowflake account. The bundled `generate_streamlit.py` still emits `px.pie`, `px.bar` and
  `px.line`. Open the first deployed dashboard and check that the charts show real values. If they do not, convert
  them to `go.*`.
- **Decimals.** Snowflake `NUMBER(p,s)` arrives as Python `Decimal`. Cast to `float` or `int` before charting.
- **Pandas merges on Snowpark data** returned empty results in the lab (UUID type differences). Join in SQL instead.
- **Column sizes.** Faker phone numbers can pass 20 characters. Use `VARCHAR(50)` for phone columns.
- **Random data.** Seeds are not fixed, so every run differs. Fix the seed if the demo must be repeatable.
- **Distribution.** Uniform random data makes flat, dull charts (for example 26 rows per route). Concentrate volume
  on a few popular values.
- **Streamlit version.** Do not rely on `hide_index`, `st.rerun` or `column_config` until you know the runtime
  version. See `cortex-streamlit-in-snowflake`.
- **Cleanup.** To undo a failed run, remove only the sandbox database you created in this session, and only after the
  user confirms its name. Never remove a database you did not create.
- **Autonomy.** The original skill ran the whole flow without asking. Keep that for file generation. Ask before any
  statement that replaces or removes an existing Snowflake object.
- `scripts/ask_questions.sh` needs an interactive terminal. Skip it in an agent session and write the config
  directly.

## Report

State: the domain, row counts per table (measured in Snowflake, not taken from the CSV), target database and schema,
the deployed app URL, the results of the key and foreign-key checks, and anything you could not check (for example
chart rendering).
