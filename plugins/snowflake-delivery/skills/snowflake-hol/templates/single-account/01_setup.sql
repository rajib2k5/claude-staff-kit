-- {{LAB}} hands-on lab: SINGLE ACCOUNT setup (each attendee has a Snowflake account of their own).
--
-- An ACCOUNTADMIN runs this in each attendee account, ahead of the lab.
-- Run order: 01_setup.sql -> 02_seed.sql -> 03_verify.sql -> (lab) -> 99_teardown.sql.
-- The attendee user ({{PARTICIPANT_USER}}) is provisioned by someone else and is NOT
-- created or dropped here; this script only binds it to the lab role.
-- Idempotent: a second run converges to the same state.

USE ROLE ACCOUNTADMIN;

-- @if cross_region
SHOW PARAMETERS LIKE 'CORTEX_ENABLED_CROSS_REGION' IN ACCOUNT;
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = '{{CORTEX_REGION}}';
-- @endif

CREATE WAREHOUSE IF NOT EXISTS {{LAB}}_WH
    WAREHOUSE_SIZE = {{WAREHOUSE_SIZE}}
    AUTO_SUSPEND = 60
    AUTO_RESUME = TRUE
    STATEMENT_TIMEOUT_IN_SECONDS = 600
    COMMENT = '{{LAB}} lab warehouse';

CREATE RESOURCE MONITOR IF NOT EXISTS {{LAB}}_RM
    WITH CREDIT_QUOTA = {{CREDIT_QUOTA}}
    TRIGGERS ON 80 PERCENT DO NOTIFY
             ON 100 PERCENT DO SUSPEND;
ALTER WAREHOUSE {{LAB}}_WH SET RESOURCE_MONITOR = {{LAB}}_RM;

CREATE ROLE IF NOT EXISTS {{LAB}}_PARTICIPANT COMMENT = '{{LAB}} lab attendee role';
GRANT ROLE {{LAB}}_PARTICIPANT TO ROLE SYSADMIN;
GRANT USAGE ON WAREHOUSE {{LAB}}_WH TO ROLE {{LAB}}_PARTICIPANT;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE {{LAB}}_PARTICIPANT;

-- @if git
CREATE OR REPLACE API INTEGRATION {{LAB}}_GIT_API_INTEGRATION
    API_PROVIDER = git_https_api
    API_ALLOWED_PREFIXES = ('{{GIT_PREFIX}}')
    ENABLED = TRUE;
GRANT USAGE ON INTEGRATION {{LAB}}_GIT_API_INTEGRATION TO ROLE SYSADMIN;
-- @endif

USE ROLE SYSADMIN;

CREATE DATABASE IF NOT EXISTS {{LAB}} COMMENT = '{{LAB}} lab database';
CREATE SCHEMA IF NOT EXISTS {{LAB}}.CORE;
USE SCHEMA {{LAB}}.CORE;

-- @if git
CREATE OR REPLACE GIT REPOSITORY {{LAB}}.CORE.{{LAB}}_GIT_REPO
    API_INTEGRATION = {{LAB}}_GIT_API_INTEGRATION
    ORIGIN = '{{GIT_ORIGIN}}';
-- @endif

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

GRANT USAGE ON DATABASE {{LAB}} TO ROLE {{LAB}}_PARTICIPANT;
GRANT ALL PRIVILEGES ON SCHEMA {{LAB}}.CORE TO ROLE {{LAB}}_PARTICIPANT;
GRANT SELECT ON ALL TABLES IN SCHEMA {{LAB}}.CORE TO ROLE {{LAB}}_PARTICIPANT;
GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA {{LAB}}.CORE TO ROLE {{LAB}}_PARTICIPANT;

USE ROLE ACCOUNTADMIN;

-- Bind the externally provisioned user. Wrapped so a missing user is a warning, not a
-- hard error at the end of an otherwise complete run: fix the name and re-run.
-- The quotes make the name case-sensitive and let it be a keyword such as USER.
EXECUTE IMMEDIATE $$
BEGIN
    GRANT ROLE {{LAB}}_PARTICIPANT TO USER "{{PARTICIPANT_USER}}";
    ALTER USER "{{PARTICIPANT_USER}}" SET
        DEFAULT_ROLE = {{LAB}}_PARTICIPANT
        DEFAULT_WAREHOUSE = {{LAB}}_WH
        DEFAULT_NAMESPACE = {{LAB}}.CORE;
    RETURN 'Bound {{LAB}}_PARTICIPANT to user {{PARTICIPANT_USER}}';
EXCEPTION
    WHEN OTHER THEN
        RETURN 'WARNING: everything else succeeded, but the attendee user could not be bound: '
            || SQLERRM || '. Check the name with SHOW USERS, fix it, and re-run.';
END;
$$;
