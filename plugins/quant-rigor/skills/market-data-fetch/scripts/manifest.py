#!/usr/bin/env python3
"""Provenance manifest for fetched data files (stdlib only).

One JSON file records, per fetched file: where it came from, when it was fetched
(UTC, ISO-8601 with offset), its sha256 and size, an optional row count, and the
tool that fetched it. `verify` re-hashes the files and exits non-zero on a missing
file, a size change or a hash change.

    manifest.py record data/manifest.json data/SPY.csv --source https://example.org/SPY.csv \
        --tool requests --tool-version 2.32.0
    manifest.py verify data/manifest.json

File paths are stored relative to the manifest's folder (POSIX separators), so the
manifest and its data can move together.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
_CHUNK = 1 << 20


class ManifestError(Exception):
    """The manifest file is unreadable or not in the expected shape."""


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(_CHUNK):
            h.update(chunk)
    return h.hexdigest()


def count_rows(path: Path) -> int | None:
    """Data rows of a CSV (header excluded) or Parquet file; None for anything else.

    CSV goes through the csv module, so a quoted newline does not count as a row.
    Parquet needs pyarrow and reads only the footer; without pyarrow it is None.
    """
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with open(path, newline="", encoding="utf-8", errors="replace") as f:
            n = sum(1 for _ in csv.reader(f))
        return max(n - 1, 0)
    if suffix == ".parquet":
        try:
            import pyarrow.parquet as pq
        except ImportError:
            return None
        return pq.ParquetFile(path).metadata.num_rows
    return None


def _utc_iso(moment: datetime | None) -> str:
    if moment is None:
        moment = datetime.now(timezone.utc)
    if moment.tzinfo is None or moment.utcoffset() is None:
        raise ValueError("fetch time must be timezone-aware; a naive time is ambiguous")
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


def atomic_write_json(path: Path, obj) -> None:
    """Write `obj` as JSON to `path` through a temp file and os.replace.

    allow_nan=False: NaN and Infinity are not JSON, and a reader that follows the
    spec rejects them. The error is raised before anything replaces `path`.
    """
    path = Path(path)
    text = json.dumps(obj, indent=2, sort_keys=True, allow_nan=False) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def _reject_constant(name: str):
    raise ValueError(f"{name} is not valid JSON")


def load(manifest_path: Path) -> dict:
    """The manifest as a dict; a missing file is an empty manifest."""
    manifest_path = Path(manifest_path)
    if not manifest_path.exists():
        return {"schema_version": SCHEMA_VERSION, "files": {}}
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"), parse_constant=_reject_constant)
    except (OSError, ValueError) as e:
        raise ManifestError(f"cannot read manifest {manifest_path}: {e}") from e
    if not isinstance(data, dict) or not isinstance(data.get("files"), dict):
        raise ManifestError(f"{manifest_path} has no 'files' object")
    return data


def _rel(manifest_path: Path, file_path: Path) -> str:
    base = Path(manifest_path).resolve().parent
    try:
        return Path(file_path).resolve().relative_to(base).as_posix()
    except ValueError as e:
        raise ValueError(f"{file_path} is not inside the manifest folder {base}") from e


def record(manifest_path: Path, file_path: Path, source: str, tool: str | None = None,
           tool_version: str | None = None, fetched_at: datetime | None = None,
           rows: int | None | str = "auto") -> dict:
    """Add or replace the entry for `file_path`; return the entry.

    rows="auto" counts CSV/Parquet rows, an int is taken as given, None omits the count.
    """
    manifest_path, file_path = Path(manifest_path), Path(file_path)
    if not source:
        raise ValueError("source (URL or identifier) is required")
    if not file_path.is_file():
        raise FileNotFoundError(file_path)
    entry = {
        "source": source,
        "fetched_at": _utc_iso(fetched_at),
        "sha256": sha256_file(file_path),
        "bytes": file_path.stat().st_size,
        "rows": count_rows(file_path) if rows == "auto" else rows,
        "tool": tool,
        "tool_version": tool_version,
    }
    data = load(manifest_path)
    data["files"][_rel(manifest_path, file_path)] = entry
    atomic_write_json(manifest_path, data)
    return entry


def verify(manifest_path: Path) -> list[str]:
    """One message per problem: missing file, size change, hash change. Empty means clean."""
    manifest_path = Path(manifest_path)
    if not manifest_path.exists():
        raise ManifestError(f"no manifest at {manifest_path}")
    data = load(manifest_path)
    base = manifest_path.resolve().parent
    problems = []
    for rel, entry in sorted(data["files"].items()):
        p = base / rel
        if not p.is_file():
            problems.append(f"MISSING {rel}")
            continue
        size = p.stat().st_size
        if size != entry.get("bytes"):
            problems.append(f"SIZE {rel}: manifest {entry.get('bytes')} bytes, file {size} bytes")
        digest = sha256_file(p)
        if digest != entry.get("sha256"):
            problems.append(f"SHA256 {rel}: manifest {entry.get('sha256')}, file {digest}")
    return problems


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record", help="add or replace one file's entry")
    r.add_argument("manifest")
    r.add_argument("file")
    r.add_argument("--source", required=True, help="URL or identifier the file came from")
    r.add_argument("--tool", help="tool that fetched it, e.g. requests, yfinance, dolt")
    r.add_argument("--tool-version")
    r.add_argument("--fetched-at", help="ISO-8601 with offset; default is now (UTC)")
    r.add_argument("--no-rows", action="store_true", help="skip the row count")
    v = sub.add_parser("verify", help="re-hash every file; exit 1 on any mismatch or missing file")
    v.add_argument("manifest")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "record":
            when = datetime.fromisoformat(args.fetched_at) if args.fetched_at else None
            entry = record(args.manifest, args.file, args.source, args.tool, args.tool_version,
                           when, None if args.no_rows else "auto")
            print(json.dumps(entry, sort_keys=True))
            return 0
        problems = verify(args.manifest)
    except (ManifestError, FileNotFoundError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    for line in problems:
        print(line)
    print(f"{'FAIL' if problems else 'OK'}: {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(_main())
