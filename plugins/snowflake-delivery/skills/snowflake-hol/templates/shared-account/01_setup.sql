-- {{LAB}} hands-on lab: SHARED ACCOUNT setup (one account, {{ATTENDEES}} attendees).
--
-- Run order: 01_setup.sql -> 02_seed.sql -> 03_verify.sql -> (lab) -> 99_teardown.sql.
-- Runs as ACCOUNTADMIN, ahead of the lab, never live in front of attendees.
-- Idempotent: a second run converges to the same state.
--
-- Before you run it, set the attendee password in YOUR worksheet session only.
-- Never write the real value into this file or commit it:
--     SET HOL_PASSWORD = '<generate one per event>';

USE ROLE ACCOUNTADMIN;

-- @if cross_region
-- Lets Cortex route to models in another region. Record the current value first;
-- the teardown unsets it, which is wrong if it was already set before the lab.
SHOW PARAMETERS LIKE 'CORTEX_ENABLED_CROSS_REGION' IN ACCOUNT;
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = '{{CORTEX_REGION}}';
-- @endif

-- One multi-cluster warehouse: concurrent attendee load scales out instead of queueing.
CREATE WAREHOUSE IF NOT EXISTS {{LAB}}_WH
    WAREHOUSE_SIZE = {{WAREHOUSE_SIZE}}
    MIN_CLUSTER_COUNT = 1
    MAX_CLUSTER_COUNT = 4
    SCALING_POLICY = STANDARD
    AUTO_SUSPEND = 60
    AUTO_RESUME = TRUE
    STATEMENT_TIMEOUT_IN_SECONDS = 600
    COMMENT = '{{LAB}} lab warehouse';

-- Cap lab spend. The monitor suspends the warehouse at the quota.
CREATE RESOURCE MONITOR IF NOT EXISTS {{LAB}}_RM
    WITH CREDIT_QUOTA = {{CREDIT_QUOTA}}
    TRIGGERS ON 80 PERCENT DO NOTIFY
             ON 100 PERCENT DO SUSPEND;
ALTER WAREHOUSE {{LAB}}_WH SET RESOURCE_MONITOR = {{LAB}}_RM;

-- One role and one user per attendee: {{LAB}}_ROLE_01.., {{LAB}}_USER_01..
EXECUTE IMMEDIATE $$
DECLARE
    num_users INTEGER DEFAULT {{ATTENDEES}};
    hol_pass  VARCHAR;
BEGIN
    SELECT $HOL_PASSWORD INTO :hol_pass;
    FOR i IN 1 TO :num_users DO
        LET suffix    VARCHAR := LPAD(i::VARCHAR, 2, '0');
        LET username  VARCHAR := '{{LAB}}_USER_' || :suffix;
        LET role_name VARCHAR := '{{LAB}}_ROLE_' || :suffix;

        EXECUTE IMMEDIATE 'CREATE ROLE IF NOT EXISTS ' || :role_name;
        EXECUTE IMMEDIATE 'GRANT ROLE ' || :role_name || ' TO ROLE SYSADMIN';
        EXECUTE IMMEDIATE 'GRANT USAGE ON WAREHOUSE {{LAB}}_WH TO ROLE ' || :role_name;
        EXECUTE IMMEDIATE 'GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE ' || :role_name;
        EXECUTE IMMEDIATE
            'CREATE USER IF NOT EXISTS ' || :username ||
            ' PASSWORD = ''' || :hol_pass || '''' ||
            ' DEFAULT_ROLE = ' || :role_name ||
            ' DEFAULT_WAREHOUSE = {{LAB}}_WH' ||
            ' DEFAULT_NAMESPACE = {{LAB}}_' || :suffix || '.CORE' ||
            ' MUST_CHANGE_PASSWORD = FALSE' ||
            ' COMMENT = ''{{LAB}} lab attendee''';
        -- Lab-day convenience: attendees skip MFA enrolment for the session length.
        -- Delete this line if your security policy does not allow it.
        EXECUTE IMMEDIATE 'ALTER USER ' || :username || ' SET MINS_TO_BYPASS_MFA = 480';
        EXECUTE IMMEDIATE 'GRANT ROLE ' || :role_name || ' TO USER ' || :username;
    END FOR;
    RETURN 'Created ' || :num_users || ' attendee roles and users';
END;
$$;

-- @if git
-- Seed files come from a git repository. Allow only the prefix you need.
CREATE OR REPLACE API INTEGRATION {{LAB}}_GIT_API_INTEGRATION
    API_PROVIDER = git_https_api
    API_ALLOWED_PREFIXES = ('{{GIT_PREFIX}}')
    ENABLED = TRUE;
GRANT USAGE ON INTEGRATION {{LAB}}_GIT_API_INTEGRATION TO ROLE SYSADMIN;
-- @endif

USE ROLE SYSADMIN;

-- The master database is the template. 02_seed.sql loads it, then clones it per attendee.
CREATE DATABASE IF NOT EXISTS {{LAB}}_MASTER
    COMMENT = '{{LAB}} lab template; cloned per attendee';
CREATE SCHEMA IF NOT EXISTS {{LAB}}_MASTER.CORE;
USE SCHEMA {{LAB}}_MASTER.CORE;

-- @if git
CREATE OR REPLACE GIT REPOSITORY {{LAB}}_MASTER.CORE.{{LAB}}_GIT_REPO
    API_INTEGRATION = {{LAB}}_GIT_API_INTEGRATION
    ORIGIN = '{{GIT_ORIGIN}}';
ALTER GIT REPOSITORY {{LAB}}_MASTER.CORE.{{LAB}}_GIT_REPO FETCH;
-- @endif

-- Example schema (retail). Replace with your lab's tables. Keep the grain in each COMMENT.
CREATE OR REPLACE TABLE CUSTOMERS (
    CUSTOMER_ID   NUMBER(38,0) NOT NULL COMMENT 'Customer identifier. Primary key.',
    CUSTOMER_NAME VARCHAR      COMMENT 'Display name.',
    REGION        VARCHAR      COMMENT 'Sales region: North, South, East or West.',
    SIGNUP_DATE   DATE         COMMENT 'Date the customer first registered.',
    CONSTRAINT PK_CUSTOMERS PRIMARY KEY (CUSTOMER_ID)
) COMMENT = 'One row per customer.';

CREATE OR REPLACE TABLE PRODUCTS (
    PRODUCT_ID     NUMBER(38,0) NOT NULL COMMENT 'Product identifier. Primary key.',
    PRODUCT_NAME   VARCHAR      COMMENT 'Display name.',
    CATEGORY       VARCHAR      COMMENT 'Product category.',
    UNIT_PRICE_USD NUMBER(10,2) COMMENT 'List price per unit, in US dollars.',
    CONSTRAINT PK_PRODUCTS PRIMARY KEY (PRODUCT_ID)
) COMMENT = 'One row per product.';

CREATE OR REPLACE TABLE ORDERS (
    ORDER_ID     NUMBER(38,0) NOT NULL COMMENT 'Order line identifier. Primary key.',
    CUSTOMER_ID  NUMBER(38,0) COMMENT 'References CUSTOMERS.',
    PRODUCT_ID   NUMBER(38,0) COMMENT 'References PRODUCTS.',
    ORDER_DATE   DATE         COMMENT 'Date the order was placed.',
    QUANTITY     NUMBER(10,0) COMMENT 'Units ordered.',
    AMOUNT_USD   NUMBER(12,2) COMMENT 'QUANTITY times the unit price at order time, in US dollars.',
    CONSTRAINT PK_ORDERS PRIMARY KEY (ORDER_ID),
    CONSTRAINT FK_ORDERS_CUSTOMER FOREIGN KEY (CUSTOMER_ID) REFERENCES CUSTOMERS (CUSTOMER_ID),
    CONSTRAINT FK_ORDERS_PRODUCT FOREIGN KEY (PRODUCT_ID) REFERENCES PRODUCTS (PRODUCT_ID)
) COMMENT = 'One row per order line.';
