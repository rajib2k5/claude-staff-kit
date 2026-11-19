-- Cortex AI Functions credits per UTC day x user x function x model. Attribution only.
-- Rows are hourly windows (START_TIME). USER_ID is populated only for data after 2026-02-16; it is the
-- user's ID as text, not a name. Excludes warehouse credits. The deprecated CORTEX_FUNCTIONS_USAGE_HISTORY
-- and CORTEX_FUNCTIONS_QUERY_USAGE_HISTORY views are not used.
-- Binds, in order: window start, window end, as text "YYYY-MM-DD HH24:MI:SS +00:00" (UTC).
-- The window is half-open: start <= t < end. Run through skills/snowflake-sql/sf.py (read-only).
-- Needs the SNOWFLAKE.USAGE_VIEWER database role (ACCOUNT_USAGE views).
WITH params AS (
    SELECT
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS start_ts,
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS end_ts
)
SELECT
    TO_DATE(CONVERT_TIMEZONE('UTC', f.start_time)) AS usage_day,
    f.user_id,
    f.function_name,
    NULLIF(f.model_name, '') AS model_name,
    SUM(f.credits) AS credits
FROM snowflake.account_usage.cortex_ai_functions_usage_history AS f
WHERE f.start_time >= (SELECT p.start_ts FROM params AS p)
    AND f.start_time < (SELECT p.end_ts FROM params AS p)
GROUP BY usage_day, f.user_id, f.function_name, NULLIF(f.model_name, '')
ORDER BY usage_day, f.user_id, f.function_name;
