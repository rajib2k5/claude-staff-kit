# Custom domain recipe

Use this when `dataset_type` is not one of the four predefined types.

## 1. Design the schema

3 to 5 tables. Each has a primary key (`VARCHAR(36)` UUID), foreign keys that reference real keys, and realistic
column names and types (`VARCHAR`, `INTEGER`, `DECIMAL`, `TIMESTAMP`, `BOOLEAN`). Write `schema.md` and `schema.json`
to the output directory. State the grain of every table ("one row per ...").

Example, flight tracking: `airports`, `airlines`, `flights` (one row per scheduled flight), `flight_updates`
(one row per actual departure or arrival event).

## 2. Generate the data

Write `generate_custom_data.py` with `pandas` and `faker`. Rules:

- Create parent tables first and sample foreign keys from the parent keys, so referential integrity holds.
- Write CSV with ISO 8601 timestamps (`YYYY-MM-DDTHH:MM:SS`). Snowflake parses these as `TIMESTAMP`.
- Make the distribution realistic. Put about 70 percent of volume on a small set of popular combinations.
- Run it with `uv run --with faker --with pandas python generate_custom_data.py`.

## 3. Write the dashboard

`streamlit_app/streamlit_app.py` with four KPIs, four charts, and a table explorer with a table selector. Use
`plotly.graph_objects`. Pass lists to the traces and cast numerics first:

```python
df = session.sql("SELECT NAME, COUNT(*) AS CNT FROM T GROUP BY NAME").to_pandas()
df["CNT"] = df["CNT"].astype(int)
fig = go.Figure(go.Bar(x=df["NAME"].tolist(), y=df["CNT"].tolist()))
st.plotly_chart(fig, use_container_width=True)
```

`snowflake.yml` (definition_version 2) and `environment.yml` (channel `snowflake`; `plotly`, `pandas`) follow
`cortex-streamlit-in-snowflake`.

## Bilingual dashboards

Add `"languages": ["en", "es"]` to the config. In the app keep a `TRANSLATIONS = {"en": {...}, "es": {...}}`
dictionary with every UI string, including chart titles and axis labels, and a sidebar `st.radio` that picks the
language. Read strings as `t = TRANSLATIONS[lang]`. Only the UI text changes; data values stay as they are. Test both
languages before deploying. `st.radio(..., horizontal=True)` needs a recent Streamlit. Drop it if the runtime
rejects it.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Schema 'X.Y' does not exist` | object created before its schema | create database, then schema, then the rest |
| `File format ... does not exist` | stage created before file format | create the file format first |
| `Connection failed` | wrong or inactive connection | `snow connection list`, then `snow connection test -c <name>` |
| `Permission denied` | role lacks CREATE privilege | check the role's grants with `snowflake-sql` |
| `COPY INTO` fails | CSV headers or column order differ from the table | compare headers to the table columns |
| Dashboard errors after deploy | missing data, suspended warehouse, wrong column names | read the app log in Snowsight, `SELECT COUNT(*)` each table, resume the warehouse |
