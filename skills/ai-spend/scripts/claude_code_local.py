#!/usr/bin/env python3
"""claude_code_local.py: tokens used by local Claude Code sessions, from ~/.claude/projects/**/*.jsonl.

USD here is an API-equivalent estimate (usd_basis: estimated_api_equivalent): tokens x public API list prices.
On a Max plan this is NOT money spent; the plan is a flat fee.

The semantics mirror hooks/subagent-cost-ledger.js (sumUsage, priceKey):
  * one count per API message id (message.id), de-duplicated across files, because a resumed or forked session
    copies earlier messages into its new transcript. Of the lines for one id, the one with the most output tokens
    is kept (ties: the later timestamp, then the larger usage object by its sorted JSON text), whatever order the
    files are read in. Streaming writes a message several times with a growing output count, so within a file this
    is the last line, as in the ledger hook;
  * ``<synthetic>`` model lines are skipped;
  * a model is priced only by an exact price-table id or that id plus a -YYYYMMDD date snapshot (a trailing
    ``[1m]``-style tag is dropped first). claude-opus-5-6 never takes claude-opus-5's price: it is unpriced.

The price table is not part of this skill. It is read from --prices, else ~/.claude/hooks/lib/model-prices.json,
else the kit's hooks/lib/model-prices.json. With no table, every model is reported with tokens and USD unpriced.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spend_common as sc  # noqa: E402

SOURCE = "claude_code_local"
DATE_SUFFIX = re.compile(r"^-\d{8}$")
TAG_SUFFIX = re.compile(r"\[.*\]$")
PRICE_PATHS = (Path("~/.claude/hooks/lib/model-prices.json").expanduser(),
               Path(__file__).resolve().parents[3] / "hooks" / "lib" / "model-prices.json")
NOT_MONEY = "API-equivalent estimate at list prices; not money spent on a Max plan"


def load_prices(path: str | None) -> tuple[dict[str, Any] | None, str | None]:
    candidates = [Path(path).expanduser()] if path else list(PRICE_PATHS)
    for candidate in candidates:
        if candidate.is_file():
            return json.loads(candidate.read_text(encoding="utf-8"), parse_float=Decimal, parse_int=Decimal), \
                str(candidate)
    if path:
        raise FileNotFoundError(f"no price table at {path}")
    return None, None


def price_key(model: str | None, prices: dict[str, Any] | None) -> str | None:
    if not model or not prices:
        return None
    name = TAG_SUFFIX.sub("", str(model))
    for key in sorted(prices.get("models", {}), key=len, reverse=True):
        if name == key or (name.startswith(key) and DATE_SUFFIX.match(name[len(key):])):
            return key
    return None


def _tokens(usage: dict[str, Any]) -> dict[str, int]:
    write_1h = int((usage.get("cache_creation") or {}).get("ephemeral_1h_input_tokens") or 0)
    write_all = int(usage.get("cache_creation_input_tokens") or 0)
    return {"input": int(usage.get("input_tokens") or 0), "output": int(usage.get("output_tokens") or 0),
            "cache_read": int(usage.get("cache_read_input_tokens") or 0),
            "cache_write_5m": max(0, write_all - write_1h), "cache_write_1h": write_1h}


def _usd(tokens: dict[str, int], row: dict[str, Any]) -> Decimal:
    return sum((Decimal(tokens[f]) * Decimal(str(row[f])) for f in sc.TOKEN_FIELDS), Decimal(0)) / Decimal(10**6)


def _timestamp(text: Any) -> datetime | None:
    try:
        moment = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _rank(entry: tuple[str, str, datetime, dict[str, Any]]) -> tuple[int, datetime, str]:
    """Which line for one message id is kept: most output tokens, then the later timestamp, then a fixed order."""
    _model, _project, moment, usage = entry
    return int(usage.get("output_tokens") or 0), moment, json.dumps(usage, sort_keys=True, default=str)


def scan(root: Path, window: sc.Window, prices: dict[str, Any] | None, *, prices_path: str | None = None,
         now: datetime | None = None) -> dict[str, Any]:
    latest: dict[str, tuple[str, str, datetime, dict[str, Any]]] = {}  # message id -> (model, project, ts, usage)
    files = skipped = bad = 0
    for path in sorted(Path(root).rglob("*.jsonl")):
        # A file last written before the window cannot hold a line inside it.
        try:
            modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        except OSError:  # a broken link or a file removed while scanning
            bad += 1
            continue
        if modified < window.since:
            skipped += 1
            continue
        files += 1
        project = path.relative_to(root).parts[0] if len(path.relative_to(root).parts) > 1 else "(root)"
        with path.open(encoding="utf-8", errors="replace") as handle:
            for n, line in enumerate(handle):
                if '"assistant"' not in line or '"usage"' not in line:
                    continue
                try:
                    data = json.loads(line)
                except ValueError:
                    bad += 1
                    continue
                message = data.get("message") if isinstance(data, dict) else None
                if data.get("type") != "assistant" or not isinstance(message, dict) or not message.get("usage"):
                    continue
                model = message.get("model") or "unknown"
                if model == "<synthetic>":
                    continue
                moment = _timestamp(data.get("timestamp"))
                if moment is None:
                    bad += 1
                    continue
                key = message.get("id") or f"{data.get('requestId', '')}:{data.get('uuid') or f'{path}:{n}'}"
                entry = (model, project, moment, message["usage"])
                if key not in latest or _rank(entry) > _rank(latest[key]):
                    latest[key] = entry
    groups: dict[tuple[str, str, str], dict[str, int]] = {}
    tier_exceeded: set[str] = set()
    in_window = 0
    for model, project, moment, usage in latest.values():
        if not window.contains(moment):
            continue
        in_window += 1
        totals = groups.setdefault((moment.date().isoformat(), model, project), dict.fromkeys(sc.TOKEN_FIELDS, 0))
        call = _tokens(usage)
        for field, value in call.items():
            totals[field] += value
        key = price_key(model, prices)
        cap = key and prices["models"][key].get("tier_max_prompt_tokens")
        if cap and call["input"] + call["cache_read"] + call["cache_write_5m"] + call["cache_write_1h"] > cap:
            tier_exceeded.add(model)  # priced at the small-prompt tier, so the estimate is low for these calls
    rows, unpriced = [], set()
    for (day, model, project), tokens in sorted(groups.items()):
        key = price_key(model, prices)
        usd = _usd(tokens, prices["models"][key]) if key else None
        if key is None:
            unpriced.add(model)
        rows.append(sc.make_row(SOURCE, feature="claude_code", day=day, model=model, project=project, tokens=tokens,
                                usd=usd, usd_basis="estimated_api_equivalent",
                                note=NOT_MONEY if usd is not None else "unpriced: no exact or dated price row"))
    notes = [NOT_MONEY]
    if prices is None:
        notes.append("no price table found (model-prices.json); every model is unpriced")
    elif prices.get("as_of"):
        notes.append(f"prices as of {prices['as_of']} from {prices_path}")
    if unpriced:
        notes.append(f"unpriced models (tokens counted, USD not guessed): {sorted(unpriced)}")
    if tier_exceeded:
        notes.append(f"price_tier_exceeded: {sorted(tier_exceeded)} had calls over the price row's "
                     f"tier_max_prompt_tokens; their estimate is low")
    if bad:
        notes.append(f"{bad} unreadable transcript lines or files skipped")
    return sc.make_doc(SOURCE, window, rows, notes=notes, fetched_at=now,
                       meta={"files_read": files, "files_skipped_by_mtime": skipped, "messages": in_window,
                             "messages_read": len(latest),
                             "prices_path": prices_path, "unpriced_models": sorted(unpriced)})


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sc.add_window_args(p)
    p.add_argument("--root", default=os.path.expanduser("~/.claude/projects"), help="transcript folder")
    p.add_argument("--prices", help="price table JSON (default: ~/.claude/hooks/lib, then the kit's hooks/lib)")
    args = p.parse_args(argv)
    try:
        window = sc.window_from_args(args)
        prices, prices_path = load_prices(args.prices)
    except (ValueError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    sc.write_doc(scan(Path(args.root), window, prices, prices_path=prices_path), args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
