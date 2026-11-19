---
name: ai-spend
description: Report AI spend across Snowflake Cortex and Cortex Code, AWS Bedrock, the Claude API (Admin analytics API) and local Claude Code transcripts, from billing data, with every dollar labelled billed, list or estimated_api_equivalent and one subtotal per label. Use when someone asks what AI or LLM usage cost over a window, by source, model, user or project. Triggers - AI spend, LLM cost, how much did Claude cost, Cortex credits, Bedrock bill, Claude Code usage this week, token spend by model.
---

# AI spend from billing data (`ai-spend`)

Billing data is the source of truth. Each source has one read-only fetcher. Each fetcher writes one JSON document
in the shape of `schema.json`. `report.py` merges the documents into one table and one JSON file.

Every row has a `usd_basis`:

| `usd_basis` | Meaning | Sources |
|---|---|---|
| `billed` | From billing data, before credits (see each source) | Claude API cost, Bedrock (Cost Explorer) |
| `list` | A quantity times a public list rate | Snowflake credits x `--credit-rate` |
| `estimated_api_equivalent` | Tokens times API list prices. **Not money spent** on a Max plan | local Claude Code |

The report gives one subtotal per basis. It never adds two bases together, and it has no grand total.

## Procedure

1. Choose the window. `--days N` is the last N complete UTC days (today is not included, because billing data
   for today is partial). `--since YYYY-MM-DD [--until YYYY-MM-DD]` is a half-open interval of UTC days; `until` is
   exclusive and defaults to today. Give every source the same window.
2. Run the fetchers you need. Write each document to a scratch folder, not to the repository:

   ```bash
   S=~/.claude/skills/ai-spend/scripts; OUT=$(mktemp -d)
   python3 "$S/claude_code_local.py" --days 7 --out "$OUT/local.json"                 # free, offline
   python3 "$S/anthropic_api.py"     --days 7 --out "$OUT/anthropic.json"             # Admin key in env
   python3 "$S/snowflake_cortex.py"  --days 7 --credit-rate 2.00 --out "$OUT/sf.json" # PAT in env, USAGE_VIEWER
   python3 "$S/bedrock.py"           --days 7 --out "$OUT/bedrock.json"               # boto3, USD 0.01 per request
   python3 "$S/report.py" "$OUT"/*.json --json-out "$OUT/report.json"
   ```

3. Read the SOURCES block first. A source with status UNKNOWN or ERROR has no number; do not read it as 0.
4. Read the notes of each source: revision windows, the matched Bedrock services, the Snowflake attribution gap,
   unpriced models.
5. Before a number goes to a decision, follow the `data-cost` skill (Step 3 and Step 4): state the window, keep
   the basis label, and validate it.

### Sources

- **Snowflake Cortex and Cortex Code** (`snowflake_cortex.py`, SQL in `sql/`). The total is
  `ACCOUNT_USAGE.METERING_DAILY_HISTORY` for SERVICE_TYPE `AI_SERVICES`, `CORTEX_CODE_CLI` and
  `CORTEX_CODE_SNOWSIGHT`. The per-user and per-model rows come from `SNOWFLAKE_COCO_USAGE_HISTORY` (model from a
  `LATERAL FLATTEN` of `CREDITS_GRANULAR`), `CORTEX_AGENT_USAGE_HISTORY`, `CORTEX_AI_FUNCTIONS_USAGE_HISTORY` and
  `CORTEX_SEARCH_DAILY_USAGE_HISTORY`. They are attribution only: they never count toward a subtotal. The
  deprecated `CORTEX_FUNCTIONS_USAGE_HISTORY` and `CORTEX_FUNCTIONS_QUERY_USAGE_HISTORY` are not used. The SQL runs
  through the `snowflake-sql` skill's `sf.py` (its config, its PAT variable, its read-only guard), with the window
  bound as two values. Dollars are credits x `--credit-rate` (AI credits list at USD 2.00 with global routing, USD
  2.20 regional), labelled `list`; there is no contract-rate path. No metering rows is UNKNOWN, not 0; a NULL
  `CREDITS_BILLED` is unpriced, not 0, and makes the source PARTIAL.
  `METERING_DAILY_HISTORY.USAGE_DATE` is a day in the **session time zone** (its
  [docs](https://docs.snowflake.com/en/sql-reference/account-usage/metering_daily_history) say to set the session
  to UTC to reconcile it with ORGANIZATION_USAGE). `sf.py` cannot set a session parameter and its read-only guard
  refuses `ALTER SESSION`, so the query returns each day's UTC offset instead. If any day is not a UTC day, the
  source is PARTIAL and a note names the offset: the subtotal then covers session-time-zone days, not the UTC
  window. To get UTC days, set the Snowflake user's `TIMEZONE` parameter to `UTC`.
- **AWS Bedrock** (`bedrock.py`). Cost Explorer `GetDimensionValues` lists the SERVICE values with cost in the
  window; a pattern list keeps the Bedrock ones; `GetCostAndUsage` (DAILY, grouped by SERVICE and USAGE_TYPE,
  metric UnblendedCost, filtered to `RECORD_TYPE` `Usage`) reads them. The record-type filter keeps credits and
  refunds from netting into the sum, so `billed` here is usage before credits, refunds, discounts and tax.
  Third-party models are reported to appear as their own service, for example
  `Claude Sonnet 5.5 (Amazon Bedrock Edition)`. AWS documentation does not confirm that name: check the
  matched-services note against your bill. Cost Explorer cannot filter a dimension by substring, so the names are
  listed first. Each paginated request costs USD 0.01; the script prints the count. `sql/bedrock_cur2_athena.sql`
  is an Athena query for a CUR 2.0 export (filter `product_product_family = 'Amazon Bedrock'`); it is a file only.
- **Claude API** (`anthropic_api.py`). `GET /v1/organizations/analytics/cost` and `.../analytics/usage`, daily,
  grouped by model, workspace_id, api_key_id and actor, every page. `cost.amount` is cents as a decimal string,
  parsed with `Decimal`, labelled `billed`: after discounts and **before credits**, so it can be higher than the
  invoice. Requests under a **Priority Tier commitment show 0** in `amount` (the commitment covers them; its fee is
  billed separately and is not in this data). The window must start on or after 2026-01-01 and within the last
  365 days, or the fetcher exits 2. A `data_refreshed_at` before the window end makes the source PARTIAL. The
  Admin key is stripped of surrounding whitespace and refused (exit 2, unsent) if it has any character other than
  a letter, a digit, `-` or `_`. Standard library only.
- **Local Claude Code** (`claude_code_local.py`). Tokens from `~/.claude/projects/**/*.jsonl`, per UTC day, model
  and project folder. One count per `message.id` across all files: the line with the most output tokens is kept
  (ties: later timestamp), whatever order the files are read in; `<synthetic>` skipped. `meta.messages` counts
  the messages inside the window. Prices
  come from `model-prices.json` (`--prices`, else `~/.claude/hooks/lib/`, else the kit's `hooks/lib/`); this skill
  has no price table of its own. A model is priced only by an exact id or that id plus `-YYYYMMDD`; anything else
  is unpriced, never guessed. With no table, every model is unpriced and the tokens are still reported.

## Traps

- **Double counts across vendors.** Claude used through Bedrock is billed by AWS. Claude used through Cortex is
  billed by Snowflake, in credits. Neither is in the Anthropic cost API. Do not add Anthropic's model rows to the
  Bedrock or Cortex rows as "Claude spend" twice, and do not take Anthropic's figure as all Claude spend.
- **Double counts inside Snowflake.** The metering total already holds every per-feature view, so the views are
  attribution only. Cortex Search `EMBED_TEXT_TOKENS` credits are treated as also present in
  `CORTEX_AI_FUNCTIONS_USAGE_HISTORY`, so they are marked excluded and left out of the attributed sum. The
  Search view's own docs do not state this overlap; it is kept out to be safe. Cortex Code can be metered under
  its own service types or inside `AI_SERVICES`; all three types are read, and each credit is in one of them only.
- **Revision windows.** Claude API figures can change until about 7 days after the end of the calendar month.
  Cost Explorer marks recent days `Estimated`. `METERING_DAILY_HISTORY` can lag 3 hours.
  Quote final figures only for closed periods.
- **UNKNOWN is not 0.** An empty Claude API response with `data_refreshed_at: null` means no data yet: the status
  is `unknown` and the report says UNKNOWN. An empty response with a refresh time is a measured zero. An empty
  Snowflake metering result is UNKNOWN too. An unpriced model has a token count and no USD.
- **Billed is before credits.** Claude API `amount` and Bedrock `Usage` records are before credits; Priority Tier
  commitment usage is 0 in the Claude API data. Neither subtotal is the invoice total.
- **Estimated is not spent.** `estimated_api_equivalent` on a Max plan is what the tokens would cost at API list
  prices. The plan is a flat fee.
- **User fields.** `CORTEX_AI_FUNCTIONS_USAGE_HISTORY` has user fields only for data after 2026-02-16, and its
  `USER_ID` is an ID, not a name. Claude API rows with no identity have `actor: null` (shown as `(unattributed)`).
- **Cortex Agents nesting.** `cortex_agent_usage.sql` follows the `CREDITS_GRANULAR` sample in Snowflake's docs
  (request id, then service type, then model). It has not run against a live account yet.

## Report

`report.py DOC.json ... [--json-out FILE]` prints:

- the window and the time the report was made; a warning if the documents cover different windows;
- SOURCES: status (OK, PARTIAL, UNKNOWN, ERROR), the time each source was fetched, rows, and every note;
- USD SUBTOTALS, ONE PER BASIS: one line per `usd_basis`, with the sources in it;
- NOT IN ANY SUBTOTAL: UNKNOWN and ERROR sources, and unpriced models with their token counts;
- TOKENS per source and model;
- BREAKDOWN per source, feature, model, user and project / workspace / service. `*` marks attribution-only rows,
  `x` marks rows excluded as a double count.

`/ai-spend` runs the fetchers and the report on demand. Nothing runs on a schedule.

## Credentials

| Source | Credential | Where it comes from | Least privilege |
|---|---|---|---|
| Claude API | Admin API key | env var `ANTHROPIC_ADMIN_KEY`, or the variable named by `--key-env NAME` | a key used only for this report, with an expiry |
| Snowflake | PAT | the variable in `snowflake-sql`'s `config.json` (`token_var`) | a role with the `SNOWFLAKE.USAGE_VIEWER` database role |
| AWS | default boto3 chain | env, profile (`--profile`), SSO, instance role | `ce:GetCostAndUsage`, `ce:GetDimensionValues`, `ce:GetTags` |
| Local | none | reads `~/.claude/projects` | read-only |

The Claude API fetcher refuses a key given on the command line (it would show in `ps` and in shell history). It
sends the key only to `https://api.anthropic.com` (or a loopback address, for tests), refuses redirects, and
removes every 8-character piece of the key from every message, error document and exception text (a text that
holds it percent-, backslash- or HTML-escaped is replaced whole). Never echo a key to check it; print its
length. AWS policy:

```json
{"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Resource": "*",
  "Action": ["ce:GetCostAndUsage", "ce:GetDimensionValues", "ce:GetTags"]}]}
```

## Langfuse seam

Langfuse is not read yet. To add it, write a `langfuse.py` that emits a source document in the shape of
`schema.json` with `"source": "langfuse"`; `report.py` needs no change. Rules for that adapter:

- Langfuse cost comes from its own model price table applied to traced tokens. Label it
  `estimated_api_equivalent`, never `billed`.
- Traces of calls that a billing source already covers (Claude API, Bedrock, Cortex) are attribution only: set
  `counts_toward_total: false`, as the Snowflake views do.
- A trace with no cost is unpriced (`usd: null`), not 0.

## Tests

`cd skills/ai-spend/scripts && python3 -m unittest test_ai_spend` (44 tests, offline: synthetic fixtures and
loopback test servers only; no credentials). They cover Claude API pagination, cents parsed with Decimal, null
workspace and actor, empty data as UNKNOWN, a stale `data_refreshed_at` as PARTIAL, 31-day chunks, the 2026-01-01
and 365-day limits, an expired cursor, no retry on a 4xx, refused redirects, transcript de-duplication by
`message.id` in any file order, the half-open window, unpriced models and a date suffix against a version suffix,
per-basis subtotals that never mix, half-up display rounding, the Cortex Search double count, empty and NULL
metering, session-time-zone days, the Bedrock service and record-type filter and request count, and a canary
Admin key (with trailing whitespace, bad characters, cut at 2000 bytes, percent- or backslash-escaped, and with an
unwritable `--out`) that must not reach stdout, stderr, files or tracebacks. Each test was seen failing first,
against the code before its fix or against a hand mutant of the behaviour it guards.
