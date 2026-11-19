-- Cortex Code (CoCo) credits per UTC day x user x interface x model. Attribution only.
-- CREDITS_GRANULAR is an OBJECT keyed by model name; each value holds input, cache_read_input,
-- cache_write_input and output credits.
-- Binds, in order: window start, window end, as text "YYYY-MM-DD HH24:MI:SS +00:00" (UTC).
-- The window is half-open: start <= t < end. Run through skills/snowflake-sql/sf.py (read-only).
-- Needs the SNOWFLAKE.USAGE_VIEWER database role (ACCOUNT_USAGE views).
WITH params AS (
    SELECT
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS start_ts,
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS end_ts
)
SELECT
    TO_DATE(CONVERT_TIMEZONE('UTC', c.usage_time)) AS usage_day,
    c.user_name,
    c.interface,
    g.key AS model_name,
    SUM(
        COALESCE(g.value:input::NUMBER(38, 12), 0)
        + COALESCE(g.value:cache_read_input::NUMBER(38, 12), 0)
        + COALESCE(g.value:cache_write_input::NUMBER(38, 12), 0)
        + COALESCE(g.value:output::NUMBER(38, 12), 0)
    ) AS credits
FROM snowflake.account_usage.snowflake_coco_usage_history AS c,
    LATERAL FLATTEN(input => c.credits_granular) AS g  -- Snowflake's idiom for a lateral flatten
WHERE c.usage_time >= (SELECT p.start_ts FROM params AS p)
    AND c.usage_time < (SELECT p.end_ts FROM params AS p)
GROUP BY usage_day, c.user_name, c.interface, g.key
ORDER BY usage_day, c.user_name, model_name;
