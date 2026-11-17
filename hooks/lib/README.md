# hooks/lib

Helpers that hook scripts call. Each one is a standalone script with its own tests.

## `scan_licensed_rows.py`

Finds licensed raw data (vendor prices, hashes, file sizes) copied into a repository. It is
standard-library Python; it imports no project package. The full rules are in its docstring.

```
python3 hooks/lib/scan_licensed_rows.py [--config CFG] [--repo DIR] [--staged | --range A..B | --rev REV | --tree DIR]
```

| Mode | Files scanned | Content read from |
|---|---|---|
| (none) | `git ls-files -co --exclude-standard` | working tree |
| `--staged` | staged added, copied, modified or renamed files | the index |
| `--range A..B` | files changed in `A..B` | `B` |
| `--rev REV` | every file in `REV` | `REV` |
| `--tree DIR` | every file under `DIR`, no git (`.git` and symlinks skipped) | disk |

Binary and non-UTF-8 files are skipped.

**Config.** `<repo>/.licensed-data.json`, or `--config PATH`:

```json
{"raw": ["$VOL_DATA_DIR/raw/*/*/*.csv", "~/data/foo/*.parquet"], "undated_integers": false}
```

| Key | Required | Meaning |
|---|---|---|
| `raw` | yes | Globs of the raw files. `$VAR`, `${VAR}`, `~` and `**` work. Write variables, not personal paths. |
| `undated_integers` | no (false) | Rule 4 also matches integers of 100000 or more in raw rows with no date (a market cap). |
| `parquet_date_column` | no | The date column of Parquet sources. Default: the first date or timestamp column, else `date`. |

A glob with an unset variable, or one that matches nothing, gives a warning on stderr.

**Output.** One `path:line rule=N` per flagged line (the lowest rule that matches), then one
summary line. The matched text is never printed. Warnings go to stderr.

**Exit codes.** 0 clean; 1 something flagged; 2 config missing or invalid, or no raw file matched
(the pre-publish hook skips with a warning); 3 internal error, including a failed git command.

**Parquet.** pyarrow is imported only when a `.parquet` glob matches a file. Without pyarrow, a
warning is printed and the Parquet files count for rules 4 and 5 only (size and SHA-256).

**Multi-row-per-date sources (option chains).** Rules 3 and 6 skip a raw file with more than 1.1
rows per date, and stderr says so. Such a file still counts for rules 1, 2, 4 and 5. The
vol-strategy-backtester copy had a joint, chance-weighted match for chains. It is not included,
because it depends on that dataset: the column "kinds" (bid, ask and last of one side are one kind)
and the `CHANCE` threshold were set for OptionsDX and DoltHub SPY chains, and it needs DuckDB and
numpy. A generic version without those column semantics would either flag most made-up quotes or
need per-source configuration that we cannot check here.

**Tests.** From the repository root:

```
python3 -B -m unittest hooks/lib/test_scan_licensed_rows.py
```

The tests make a small synthetic raw store (made-up numbers) and a temporary git repository. The
Parquet test runs only when pyarrow is installed.
