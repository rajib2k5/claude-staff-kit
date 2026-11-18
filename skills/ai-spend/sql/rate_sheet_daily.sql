-- Contract price per credit, per UTC day and service type, for this account. Read only with
-- --contract-rate-from-org: ORGANIZATION_USAGE needs an organization-level role, and the view can lag 24 hours.
-- The docs do not name the SERVICE_TYPE value for AI services; snowflake_cortex.py matches it to the metering
-- SERVICE_TYPE by name (upper case, spaces as underscores) and falls back to the list rate when none matches.
-- Binds, in order: window start, window end, as text "YYYY-MM-DD HH24:MI:SS +00:00" (UTC).
-- The window is half-open: start <= t < end. Run through skills/snowflake-sql/sf.py (read-only).
-- Needs a role that can read SNOWFLAKE.ORGANIZATION_USAGE (not granted by USAGE_VIEWER).
WITH params AS (
    SELECT
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS start_ts,
        TO_TIMESTAMP_TZ(?, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS end_ts
)
SELECT
    r.date AS rate_date,
    r.service_type,
    r.currency,
    r.effective_rate
FROM snowflake.organization_usage.rate_sheet_daily AS r
WHERE r.account_locator = CURRENT_ACCOUNT()
    AND r.billing_type = 'consumption'
    AND COALESCE(r.is_adjustment, FALSE) = FALSE
    AND r.date >= (SELECT p.start_ts::DATE FROM params AS p)
    AND r.date < (SELECT p.end_ts::DATE FROM params AS p)
ORDER BY rate_date, r.service_type;
