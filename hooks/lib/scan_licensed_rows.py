#!/usr/bin/env python3
"""Find licensed raw data rows copied into a repository. Standard library only; Parquet needs pyarrow.

    python3 hooks/lib/scan_licensed_rows.py [--config CFG] [--repo DIR] [--staged | --range A..B | --rev REV | --tree DIR]

The raw files come from ``<repo>/.licensed-data.json`` (or ``--config``)::

    {"raw": ["$VOL_DATA_DIR/raw/*/*/*.csv", "~/data/foo/*.parquet"], "undated_integers": false}

``raw`` is a list of globs (``$VAR``, ``${VAR}`` and ``~`` are expanded, ``**`` recurses), so no
personal path is written into the repository. Optional keys: ``undated_integers`` (rule 4 below)
and ``parquet_date_column`` (the date column of the Parquet sources; default: the first date or
timestamp column, else a column named ``date``). A ``.parquet`` file is read with pyarrow; any other
file is read as text (CSV rows that start with a date). The raw files are only read, never written.

What is scanned:

* default: every text file git would commit (``git ls-files -co --exclude-standard``), from the
  working tree;
* ``--staged``: every added, copied, modified or renamed staged file, read from the index;
* ``--range A..B``: every file changed in that range, read at ``B``;
* ``--rev REV``: every file in that commit;
* ``--tree DIR``: every text file under ``DIR`` (no git; ``.git`` folders and symlinks skipped).

Binary files (a NUL byte in the first 8 KiB) and files that are not UTF-8 are skipped.

A line is flagged, with the lowest rule number that matches it, when:

1. it is at least 12 characters long (after stripping), holds a digit, and appears verbatim in a raw
   text file (a CSV header has no digit: that is column names, not data);
2. it contains a whole raw data row (a raw line that starts with a date, at least 12 characters),
   for example inside a Python bytes literal, where ``\\n`` escapes keep rule 1 from matching;
3. it holds a number equal to a raw value of a date named near it. "Equal" means equal to the raw
   value rounded to the number's own decimals (half up and half to even both count), or, for a
   number with 3 or more decimals, to the raw value divided by 100 (a vol written as a decimal:
   0.1694 for 16.94, read at 2 decimals). The number needs 3 or more significant digits, and then:
   - read at 2 or more decimals, the date is on the same line within ``NEAR_CHARS`` characters,
     on any line up to ``NEAR_LINES`` lines away, or on the nearest dated line above or below up
     to ``FAR_LINES`` lines away (one pretty-printed JSON record);
   - read at 1 decimal, the date is on the same line within ``NEAR_CHARS`` characters;
   - an integer of 6 or more digits (a volume) is treated like 2 decimals.
   A date is any of: ``1990-05-25``, ``1990/05/25`` or ``1990.05.25`` (one-digit month or day
   allowed); ``05/25/1990``, ``5-25-1990`` and day first ``25.05.1990`` (both readings when
   ambiguous); compact ``19900525``; ``(1990, 5, 25)`` as in ``date(...)``, ``datetime(...)`` or
   ``Timestamp(...)`` (``Date(1990, 4, 25)`` and ``Date.UTC(...)`` count months from 0, as
   JavaScript does); ``May 25, 1990``, ``25 May 1990`` or ``25-May-1990`` (full or 3-letter month
   names, any case); epoch seconds, milliseconds, microseconds or nanoseconds (the UTC day, as
   pandas ``to_json`` writes index keys). Written years 1900 to 2099 only;
4. it holds an integer of 6 or more digits (thousands separators ``,``, ``_`` or a space allowed)
   equal to the size of a raw file, the total of all raw files, the total of the files one glob
   matched, or the total of the newest file (by mtime) in each raw folder (the latest snapshot per
   symbol); with ``"undated_integers": true``, also equal to an integer of 100000 or more in a raw
   row that has no date (a market cap);
5. it holds a 64-hex string equal to a raw file's SHA-256 (or its file name, when the name is one,
   or what a ``<file>.meta.json`` sidecar records under ``sha256`` and ``bytes``);
6. it holds one of ``RUN_MIN`` or more numbers that, in file order and with no date needed, equal
   consecutive sessions of one raw series (one column of one raw file), oldest or newest first: a
   list of closes, one per line or all on one line. The numbers are rule 3's (same readings). Up
   to ``RUN_MAX_STRIDE`` - 1 other numbers may sit between two sessions, the same count each time,
   if each equals a value of that raw file at one of the two sessions (the other columns of an
   OHLC row) or, in a run read at 2 or more decimals, equals no raw value (a computed column).
   A run with any number read at 1 decimal must be ``RUN_MIN_ONE_DECIMAL`` long.

A number is digits with a decimal part, or an integer of 6 or more digits; thousands commas
(``2,345.67``, also read as ``345.67``), a decimal comma (``16,94``, not with exactly 3 digits
after it, which is read as thousands) and a leading point (``.1694``) are allowed, and a full stop
after it ends it. Digits inside a written date are the date, not a number.

Rules 3 and 6 use only raw files with about one row per date (a time series). A file with more rows
than dates (an option chain: hundreds of quotes per day) fills nearly every cent near a date with
some value, so one number equal to "a value of that day" says nothing; such a file still counts for
rules 1, 2, 4 and 5, and stderr says so.

Rules 3 and 6 can flag a coincidence: a made-up number that happens to equal a real value of a
nearby date, or made-up numbers that happen to follow real consecutive sessions. The fix is the
same: pick other made-up numbers. Still not caught: values transformed beyond rounding and /100
(returns, logs, differences, ratios, sums, truncation); a lone value with no date near it and no
run; a 1-decimal value whose date is on another line; fewer than 3 consecutive sessions (5 at
1 decimal); every k-th session (weekly or monthly closes, k > 1); Excel serial dates; 2-digit
years and date spellings not listed; numbers in scientific notation or with fewer than 3
significant digits; numbers spelled out in words; values of multi-row-per-date sources (above);
and anything in a file that is not scanned (ignored, binary or not UTF-8).

It prints only ``path:line rule=N`` for each flagged line and one summary line, never the text that
matched, so its output can be pasted into a PR or a log. Warnings go to stderr. Exit 0 clean,
1 something flagged, 2 config missing or invalid or no raw file matched (nothing to compare with),
3 internal error (including a failed git command).
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
from bisect import bisect_left, bisect_right
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_EVEN, Decimal
from pathlib import Path
from typing import Iterable, Iterator

CONFIG_NAME = ".licensed-data.json"
CONFIG_KEYS = {"raw", "undated_integers", "parquet_date_column"}

MIN_LINE = 12
NEAR_CHARS = 120  # rule 3, same line: a one-line JSON file names many dates far from any value
# Rule 3, other lines. Lines of the source repo flagged against its real store when these were set:
# every date within 3 lines plus the nearest dated line within 12, as set: 1 (a coincidence); every
# date within 10 lines: 3; within 15: 6; the nearest within 20: 2. Letting 1-decimal numbers use
# these lines too: 2 against the real store, and 1 against a synthetic one (0 as set).
NEAR_LINES = 3  # every date on a line up to 3 lines away: a dict or a table row over a few lines
FAR_LINES = 12  # the nearest dated line above and below: a pretty-printed JSON record
LONG_LINE = 300  # a longer line (minified JSON) lends its dates to no other line
MIN_SIGNIFICANT = 3
MIN_INT_DIGITS = 6
MIN_UNDATED_INT = 100_000  # rule 4 with undated_integers: a market cap, not a count or a year
RUN_MIN = 3  # rule 6, read at 2 or more decimals (or integers); 2 flagged 135 lines of the source repo
RUN_MIN_ONE_DECIMAL = 5  # rule 6, any number read at 1 decimal; 4 flagged 8 lines of the source repo
RUN_MAX_STRIDE = 8  # rule 6: up to 7 numbers between two sessions (OHLC, adj close, volume)
ROWS_PER_DATE_MAX = 1.1  # rules 3 and 6: above this a raw file is a chain, not a series (a few repeated sessions are a vendor glitch)
SCALE = 6  # raw values are compared in millionths, the raw files' own precision
_ROW_BITS = 24  # rule 6 packs (series, row) into one int: series << _ROW_BITS | row ...
_COLUMN_BITS = 10  # ... with series = file << _COLUMN_BITS | column (up to 1024 columns per file)
_ROW_MASK = (1 << _ROW_BITS) - 1
_FILE_SHIFT = _ROW_BITS + _COLUMN_BITS
_BINARY_PROBE = 8192

# Rule 2 and the raw index: the two spellings raw CSV files use, at the start of a row.
_US_DATE = re.compile(r"(?<!\d)(\d{2})/(\d{2})/(\d{4})(?!\d)")
_ISO_DATE = re.compile(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)")
_BIG_INT = re.compile(r"(?<![\w.,])\d{1,3}(?:[,_ ]\d{3})+(?![\w.,]?\d)|(?<![\w.,])\d{6,}(?!\w|\.\d)")
_SHA = re.compile(r"(?<![0-9a-fA-F])[0-9a-f]{64}(?![0-9a-fA-F])")
_SHA_NAME = re.compile(r"[0-9a-f]{64}")
_RAW_ALPHABET = re.compile(r"[0-9A-Za-z/.,:^\- ]+")
_RAW_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")
_UNSET_VAR = re.compile(r"\$(?:\w+|\{\w+\})")

# Rule 3: every date spelling (module docstring). Years 1900 to 2099 only.
_YEAR = r"((?:19|20)\d{2})"
_MONTH_NAME = (
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
    r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
_MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
_YMD = re.compile(r"(?<![\d.])" + _YEAR + r"([-/.])(\d{1,2})\2(\d{1,2})(?!\d)")
_MDY = re.compile(r"(?<![\d.])(\d{1,2})([-/.])(\d{1,2})\2" + _YEAR + r"(?!\d)")
_COMPACT = re.compile(r"(?<![\d.])" + _YEAR + r"(\d{2})(\d{2})(?!\d|\.\d)")
_TUPLE = re.compile(
    r"[(\[]\s*(?:year\s*=\s*)?" + _YEAR + r"\s*,\s*(?:month\s*=\s*)?(\d{1,2})\s*,\s*(?:day\s*=\s*)?(\d{1,2})(?!\d)"
)
_JS_DATE = re.compile(r"\bDate(?:\.UTC)?\s*$")
_TEXT_MDY = re.compile(r"\b" + _MONTH_NAME + r"\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+" + _YEAR + r"(?!\d)", re.I)
_TEXT_DMY = re.compile(r"(?<!\d)(\d{1,2})(?:st|nd|rd|th)?[\s-]+" + _MONTH_NAME + r"\.?,?[\s-]+" + _YEAR + r"(?!\d)", re.I)
_EPOCH = re.compile(r"(?<![\d.])(\d{9,19})(?!\d)")  # the lengths in _EPOCH_UNIT only
_EPOCH_UNIT = {9: 1, 10: 1, 12: 10**3, 13: 10**3, 15: 10**6, 16: 10**6, 18: 10**9, 19: 10**9}
_EPOCH_DAY0 = date(1970, 1, 1)

# Rules 3 and 6: numbers. Thousands-grouped ones are read both ways (``2,345.67`` and ``345.67``).
_PLAIN = re.compile(r"(?<![\w.])(?:\d+\.\d+|\.\d+|\d{6,})(?!\w|\.\d)")  # shorter integers never qualify
_GROUPED = re.compile(r"(?<![\w.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\w|[.,]\d)")
# A decimal comma (``16,94``, as a ``;``-separated European CSV writes 16.94). Not 3 digits after the
# comma, which is a thousands group, and nothing glued on either side.
_DECIMAL_COMMA = re.compile(r"(?<![\w.,])\d+,(?:\d{1,2}|\d{4,6})(?![\w,]|\.\d)")


class ConfigError(Exception):
    """The config is missing or invalid (exit 2)."""


@dataclass(frozen=True)
class Config:
    raw: tuple[str, ...]
    undated_integers: bool = False
    parquet_date_column: str | None = None


def warn(message: str) -> None:
    print(f"scan_licensed_rows: {message}", file=sys.stderr)


def load_config(path: Path) -> Config:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ConfigError(f"no config at {path}") from None
    except (OSError, ValueError) as exc:
        raise ConfigError(f"cannot read {path}: {exc}") from None
    if not isinstance(data, dict):
        raise ConfigError(f"{path}: the top level must be a JSON object")
    raw = data.get("raw")
    if not isinstance(raw, list) or not raw or not all(isinstance(p, str) and p.strip() for p in raw):
        raise ConfigError(f'{path}: "raw" must be a non-empty list of glob strings')
    undated = data.get("undated_integers", False)
    if not isinstance(undated, bool):
        raise ConfigError(f'{path}: "undated_integers" must be true or false')
    date_column = data.get("parquet_date_column")
    if date_column is not None and not (isinstance(date_column, str) and date_column):
        raise ConfigError(f'{path}: "parquet_date_column" must be a non-empty string')
    for key in sorted(set(data) - CONFIG_KEYS):
        warn(f"{path}: unknown key {key!r} ignored")
    return Config(tuple(raw), undated, date_column)


def expand_raw(patterns: Iterable[str]) -> tuple[list[Path], list[list[Path]]]:
    """Every raw file the globs match (each once, in glob order), and the files of each glob."""
    files: dict[Path, None] = {}
    groups: list[list[Path]] = []
    for pattern in patterns:
        expanded = os.path.expanduser(os.path.expandvars(pattern))
        if _UNSET_VAR.search(expanded):
            warn(f"raw glob {pattern!r} names an unset variable; skipped")
            continue
        matched = [Path(p) for p in sorted(glob.glob(expanded, recursive=True)) if os.path.isfile(p)]
        if not matched:
            warn(f"raw glob {pattern!r} matched no file")
        groups.append(matched)
        files.update(dict.fromkeys(matched))
    return list(files), groups


def _dates_in(text: str) -> list[tuple[int, int, date]]:
    """``(start, end, date)`` for every M/D/Y or ISO date token in ``text`` that is a real calendar date.

    Only the raw files' own spellings: the raw index and rule 2 use it. Rule 3 uses ``_date_spans``.
    """
    found = []
    for pattern, order in ((_US_DATE, (2, 0, 1)), (_ISO_DATE, (0, 1, 2))):
        for match in pattern.finditer(text):
            parts = [int(g) for g in match.groups()]
            try:
                found.append((match.start(), match.end(), date(parts[order[0]], parts[order[1]], parts[order[2]])))
            except ValueError:
                continue
    return found


def _date_spans(text: str) -> list[tuple[int, int, date]]:
    """``(start, end, date)`` for every date in ``text``, in any spelling rule 3 knows."""
    found: list[tuple[int, int, date]] = []

    def add(match: re.Match, ymd: set[tuple[int, int, int]]) -> None:
        for year, month, day in ymd:
            try:
                found.append((match.start(), match.end(), date(year, month, day)))
            except ValueError:
                continue

    for m in _YMD.finditer(text):
        add(m, {(int(m[1]), int(m[3]), int(m[4]))})
    for m in _MDY.finditer(text):
        a, b, year = int(m[1]), int(m[3]), int(m[4])
        add(m, {(year, a, b), (year, b, a)})
    for m in _COMPACT.finditer(text):
        add(m, {(int(m[1]), int(m[2]), int(m[3]))})
    for m in _TUPLE.finditer(text):
        js = _JS_DATE.search(text, max(0, m.start() - 12), m.start()) is not None
        add(m, {(int(m[1]), int(m[2]) + js, int(m[3]))})
    for m in _TEXT_MDY.finditer(text):
        add(m, {(int(m[3]), _MONTHS.index(m[1][:3].lower()) + 1, int(m[2]))})
    for m in _TEXT_DMY.finditer(text):
        add(m, {(int(m[3]), _MONTHS.index(m[2][:3].lower()) + 1, int(m[1]))})
    for m in _EPOCH.finditer(text):
        digits = m[1]
        if len(digits) not in _EPOCH_UNIT:
            continue
        days = int(digits) // (86400 * _EPOCH_UNIT[len(digits)])
        found.append((m.start(), m.end(), _EPOCH_DAY0 + timedelta(days=days)))
    found.sort(key=lambda span: span[0])
    return found


def _numbers(text: str) -> list[tuple[int, int, list[tuple[int, int]]]]:
    """``(start, end, readings)`` for every number rules 3 and 6 consider, in file order.

    A reading is ``(decimals, digits)``: the number's value is ``digits / 10**decimals``. A number
    with 3 or more decimals is also read as points: ``0.1694`` gives ``(4, 1694)`` and ``(2, 1694)``.
    No written date yields a number: ``_PLAIN`` needs a decimal part not followed by another
    ``.digit``, or 6 or more digits. A compact or epoch date is also a number (it may be a volume).
    """
    grouped = [(m.start(), m.end()) for m in _GROUPED.finditer(text)]
    group_starts = [start for start, _ in grouped]
    tokens = {start: (end, [text[start:end].replace(",", "")]) for start, end in grouped}
    for m in _PLAIN.finditer(text):
        k = bisect_right(group_starts, m.start()) - 1
        if k >= 0 and m.start() < grouped[k][1]:
            # Inside a grouped number (the "345.67" of "2,345.67"): another reading of that number.
            tokens[grouped[k][0]][1].append(m.group())
        else:
            tokens[m.start()] = (m.end(), [m.group()])
    taken = sorted((start, end) for start, (end, _) in tokens.items())
    for m in _DECIMAL_COMMA.finditer(text):
        k = bisect_right(taken, (m.start(), len(text))) - 1
        if k >= 0 and m.start() < taken[k][1]:
            continue  # inside a number already read
        tokens[m.start()] = (m.end(), [m.group().replace(",", ".")])
    out = []
    for start, (end, spellings) in sorted(tokens.items()):
        readings: list[tuple[int, int]] = []
        for spelling in spellings:
            whole, _, fraction = spelling.partition(".")
            digits = int(whole + fraction or "0")
            if not fraction:
                if len(whole) >= MIN_INT_DIGITS and digits:
                    readings.append((0, digits))
            elif len(str(digits)) >= MIN_SIGNIFICANT and digits:
                readings.append((len(fraction), digits))
                if len(fraction) >= 3:
                    readings.append((len(fraction) - 2, digits))
        if readings:
            out.append((start, end, readings))
    return out


def _interval(digits: int, decimals: int) -> tuple[int, int]:
    """The raw values (in millionths) that round to ``digits / 10**decimals``, ends included."""
    if decimals <= SCALE:
        unit = 10 ** (SCALE - decimals)
        return digits * unit - unit // 2, digits * unit + unit // 2
    unit = 10 ** (decimals - SCALE)  # more decimals than the raw files: equal at their precision
    return -((unit - 2 * digits) // (2 * unit)), (2 * digits + unit) // (2 * unit)


def _millionths(cell: str) -> int | None:
    """A raw cell in millionths (``"16.936306"`` -> 16936306), or None if it is not a plain number."""
    if not _RAW_NUMBER.fullmatch(cell):
        return None
    whole, _, fraction = cell.partition(".")
    if len(fraction) > SCALE:  # more decimals than the raw files use: round, half to even
        return int((Decimal(cell) * 10**SCALE).to_integral_value(ROUND_HALF_EVEN))
    magnitude = int(whole.lstrip("-")) * 10**SCALE + int(fraction.ljust(SCALE, "0"))
    return -magnitude if whole.startswith("-") else magnitude


def _value_millionths(value: object) -> int | None:
    """A Parquet cell in millionths, or None for a null, NaN, infinity or a non-number."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value * 10**SCALE
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return None
        return _millionths(repr(value)) if "e" not in repr(value) else int(round(value * 10**SCALE))
    if isinstance(value, Decimal):
        return int((value * 10**SCALE).to_integral_value(ROUND_HALF_EVEN)) if value.is_finite() else None
    return None


def _as_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 22), b""):
            digest.update(chunk)
    return digest.hexdigest()


class RawIndex:
    """What rules 1 to 6 compare against, built from the raw files."""

    def __init__(self, files: list[Path], groups: list[list[Path]], config: Config):
        self.files = files
        self.texts: list[str] = []
        self.fields: set[str] = set()  # every comma-separated field of a raw text line (rule 1 prefilter)
        self.rows_by_prefix: dict[str, list[str]] = defaultdict(list)
        self.by_date: dict[date, list[int]] = defaultdict(list)  # every raw value of a date, in millionths
        self.ints: set[int] = set()  # rule 4: sizes, totals and (optionally) undated integers
        self.shas: set[str] = set()
        self.undated_integers = config.undated_integers
        self.series_files = 0  # raw files that feed rules 3 and 6
        self._pq = None
        cells: list[tuple[int, int]] = []  # (millionths, series << _ROW_BITS | row)
        parquet = [p for p in files if p.suffix.lower() == ".parquet"]
        if parquet:
            try:
                import pyarrow.parquet as pq  # optional: only when a Parquet source is configured

                self._pq = pq
            except ImportError:
                warn(f"pyarrow is not installed: {len(parquet)} Parquet file(s) count for rules 4 and 5 only (sizes, hashes)")
        for number, path in enumerate(files):
            self._remember(path)
            if path.suffix.lower() == ".parquet":
                rows = self._parquet_rows(path, config.parquet_date_column) if self._pq else []
            else:
                rows = self._text_rows(path)
            days = [day for day, _ in rows]
            if not rows:
                continue
            if len(days) > ROWS_PER_DATE_MAX * len(set(days)):
                warn(f"{path.name}: {len(days)} rows over {len(set(days))} dates (a chain, not a series): rules 3 and 6 skip it")
                continue
            self.series_files += 1
            for row, (day, values) in enumerate(rows):
                for column, value in values:
                    self.by_date[day].append(value)
                    if column < 1 << _COLUMN_BITS and row <= _ROW_MASK:
                        cells.append((value, (number << _COLUMN_BITS | column) << _ROW_BITS | row))
        for values in self.by_date.values():
            values.sort()
        cells.sort()
        self.values = [value for value, _ in cells]
        self.codes = [code for _, code in cells]
        # Rule 4 totals: all files, the files of each glob, and the newest file of each folder.
        sizes = {path: path.stat().st_size for path in files}
        self.ints.add(sum(sizes.values()))
        self.ints.update(sum(sizes[p] for p in group) for group in groups if group)
        newest: dict[Path, Path] = {}
        for path in files:
            if path.parent not in newest or path.stat().st_mtime > newest[path.parent].stat().st_mtime:
                newest[path.parent] = path
        self.ints.add(sum(sizes[p] for p in newest.values()))
        self.ints.discard(0)
        self.joined = "\n".join(self.texts)

    def _remember(self, path: Path) -> None:
        """Rules 4 and 5 for one raw file: its size, its SHA-256, a 64-hex name, a .meta.json sidecar."""
        self.ints.add(path.stat().st_size)
        self.shas.add(_sha256(path))
        if _SHA_NAME.fullmatch(path.stem):
            self.shas.add(path.stem)
        meta = path.with_name(path.name + ".meta.json")
        if meta.is_file():
            try:
                recorded = json.loads(meta.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                return
            if isinstance(recorded, dict):
                if isinstance(recorded.get("bytes"), int) and not isinstance(recorded["bytes"], bool):
                    self.ints.add(recorded["bytes"])
                if isinstance(recorded.get("sha256"), str):
                    self.shas.add(recorded["sha256"].lower())

    def _text_rows(self, path: Path) -> list[tuple[date, list[tuple[int, int]]]]:
        """Index a raw text file for rules 1 and 2; return its dated rows as ``(date, [(column, millionths)])``."""
        text = path.read_bytes().decode("utf-8", errors="replace")
        self.texts.append(text)
        rows = []
        for line in text.splitlines():
            line = line.strip()
            self.fields.update(line.split(","))
            dates = _dates_in(line)
            if not dates or dates[0][0] != 0:
                if self.undated_integers:  # a header, or an undated row (a market cap)
                    for cell in line.split(","):
                        value = _millionths(cell.strip())
                        if value is not None and value % 10**SCALE == 0 and abs(value) >= MIN_UNDATED_INT * 10**SCALE:
                            self.ints.add(abs(value) // 10**SCALE)
                continue
            if len(line) >= MIN_LINE:
                self.rows_by_prefix[line[: dates[0][1]]].append(line)
            values = []
            for column, cell in enumerate(line[dates[0][1] :].split(",")[1:]):
                value = _millionths(cell.strip())
                if value is not None:
                    values.append((column, value))
            rows.append((dates[0][2], values))
        return rows

    def _parquet_rows(self, path: Path, date_column: str | None) -> list[tuple[date, list[tuple[int, int]]]]:
        """A Parquet file's dated rows as ``(date, [(column, millionths)])`` (numeric columns only)."""
        import pyarrow as pa

        schema = self._pq.read_schema(path)
        numeric = [f.name for f in schema if pa.types.is_integer(f.type) or pa.types.is_floating(f.type) or pa.types.is_decimal(f.type)]
        name = date_column if date_column in schema.names else None
        if name is None:
            name = next((f.name for f in schema if pa.types.is_date(f.type) or pa.types.is_timestamp(f.type)), None)
        if name is None:
            name = next((n for n in schema.names if n.strip("[] ").lower() == "date"), None)
        if name is None:
            if self.undated_integers:
                table = self._pq.read_table(path, columns=numeric)
                for column in table.column_names:
                    for value in table.column(column).to_pylist():
                        scaled = _value_millionths(value)
                        if scaled is not None and scaled % 10**SCALE == 0 and abs(scaled) >= MIN_UNDATED_INT * 10**SCALE:
                            self.ints.add(abs(scaled) // 10**SCALE)
            return []
        days = [_as_date(v) for v in self._pq.read_table(path, columns=[name]).column(0).to_pylist()]
        dated = [d for d in days if d is not None]
        if len(dated) > ROWS_PER_DATE_MAX * len(set(dated)):
            return [(d, []) for d in dated]  # a chain: the caller skips it before reading every column
        numeric = [n for n in numeric if n != name]
        table = self._pq.read_table(path, columns=numeric)
        columns = [table.column(n).to_pylist() for n in numeric]
        rows = []
        for i, day in enumerate(days):
            if day is None:
                continue
            values = [(c, v) for c, v in ((c, _value_millionths(col[i])) for c, col in enumerate(columns)) if v is not None]
            rows.append((day, values))
        return rows

    def _verbatim(self, stripped: str) -> bool:
        """Rule 1: the whole (stripped) line appears in a raw text file."""
        if len(stripped) < MIN_LINE or not any(c.isdigit() for c in stripped) or not _RAW_ALPHABET.fullmatch(stripped):
            return False
        # Raw text has no newline inside a row, so every field strictly between two commas of the line
        # is a whole raw field: if one is not, the line cannot be in the raw text (exact, and cheap).
        if any(field not in self.fields for field in stripped.split(",")[1:-1]):
            return False
        return stripped in self.joined

    def hits(self, line: str) -> int:
        """The first of rules 1, 2, 4 and 5 that flags ``line``, or 0 (rules 3 and 6: ``rule_lines``)."""
        if self._verbatim(line.strip()):
            return 1
        for start, end, _day in _dates_in(line):
            # Rule 2: a whole raw row starts at this date.
            for row in self.rows_by_prefix.get(line[start:end], ()):
                if line.startswith(row, start):
                    return 2
        # Rule 4: a raw file size, a total of them, or an undated raw integer.
        for match in _BIG_INT.finditer(line):
            if int(re.sub(r"[,_ ]", "", match.group())) in self.ints:
                return 4
        # Rule 5: a raw file's hash.
        return 5 if any(token in self.shas for token in _SHA.findall(line)) else 0

    def _on(self, day: date, low: int, high: int) -> bool:
        values = self.by_date.get(day)
        if not values:
            return False
        k = bisect_left(values, low)
        return k < len(values) and values[k] <= high

    def scan_text(self, text: str) -> list[tuple[int, int]]:
        """``(line, rule)`` for each flagged line of ``text`` (1-based), with the lowest rule that flags it."""
        rules: dict[int, int] = {}
        for rule, lines in self.rule_lines(text).items():
            for i in lines:
                rules[i] = min(rules.get(i, rule), rule)
        return [(i + 1, rules[i]) for i in sorted(rules)]

    def rule_lines(self, text: str) -> dict[int, set[int]]:
        """The 0-based lines of ``text`` each rule flags."""
        lines = text.split("\n")
        starts = [0]
        for line in lines:
            starts.append(starts[-1] + len(line) + 1)
        found: dict[int, set[int]] = {rule: set() for rule in range(1, 7)}
        for i, line in enumerate(lines):
            rule = self.hits(line)
            if rule:
                found[rule].add(i)
        if not self.by_date:
            return found

        spans = _date_spans(text)
        same_line: dict[int, list[tuple[int, int, date]]] = defaultdict(list)
        lends: dict[int, list[date]] = defaultdict(list)  # line -> its dates, if short enough to lend
        for start, end, day in spans:
            i = bisect_right(starts, start) - 1
            same_line[i].append((start, end, day))
            if len(lines[i]) <= LONG_LINE:
                lends[i].append(day)
        lending = sorted(lends)

        def other_lines(i: int) -> list[date]:
            """Dates on every line up to NEAR_LINES away, and on the nearest dated line above and below up to FAR_LINES."""
            near = lending[bisect_left(lending, i - NEAR_LINES) : bisect_right(lending, i + NEAR_LINES)]
            above, below = bisect_left(lending, i) - 1, bisect_right(lending, i)
            if above >= 0 and i - lending[above] <= FAR_LINES:
                near.append(lending[above])
            if below < len(lending) and lending[below] - i <= FAR_LINES:
                near.append(lending[below])
            return [day for j in set(near) if j != i for day in lends[j]]

        strict: list[set[int]] = []  # rule 6: the raw sessions each number equals, read at 0 or 2+ decimals
        loose: list[set[int]] = []  # ... or at 1 decimal
        where: list[int] = []
        for start, end, readings in _numbers(text):
            i = bisect_right(starts, start) - 1
            where.append(i)
            codes_strict: set[int] = set()
            codes_loose: set[int] = set()
            for decimals, digits in readings:
                low, high = _interval(digits, decimals)
                # Rule 3: a raw value of a date on this line, close by, or (unless read at 1 decimal)
                # of a date on another line near it.
                if i not in found[3] and (
                    any(
                        min(abs(start - e), abs(s - end)) <= NEAR_CHARS and self._on(day, low, high)
                        for s, e, day in same_line.get(i, ())
                    )
                    or (decimals != 1 and any(self._on(day, low, high) for day in other_lines(i)))
                ):
                    found[3].add(i)
                # Rule 6: every raw session this reading equals.
                a, b = bisect_left(self.values, low), bisect_right(self.values, high)
                if a < b:
                    (codes_loose if decimals == 1 else codes_strict).update(self.codes[a:b])
            strict.append(codes_strict)
            loose.append(codes_strict | codes_loose)
        found[6] = {where[k] for k in self.runs(strict, RUN_MIN, True) | self.runs(loose, RUN_MIN_ONE_DECIMAL, False)}
        return found

    @staticmethod
    def runs(tokens: list[set[int]], minimum: int, unmatched_between: bool) -> set[int]:
        """Rule 6: the positions of ``minimum`` or more numbers that equal consecutive sessions of one series.

        ``tokens`` holds, per number in file order, the raw sessions it equals
        (``series << _ROW_BITS | row``). A run steps through the numbers at a constant stride of 1 to
        ``RUN_MAX_STRIDE`` and through the rows one at a time, up or down. With a stride above 1,
        every number in between must equal a value of the same raw file at one of the two sessions
        it sits between (another column of an OHLC row), or, if ``unmatched_between``, equal no raw
        value at all (a computed column, such as a return, next to the raw ones).

        Why these conditions, measured on the source repo against its real store: with any number
        allowed in between, made-up numbers formed chance runs at some stride (a synthetic control at
        stride 4; 76 lines of SVG coordinates, all 1-decimal runs at a stride above 1). With the
        same-session condition, and numbers that equal nothing allowed only in runs read at 2 or more
        decimals, that tree had 0. ``RUN_MIN`` 2 instead of 3 flagged 135 lines there;
        ``RUN_MIN_ONE_DECIMAL`` 4 instead of 5 flagged 8.
        """
        file_rows = [{(code >> _FILE_SHIFT) << _ROW_BITS | (code & _ROW_MASK) for code in codes} for codes in tokens]

        def between_ok(x: int, code: int, step: int) -> bool:
            if not tokens[x]:
                return unmatched_between
            here = (code >> _FILE_SHIFT) << _ROW_BITS | (code & _ROW_MASK)
            return here in file_rows[x] or here + step in file_rows[x]

        hits: set[int] = set()
        n = len(tokens)
        for k, codes in enumerate(tokens):
            if not codes:
                continue
            for step in (1, -1):
                shifted = {code + step for code in codes}
                for stride in range(1, RUN_MAX_STRIDE + 1):
                    if k + stride >= n:
                        break
                    following = shifted & tokens[k + stride]
                    if not following:
                        continue
                    if stride > 1:  # cheap bound first: the run's length without the in-between condition
                        bound, j, length = following, k + stride, 2
                        while length < minimum and j + stride < n and bound:
                            bound = {code + step for code in bound} & tokens[j + stride]
                            j, length = j + stride, length + bool(bound)
                        if length < minimum:
                            continue
                    j, chain = k, [k]
                    while following:
                        if stride > 1:
                            following = {c for c in following if all(between_ok(x, c - step, step) for x in range(j + 1, j + stride))}
                            if not following:
                                break
                        j += stride
                        chain.append(j)
                        following = {c + step for c in following} & tokens[j + stride] if j + stride < n else set()
                    if len(chain) >= minimum:
                        hits.update(chain)
        return hits


# --- what to scan -----------------------------------------------------------------------------------


def _git(repo: Path, *args: str, stdin: bytes | None = None) -> bytes:
    return subprocess.run(["git", *args], cwd=repo, input=stdin, capture_output=True, check=True).stdout


def _names(blob: bytes) -> list[str]:
    return [name.decode("utf-8", errors="surrogateescape") for name in blob.split(b"\0") if name]


def _git_blobs(repo: Path, prefix: str, names: list[str]) -> Iterator[tuple[str, bytes]]:
    """``(name, content)`` of ``<prefix><name>`` for each name, through one ``git cat-file --batch``."""
    batched = [n for n in names if "\n" not in n]
    request = "".join(f"{prefix}{n}\n" for n in batched).encode("utf-8", errors="surrogateescape")
    out = _git(repo, "cat-file", "--batch", stdin=request) if batched else b""
    pos = 0
    for name in batched:
        end = out.index(b"\n", pos)
        header = out[pos:end].split()
        pos = end + 1
        if header[-1] in (b"missing", b"ambiguous"):
            continue
        size = int(header[2])
        content = out[pos : pos + size]
        pos += size + 1
        if header[1] == b"blob":
            yield name, content
    for name in names:
        if "\n" in name:  # cat-file --batch is line-based
            yield name, _git(repo, "show", f"{prefix}{name}")


def iter_sources(args: argparse.Namespace, repo: Path) -> Iterator[tuple[str, bytes]]:
    """``(path, content)`` of every file the chosen mode scans."""
    if args.tree is not None:
        base = args.tree.expanduser()
        for folder, dirs, files in os.walk(base):
            dirs[:] = sorted(d for d in dirs if d != ".git")
            for name in sorted(files):
                path = Path(folder) / name
                if path.is_file() and not path.is_symlink():
                    try:
                        yield str(path.relative_to(base)), path.read_bytes()
                    except OSError as exc:
                        warn(f"cannot read {path}: {exc.strerror}")
        return
    if args.staged:
        names = _names(_git(repo, "diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"))
        yield from _git_blobs(repo, ":", names)
        return
    if args.range is not None:
        head = re.split(r"\.\.\.?", args.range)[-1] or "HEAD"
        names = _names(_git(repo, "diff", "--name-only", "-z", "--diff-filter=ACMR", args.range))
        yield from _git_blobs(repo, f"{head}:", names)
        return
    if args.rev is not None:
        names = []
        for entry in _git(repo, "ls-tree", "-r", "-z", args.rev).split(b"\0"):
            meta, _, path = entry.partition(b"\t")  # "<mode> <type> <object>\t<path>"
            if meta.split()[1:2] == [b"blob"]:  # not a submodule (commit)
                names.append(path.decode("utf-8", errors="surrogateescape"))
        yield from _git_blobs(repo, f"{args.rev}:", names)
        return
    for name in _names(_git(repo, "ls-files", "-co", "--exclude-standard", "-z")):
        path = repo / name
        if path.is_file():
            yield name, path.read_bytes()


def _repo_root(given: Path | None) -> Path:
    if given is not None:
        return given.expanduser().resolve()
    try:
        return Path(_git(Path.cwd(), "rev-parse", "--show-toplevel").decode().strip())
    except (OSError, subprocess.CalledProcessError):
        return Path.cwd()


def run(args: argparse.Namespace) -> int:
    repo = _repo_root(args.repo)
    config_path = (args.config or repo / CONFIG_NAME).expanduser()
    try:
        config = load_config(config_path)
    except ConfigError as exc:
        warn(str(exc))
        return 2
    files, groups = expand_raw(config.raw)
    if not files:
        warn("no raw file matched the configured globs; nothing to compare with")
        return 2
    index = RawIndex(files, groups, config)
    flagged = scanned = skipped = 0
    for name, blob in iter_sources(args, repo):
        if b"\0" in blob[:_BINARY_PROBE]:
            skipped += 1
            continue
        try:
            text = blob.decode("utf-8")
        except UnicodeDecodeError:
            skipped += 1
            continue
        scanned += 1
        for line, rule in index.scan_text(text):
            print(f"{name}:{line} rule={rule}")
            flagged += 1
    if skipped:
        warn(f"skipped {skipped} binary or non-UTF-8 file(s)")
    summary = f"{scanned} text file(s) against {len(files)} raw file(s)"
    if flagged:
        print(f"{flagged} line(s) flagged in {summary}")
        return 1
    print(f"clean: 0 lines flagged in {summary}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--config", type=Path, help=f"the config (default: <repo>/{CONFIG_NAME})")
    parser.add_argument("--repo", type=Path, help="the repository (default: the git top level of the current folder)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true", help="scan the staged files, read from the index")
    mode.add_argument("--range", metavar="A..B", help="scan the files changed in A..B, read at B")
    mode.add_argument("--rev", metavar="REV", help="scan every file in commit REV")
    mode.add_argument("--tree", type=Path, metavar="DIR", help="scan every text file under DIR, without git")
    args = parser.parse_args(argv)
    if args.range is not None and ".." not in args.range:
        parser.error("--range needs A..B")
    if args.tree is not None and not args.tree.expanduser().is_dir():
        parser.error(f"--tree {args.tree} is not a folder")
    try:
        return run(args)
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode("utf-8", errors="replace").strip().splitlines() if exc.stderr else []
        warn(f"git {' '.join(exc.cmd[1:3])} failed: {detail[-1] if detail else exc.returncode}")
        return 3
    except Exception as exc:  # noqa: BLE001 - the hook needs exit 3, not a traceback, for any bug
        warn(f"internal error: {type(exc).__name__}: {exc}")
        return 3


if __name__ == "__main__":
    sys.exit(main())
