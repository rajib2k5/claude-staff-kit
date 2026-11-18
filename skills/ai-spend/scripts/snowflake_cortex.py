#!/usr/bin/env python3
"""snowflake_cortex.py: Snowflake Cortex and Cortex Code spend from SNOWFLAKE.ACCOUNT_USAGE, read-only.

Totals come from METERING_DAILY_HISTORY (SERVICE_TYPE AI_SERVICES, CORTEX_CODE_CLI, CORTEX_CODE_SNOWSIGHT); only
these rows count toward the report's subtotal. The per-feature views (Cortex Code, Cortex Agents, AI Functions,
Cortex Search) give user x model attribution and never count toward it. Cortex Search EMBED_TEXT_TOKENS credits
are kept out of the attributed sum because the same embeddings are also billed as AI Functions usage.

Dollars: credits x --credit-rate, labelled ``list`` (AI credits list at USD 2.00 with global routing, USD 2.20
regional; check your region). With --contract-rate-from-org the contract rate from ORGANIZATION_USAGE
.RATE_SHEET_DAILY is used where it matches, labelled ``billed``; if it cannot be read, the list rate is used and
the document says so.

The SQL is in ../sql/*.sql. It runs through the snowflake-sql skill's sf.py (PAT from the environment, read-only
guard), with the window bound as two values. Needs the SNOWFLAKE.USAGE_VIEWER database role.

Exit codes: 0 ok, 1 Snowflake error on the totals query, 2 usage or configuration error.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Mapping, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spend_common as sc  # noqa: E402

SOURCE = "snowflake_cortex"
SQL_DIR = Path(__file__).resolve().parent.parent / "sql"
SF_DIRS = (Path(__file__).resolve().parents[2] / "snowflake-sql", Path("~/.claude/skills/snowflake-sql").expanduser())
QUERIES = {"metering": "cortex_metering_daily.sql", "coco": "cortex_code_usage.sql",
           "agents": "cortex_agent_usage.sql", "ai_functions": "cortex_ai_functions_usage.sql",
           "search": "cortex_search_daily.sql"}
RATE_SHEET = "rate_sheet_daily.sql"
CODE_SERVICE_TYPES = ("CORTEX_CODE_CLI", "CORTEX_CODE_SNOWSIGHT")
EMBED = "EMBED_TEXT_TOKENS"
EMBED_REASON = "double count: Cortex Search embedding credits are also in CORTEX_AI_FUNCTIONS_USAGE_HISTORY"
# query name -> (feature, user column, service column, usage_type column)
DETAIL = {"coco": ("cortex_code", "USER_NAME", "INTERFACE", None),
          "agents": ("cortex_agents", "USER_NAME", "AGENT_NAME", "SERVICE_TYPE"),
          "ai_functions": ("cortex_ai_functions", "USER_ID", "FUNCTION_NAME", None),
          "search": ("cortex_search", None, "SERVICE_NAME", "CONSUMPTION_TYPE")}


def _key(service_type: Any) -> str:
    return str(service_type or "").strip().upper().replace(" ", "_")


def contract_rates(rate_rows: Sequence[Mapping[str, Any]]) -> dict[tuple[str, str], Decimal]:
    """(day, SERVICE_TYPE) -> USD per credit, only where the rate sheet gives exactly one USD rate."""
    seen: dict[tuple[str, str], set[Decimal]] = {}
    for r in rate_rows:
        if str(r.get("CURRENCY") or "").upper() != "USD" or r.get("EFFECTIVE_RATE") is None:
            continue
        seen.setdefault((str(r["RATE_DATE"]), _key(r["SERVICE_TYPE"])), set()).add(sc.dec(r["EFFECTIVE_RATE"]))
    return {k: next(iter(v)) for k, v in seen.items() if len(v) == 1}


def normalize(results: Mapping[str, Sequence[Mapping[str, Any]]], *, rate: Decimal,
              contract: Mapping[tuple[str, str], Decimal] | None = None) -> tuple[list[dict], dict, list[str]]:
    rows: list[dict[str, Any]] = []
    notes: list[str] = []
    metered = attributed = Decimal(0)
    fell_back = set()
    for r in results.get("metering", []):
        credits = sc.dec(r.get("CREDITS_BILLED")) or Decimal(0)
        metered += credits
        day, service = str(r["USAGE_DAY"]), _key(r["SERVICE_TYPE"])
        contract_rate = (contract or {}).get((day, service))
        if contract is not None and contract_rate is None:
            fell_back.add(service)
        rows.append(sc.make_row(
            SOURCE, feature=service.lower(), day=day, service=service, credits=credits,
            usd=credits * (contract_rate if contract_rate is not None else rate),
            usd_basis="billed" if contract_rate is not None else "list",
            note=f"contract rate {contract_rate}/credit" if contract_rate is not None else f"list rate {rate}/credit"))
    for name, (feature, user_col, service_col, usage_col) in DETAIL.items():
        for r in results.get(name, []):
            credits = sc.dec(r.get("CREDITS")) or Decimal(0)
            usage_type = r.get(usage_col) if usage_col else None
            excluded = EMBED_REASON if name == "search" and _key(usage_type) == EMBED else None
            if excluded is None:
                attributed += credits
            rows.append(sc.make_row(
                SOURCE, feature=feature, day=str(r["USAGE_DAY"]), user=r.get(user_col) if user_col else None,
                model=r.get("MODEL_NAME"), service=r.get(service_col), usage_type=usage_type, credits=credits,
                usd=credits * rate, usd_basis="list", counts_toward_total=False, excluded_reason=excluded,
                note="attribution only; the total is METERING_DAILY_HISTORY"))
    if fell_back:
        notes.append(f"no single contract rate for {sorted(fell_back)} on some days; the list rate was used there")
    metered_code = any(_key(r["SERVICE_TYPE"]) in CODE_SERVICE_TYPES for r in results.get("metering", []))
    if results.get("coco") and not metered_code:
        notes.append("Cortex Code usage exists but no CORTEX_CODE_* service type was metered: its credits are "
                     "inside AI_SERVICES in this account (or not metered yet)")
    if any(r.get("USER_ID") is None for r in results.get("ai_functions", [])):
        notes.append("some AI Functions rows have no user (user fields exist only for data after 2026-02-16)")
    gap = metered - attributed
    notes.append(f"metered {metered} credits; attributed to user/model/service {attributed}; unattributed {gap}")
    meta = {"metered_credits": metered, "attributed_credits": attributed, "unattributed_credits": gap,
            "credit_rate": rate}
    return rows, meta, notes


def _load_sf() -> Any:
    for folder in SF_DIRS:
        if (folder / "sf.py").is_file():
            sys.path.insert(0, str(folder))
            import sf  # noqa: PLC0415
            return sf
    raise FileNotFoundError("snowflake-sql's sf.py not found next to this skill or in ~/.claude/skills")


def fetch(sf: Any, client: Any, window: sc.Window, *, rate: Decimal, use_contract: bool,
          now: datetime | None = None) -> dict[str, Any]:
    binds = [sf.parse_bind(f"str:{moment:%Y-%m-%d %H:%M:%S} +00:00") for moment in (window.since, window.until)]

    def run(filename: str) -> list[dict[str, Any]]:
        sql = (SQL_DIR / filename).read_text(encoding="utf-8")
        sf.guard(sql, write=False, destructive=False)  # the library does not guard by itself
        [result] = client.run(sql, binds)
        return result.as_dicts()

    results: dict[str, list[dict[str, Any]]] = {"metering": run(QUERIES["metering"])}
    notes: list[str] = []
    status = "ok"
    for name, filename in QUERIES.items():
        if name == "metering":
            continue
        try:
            results[name] = run(filename)
        except sf.SfError as exc:
            status = "partial"
            notes.append(f"{name} attribution not read ({filename}): {exc}")
    contract = None
    if use_contract:
        try:
            contract = contract_rates(run(RATE_SHEET))
        except sf.SfError as exc:
            notes.append(f"RATE_SHEET_DAILY not readable ({exc}); the list rate was used")
    rows, meta, more = normalize(results, rate=rate, contract=contract)
    notes += more
    notes.append("Claude used through Cortex is billed by Snowflake in credits, not by Anthropic")
    notes.append("ACCOUNT_USAGE lags: METERING_DAILY_HISTORY up to 3 hours, the Cortex views up to 1 hour")
    return sc.make_doc(SOURCE, window, rows, status=status, notes=notes, meta=meta, fetched_at=now)


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sc.add_window_args(p)
    p.add_argument("--credit-rate", default="2.00",
                   help="USD per AI credit, list price (2.00 global routing, 2.20 regional; default 2.00)")
    p.add_argument("--contract-rate-from-org", action="store_true",
                   help="use ORGANIZATION_USAGE.RATE_SHEET_DAILY contract rates where they match (usd_basis billed)")
    p.add_argument("--profile", help="profile in snowflake-sql's config.json")
    p.add_argument("--role", help="a role that has SNOWFLAKE.USAGE_VIEWER")
    p.add_argument("--warehouse")
    args = p.parse_args(argv)
    try:
        window = sc.window_from_args(args)
        rate = Decimal(args.credit_rate)
        if not rate.is_finite() or rate <= 0:
            raise ValueError("--credit-rate must be a positive number")
        sf = _load_sf()
        client = sf.make_client(argparse.Namespace(
            config=None, profile=args.profile, connection=None, token_var=None, account_url=None, role=args.role,
            warehouse=args.warehouse, database=None, schema=None, timeout=300))
    except Exception as exc:  # noqa: BLE001 - usage/config errors; sf scrubs the token from its own messages
        print(f"error: {exc}", file=sys.stderr)
        return 2
    try:
        doc = fetch(sf, client, window, rate=rate, use_contract=args.contract_rate_from_org)
    except (sf.SfError, sf.Refused) as exc:
        print(f"error: {exc}", file=sys.stderr)
        sc.write_doc(sc.make_doc(SOURCE, window, [], status="error", notes=[str(exc)]), args.out)
        return 1
    sc.write_doc(doc, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
