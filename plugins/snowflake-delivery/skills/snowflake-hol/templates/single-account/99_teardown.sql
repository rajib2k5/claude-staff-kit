-- {{LAB}} hands-on lab: SINGLE ACCOUNT teardown. Drops everything 01_setup.sql and
-- 02_seed.sql create; also the reset path. The attendee user is not dropped: it is
-- provisioned and owned outside this lab. Dropping the role removes its grant to the user.

USE ROLE SYSADMIN;
DROP DATABASE IF EXISTS {{LAB}};

USE ROLE ACCOUNTADMIN;
DROP ROLE IF EXISTS {{LAB}}_PARTICIPANT;
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
