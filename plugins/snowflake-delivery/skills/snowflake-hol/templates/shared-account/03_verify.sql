-- {{LAB}} hands-on lab: SHARED ACCOUNT verify. Read-only. Every check names its expected value.
-- Run after 02_seed.sql. Any row with STATUS = 'FAIL' blocks the lab.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE {{LAB}}_WH;

-- 1. Attendee users and roles: expect {{ATTENDEES}} of each.
SHOW USERS LIKE '{{LAB}}_USER_%';
SELECT 'users' AS check_name, COUNT(*) AS actual, {{ATTENDEES}} AS expected,
       IFF(COUNT(*) = {{ATTENDEES}}, 'PASS', 'FAIL') AS status
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

SHOW ROLES LIKE '{{LAB}}_ROLE_%';
SELECT 'roles' AS check_name, COUNT(*) AS actual, {{ATTENDEES}} AS expected,
       IFF(COUNT(*) = {{ATTENDEES}}, 'PASS', 'FAIL') AS status
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- 2. Attendee clones: expect {{ATTENDEES}} databases besides the master.
SHOW DATABASES LIKE '{{LAB}}_%';
SELECT 'attendee clones' AS check_name, COUNT(*) AS actual, {{ATTENDEES}} AS expected,
       IFF(COUNT(*) = {{ATTENDEES}}, 'PASS', 'FAIL') AS status
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
WHERE "name" RLIKE '{{LAB}}_[0-9]+';

-- 3. Row counts in the master: a missing row is a FAIL, not a zero.
SELECT t.table_name AS check_name, COALESCE(c.n, 0) AS actual, t.expected,
       IFF(COALESCE(c.n, -1) = t.expected, 'PASS', 'FAIL') AS status
FROM (SELECT 'CUSTOMERS' AS table_name, {{CUSTOMERS_ROWS}} AS expected
      UNION ALL SELECT 'PRODUCTS', {{PRODUCTS_ROWS}}
      UNION ALL SELECT 'ORDERS', {{ORDERS_ROWS}}) t
LEFT JOIN (SELECT 'CUSTOMERS' AS table_name, COUNT(*) AS n FROM {{LAB}}_MASTER.CORE.CUSTOMERS
           UNION ALL SELECT 'PRODUCTS', COUNT(*) FROM {{LAB}}_MASTER.CORE.PRODUCTS
           UNION ALL SELECT 'ORDERS', COUNT(*) FROM {{LAB}}_MASTER.CORE.ORDERS) c
  ON c.table_name = t.table_name;

-- 4. Grain: primary keys are unique (Snowflake does not enforce PRIMARY KEY).
SELECT 'orders pk unique' AS check_name, COUNT(*) AS actual, 0 AS expected,
       IFF(COUNT(*) = 0, 'PASS', 'FAIL') AS status
FROM (SELECT ORDER_ID FROM {{LAB}}_MASTER.CORE.ORDERS GROUP BY ORDER_ID HAVING COUNT(*) > 1);

-- 5. Referential integrity: no order points at a missing customer or product.
SELECT 'orders orphan fks' AS check_name, COUNT(*) AS actual, 0 AS expected,
       IFF(COUNT(*) = 0, 'PASS', 'FAIL') AS status
FROM {{LAB}}_MASTER.CORE.ORDERS o
WHERE NOT EXISTS (SELECT 1 FROM {{LAB}}_MASTER.CORE.CUSTOMERS c WHERE c.CUSTOMER_ID = o.CUSTOMER_ID)
   OR NOT EXISTS (SELECT 1 FROM {{LAB}}_MASTER.CORE.PRODUCTS p WHERE p.PRODUCT_ID = o.PRODUCT_ID);

-- 6. Isolation spot check: attendee 01 can see its clone. Look for USAGE on {{LAB}}_01.
SHOW GRANTS TO ROLE {{LAB}}_ROLE_01;
