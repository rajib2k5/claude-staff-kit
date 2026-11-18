#!/usr/bin/env python3
"""report.py: merge ai-spend source documents into one report: a printed table and, with --json-out, a JSON file.

Rules the report keeps:
  * one USD subtotal per usd_basis (billed, list, estimated_api_equivalent); bases are never added together, and
    there is no grand total;
  * only rows with counts_toward_total enter a subtotal (Snowflake's per-feature attribution rows and Anthropic's
    token rows do not), and only rows that have a price (an unpriced row is listed, never counted as 0);
  * a source whose status is unknown or error is shown as UNKNOWN or ERROR, never as 0;
  * every report states its window and the time each source was fetched.

Usage: report.py SOURCE.json [SOURCE.json ...] [--json-out report.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any, Iterable, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spend_common as sc  # noqa: E402

BASIS_NOTE = {"billed": "from billing data", "list": "quantity x public list rate",
              "estimated_api_equivalent": "tokens x API list prices; not money spent on a Max plan"}
USER_SOURCES = {"anthropic_api", "snowflake_cortex"}


def _usd(value: Any) -> Decimal | None:
    return None if value is None else sc.dec(value)


def _token_total(tokens: dict[str, Any] | None) -> int:
    return sum(int(tokens.get(f) or 0) for f in sc.TOKEN_FIELDS) if tokens else 0


def build(docs: Iterable[dict[str, Any]], *, generated_at: Any = None) -> dict[str, Any]:
    docs = list(docs)
    windows = {json.dumps(d["window"], sort_keys=True) for d in docs}
    subtotals: dict[str, dict[str, Any]] = {}
    not_counted: list[str] = []
    tokens: dict[tuple[str, str], int] = defaultdict(int)
    unpriced: dict[tuple[str, str], int] = defaultdict(int)
    lines: dict[tuple, dict[str, Any]] = {}
    for doc in docs:
        status = doc["status"]
        if status in ("unknown", "error"):
            not_counted.append(f"{doc['source']}: {status.upper()} (not 0); " + "; ".join(doc.get("notes") or []))
            continue
        for row in doc["rows"]:
            usd = _usd(row.get("usd"))
            if row.get("tokens"):
                tokens[(row["source"], row.get("model") or "-")] += _token_total(row["tokens"])
            if row.get("counts_toward_total") and row.get("excluded_reason") is None:
                if usd is None:
                    unpriced[(row["source"], row.get("model") or row.get("service") or "-")] += \
                        _token_total(row.get("tokens"))
                else:
                    sub = subtotals.setdefault(row["usd_basis"], {"usd": Decimal(0), "sources": set(), "rows": 0,
                                                                   "partial": False})
                    sub["usd"] += usd
                    sub["sources"].add(row["source"])
                    sub["rows"] += 1
                    sub["partial"] = sub["partial"] or status == "partial"
            user = row.get("user")
            if user is None:
                user = "(unattributed)" if row["source"] in USER_SOURCES and row.get("feature") != "cortex_search" \
                    else "-"
            place = row.get("project") or row.get("workspace") or row.get("service") or "-"
            key = (row["source"], row.get("feature") or "-", row.get("model") or "-", str(user), str(place),
                   row["usd_basis"], bool(row.get("counts_toward_total")), row.get("excluded_reason"))
            line = lines.setdefault(key, {"usd": Decimal(0), "unpriced": False, "credits": Decimal(0), "tokens": 0})
            if usd is None:
                line["unpriced"] = True
            else:
                line["usd"] += usd
            line["credits"] += _usd(row.get("credits")) or Decimal(0)
            line["tokens"] += _token_total(row.get("tokens"))
    not_counted += [f"{source}: {model} is unpriced ({n:,} tokens); its USD is not known, not 0"
                    for (source, model), n in sorted(unpriced.items())]
    breakdown = [{"source": k[0], "feature": k[1], "model": k[2], "user": k[3], "where": k[4], "usd_basis": k[5],
                  "counts_toward_total": k[6], "excluded_reason": k[7],
                  "usd": None if v["unpriced"] and not v["usd"] else v["usd"], "unpriced": v["unpriced"],
                  "credits": v["credits"] or None, "tokens": v["tokens"] or None}
                 for k, v in sorted(lines.items(), key=lambda kv: (kv[0][0], kv[0][1], -kv[1]["usd"]))]
    return {
        "generated_at": sc.iso(generated_at or sc.utc_now()),
        "windows": [json.loads(w) for w in sorted(windows)],
        "window_mismatch": len(windows) > 1,
        "sources": [{"source": d["source"], "status": d["status"], "fetched_at": d["fetched_at"],
                     "window": d["window"], "rows": len(d["rows"]), "notes": d.get("notes") or [],
                     "meta": d.get("meta") or {}} for d in docs],
        "subtotals": {b: {**s, "sources": sorted(s["sources"]), "note": BASIS_NOTE[b]}
                      for b, s in sorted(subtotals.items(), key=lambda kv: sc.BASES.index(kv[0]))},
        "not_in_any_subtotal": not_counted,
        "tokens": [{"source": s, "model": m, "tokens": n} for (s, m), n in sorted(tokens.items())],
        "breakdown": breakdown,
    }


def _money(value: Decimal | None) -> str:
    """Cents for display, half up (0.125 -> 0.13), as a reader rounds; the JSON keeps the exact value."""
    return "unpriced" if value is None else f"{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}"


def _table(header: Sequence[str], rows: list[Sequence[str]]) -> list[str]:
    widths = [max(len(str(c)) for c in col) for col in zip(header, *rows)] if rows else [len(h) for h in header]
    fmt = "  " + "  ".join(f"{{:<{w}}}" for w in widths)
    return [fmt.format(*header)] + [fmt.format(*map(str, r)) for r in rows]


def render(report: dict[str, Any]) -> str:
    out = ["AI spend report"]
    for w in report["windows"]:
        out.append(f"window: {w['since']} to {w['until']} ({w['kind']})")
    if report["window_mismatch"]:
        out.append("WARNING: the sources cover different windows; compare them with care")
    out += [f"generated: {report['generated_at']}", "", "SOURCES"]
    out += _table(("source", "status", "fetched_at", "rows"),
                  [(s["source"], s["status"].upper(), s["fetched_at"], s["rows"]) for s in report["sources"]])
    for s in report["sources"]:
        for note in s["notes"]:
            out.append(f"    {s['source']}: {note}")
    out += ["", "USD SUBTOTALS, ONE PER BASIS (never added together; there is no grand total)"]
    if report["subtotals"]:
        out += _table(("usd_basis", "usd", "sources", "meaning"),
                      [(b, _money(s["usd"]) + (" PARTIAL" if s["partial"] else ""), ", ".join(s["sources"]),
                        s["note"]) for b, s in report["subtotals"].items()])
    else:
        out.append("  (none: no source returned priced rows)")
    if report["not_in_any_subtotal"]:
        out += ["", "NOT IN ANY SUBTOTAL"] + [f"  {line}" for line in report["not_in_any_subtotal"]]
    if report["tokens"]:
        out += ["", "TOKENS"] + _table(("source", "model", "tokens"),
                                       [(t["source"], t["model"], f"{t['tokens']:,}") for t in report["tokens"]])
    if report["breakdown"]:
        out += ["", "BREAKDOWN (* = attribution only, not in a subtotal; x = excluded as a double count)"]
        out += _table(("", "source", "feature", "model", "user", "where", "usd_basis", "usd", "credits", "tokens"),
                      [("x" if b["excluded_reason"] else "" if b["counts_toward_total"] else "*", b["source"],
                        b["feature"], b["model"], b["user"], b["where"], b["usd_basis"], _money(b["usd"]),
                        b["credits"] if b["credits"] is not None else "", f"{b['tokens']:,}" if b["tokens"] else "")
                       for b in report["breakdown"]])
    return "\n".join(out) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("docs", nargs="+", help="source documents written by the fetchers")
    p.add_argument("--json-out", help="also write the merged report as JSON here")
    args = p.parse_args(argv)
    docs = []
    for path in args.docs:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
        if doc.get("schema_version") != sc.SCHEMA_VERSION:
            print(f"error: {path} is not an ai-spend source document (schema_version)", file=sys.stderr)
            return 2
        docs.append(doc)
    report = build(docs)
    sys.stdout.write(render(report))
    if args.json_out:
        Path(args.json_out).write_text(sc.dumps(report), encoding="utf-8")
        print(f"wrote {args.json_out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
