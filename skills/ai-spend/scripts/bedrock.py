#!/usr/bin/env python3
"""bedrock.py: AWS Bedrock spend from Cost Explorer, read-only (usd_basis: billed, UnblendedCost).

1. ce:GetDimensionValues lists every SERVICE value with cost in the window (no SearchString: how it matches is
   not documented, and a prefix match would miss the model-named services below).
2. They are kept only when they match SERVICE_PATTERNS: Amazon Bedrock itself, and third-party models that are
   reported as their own service, e.g. "Claude Sonnet 5.5 (Amazon Bedrock Edition)". That naming comes from
   third-party reports, not AWS documentation: check the matched list this script prints against your bill.
   Cost Explorer cannot filter a dimension by substring (MatchOptions for Dimensions are EQUALS and
   CASE_SENSITIVE only, per the GetCostAndUsage API reference), which is why the names are listed first.
3. ce:GetCostAndUsage, DAILY, grouped by SERVICE and USAGE_TYPE, filtered to the matched services.

Cost: AWS charges USD 0.01 for each paginated Cost Explorer API request. The script counts its requests and prints
the count. Credentials come from the default boto3 chain (environment, profile, SSO, instance role); nothing is
read from the command line. Least-privilege IAM: ce:GetCostAndUsage, ce:GetDimensionValues, ce:GetTags.

Exit codes: 0 ok, 1 AWS error, 2 usage error (including boto3 not installed).
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spend_common as sc  # noqa: E402

SOURCE = "aws_bedrock"
REQUEST_USD = Decimal("0.01")
EDITION = re.compile(r"\s*\(Amazon Bedrock Edition\)\s*$")
# Exact Bedrock, any "Amazon Bedrock <feature>" service, and any "<model> (Amazon Bedrock Edition)" service.
SERVICE_PATTERNS = (re.compile(r"^Amazon Bedrock$"), re.compile(r"^Amazon Bedrock\s+\S"), EDITION)
METRIC = "UnblendedCost"
MAX_PAGES = 1000


def matching_services(names: Sequence[str]) -> list[str]:
    return [n for n in names if any(p.search(n) for p in SERVICE_PATTERNS)]


def fetch(ce: Any, window: sc.Window, *, now: datetime | None = None) -> dict[str, Any]:
    period = {"Start": window.since.date().isoformat(), "End": window.until.date().isoformat()}
    requests = 0
    names: list[str] = []
    token: str | None = None
    for _ in range(MAX_PAGES):
        kw: dict[str, Any] = {"TimePeriod": period, "Dimension": "SERVICE", "Context": "COST_AND_USAGE"}
        if token:
            kw["NextPageToken"] = token
        body = ce.get_dimension_values(**kw)
        requests += 1
        names += [v["Value"] for v in body.get("DimensionValues", [])]
        token = body.get("NextPageToken")
        if not token:
            break
    services = matching_services(names)
    near = [n for n in names if n not in services and re.search(r"bedrock|claude|anthropic", n, re.I)]
    notes = [f"services matched: {services or 'none'}; Bedrock-like names not matched: {near or 'none'}. "
             f"Check both against your bill.",
             "Claude on Bedrock is billed by AWS (it is not in the Anthropic Console cost)"]
    rows: list[dict[str, Any]] = []
    if services:
        token = None
        for _ in range(MAX_PAGES):
            kw = {"TimePeriod": period, "Granularity": "DAILY", "Metrics": [METRIC],
                  "Filter": {"Dimensions": {"Key": "SERVICE", "Values": services}},
                  "GroupBy": [{"Type": "DIMENSION", "Key": "SERVICE"}, {"Type": "DIMENSION", "Key": "USAGE_TYPE"}]}
            if token:
                kw["NextPageToken"] = token
            body = ce.get_cost_and_usage(**kw)
            requests += 1
            for result in body.get("ResultsByTime", []):
                day = result["TimePeriod"]["Start"]
                for group in result.get("Groups", []):
                    service, usage_type = (group.get("Keys") or [None, None])[:2]
                    metric = group["Metrics"][METRIC]
                    usd = sc.dec(metric["Amount"]) if metric.get("Unit") == "USD" else None
                    note = "Estimated by Cost Explorer (not final)" if result.get("Estimated") else None
                    if usd is None:
                        note = f"unit {metric.get('Unit')} is not USD; not priced"
                    rows.append(sc.make_row(
                        SOURCE, feature="bedrock", day=day, service=service, usage_type=usage_type,
                        model=EDITION.sub("", service) if service and EDITION.search(service) else None,
                        usd=usd, usd_basis="billed", note=note))
            token = body.get("NextPageToken")
            if not token:
                break
    else:
        notes.append("no Bedrock service had cost in the window (Cost Explorer data can lag about a day)")
    spent = REQUEST_USD * requests
    print(f"Cost Explorer: {requests} paginated requests at USD {REQUEST_USD} each = USD {spent}", file=sys.stderr)
    notes.append(f"this fetch made {requests} Cost Explorer requests (USD {spent} at USD 0.01 each)")
    return sc.make_doc(SOURCE, window, rows, notes=notes, fetched_at=now,
                       meta={"ce_requests": requests, "ce_request_cost_usd": spent, "metric": METRIC,
                             "services": services})


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sc.add_window_args(p)
    p.add_argument("--profile", help="AWS profile (default: the boto3 default chain)")
    args = p.parse_args(argv)
    try:
        window = sc.window_from_args(args)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    try:
        import boto3  # noqa: PLC0415 - optional dependency, only this source needs it
    except ImportError:
        print("error: boto3 is not installed. Install it (pip install boto3) to read Cost Explorer; "
              "the other ai-spend sources need only the standard library.", file=sys.stderr)
        return 2
    try:
        session = boto3.Session(profile_name=args.profile) if args.profile else boto3.Session()
        doc = fetch(session.client("ce", region_name="us-east-1"), window)
    except Exception as exc:  # noqa: BLE001 - botocore errors carry no secrets; report and write an error doc
        message = f"{type(exc).__name__}: {exc}"
        print(f"error: {message}", file=sys.stderr)
        sc.write_doc(sc.make_doc(SOURCE, window, [], status="error", notes=[message]), args.out)
        return 1
    sc.write_doc(doc, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
