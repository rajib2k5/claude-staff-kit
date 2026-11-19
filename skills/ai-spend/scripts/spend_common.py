"""Shared pieces of the ai-spend fetchers: the window, the row and document shape, and exact-decimal JSON.

Every fetcher writes one source document (see ../schema.json):
  {"schema_version", "source", "window", "fetched_at", "status", "notes", "meta", "rows": [...]}
Every row carries ``usd_basis``: billed (from an invoice-grade source), list (quantity x a public list rate) or
estimated_api_equivalent (tokens x API list prices, not money spent). The report never adds two bases together.
Money is a Decimal in memory and a string in JSON, never a float. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = 1
BASES = ("billed", "list", "estimated_api_equivalent")
STATUSES = ("ok", "partial", "unknown", "error")
TOKEN_FIELDS = ("input", "output", "cache_read", "cache_write_5m", "cache_write_1h")
ROW_FIELDS = ("source", "feature", "day", "model", "user", "workspace", "project", "api_key_id", "service",
              "usage_type", "tokens", "requests", "credits", "usd", "list_usd", "usd_basis", "counts_toward_total",
              "excluded_reason", "note")


class Window:
    """A half-open UTC interval [since, until) of whole days."""

    def __init__(self, since: datetime, until: datetime) -> None:
        if since >= until:
            raise ValueError(f"empty window: since {since:%Y-%m-%d} is not before until {until:%Y-%m-%d}")
        self.since, self.until = since, until

    def contains(self, moment: datetime) -> bool:
        return self.since <= moment < self.until

    def as_dict(self) -> dict[str, str]:
        return {"since": iso(self.since), "until": iso(self.until), "kind": "half-open [since, until), UTC days"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _midnight(day: date) -> datetime:
    return datetime.combine(day, time(0), tzinfo=timezone.utc)


def parse_window(days: int | None = None, since: str | None = None, until: str | None = None,
                 now: datetime | None = None) -> Window:
    """``--days N`` is the last N complete UTC days (today is excluded: billing data for it is partial).
    ``--since D [--until D]`` takes dates (YYYY-MM-DD); until is exclusive and defaults to today 00:00 UTC."""
    today = _midnight((now or utc_now()).astimezone(timezone.utc).date())
    if since is not None:
        if days is not None:
            raise ValueError("pass --days or --since/--until, not both")
        start = _midnight(date.fromisoformat(since))
        end = _midnight(date.fromisoformat(until)) if until else today
        return Window(start, end)
    if until is not None:
        raise ValueError("--until needs --since")
    n = 7 if days is None else days
    if n < 1:
        raise ValueError("--days must be at least 1")
    return Window(today - timedelta(days=n), today)


def add_window_args(parser: argparse.ArgumentParser) -> None:
    group = parser.add_argument_group("window (half-open, UTC days)")
    group.add_argument("--days", type=int, help="the last N complete UTC days (default 7)")
    group.add_argument("--since", help="first day, YYYY-MM-DD (inclusive)")
    group.add_argument("--until", help="end day, YYYY-MM-DD (exclusive; default today)")
    parser.add_argument("--out", help="write the source document here (default: standard output)")


def window_from_args(args: argparse.Namespace, now: datetime | None = None) -> Window:
    return parse_window(args.days, args.since, args.until, now)


def make_row(source: str, *, usd_basis: str, usd: Decimal | None = None, counts_toward_total: bool = True,
             **fields: Any) -> dict[str, Any]:
    """One normalised row. ``usd`` None means not priced (unknown price), never zero."""
    if usd_basis not in BASES:
        raise ValueError(f"usd_basis must be one of {BASES}, not {usd_basis!r}")
    unknown = set(fields) - set(ROW_FIELDS)
    if unknown:
        raise ValueError(f"unknown row fields: {sorted(unknown)}")
    if usd is not None and not isinstance(usd, Decimal):
        raise TypeError("usd must be a Decimal (never a float)")
    row: dict[str, Any] = {name: None for name in ROW_FIELDS}
    row.update(fields, source=source, usd=usd, usd_basis=usd_basis, counts_toward_total=counts_toward_total)
    return row


def make_doc(source: str, window: Window, rows: list[dict[str, Any]], *, status: str = "ok",
             notes: Iterable[str] = (), meta: dict[str, Any] | None = None,
             fetched_at: datetime | None = None) -> dict[str, Any]:
    if status not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}")
    return {"schema_version": SCHEMA_VERSION, "source": source, "window": window.as_dict(),
            "fetched_at": iso(fetched_at or utc_now()), "status": status, "notes": list(notes),
            "meta": meta or {}, "rows": rows}


def _default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


def dumps(obj: Any) -> str:
    return json.dumps(obj, default=_default, indent=2, sort_keys=False) + "\n"


def write_doc(doc: dict[str, Any], out: str | None) -> None:
    text = dumps(doc)
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(text, encoding="utf-8")
        print(f"wrote {out} ({len(doc['rows'])} rows, status {doc['status']})", file=sys.stderr)
    else:
        sys.stdout.write(text)


def dec(value: Any) -> Decimal | None:
    """A Snowflake NUMBER, a JSON string or an int as an exact Decimal; None stays None. Floats are refused."""
    if value is None:
        return None
    if isinstance(value, float):
        raise TypeError("refusing a float amount; parse it as a string")
    return value if isinstance(value, Decimal) else Decimal(str(value))
