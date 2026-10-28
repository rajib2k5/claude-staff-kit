# agent: pipeline-debugger

Location: live+repo. Lines: 60. Model ids named: none.

Purpose: Root-causes data pipeline failures across dbt, Airflow, Snowflake tasks/streams, and ingestion — including the hard case where the pipeline reports success but the data is wrong or stale. Use for any pipeline incident or unexplained data discrepancy. Runs on Opus.

Sections:
- First: classify the failure
- Method — systematic, not speculative
- Component-specific traps
- Report
