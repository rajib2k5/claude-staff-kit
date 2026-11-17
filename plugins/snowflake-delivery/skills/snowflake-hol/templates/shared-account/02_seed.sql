-- {{LAB}} hands-on lab: SHARED ACCOUNT seed. Run after 01_setup.sql.
-- Loads the master database, then clones it once per attendee and grants each
-- attendee role access to its own clone only. Re-running reloads identical row counts.

USE ROLE SYSADMIN;
USE WAREHOUSE {{LAB}}_WH;
USE SCHEMA {{LAB}}_MASTER.CORE;

-- @if synthetic
-- Deterministic synthetic data. Row counts are fixed; 03_verify.sql checks them.
INSERT OVERWRITE INTO CUSTOMERS
SELECT SEQ4() + 1,
       'Customer ' || (SEQ4() + 1),
       ARRAY_CONSTRUCT('North', 'South', 'East', 'West')[MOD(SEQ4(), 4)]::VARCHAR,
       DATEADD(DAY, -MOD(SEQ4() * 37, 1000), '2026-01-01'::DATE)
FROM TABLE(GENERATOR(ROWCOUNT => {{CUSTOMERS_ROWS}}));

INSERT OVERWRITE INTO PRODUCTS
SELECT SEQ4() + 1,
       'Product ' || (SEQ4() + 1),
       ARRAY_CONSTRUCT('Grocery', 'Home', 'Outdoor', 'Toys', 'Apparel')[MOD(SEQ4(), 5)]::VARCHAR,
       (5 + MOD(SEQ4() * 13, 95))::NUMBER(10,2)
FROM TABLE(GENERATOR(ROWCOUNT => {{PRODUCTS_ROWS}}));

INSERT OVERWRITE INTO ORDERS
WITH g AS (
    SELECT SEQ4() AS n FROM TABLE(GENERATOR(ROWCOUNT => {{ORDERS_ROWS}}))
)
SELECT g.n + 1,
       MOD(g.n * 7, {{CUSTOMERS_ROWS}}) + 1,
       MOD(g.n * 11, {{PRODUCTS_ROWS}}) + 1,
       DATEADD(DAY, -MOD(g.n * 3, 365), '2026-01-01'::DATE),
       1 + MOD(g.n, 5),
       (1 + MOD(g.n, 5)) * p.UNIT_PRICE_USD
FROM g
JOIN PRODUCTS p ON p.PRODUCT_ID = MOD(g.n * 11, {{PRODUCTS_ROWS}}) + 1;
-- @endif

-- @if git
-- Seed from CSV files in the git repository created by 01_setup.sql.
CREATE OR REPLACE STAGE {{LAB}}_MASTER.CORE.{{LAB}}_SEED_STAGE
    FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"');
ALTER GIT REPOSITORY {{LAB}}_MASTER.CORE.{{LAB}}_GIT_REPO FETCH;
COPY FILES INTO @{{LAB}}_MASTER.CORE.{{LAB}}_SEED_STAGE
    FROM @{{LAB}}_MASTER.CORE.{{LAB}}_GIT_REPO/branches/main/{{SEED_PATH}}/;
TRUNCATE TABLE CUSTOMERS;
TRUNCATE TABLE PRODUCTS;
TRUNCATE TABLE ORDERS;
COPY INTO CUSTOMERS FROM @{{LAB}}_SEED_STAGE/customers.csv ON_ERROR = ABORT_STATEMENT;
COPY INTO PRODUCTS  FROM @{{LAB}}_SEED_STAGE/products.csv  ON_ERROR = ABORT_STATEMENT;
COPY INTO ORDERS    FROM @{{LAB}}_SEED_STAGE/orders.csv    ON_ERROR = ABORT_STATEMENT;
-- @endif

-- One zero-copy clone per attendee. CREATE OR REPLACE so a re-run resets every clone.
EXECUTE IMMEDIATE $$
DECLARE
    num_users INTEGER DEFAULT {{ATTENDEES}};
BEGIN
    FOR i IN 1 TO :num_users DO
        LET suffix    VARCHAR := LPAD(i::VARCHAR, 2, '0');
        LET db_name   VARCHAR := '{{LAB}}_' || :suffix;
        LET role_name VARCHAR := '{{LAB}}_ROLE_' || :suffix;

        EXECUTE IMMEDIATE 'CREATE OR REPLACE DATABASE ' || :db_name || ' CLONE {{LAB}}_MASTER';
        EXECUTE IMMEDIATE 'GRANT USAGE ON DATABASE ' || :db_name || ' TO ROLE ' || :role_name;
        EXECUTE IMMEDIATE 'GRANT ALL PRIVILEGES ON SCHEMA ' || :db_name || '.CORE TO ROLE ' || :role_name;
        EXECUTE IMMEDIATE 'GRANT SELECT ON ALL TABLES IN SCHEMA ' || :db_name || '.CORE TO ROLE ' || :role_name;
        EXECUTE IMMEDIATE 'GRANT ALL PRIVILEGES ON FUTURE TABLES IN SCHEMA ' || :db_name || '.CORE TO ROLE ' || :role_name;
    END FOR;
    RETURN 'Cloned and granted ' || :num_users || ' attendee databases';
END;
$$;
