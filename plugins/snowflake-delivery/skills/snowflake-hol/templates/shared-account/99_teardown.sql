-- {{LAB}} hands-on lab: SHARED ACCOUNT teardown. Drops everything 01_setup.sql and
-- 02_seed.sql create. It is also the reset path: run it, then run setup again.
-- teardown_check.py proves the coverage statically; 03_verify.sql after teardown
-- should report zero users, roles and clones.

USE ROLE ACCOUNTADMIN;

EXECUTE IMMEDIATE $$
DECLARE
    num_users INTEGER DEFAULT {{ATTENDEES}};
BEGIN
    FOR i IN 1 TO :num_users DO
        LET suffix    VARCHAR := LPAD(i::VARCHAR, 2, '0');
        LET username  VARCHAR := '{{LAB}}_USER_' || :suffix;
        LET db_name   VARCHAR := '{{LAB}}_' || :suffix;
        LET role_name VARCHAR := '{{LAB}}_ROLE_' || :suffix;

        EXECUTE IMMEDIATE 'DROP USER IF EXISTS ' || :username;
        EXECUTE IMMEDIATE 'DROP DATABASE IF EXISTS ' || :db_name;
        EXECUTE IMMEDIATE 'DROP ROLE IF EXISTS ' || :role_name;
    END FOR;
    RETURN 'Dropped ' || :num_users || ' attendee users, databases and roles';
END;
$$;

DROP DATABASE IF EXISTS {{LAB}}_MASTER;
-- @if git
DROP API INTEGRATION IF EXISTS {{LAB}}_GIT_API_INTEGRATION;
-- @endif
DROP WAREHOUSE IF EXISTS {{LAB}}_WH;
DROP RESOURCE MONITOR IF EXISTS {{LAB}}_RM;

-- @if cross_region
-- Restores the account default. If 01_setup.sql showed a non-default value before
-- the lab, set that value back instead of unsetting it.
ALTER ACCOUNT UNSET CORTEX_ENABLED_CROSS_REGION;
-- @endif
