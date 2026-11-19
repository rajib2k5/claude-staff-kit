-- Cortex Search credits per UTC day x service x consumption type. Attribution only.
-- CONSUMPTION_TYPE is SERVING, EMBED_TEXT_TOKENS or BATCH. EMBED_TEXT_TOKENS credits are treated as also
-- present in CORTEX_AI_FUNCTIONS_USAGE_HISTORY, so snowflake_cortex.py keeps them out of the attributed sum.
-- Binds, in order: window start, window end, as text "YYYY-MM-DD HH24:MI:SS +00:00" (UTC).
-- The window is half-open: start <= t < end. Run through skills/snowflake-sql/sf.py (read-only).
-- Needs the SNOWFLAKE.USAGE_VIEWER database role (ACCOUNT_USAGE views).
WITH params AS (
    SELECT
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS start_ts,
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS end_ts
)
SELECT
    TO_DATE(CONVERT_TIMEZONE('UTC', s.usage_date)) AS usage_day,
    CONCAT_WS('.', s.database_name, s.schema_name, s.service_name) AS service_name,
    s.consumption_type,
    s.model_name,
    SUM(s.credits) AS credits
FROM snowflake.account_usage.cortex_search_daily_usage_history AS s
WHERE s.usage_date >= (SELECT p.start_ts FROM params AS p)
    AND s.usage_date < (SELECT p.end_ts FROM params AS p)
GROUP BY usage_day, service_name, s.consumption_type, s.model_name
ORDER BY usage_day, service_name, s.consumption_type;
