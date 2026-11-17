# Market-data pitfalls

Traps met while building option, earnings and equity-forecasting studies. Each one produced a plausible wrong number
or a silent failure, not an error. The evidence is in the milestone documents of three public study repositories
(earnings-vol-study, vol-strategy-backtester, arima-stock-forecasting); the entries are paraphrased and generic.

## Prices and vendors

| Trap | Why it bites | Guard |
|---|---|---|
| yfinance adjusts prices by default (`auto_adjust=True` in `history()` and `download()`) | `Close` becomes the adjusted close: on a day with a dividend it printed about 20 dollars below the price that traded | Pass `auto_adjust` explicitly. Refuse a frame by its columns: an `Adj Close` column means adjustment was off, its absence means it was on. Record the yfinance version in the manifest |
| yfinance writes cookies and a timezone cache under the home folder | A fetch touches state outside the project and can behave differently on a clean machine | Point its cache into the project's cache folder before the first request |
| Closed column set not enforced | A future library version adds a column and the code takes the wrong one | Accept exactly the expected columns; fail on anything else |
| Split-adjusted history against as-of quantities | A per-share number from before a split sits next to a post-split price (a 10-for-1 split made a surprise meaningless) | Scale by the unadjusted price as of the date, or undo only the splits after that date |
| Holiday and weekend rows in a vendor snapshot | A holiday row repeats the previous session and adds a fake zero-change day | Map snapshots to sessions with an exchange calendar; keep the row dated on the session, drop the copy, never impute |
| Ticker changes and duplicates (renamed or merged tickers) | Two ids for one company double-count events | Maintain an alias table; test that agreeing duplicates merge and conflicting ones are flagged |
| Vendor-computed analytics (implied vol, Greeks) | Opaque, and call and put can disagree by several vol points on event days | Recompute from quotes; use the vendor column only to validate |
| Future-dated rows in a calendar table | Scheduled dates look like events that already happened | Bound every sample to the observed data range |

## DoltHub

| Trap | Why it bites | Guard |
|---|---|---|
| A local `dolt sql` SELECT rewrites files in the clone (manifest, journal index, stats), with the same bytes but new modification times | Several projects sharing one clone contend for those files, and any fingerprint-based integrity check trips. The DoltHub SQL API (a GET) does not touch a local clone | Copy the clone once into a private mirror and query only the mirror; never run dolt in a shared clone; never `dolt sql-server` |
| A SELECT that writes: `SELECT dolt_commit('-am', 'x')` | Dolt procedures are callable as functions; the statement starts with SELECT and passes a first-word check. A word-boundary match misses it because `_` joins `dolt` to `commit` | `scripts/dolthub_guard.py` refuses any `dolt_*(` call; a system table such as `dolt_log` without `(` stays readable |
| Two statements: `SELECT 1; DROP TABLE x` | Passes every word test | One statement only; a semicolon is allowed only at the end |
| Words inside string literals or comments | A substring scan either refuses a harmless `'delete'` literal or is fooled by a comment (`/*! ... */` runs on MySQL-family servers) | Tokenise: strings and quoted identifiers are opaque, comments are refused outright |
| Backslash in a string literal | Whether `\'` ends the string depends on the server's sql_mode, so one text parses two ways | Refuse a backslash inside a string |
| The branch name moves | A rerun next month reads different rows | Resolve to a commit hash, query `AS OF '<hash>'`, store the hash |
| Garbage collection as a side effect of a session | The store is rewritten while you read it | `--disable-auto-gc` on every local session |
| dolt keeps config and telemetry in the home folder | Writes outside the project | Set `DOLT_ROOT_PATH` inside the project with metrics off |
| Query time | Big tables with a filter on a non-leading key column are slow (a month of option chain took about 40 s) | Filter on the leading primary-key column; cache one file per month keyed by commit and symbol set |
| API rate limits and timeouts | Small exploratory queries hit a deadline error | Use the API for schema discovery, a local mirror for the pipeline |

## Types and serialisation

| Trap | Why it bites | Guard |
|---|---|---|
| pyarrow decimal to float cast | Not correctly rounded: decimal(5,4) 0.2678 became 0.26780000000000004 | Cast through text (`cast(string)` then `float64`); version the normaliser so cached extracts are redone when it changes |
| Timestamp with a time of day cast to a date | The hour is dropped silently | Refuse a non-midnight timestamp instead of truncating |
| Dolt DATE comes back as a midnight timestamp | Date joins miss | Convert once, at the boundary, after the midnight check |
| Reading a zero-row Parquet buffer with threads | Crashed the interpreter at exit on one aarch64 build | `use_threads=False` where it was seen; reproduce before assuming it is gone |
| pandas 3 turns `None` in text or int columns into NaN or float | An id column becomes float and no longer joins | `dtype=object` for such columns; the writer refuses floats in int columns |
| NaN in JSON | Python writes the bare token `NaN`; `JSON.parse` rejects it, and a serialiser that writes null for it hides the bug | `allow_nan=False`; a missing value is `null` plus a reason |
| Naive datetimes | "14:00" with no zone is ambiguous; guessing writes a wrong `Z` time | Refuse naive input; convert to UTC before formatting |
| Float money and tick boundaries | `round(1235*0.005, 2)` gave 6.17, not 6.18; a quote at 2.00/2.10 filled at 1.99 | Integer cents or `Decimal` with an explicit rounding mode; test at the tick boundaries |
| Row order and metadata in written files | The same rows gave different bytes, so a hash comparison failed | Sort before writing; write pandas and arrow inputs and require equal bytes |
| Mean of a column differs between runs by 1e-15 | Thread order in the aggregate | Compute exactly or compare with a tolerance, and say which |

## Provenance and licensing

| Trap | Why it bites | Guard |
|---|---|---|
| No record of what was fetched | Cannot tell a data change from a code change | `scripts/manifest.py record` per file; `verify` before each run |
| A hash that matches while the source changed | The hash proves you hold the same bytes, not that the vendor still serves them | Keep fetch time and source; re-fetch on a schedule and compare |
| Vendor data committed to a public repository | Licence breach (some index and price data may not be redistributed) | A licence class per column; drop restricted columns before any commit or export; hash-scan staged files against known vendor snapshots |
| A modified copy of a vendor file | A content hash is defeated by a one-byte change | A value scanner for real rows as a second check; neither covers a transformed binary |
| Scraping an API with a placeholder contact | Some public APIs require a real contact in the user agent and block or ban otherwise | Refuse to run without a real contact address |
| Selecting events or labels by looking at the outcome | A label chosen after seeing the price move leaks the outcome | Fix label rules from documents before looking; use the outcome only to trigger a second, blind reading |
