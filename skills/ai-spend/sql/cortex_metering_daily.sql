-- Billed AI credits per day and service type: the Snowflake total that the report adds up.
-- One row per USAGE_DAY x SERVICE_TYPE. The METERING_DAILY_HISTORY docs list CORTEX_CODE_CLI and
-- CORTEX_CODE_SNOWSIGHT for Cortex Code; an account that meters Cortex Code inside AI_SERVICES instead is
-- covered too, because all three are read. Each credit is in exactly one SERVICE_TYPE row, so this sum has
-- no double count. The per-feature views are never added to it (they are attribution only).
-- USAGE_DATE is a day in the SESSION time zone: the view's docs say to run ALTER SESSION SET TIMEZONE = UTC to
-- reconcile it with ORGANIZATION_USAGE (docs.snowflake.com/en/sql-reference/account-usage/metering_daily_history).
-- sf.py cannot set a session parameter and its read-only guard refuses ALTER SESSION, so DAY_UTC_OFFSET returns
-- the UTC offset at which each USAGE_DATE starts (a DATE cast to TIMESTAMP_LTZ is midnight in the session time
-- zone); snowflake_cortex.py marks the source PARTIAL for any day whose offset is not +00:00.
-- Binds, in order: window start, window end, as text "YYYY-MM-DD HH24:MI:SS +00:00" (UTC).
-- The window is half-open: start <= t < end. Run through skills/snowflake-sql/sf.py (read-only).
-- Needs the SNOWFLAKE.USAGE_VIEWER database role (ACCOUNT_USAGE views).
WITH params AS (
    SELECT
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS start_ts,
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS end_ts
)
SELECT
    m.usage_date AS usage_day,
    m.service_type,
    TO_CHAR(m.usage_date::TIMESTAMP_LTZ, 'TZH:TZM') AS day_utc_offset,
    SUM(m.credits_billed) AS credits_billed,
    SUM(m.credits_used) AS credits_used
FROM snowflake.account_usage.metering_daily_history AS m
WHERE m.service_type IN ('AI_SERVICES', 'CORTEX_CODE_CLI', 'CORTEX_CODE_SNOWSIGHT')
    AND m.usage_date >= (SELECT p.start_ts::DATE FROM params AS p)
    AND m.usage_date < (SELECT p.end_ts::DATE FROM params AS p)
GROUP BY m.usage_date, m.service_type, TO_CHAR(m.usage_date::TIMESTAMP_LTZ, 'TZH:TZM')
ORDER BY usage_day, m.service_type;
