-- Amazon Bedrock spend from a CUR 2.0 export, for Athena. Provided as a file only: ai-spend never runs it.
-- One row per UTC usage day x service (line_item_product_code) x provider x model x inference type.
-- Columns are from the CUR 2.0 data dictionary (docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2*):
--   product_product_family is 'Amazon Bedrock' for every Bedrock line item, third-party models included;
--   product is a map<string,string> whose Bedrock keys include provider, model, inference_type and feature.
-- Replace <database>.<cur2_table> and the two dates. The window is half-open: start <= day < end.
-- line_item_unblended_cost is USD for most accounts; check line_item_currency_code. usd_basis: billed.
-- Credits, refunds and taxes are separate line item types; this query keeps Usage only, so it can be
-- higher than the invoice after credits.
SELECT
    DATE(cur.line_item_usage_start_date) AS usage_day,
    cur.line_item_product_code AS product_code,
    cur.product['provider'] AS provider,
    cur.product['model'] AS model,
    cur.product['inference_type'] AS inference_type,
    cur.line_item_currency_code AS currency,
    SUM(cur.line_item_unblended_cost) AS unblended_cost
FROM <database>.<cur2_table> AS cur
WHERE cur.product_product_family = 'Amazon Bedrock'
    AND cur.line_item_line_item_type = 'Usage'
    AND cur.line_item_usage_start_date >= TIMESTAMP '2026-11-01 00:00:00'
    AND cur.line_item_usage_start_date < TIMESTAMP '2026-11-08 00:00:00'
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY usage_day, unblended_cost DESC;
