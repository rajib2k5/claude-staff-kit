# skill: data-pipeline-debug

Location: live+repo. Lines: 59. Model ids named: none.

Purpose: Root-cause a data pipeline failure across dbt, Airflow, Snowflake tasks and streams, and ingestion — including the hard case where the run succeeded but the data is stale or wrong. Use for any pipeline incident or unexplained data discrepancy. Triggers - pipeline failed, dbt run failed, airflow task failed, data did not load, pipeline succeeded but no data.

Sections:
- Pipeline debugging
- First: classify the failure — the class determines where to look
- Procedure
- Component traps — check these specifically
- Distinguish
- Report
