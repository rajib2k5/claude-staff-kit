---
name: market-data-fetch
description: Fetch market data reproducibly and defensibly - record every downloaded file in a sha256 provenance manifest, verify it before use, and send only read-only SQL to DoltHub. Use when downloading prices, option chains, filings or other vendor data for a backtest or study, when a result must be reproducible from the exact bytes, or before running any SQL against a DoltHub database. Triggers - fetch market data, download prices, data provenance, manifest sha256, verify downloaded data, dolthub query, dolt sql read-only, yfinance download, pin the data.
---

# Fetching market data you can defend

Two stdlib-only tools and a trap list. A result is only as reproducible as the bytes it was computed from, so every
fetched file gets a manifest entry, and every DoltHub query is checked before it is sent.

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/market-data-fetch/scripts"
```

## Procedure

1. **Read `references/pitfalls.md` for the source you are about to use** (yfinance, DoltHub, CBOE, EDGAR, pandas/pyarrow
   handling). Most entries are silent: the fetch succeeds and the numbers are wrong.
2. **Fetch into a folder that holds the manifest.** The manifest lives next to the data, for example
   `data/raw/manifest.json` for files under `data/raw/`. Paths in it are relative to the manifest's folder.
3. **Record each file straight after its fetch**, with the source and the tool:
   ```bash
   python3 "$S/manifest.py" record data/raw/manifest.json data/raw/SPY.csv \
       --source "https://example.org/SPY.csv" --tool requests --tool-version "$(python3 -c 'import requests;print(requests.__version__)')"
   ```
   It stores the source, the fetch time (UTC, ISO-8601 with offset), sha256, size, a row count for CSV and Parquet, and
   the tool and its version. Pass `--fetched-at` only to record a fetch that happened earlier, and always with an offset.
   For an API or library call with no URL, `--source` is the identifier: the function, its arguments, the symbol list.
4. **Verify before every analysis run**, not only after fetching:
   ```bash
   python3 "$S/manifest.py" verify data/raw/manifest.json    # exit 0 clean, 1 mismatch or missing file, 2 unreadable manifest
   ```
   A non-zero exit stops the run. Do not re-record a changed file to make verify pass unless you meant to re-fetch it;
   a changed hash with no new fetch is a finding, not a chore.
5. **DoltHub: check the SQL before sending it.**
   ```bash
   python3 "$S/dolthub_guard.py" "SELECT act_symbol, date FROM earnings_calendar WHERE date >= '2024-01-01'"
   ```
   Or in code: `from dolthub_guard import check_sql` (it raises `UnsafeSqlError`). It allows one read-only statement:
   SELECT, WITH ... SELECT, SHOW, DESCRIBE, EXPLAIN of a SELECT. It refuses writes, DDL, a second statement, comments,
   `INTO`, locking reads, `EXPLAIN ANALYZE`, and every `dolt_*(` call (Dolt's write procedures are callable as
   functions, so `SELECT dolt_commit(...)` is a write that starts with SELECT).
6. **Pin DoltHub reads to a commit.** The branch name moves. Resolve the branch to a commit hash once, query
   `table AS OF '<hash>'`, and put the hash in the manifest `--source`.
7. **Say what the guard does not do.** It does not run the query, does not limit result size, and does not replace
   pinning or the licence check (`references/pitfalls.md`).

## Traps

| Trap | What to do |
|---|---|
| Re-recording a file to "fix" a failing verify | Find out why the bytes changed first; re-record only after a deliberate re-fetch |
| Manifest and data in different folders | The manifest refuses a file outside its own folder: keep them together |
| A fetch with no recorded tool version | Library defaults change between versions (yfinance `auto_adjust`); record the version |
| Row count missing for a non-CSV file | Rows are counted for CSV and, with pyarrow installed, Parquet; otherwise the field is null, not zero |
| Guard refuses a column named `set`, `load`, `lock`, `call`, `insert` | Backtick-quote it. Token matching has no grammar, so it refuses these words unquoted |
| Guard passes, query is still expensive or wrong | The guard checks that a query cannot write, not that it is correct or cheap |
| Naive timestamps in the manifest | `record` rejects a naive `--fetched-at`; the manifest never holds local time |
| NaN written into manifest or exported JSON | The writer uses `allow_nan=False` and fails before replacing the old file |

## Report

State, for each dataset used: the manifest path, the number of files, the result of `verify` with its exit code, the
source and tool version of each, and for DoltHub the pinned commit. Name any file fetched but not recorded, any query
sent without the guard, and any pitfall from `references/pitfalls.md` that you could not check.

Tests: `python3 -m unittest discover -s "$S" -p 'test_*.py'`.
