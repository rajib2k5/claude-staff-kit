-- Cortex Agents credits per UTC day x user x agent x model. Attribution only.
-- CREDITS_GRANULAR is an ARRAY of objects, one per request: {"<request id>": {"<service type>": {"<model>":
-- {input, cache_read_input, cache_write_input, output}}}, "start_time": ...}. The nesting follows the sample in
-- the view's docs and is not yet checked against a live account. The IFF guards skip the start_time scalar.
-- Usage before 2026-04-13 can carry the service type cortex_analyst as well as cortex_agents.
-- Binds, in order: window start, window end, as text "YYYY-MM-DD HH24:MI:SS +00:00" (UTC).
-- The window is half-open: start <= t < end. Run through skills/snowflake-sql/sf.py (read-only).
-- Needs the SNOWFLAKE.USAGE_VIEWER database role (ACCOUNT_USAGE views).
WITH params AS (
    SELECT
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS start_ts,
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS end_ts
)
SELECT
    TO_DATE(CONVERT_TIMEZONE('UTC', a.start_time)) AS usage_day,
    a.user_name,
    CONCAT_WS('.', a.agent_database_name, a.agent_schema_name, a.agent_name) AS agent_name,
    svc.key AS service_type,
    mdl.key AS model_name,
    SUM(
        COALESCE(mdl.value:input::NUMBER(38, 12), 0)
        + COALESCE(mdl.value:cache_read_input::NUMBER(38, 12), 0)
        + COALESCE(mdl.value:cache_write_input::NUMBER(38, 12), 0)
        + COALESCE(mdl.value:output::NUMBER(38, 12), 0)
    ) AS credits
FROM snowflake.account_usage.cortex_agent_usage_history AS a,
    LATERAL FLATTEN(input => a.credits_granular) AS req,
    LATERAL FLATTEN(input => req.value) AS req_key,
    LATERAL FLATTEN(input => IFF(IS_OBJECT(req_key.value), req_key.value, NULL)) AS svc,
    LATERAL FLATTEN(input => IFF(IS_OBJECT(svc.value), svc.value, NULL)) AS mdl
WHERE a.start_time >= (SELECT p.start_ts FROM params AS p)
    AND a.start_time < (SELECT p.end_ts FROM params AS p)
GROUP BY usage_day, a.user_name, agent_name, svc.key, mdl.key
ORDER BY usage_day, a.user_name, agent_name, model_name;
