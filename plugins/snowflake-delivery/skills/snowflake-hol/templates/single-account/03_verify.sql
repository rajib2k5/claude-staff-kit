-- {{LAB}} hands-on lab: SINGLE ACCOUNT verify. Read-only. Any STATUS = 'FAIL' blocks the lab.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE {{LAB}}_WH;

-- 1. Row counts: a missing row is a FAIL, not a zero.
SELECT t.table_name AS check_name, COALESCE(c.n, 0) AS actual, t.expected,
       IFF(COALESCE(c.n, -1) = t.expected, 'PASS', 'FAIL') AS status
FROM (SELECT 'CUSTOMERS' AS table_name, {{CUSTOMERS_ROWS}} AS expected
      UNION ALL SELECT 'PRODUCTS', {{PRODUCTS_ROWS}}
      UNION ALL SELECT 'ORDERS', {{ORDERS_ROWS}}) t
LEFT JOIN (SELECT 'CUSTOMERS' AS table_name, COUNT(*) AS n FROM {{LAB}}.CORE.CUSTOMERS
           UNION ALL SELECT 'PRODUCTS', COUNT(*) FROM {{LAB}}.CORE.PRODUCTS
           UNION ALL SELECT 'ORDERS', COUNT(*) FROM {{LAB}}.CORE.ORDERS) c
  ON c.table_name = t.table_name;

-- 2. Grain: primary keys are unique.
SELECT 'orders pk unique' AS check_name, COUNT(*) AS actual, 0 AS expected,
       IFF(COUNT(*) = 0, 'PASS', 'FAIL') AS status
FROM (SELECT ORDER_ID FROM {{LAB}}.CORE.ORDERS GROUP BY ORDER_ID HAVING COUNT(*) > 1);

-- 3. Referential integrity.
SELECT 'orders orphan fks' AS check_name, COUNT(*) AS actual, 0 AS expected,
       IFF(COUNT(*) = 0, 'PASS', 'FAIL') AS status
FROM {{LAB}}.CORE.ORDERS o
WHERE NOT EXISTS (SELECT 1 FROM {{LAB}}.CORE.CUSTOMERS c WHERE c.CUSTOMER_ID = o.CUSTOMER_ID)
   OR NOT EXISTS (SELECT 1 FROM {{LAB}}.CORE.PRODUCTS p WHERE p.PRODUCT_ID = o.PRODUCT_ID);

-- 4. The attendee user is bound: expect one row granting {{LAB}}_PARTICIPANT.
SHOW GRANTS TO USER "{{PARTICIPANT_USER}}";
SELECT 'participant bound' AS check_name, COUNT(*) AS actual, 1 AS expected,
       IFF(COUNT(*) = 1, 'PASS', 'FAIL') AS status
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
WHERE "role" = '{{LAB}}_PARTICIPANT';

-- 5. The attendee user lands in the lab: default role, warehouse and namespace.
SHOW USERS LIKE '{{PARTICIPANT_USER}}';
SELECT 'participant defaults' AS check_name,
       COUNT_IF("default_role" = '{{LAB}}_PARTICIPANT'
                AND "default_warehouse" = '{{LAB}}_WH'
                AND "default_namespace" = '{{LAB}}.CORE') AS actual,
       1 AS expected,
       IFF(actual = 1, 'PASS', 'FAIL') AS status
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
