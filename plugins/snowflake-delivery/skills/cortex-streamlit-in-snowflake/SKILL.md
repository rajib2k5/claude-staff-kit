---
name: cortex-streamlit-in-snowflake
description: Write and deploy Streamlit in Snowflake (SiS) apps that run on the older warehouse runtime, with the API gaps that crash apps, the connection, refresh, chart and filter patterns that work, the snowflake.yml and environment.yml shape, and a pre-deploy checklist. Use when building, fixing or deploying a Streamlit app inside Snowflake. Triggers - streamlit in snowflake, SiS, snow streamlit deploy, st.rerun AttributeError, hide_index TypeError, streamlit app crashes in snowflake.
---

# Streamlit in Snowflake (SiS)

Ported from a Cortex Code skill used in two labs. Both labs shipped identical copies, so there is nothing to merge.

**Read this first.** Every "unavailable API" claim below was observed on one SiS runtime that used an old Streamlit
version (the lab notes say about 1.26). Newer SiS runtimes, and the container runtime, ship newer Streamlit and
accept more of these calls. Before you ban an API, find the version your app really runs on:

```python
import streamlit as st
st.write(st.__version__)
```

Then check that version against the Streamlit changelog. If the app runs on a newer version, the "Avoid" column is
advice, not a rule. If you cannot check, follow the table: the patterns below work on old and new runtimes.

## Procedure

1. **Check the runtime version** as above. Record it in the app README.
2. **Connect** with `get_active_session()`. Do not use `st.connection("snowflake")` in a warehouse-runtime app.
3. **Define sidebar filters first**, then the query functions that use them, then the page body.
4. **Use the safe patterns** in the table. Format numbers and dates in SQL.
5. **Add `snowflake.yml` and `environment.yml`** as shown. Create the stage once.
6. **Run the checklist**, then deploy: `snow streamlit deploy --database <DB> --schema <SCHEMA> --replace`.
7. **Open the app** and exercise every filter. A deploy that succeeds proves nothing about runtime errors.

## API gaps seen on the old runtime

| Call | Symptom | Use instead |
|---|---|---|
| `st.rerun()`, `st.experimental_rerun()` | `AttributeError` (the two lab skills disagree on which one existed; test both) | show a message and let the next interaction refresh |
| `st.camera_input()` | not supported | none |
| `st.file_uploader()` | limited or broken | avoid |
| `st.connection("snowflake")` | not needed, fails | `get_active_session()` |
| `st.line_chart(df, x=, y=)`, `st.bar_chart(df, x=, y=)` | x and y arguments rejected | `df.set_index("COL")[["VAL"]]` then `st.line_chart(...)` |
| `st.column_config.*` | missing | plain `st.dataframe(df)`; format in SQL |
| `st.dataframe(..., hide_index=True)` | `TypeError: unexpected keyword argument 'hide_index'` | omit it |
| `st.button(..., type="primary")` | `type` rejected | omit it |
| `st.data_editor()` | missing | `st.dataframe()` for display |
| `@st.cache_data` | can cause trouble | test it, or drop it |

## Patterns that work

Connection:
```python
from snowflake.snowpark.context import get_active_session
session = get_active_session()

def run_query(query: str) -> pd.DataFrame:
    return session.sql(query).to_pandas()
```

Refresh (no rerun):
```python
if st.button("Refresh"):
    st.cache_data.clear()
    st.success("Cache cleared. Data refreshes on the next interaction.")
```

Charts: `st.line_chart(df.set_index("DATE")[["VALUE"]])`.

Formatting in SQL, not in `column_config`:
```sql
SELECT customer_name, ROUND(amount, 2) AS amount, TO_VARCHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
FROM my_table
```

Layout: `st.divider()` and `st.subheader()`, not `st.markdown("---")` or `### ` markdown.

Sidebar before queries. The filter value must exist before any function that reads it runs:
```python
with st.sidebar:
    period = st.selectbox("Period", ["Last 7 days", "Last 30 days", "Last 90 days"], index=1)
    selected_days = {"Last 7 days": 7, "Last 30 days": 30, "Last 90 days": 90}[period]

def get_trend(days: int) -> pd.DataFrame:
    return run_query(f"""
        SELECT DATE(created_at) AS day, COUNT(*) AS n FROM my_table
        WHERE created_at >= DATEADD('day', -{int(days)}, CURRENT_TIMESTAMP())
        GROUP BY 1 ORDER BY 1""")
```
Only interpolate values you built yourself (here an integer from a fixed map). Never interpolate free text from a
widget into SQL. Use `session.sql(query, params=[...])` with `?` placeholders for user-typed values.

## Project files

```
streamlit_app/
  snowflake.yml
  environment.yml
  streamlit_app.py
```

`snowflake.yml` (definition_version 2):
```yaml
definition_version: 2
entities:
  my_app:
    type: streamlit
    identifier:
      name: MY_APP_NAME
    title: "My Dashboard"
    query_warehouse: COMPUTE_WH
    main_file: streamlit_app.py
    stage: STREAMLIT_STAGE
    artifacts:
      - streamlit_app.py
      - environment.yml
```
Do not add `env_file:` or `defaults:` (the lab saw definition_version 2 reject them), and do not leave `pages_dir:`
empty.

`environment.yml`: Snowflake Anaconda channel only. Pip packages do not install.
```yaml
name: sf_env
channels:
  - snowflake
dependencies:
  - pandas
  - snowflake-snowpark-python
```

Create the stage once (`USE DATABASE ...; USE SCHEMA ...; CREATE STAGE IF NOT EXISTS STREAMLIT_STAGE;`), then deploy
and redeploy with the same `snow streamlit deploy ... --replace` command.

## Traps

- A filter defined after the function that reads it crashes the app or uses a stale value. Sidebar first.
- Snowflake `NUMBER` arrives as `Decimal`. Cast before charting.
- Plotly Express on Snowpark `to_pandas()` data was reported to plot the index. Prefer `plotly.graph_objects` with
  `.tolist()`. Not reproduced in this port.
- Empty frames after a filter usually mean the window or a `HAVING` threshold is too tight, not a code fault.

| Error | Cause | Fix |
|---|---|---|
| `st.rerun()` AttributeError | call missing on the runtime | remove the call |
| `x is not a valid parameter` | old chart API | `set_index` pattern |
| `column_config not found` | API missing | basic `st.dataframe`, format in SQL |
| `env_file not permitted` | wrong `snowflake.yml` shape | remove it, list files in `artifacts` |
| filter has no effect | filter defined after queries | move sidebar to the top |

## Checklist before deploy

- [ ] Runtime Streamlit version known and recorded
- [ ] No `st.rerun` or `st.experimental_rerun`
- [ ] `get_active_session()`, not `st.connection()`
- [ ] Charts use the `set_index` pattern
- [ ] No `st.column_config`, no `hide_index`, no `type="primary"`
- [ ] Sidebar and filters defined before the functions that use them
- [ ] No user-typed text interpolated into SQL
- [ ] `snowflake.yml` is definition_version 2; every file is listed in `artifacts`
- [ ] `environment.yml` uses only the `snowflake` channel
- [ ] Stage exists in the target database and schema

## Report

State the Streamlit version the app ran on, the deploy command and its output, the app URL, which filters you
exercised in the running app, and which API gaps you worked around.
