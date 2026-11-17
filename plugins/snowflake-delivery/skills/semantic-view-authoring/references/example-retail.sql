-- Worked example: retail orders. Sandbox only. Replace RETAIL_DEMO / CORE / RETAIL_WH with your names.
-- Clause shapes follow the semantic view and agent scripts of the source hands-on lab. Syntax marked UNVERIFIED
-- was not executed against a Snowflake account when this file was written. Run section 1 to 4 in a sandbox, then
-- section 5 and 6, and fix any parse errors against the docs:
--   https://docs.snowflake.com/en/sql-reference/sql/create-semantic-view
--   https://docs.snowflake.com/en/sql-reference/sql/create-agent

----------------------------------------------------------------------------------------------------------------
-- 0. Source of the definitions (invented for this example; in a real engagement quote the transcript)
--   "A customer is one row per customer."                       -> CUSTOMERS grain
--   "An order is one row per order; items are one row per line." -> ORDERS, ORDER_ITEMS grain
--   "Revenue is line amount after discount, never shipping."     -> TOTAL_REVENUE
--   "Repeat rate is the share of customers with 2+ orders in the month; average it, never sum it."
--                                                               -> AVG_REPEAT_RATE (pre-aggregated rollup)
--   OPEN QUESTION (not invented): does revenue exclude cancelled orders? Modelled as all orders until answered.
----------------------------------------------------------------------------------------------------------------

----------------------------------------------------------------------------------------------------------------
-- 1. Sandbox base tables and a few rows
----------------------------------------------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS RETAIL_DEMO;
CREATE SCHEMA IF NOT EXISTS RETAIL_DEMO.CORE;

CREATE OR REPLACE TABLE RETAIL_DEMO.CORE.CUSTOMERS (
    CUSTOMER_ID NUMBER NOT NULL, CUSTOMER_NAME VARCHAR, REGION VARCHAR, LOYALTY_TIER VARCHAR
);
CREATE OR REPLACE TABLE RETAIL_DEMO.CORE.PRODUCTS (
    PRODUCT_ID NUMBER NOT NULL, PRODUCT_NAME VARCHAR, CATEGORY VARCHAR
);
CREATE OR REPLACE TABLE RETAIL_DEMO.CORE.ORDERS (
    ORDER_ID NUMBER NOT NULL, CUSTOMER_ID NUMBER NOT NULL, ORDER_DATE DATE, STATUS VARCHAR, SHIPPING_AMOUNT NUMBER(12,2)
);
CREATE OR REPLACE TABLE RETAIL_DEMO.CORE.ORDER_ITEMS (
    ORDER_ITEM_ID NUMBER NOT NULL, ORDER_ID NUMBER NOT NULL, PRODUCT_ID NUMBER NOT NULL,
    QUANTITY NUMBER, UNIT_PRICE NUMBER(12,2), DISCOUNT_AMOUNT NUMBER(12,2)
);
-- One row per customer per month; REPEAT_RATE is a ratio already computed upstream.
CREATE OR REPLACE TABLE RETAIL_DEMO.CORE.CUSTOMER_MONTHLY (
    REGION VARCHAR NOT NULL, PERIOD DATE NOT NULL, ACTIVE_CUSTOMERS NUMBER, REPEAT_RATE NUMBER(6,4)
);

INSERT INTO RETAIL_DEMO.CORE.CUSTOMERS VALUES
    (1,'Ada','North','Gold'),(2,'Ben','North','Basic'),(3,'Cy','South','Basic');
INSERT INTO RETAIL_DEMO.CORE.PRODUCTS VALUES (10,'Kettle','Home'),(11,'Mug','Home'),(12,'Lamp','Lighting');
INSERT INTO RETAIL_DEMO.CORE.ORDERS VALUES
    (100,1,'2026-01-05','Shipped',4.00),(101,1,'2026-01-20','Shipped',4.00),
    (102,2,'2026-01-22','Cancelled',0.00),(103,3,'2026-02-02','Shipped',6.00);
INSERT INTO RETAIL_DEMO.CORE.ORDER_ITEMS VALUES
    (1000,100,10,1,30.00,0.00),(1001,100,11,2,8.00,1.00),(1002,101,12,1,25.00,5.00),
    (1003,102,10,1,30.00,0.00),(1004,103,11,3,8.00,0.00);
INSERT INTO RETAIL_DEMO.CORE.CUSTOMER_MONTHLY VALUES
    ('North','2026-01-01',2,0.5000),('South','2026-01-01',0,0.0000),
    ('North','2026-02-01',0,0.0000),('South','2026-02-01',1,0.0000);

----------------------------------------------------------------------------------------------------------------
-- 2. Grain checks on the base tables (each must return zero rows BEFORE you model them)
----------------------------------------------------------------------------------------------------------------
SELECT 'CUSTOMERS' AS t, CUSTOMER_ID AS k, COUNT(*) AS n FROM RETAIL_DEMO.CORE.CUSTOMERS GROUP BY CUSTOMER_ID HAVING COUNT(*) > 1
UNION ALL SELECT 'PRODUCTS', PRODUCT_ID, COUNT(*) FROM RETAIL_DEMO.CORE.PRODUCTS GROUP BY PRODUCT_ID HAVING COUNT(*) > 1
UNION ALL SELECT 'ORDERS', ORDER_ID, COUNT(*) FROM RETAIL_DEMO.CORE.ORDERS GROUP BY ORDER_ID HAVING COUNT(*) > 1
UNION ALL SELECT 'ORDER_ITEMS', ORDER_ITEM_ID, COUNT(*) FROM RETAIL_DEMO.CORE.ORDER_ITEMS GROUP BY ORDER_ITEM_ID HAVING COUNT(*) > 1;

-- Composite key on the rollup:
SELECT REGION, PERIOD, COUNT(*) FROM RETAIL_DEMO.CORE.CUSTOMER_MONTHLY GROUP BY REGION, PERIOD HAVING COUNT(*) > 1;

-- Orphan foreign keys (each must return zero rows):
SELECT o.ORDER_ID FROM RETAIL_DEMO.CORE.ORDERS o
  LEFT JOIN RETAIL_DEMO.CORE.CUSTOMERS c ON o.CUSTOMER_ID = c.CUSTOMER_ID WHERE c.CUSTOMER_ID IS NULL;
SELECT i.ORDER_ITEM_ID FROM RETAIL_DEMO.CORE.ORDER_ITEMS i
  LEFT JOIN RETAIL_DEMO.CORE.ORDERS o ON i.ORDER_ID = o.ORDER_ID WHERE o.ORDER_ID IS NULL;
SELECT i.ORDER_ITEM_ID FROM RETAIL_DEMO.CORE.ORDER_ITEMS i
  LEFT JOIN RETAIL_DEMO.CORE.PRODUCTS p ON i.PRODUCT_ID = p.PRODUCT_ID WHERE p.PRODUCT_ID IS NULL;

----------------------------------------------------------------------------------------------------------------
-- 3. Semantic view
--    Shape: TABLES, RELATIONSHIPS, FACTS, DIMENSIONS, METRICS, COMMENT (same order as the source lab script).
--    Grain per table is stated in each COMMENT. Rates are averaged, never summed.
----------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE SEMANTIC VIEW RETAIL_DEMO.CORE.RETAIL_SEMANTIC_VIEW
  TABLES (
    CUSTOMERS AS RETAIL_DEMO.CORE.CUSTOMERS
      PRIMARY KEY (CUSTOMER_ID)
      WITH SYNONYMS ('customers', 'shoppers')
      COMMENT = 'One row per customer. Anchor table for customer attributes.',
    PRODUCTS AS RETAIL_DEMO.CORE.PRODUCTS
      PRIMARY KEY (PRODUCT_ID)
      WITH SYNONYMS ('products', 'items catalogue')
      COMMENT = 'One row per product.',
    ORDERS AS RETAIL_DEMO.CORE.ORDERS
      PRIMARY KEY (ORDER_ID)
      WITH SYNONYMS ('orders', 'purchases')
      COMMENT = 'One row per order. Each order belongs to one customer.',
    ORDER_ITEMS AS RETAIL_DEMO.CORE.ORDER_ITEMS
      PRIMARY KEY (ORDER_ITEM_ID)
      WITH SYNONYMS ('order lines', 'line items')
      COMMENT = 'One row per order line (one product on one order).',
    CUSTOMER_MONTHLY AS RETAIL_DEMO.CORE.CUSTOMER_MONTHLY
      PRIMARY KEY (REGION, PERIOD)
      WITH SYNONYMS ('monthly regional rollup')
      COMMENT = 'One row per region per month. Pre-aggregated; rates here are averaged, never summed.'
  )
  RELATIONSHIPS (
    ORDERS_TO_CUSTOMERS AS ORDERS (CUSTOMER_ID) REFERENCES CUSTOMERS (CUSTOMER_ID),
    ORDER_ITEMS_TO_ORDERS AS ORDER_ITEMS (ORDER_ID) REFERENCES ORDERS (ORDER_ID),
    ORDER_ITEMS_TO_PRODUCTS AS ORDER_ITEMS (PRODUCT_ID) REFERENCES PRODUCTS (PRODUCT_ID)
    -- CUSTOMER_MONTHLY has no relationship: it joins on REGION, which is not a key of CUSTOMERS.
    -- It is queried on its own dimensions (REGION, PERIOD). Linking it would fan out.
  )
  FACTS (
    ORDER_ITEMS.QUANTITY AS QUANTITY
      COMMENT = 'Units on this order line.',
    ORDER_ITEMS.LINE_AMOUNT AS (QUANTITY * UNIT_PRICE - DISCOUNT_AMOUNT)
      WITH SYNONYMS ('line revenue')
      COMMENT = 'Amount for this line after discount, excluding shipping.'
  )
  DIMENSIONS (
    CUSTOMERS.CUSTOMER_ID AS CUSTOMER_ID
      COMMENT = 'Unique customer identifier.',
    CUSTOMERS.REGION AS REGION
      WITH SYNONYMS ('territory', 'area')
      COMMENT = 'Sales region of the customer: North or South.',
    CUSTOMERS.LOYALTY_TIER AS LOYALTY_TIER
      WITH SYNONYMS ('tier')
      COMMENT = 'Loyalty tier: Basic or Gold.',
    PRODUCTS.CATEGORY AS CATEGORY
      WITH SYNONYMS ('product category')
      COMMENT = 'Product category.',
    PRODUCTS.PRODUCT_NAME AS PRODUCT_NAME
      COMMENT = 'Product name.',
    ORDERS.ORDER_DATE AS ORDER_DATE
      WITH SYNONYMS ('date ordered')
      COMMENT = 'Date the order was placed.',
    ORDERS.STATUS AS STATUS
      WITH SYNONYMS ('order status')
      COMMENT = 'Order status: Shipped or Cancelled.',
    CUSTOMER_MONTHLY.REGION AS REGION
      COMMENT = 'Region of the monthly rollup row.',
    CUSTOMER_MONTHLY.PERIOD AS PERIOD
      WITH SYNONYMS ('month')
      COMMENT = 'First day of the rollup month.'
  )
  METRICS (
    ORDERS.ORDER_COUNT AS COUNT(ORDERS.ORDER_ID)
      WITH SYNONYMS ('number of orders', 'order volume')
      COMMENT = 'Count of orders, at the order grain. Includes cancelled orders until the business answers the open question.',
    ORDER_ITEMS.TOTAL_REVENUE AS SUM(ORDER_ITEMS.LINE_AMOUNT)
      WITH SYNONYMS ('revenue', 'sales')
      COMMENT = 'Sum of line amounts after discount, excluding shipping, at the order line grain.',
    ORDER_ITEMS.UNITS_SOLD AS SUM(ORDER_ITEMS.QUANTITY)
      WITH SYNONYMS ('units')
      COMMENT = 'Total units across order lines.',
    CUSTOMER_MONTHLY.TOTAL_ACTIVE_CUSTOMERS AS SUM(CUSTOMER_MONTHLY.ACTIVE_CUSTOMERS)
      WITH SYNONYMS ('active customers')
      COMMENT = 'Customers who ordered in the month, per the rollup. A count, so it can be summed across regions.',
    CUSTOMER_MONTHLY.AVG_REPEAT_RATE AS AVG(CUSTOMER_MONTHLY.REPEAT_RATE)
      WITH SYNONYMS ('repeat rate', 'repeat purchase rate')
      COMMENT = 'Average share of customers with two or more orders in the month. A rate: average it, never sum it.'
  )
  COMMENT = 'Retail orders: customers, products, orders and order lines, plus a monthly regional rollup.'
;

----------------------------------------------------------------------------------------------------------------
-- 4. Agent bound to the semantic view
--    Shape follows the source lab script. See references/agent-spec.md for each key.
----------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE AGENT RETAIL_DEMO.CORE.RETAIL_AGENT
  COMMENT = 'Retail agent for natural-language questions over orders, customers, products and monthly rollups.'
  PROFILE = '{"display_name": "Retail Agent", "color": "blue"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto

  orchestration:
    budget:
      seconds: 30
      tokens: 16000

  instructions:
    response: "Respond concisely. State the time window and any filter you applied."
    orchestration: "Use the Retail Analyst tool for any question about orders, revenue, customers, products or repeat rate."
    sample_questions:
      - question: "What was total revenue by product category in January 2026?"
      - question: "How many orders did each region place, and which customers are Gold tier?"
      - question: "What is the average repeat rate by region for each month?"

  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "Retail Analyst"
        description: "Answers questions about orders, order lines, customers, products and the monthly regional repeat rate using the retail semantic view."

  tool_resources:
    "Retail Analyst":
      semantic_view: "RETAIL_DEMO.CORE.RETAIL_SEMANTIC_VIEW"
      execution_environment:
        type: "warehouse"
        warehouse: "RETAIL_WH"
  $$
;

----------------------------------------------------------------------------------------------------------------
-- 5. Verification: SEMANTIC_VIEW(...) query reconciled to plain SQL on the base tables.
--    UNVERIFIED: the SEMANTIC_VIEW(...) table-function form below follows the Snowflake docs, not the lab scripts.
--    Each reconciliation returns ZERO rows when the two sides agree (EXCEPT both ways).
----------------------------------------------------------------------------------------------------------------

-- 5a. Sample question: "total revenue by product category"
WITH sv AS (
    SELECT CATEGORY, TOTAL_REVENUE
    FROM SEMANTIC_VIEW(
        RETAIL_DEMO.CORE.RETAIL_SEMANTIC_VIEW
        DIMENSIONS PRODUCTS.CATEGORY
        METRICS ORDER_ITEMS.TOTAL_REVENUE
    )
),
plain AS (
    SELECT p.CATEGORY, SUM(i.QUANTITY * i.UNIT_PRICE - i.DISCOUNT_AMOUNT) AS TOTAL_REVENUE
    FROM RETAIL_DEMO.CORE.ORDER_ITEMS i
    JOIN RETAIL_DEMO.CORE.PRODUCTS p ON i.PRODUCT_ID = p.PRODUCT_ID
    GROUP BY p.CATEGORY
)
SELECT 'only_in_semantic_view' AS side, * FROM (SELECT * FROM sv EXCEPT SELECT * FROM plain)
UNION ALL
SELECT 'only_in_plain_sql', * FROM (SELECT * FROM plain EXCEPT SELECT * FROM sv);

-- 5b. Sample question: "orders by region" (order grain, joined to customers)
WITH sv AS (
    SELECT REGION, ORDER_COUNT
    FROM SEMANTIC_VIEW(
        RETAIL_DEMO.CORE.RETAIL_SEMANTIC_VIEW
        DIMENSIONS CUSTOMERS.REGION
        METRICS ORDERS.ORDER_COUNT
    )
),
plain AS (
    SELECT c.REGION, COUNT(*) AS ORDER_COUNT
    FROM RETAIL_DEMO.CORE.ORDERS o
    JOIN RETAIL_DEMO.CORE.CUSTOMERS c ON o.CUSTOMER_ID = c.CUSTOMER_ID
    GROUP BY c.REGION
)
SELECT 'only_in_semantic_view' AS side, * FROM (SELECT * FROM sv EXCEPT SELECT * FROM plain)
UNION ALL
SELECT 'only_in_plain_sql', * FROM (SELECT * FROM plain EXCEPT SELECT * FROM sv);

-- 5c. Sample question: "average repeat rate by region and month" (rollup table, rate averaged)
WITH sv AS (
    SELECT REGION, PERIOD, AVG_REPEAT_RATE
    FROM SEMANTIC_VIEW(
        RETAIL_DEMO.CORE.RETAIL_SEMANTIC_VIEW
        DIMENSIONS CUSTOMER_MONTHLY.REGION, CUSTOMER_MONTHLY.PERIOD
        METRICS CUSTOMER_MONTHLY.AVG_REPEAT_RATE
    )
),
plain AS (
    SELECT REGION, PERIOD, AVG(REPEAT_RATE) AS AVG_REPEAT_RATE
    FROM RETAIL_DEMO.CORE.CUSTOMER_MONTHLY
    GROUP BY REGION, PERIOD
)
SELECT 'only_in_semantic_view' AS side, * FROM (SELECT * FROM sv EXCEPT SELECT * FROM plain)
UNION ALL
SELECT 'only_in_plain_sql', * FROM (SELECT * FROM plain EXCEPT SELECT * FROM sv);

-- 5d. Cross-table fan-out probe: revenue by customer region (order_items -> orders -> customers).
--     Revenue must equal the item-level total, not a multiple of it.
SELECT
    (SELECT SUM(TOTAL_REVENUE) FROM SEMANTIC_VIEW(RETAIL_DEMO.CORE.RETAIL_SEMANTIC_VIEW
         DIMENSIONS CUSTOMERS.REGION METRICS ORDER_ITEMS.TOTAL_REVENUE)) AS revenue_through_joins,
    (SELECT SUM(QUANTITY * UNIT_PRICE - DISCOUNT_AMOUNT) FROM RETAIL_DEMO.CORE.ORDER_ITEMS) AS revenue_base_table;

----------------------------------------------------------------------------------------------------------------
-- 6. Relationship fan-out checks on the base tables. "Many side" rows must not change when joined to the "one side".
--    Each pair of numbers must be equal.
----------------------------------------------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM RETAIL_DEMO.CORE.ORDERS) AS orders_rows,
    (SELECT COUNT(*) FROM RETAIL_DEMO.CORE.ORDERS o
        JOIN RETAIL_DEMO.CORE.CUSTOMERS c ON o.CUSTOMER_ID = c.CUSTOMER_ID) AS orders_joined_to_customers;
SELECT
    (SELECT COUNT(*) FROM RETAIL_DEMO.CORE.ORDER_ITEMS) AS item_rows,
    (SELECT COUNT(*) FROM RETAIL_DEMO.CORE.ORDER_ITEMS i
        JOIN RETAIL_DEMO.CORE.ORDERS o ON i.ORDER_ID = o.ORDER_ID
        JOIN RETAIL_DEMO.CORE.PRODUCTS p ON i.PRODUCT_ID = p.PRODUCT_ID) AS items_joined_to_orders_and_products;

-- Expected measured values on the seed rows above (compute by hand, then compare to the query output):
--   revenue by category: Home = (30.00) + (2*8.00-1.00) + (30.00) + (3*8.00) = 30 + 15 + 30 + 24 = 99.00 ; Lighting = 20.00
--   orders by region: North = 3 (100,101,102), South = 1 (103)
