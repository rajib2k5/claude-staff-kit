---
name: snowflake-sql
description: Run Snowflake SQL and inspect a Snowflake account with a programmatic access token (PAT) through the Snowflake SQL API, using the bundled stdlib-only Python CLI sf.py. Use for any task that has to execute something in Snowflake - queries, SHOW / DESCRIBE / GET_DDL, grants, query history, warehouse credits, explain plans, async statements and cancel. This is the only way to reach Snowflake: never use the Snowflake MCP server, even when it is connected; always authenticate with the TMP_PAT token. Triggers - run this in snowflake, query snowflake, check snowflake, snowflake table, show grants, query history, snowflake credits, live snowflake test.
---

# Snowflake SQL with a PAT (`sf.py`)

**Rule: never use the Snowflake MCP server, even when it shows as connected. Use this tool, with `TMP_PAT`.** The
owner decided this on 2026-10-19 ("stop looking for snowflake mcp") and repeated it on 2026-10-30 ("Don't use mcp
server ... use TMP_PAT"). The server can connect; whether it can is not the reason. Do not repair, reconnect or
configure it. The tool calls the Snowflake SQL API (`POST /api/v2/statements`) directly, with the PAT in the
`TMP_PAT` variable that `~/.zshrc` exports.

```bash
SF=~/.claude/skills/snowflake-sql/sf.py      # in zsh, call "$SF" directly, never `python3 $SF` in one variable
"$SF" whoami
```

## Commands

| Task | Command |
|---|---|
| Who and where the token runs (user, role, secondary roles, warehouse, db, account, region) | `"$SF" whoami` |
| A query | `"$SF" sql "SELECT ..."` · `-f query.sql` · `-` for stdin |
| Bind values (never paste user data into SQL) | `"$SF" sql "SELECT * FROM T WHERE ID = ? AND D >= ?" --bind int:42 --bind date:2026-10-01` |
| Several statements in one request (one session: USE, SET, RESULT_SCAN, BEGIN..COMMIT carry over) | `"$SF" sql "SELECT 1; SELECT 2" --multi` |
| A script, one request per statement, stopping at the first failure and saying which ran | `"$SF" sql -f deploy.sql --each --write` (no `--bind`; each statement is its own session) |
| How the guard reads a script, offline (no token used, nothing sent) | `"$SF" classify -f deploy.sql` |
| First rows, row count | `"$SF" sample DB.S.T -n 10` · `"$SF" count DB.S.T` |
| Output for a script | `--format json` · `jsonl` · `csv`, `--out FILE` (table is the default; it shows 200 rows, `--max-rows N` for more) |
| Plan without running | `"$SF" explain "SELECT ..."` |
| List objects | `"$SF" ls tables --in DB.SCHEMA --like '%NAME%'` (kinds: masking-policies, objects, databases, schemas, tables, views, procedures, functions, tasks, streams, stages, warehouses, roles, users, dynamic-tables, pipes, sequences, file-formats, alerts, integrations, secrets, columns) |
| Columns of a table | `"$SF" describe DB.S.T` (`--kind VIEW` ...) or `"$SF" ls columns --in DB.S.T` |
| DDL | `"$SF" ddl DB.S.T --kind TABLE` (VIEW, PROCEDURE, SCHEMA, ...) |
| Grants | `"$SF" grants --to-role R` · `--of-role R` · `--to-user U` · `--on "TABLE DB.S.T"` |
| Recent queries (real time) | `"$SF" history --minutes 60 --failed` |
| Credits per warehouse per day (`ACCOUNT_USAGE`, up to ~3 h late) | `"$SF" credits --days 7` |
| Long statement | `H=$("$SF" submit "CALL ...")`, then `"$SF" status "$H"`, `"$SF" cancel "$H" --write` (cancel changes Snowflake and can stop another user's statement, so it needs `--write`) |
| Context | `--database DB --schema S --warehouse W --role R`, or `--profile dq-accelerator` (see `config.json`), or `--connection [NAME]` for the account, warehouse, database and schema of a `~/.snowflake/config.toml` connection (never its role or authentication). Unquoted names are upper-cased as SQL does (the SQL API itself matches them case-sensitively: `compute_wh` set no warehouse); quote a mixed-case name: `--role '"MixedRole"'` |

Bind types: `str:`, `int:`, `num:` (exact decimal), `float:`, `bool:`, `date:YYYY-MM-DD`, `ts:YYYY-MM-DDTHH:MM:SS`
(naive UTC), `null:`. Results lose nothing: NUMBER with a scale is an exact Decimal; timestamps and TIME are ISO text
with every fractional digit (nanoseconds kept); TIMESTAMP_TZ keeps its offset; TIMESTAMP_LTZ is shown as UTC
(`+00:00`), because the SQL API sends the instant without the session's zone; VARIANT / OBJECT / ARRAY are JSON with
exact decimals and a SQL NULL inside an ARRAY as null. `--format json` / `jsonl` is strict RFC 8259 JSON: a FLOAT or
VARIANT Infinity / -Infinity / NaN is written as that word in a string. A VARIANT holding JSON `null` prints `null` in a
table and in CSV, a SQL NULL prints `NULL` (an empty field in CSV, where an empty string is `""`); JSON output writes
both as null. In library use a JSON null is `sf.JSON_NULL` (falsy), not None. JSON output writes an exact decimal as
a string (`"12.50"`), so no digit is lost to a float.

Exit codes: 0 ok · 1 Snowflake or HTTP error (code in brackets, e.g. `[002003]` object not found) · 2 usage or
config · 3 refused by the safety guard.

## Safety: read this before any write

- **This token is very powerful.** Measured 2026-10-19 with `whoami`: the default role is `LOAN_QNT_DEMO_OWNER`, and
  the secondary roles are `ALL`, which include **ACCOUNTADMIN**. Any statement this tool sends can use ACCOUNTADMIN
  privileges. The default database (`UNIFAI.SALES_COPILOT`) belongs to another project. So always name the database
  (`--database`, a profile, or fully qualified names), and treat every write as account-wide.
- **Read-only by default.** SELECT, SHOW, DESCRIBE, EXPLAIN, LIST, VALUES, `WITH ... SELECT` and USE run as is. USE
  changes nothing stored, but `USE ROLE` / `USE SECONDARY ROLES` change what the rest of a `--multi` request may do
  (this token can already use ACCOUNTADMIN). Anything else needs `--write`. `--destructive` is also needed for
  anything a person must approve:
  - removing or replacing: DROP, TRUNCATE, DELETE, REMOVE, UNDROP, REVOKE, MERGE, CREATE OR REPLACE, CREATE OR ALTER,
    INSERT OVERWRITE, every UPDATE (a WHERE can still match every row), ALTER ... DROP / SWAP / RENAME / UNSET, a
    change to DATA_RETENTION_TIME_IN_DAYS (it shortens Time Travel), COPY INTO ... OVERWRITE = TRUE;
  - what its text does not show: CALL, EXECUTE (IMMEDIATE, TASK, ...), DECLARE and BEGIN ... END script blocks
    (BEGIN / BEGIN TRANSACTION stays a plain write), and any `SYSTEM$` function outside a short read-only list
    (`SYSTEM$WAIT`, `TYPEOF`, `CLUSTERING_INFORMATION`, `STREAM_HAS_DATA`, `PIPE_STATUS`, `GET_TAG`, ...), even in a
    SELECT, because many cancel queries, send mail, enable tasks or change the account;
  - spend: any ALTER ... RESUME (task, alert, warehouse, compute pool, dynamic table, materialized view), an unpaused
    pipe, EXECUTE TASK, a warehouse size, cluster count, auto-suspend or resource monitor change, CREATE WAREHOUSE /
    COMPUTE POOL / DYNAMIC TABLE / RESOURCE MONITOR, ADD SEARCH OPTIMIZATION, CLUSTER BY;
  - security and account: ALTER USER / ACCOUNT / NETWORK POLICY / NETWORK RULE / SECURITY INTEGRATION /
    AUTHENTICATION POLICY / SHARE, CREATE USER / SHARE / an integration / a network policy or rule, a programmatic
    access token change, GRANT OWNERSHIP, GRANT ... ON ACCOUNT, GRANT MANAGE GRANTS, a GRANT that names ACCOUNTADMIN,
    SECURITYADMIN, SYSADMIN, USERADMIN or ORGADMIN, SET MASKING POLICY ... FORCE;
  - removal of stage files: COPY INTO ... PURGE = TRUE; and an anonymous procedure, `WITH p AS PROCEDURE ... CALL p()`.
  The `SYSTEM$` check reads the whole text, quoted names and strings included, so `"SYSTEM$CANCEL_ALL_QUERIES"(1)` and
  `IDENTIFIER('SYSTEM$...')` count too.
- **Protected schemas are never written.** Any SQL that changes Snowflake and names a schema in `protected_schemas`
  (config.json; default `DQ_AI_ACCELERATOR.DEMO`, `DQ_METRICS`, `PUBLIC`, the DQ accelerator's read-only inputs) is
  refused, with or without flags. Caught:
  - fully qualified and "quoted" names, also with a comment between the parts (`DB./**/DEMO`), and `DB..T`, which
    Snowflake resolves to `DB.PUBLIC.T` (measured);
  - a name inside a string literal or a `$$` body (`IDENTIFIER('...DEMO.T')`, `EXECUTE IMMEDIATE '... DEMO.T'`);
  - the database that holds a protected schema, at database scope: CREATE OR REPLACE / ALTER / SWAP WITH / GRANT ...
    IN DATABASE `DQ_AI_ACCELERATOR` are refused (ask the owner to do those by hand);
  - `SCHEMA.x`, `SCHEMA s` and `SWAP WITH s` under a session database of that name, in strings and `$$` bodies too, and
    any write while the session is in a protected schema. The session follows `--database` / `--schema` and every
    `USE DATABASE` / `USE SCHEMA` in the SQL (`USE DATABASE` selects PUBLIC, measured; `--database` alone selects no
    schema, measured, so an unqualified write fails in Snowflake);
  - a write through a variable or a bind, `IDENTIFIER($v)`, `IDENTIFIER(:v)`, `IDENTIFIER(?)`, `EXECUTE IMMEDIATE :v`,
    also inside a `$$` body, since its target cannot be checked.
  A protected name in a comment or a string also refuses the SQL: the safe direction. Change the list only on the
  owner's word.
- **How the guard reads SQL.** One lexer serves the guard and `--each`. It removes comments and literals, then checks
  every statement: a `;` ends one, and so does the flow operator `->>` (which chains statements, so
  `SELECT 1 ->> DROP TABLE T` is refused). It follows Snowflake where a naive reader would not: a `--` or `//` comment
  ends at a bare carriage return, `a$$` is an identifier and not a `$$` body, and an `@stage/path` runs to whitespace
  or `;,()`, so `//` or a `"` inside the path is part of it (a quoted stage name only right after `@` or a dot). The
  `sql` command counts statements the way Snowflake does (a `->>` chain is one) for `--multi`.
  `sf.py classify "..."` shows offline what the guard decides, statement by statement, and ends with the guard's own
  verdict for the whole SQL. `--dry-run` shows what would be sent.
- **What the guard cannot see (residual risk).** It reads text. It is two rounds of Opus adversarial validation deep
  (2026-10-19; every reproduced finding fixed), not a proof. It cannot see: a name built by concatenation inside a
  script (`'DQ_AI_ACC' || 'ELERATOR.DEMO'`), what a procedure, task or stored script does inside Snowflake (which
  is why CALL, EXECUTE and script blocks need a person's yes), and `USE DATABASE IDENTIFIER(...)`. The real boundary
  is the role: a PAT limited to a least-privileged role (Snowflake's ROLE_RESTRICTION on the token), with no
  secondary roles, would make most of this guard a convenience instead of the last line. Ask the owner for one before
  any regular write work.
- **Never pass `--write` or `--destructive` on inference.** Writes follow the project's rules (for example the
  DQ accelerator: only BRONZE, SILVER, APP, ML, CONFIG; never DEMO, DQ_METRICS, PUBLIC; deploy only through its
  `scripts/sf_deploy.py`). A destructive statement follows the `destructive-ops-guard` skill: tell the user what is
  destroyed (measured), how it is recovered, and wait for their yes. Resuming a task or a warehouse is a spend
  decision for a person.
- **The token.** The tool reads `TMP_PAT` from the environment, and when it is not there (a non-interactive shell does
  not read `~/.zshrc`), from a plain `export TMP_PAT=...` line of `~/.zshenv`, `~/.zprofile`, `~/.zshrc` and
  `~/.zlogin`, read in zsh's order so the last one wins as in a login shell. A value a shell would expand (a `$` or a
  backtick outside single quotes, anywhere in it) or that holds a typographic quote is refused. It never runs the file, never prints the token, sends it only to the configured `*.snowflakecomputing.com` origin,
  refuses redirects and removes it from every error. Never echo the token to check it: print its length
  (`zsh -ic 'echo ${#TMP_PAT}'`).
- **Retries are safe.** HTTP 429, 503, timeouts and a reset connection are retried with backoff and the same `requestId` plus
  `retry=true`, so Snowflake never runs a statement twice. Every result partition is fetched and its row count
  checked; a short result raises `truncated_result` instead of returning fewer rows.
- Every statement carries `QUERY_TAG = 'claude-snowflake-sql'`, so its cost is attributable in `QUERY_HISTORY`.

## Traps seen in this account

- `EXPLAIN` on an `INFORMATION_SCHEMA` view is refused ("insufficient privilege") even when SELECT works.
- `ACCOUNT_USAGE` lags (up to 45 min for most views, ~3 h for metering) while `INFORMATION_SCHEMA` is real time:
  never compare a figure from one with the other.
- Owner's-rights procedures run as their owner role, not as this token's role: an "Insufficient privileges ... owner
  role X must have SELECT" error is a grant to X, not a problem with the token.
- A canceled statement reports `canceled` in `status` (Snowflake code 000604).

## Configuration

`config.json` beside the tool is per machine and is not committed to the kit: copy `config.example.json` to `config.json` and set your account URL and token variable. It holds no secret: `account_url`, `token_var`, `protected_schemas` and an optional
default role, warehouse, database and schema per profile. Add a profile for each project, e.g. `dq-accelerator` sets `DQ_AI_ACCELERATOR`
and `COMPUTE_WH`. Override per call with `--account-url`, `--token-var`, `--role`, `--warehouse`, `--database`,
`--schema`.

## Library use

```python
import os, sys; sys.path.insert(0, os.path.expanduser("~/.claude/skills/snowflake-sql"))
import sf
cfg = sf.load_config(profile="dq-accelerator")
client = sf.Client(cfg["account_url"], sf.resolve_token(cfg["token_var"]), database=cfg.get("database"),
                   warehouse=cfg.get("warehouse"))
sf.guard(sql, write=False, destructive=False)            # the library does not guard by itself
[result] = client.run(sql, [sf.parse_bind("int:42")])
rows = result.as_dicts()
```

## Tests

`cd ~/.claude/skills/snowflake-sql && python3 -m unittest test_sf` (65 tests, offline; a path given to unittest fails
to import): guard, token reading, bindings, decoding, retries with the same request id, partitions, scrubbing, and one
test per finding of two rounds of Opus adversarial validation on 2026-10-19 (round 1: the `->>` chain, three lexer
gaps, `SYSTEM$` calls, statements whose effect is hidden, protected-schema bypasses, lost digits, invalid JSON;
round 2: a quote in a stage path, quoted `SYSTEM$` names, `DB..T`, comments inside names, database-scope statements,
session-relative names in strings, `IDENTIFIER(?)`, more spend and security statements, cancel), each observed
failing first. Mutation passes over the fixes: round 1, 12 of 12 caught; round 2, 10 of 10. Live checks, 2026-10-19: a 300,000-row result arrived in
8 partitions with COUNT and SUM equal to Snowflake's own; every type above, binds, `--multi`, submit / status /
cancel, explain, ls, describe, ddl, grants, history and credits ran against the account.
Merged from the parallel snowflake-tool, live 2026-10-19: `classify`, `sample`, `count` (534 rows in `DQ_AI_ACCELERATOR.SILVER.CUSTOMER_NAME`), `--each` (a failure at statement 2 of 3 reports "statements 1 to 1 ran"), `--out`, `--connection` (`compute_wh` from config.toml resolved to `COMPUTE_WH`), `ls masking-policies`, and `ls --help`, which crashed before on an unescaped `%`.
