#!/usr/bin/env python3
"""anthropic_api.py: Claude API spend from the Usage and Cost Analytics API (Admin API), read-only.

  GET /v1/organizations/analytics/cost   USD per day x model x workspace x API key x actor  (usd_basis: billed)
  GET /v1/organizations/analytics/usage  tokens for the same groups (no USD)

Facts from https://platform.claude.com/docs/en/manage-claude/usage-cost-analytics-api (read 2026-11-18):
  * headers anthropic-beta: analytics-usage-cost-2026-08-24 and anthropic-version (the docs send 2026-10-21);
  * starting_at inclusive, ending_at exclusive, at most 31 days per request, time_bucket_width=1d, group_by[]=...;
  * pages: pass next_page as ``page`` with the other parameters unchanged; HTTP 410 means the cursor expired and
    pagination restarts from the first page;
  * cost.amount is a string of cents with six decimals ("41280.000000" is USD 412.80), after discounts and before
    credits; it is parsed with Decimal, never float;
  * data_refreshed_at null with empty data means no data yet: UNKNOWN, not 0;
  * values can be revised until about 7 days after the end of the calendar month.

The Admin key comes from an environment variable (default ANTHROPIC_ADMIN_KEY; --key-env names another). A key on
the command line is refused. The key is sent only to https://api.anthropic.com (or a loopback address, for tests),
redirects are refused, and it is removed from every message, error document and exception text.

Exit codes: 0 ok (also UNKNOWN: the document says so), 1 API or network error, 2 usage error.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from urllib.parse import urlencode, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spend_common as sc  # noqa: E402

SOURCE = "anthropic_api"
DEFAULT_BASE = "https://api.anthropic.com"
BETA = "analytics-usage-cost-2026-08-24"
API_VERSION = "2026-10-21"
GROUP_BY = ("model", "workspace_id", "api_key_id", "actor")
MAX_SPAN = timedelta(days=31)
EARLIEST = datetime(2026, 1, 1, tzinfo=timezone.utc)
PAGE_LIMIT = 1000
MAX_PAGES = 10_000
RETRY_STATUS = frozenset({429, 500, 502, 503, 504, 529})
MAX_ATTEMPTS = 4
LOOPBACK = frozenset({"127.0.0.1", "localhost", "::1"})
KEY_ENV_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
KEY_SHAPE = re.compile(r"sk-ant-", re.I)
USER_AGENT = "claude-staff-kit-ai-spend/1"


class ApiError(RuntimeError):
    pass


class _CursorExpired(Exception):
    pass


class Scrubber:
    """Removes secret values from any text before it is printed or written."""

    def __init__(self, *secrets: str) -> None:
        self.secrets = [s for s in secrets if s and len(s) >= 8]

    def __call__(self, text: str) -> str:
        for secret in self.secrets:
            text = text.replace(secret, "[REDACTED]")
        return text


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """urllib would resend the x-api-key header to the redirect target."""

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        raise ApiError(f"refused a redirect (HTTP {code})")


def check_base(url: str) -> str:
    parts = urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    if origin == DEFAULT_BASE and parts.path in ("", "/"):
        return origin
    if parts.scheme in ("http", "https") and parts.hostname in LOOPBACK and parts.path in ("", "/"):
        return origin
    raise ValueError("--base-url must be https://api.anthropic.com or a loopback address (tests only)")


def chunks(window: sc.Window) -> list[tuple[datetime, datetime]]:
    """Split the window into requests of at most 31 days, half-open and back to back."""
    if window.since < EARLIEST:
        raise ValueError("the analytics API has no data before 2026-01-01")
    out, start = [], window.since
    while start < window.until:
        end = min(start + MAX_SPAN, window.until)
        out.append((start, end))
        start = end
    return out


def _cents_to_usd(text: Any) -> Decimal | None:
    if text is None:
        return None
    if not isinstance(text, str):
        raise ApiError(f"amount is not a decimal string: {type(text).__name__}")
    return Decimal(text) / 100


def actor_label(actor: Mapping[str, Any] | None) -> str | None:
    """The identity a row is attributed to, or None when the API attributes it to nobody."""
    if not actor:
        return None
    kind = actor.get("type")
    if kind == "user_actor":
        return actor.get("email_address") or actor.get("user_id")
    if kind == "service_account_actor":
        return actor.get("service_account_id")
    if kind == "api_actor":
        return actor.get("api_key_id")
    if kind == "federated_actor":
        provider = (actor.get("provider") or {}).get("type") or "federated"
        return f"{provider}:{actor.get('subject')}"
    return kind or None


class Client:
    def __init__(self, key: str, base_url: str = DEFAULT_BASE, opener: Any = None, timeout_s: float = 60,
                 sleep: Callable[[float], None] = time.sleep, scrub: Scrubber | None = None) -> None:
        self.base = check_base(base_url)
        self._key = key
        self.opener = opener or urllib.request.build_opener(_NoRedirect())
        self.timeout_s, self.sleep = timeout_s, sleep
        self.scrub = scrub or Scrubber(key)
        self.requests = 0

    def get(self, endpoint: str, params: Sequence[tuple[str, str]]) -> dict[str, Any]:
        url = f"{self.base}/v1/organizations/analytics/{endpoint}?{urlencode(list(params))}"
        request = urllib.request.Request(url, method="GET", headers={
            "x-api-key": self._key, "anthropic-version": API_VERSION, "anthropic-beta": BETA,
            "accept": "application/json", "user-agent": USER_AGENT})
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self.requests += 1
            try:
                with self.opener.open(request, timeout=self.timeout_s) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                body = self.scrub(exc.read(2000).decode("utf-8", "replace")) if exc.fp else ""
                if exc.code == 410:
                    raise _CursorExpired() from None
                if exc.code in RETRY_STATUS and attempt < MAX_ATTEMPTS:
                    self._backoff(attempt, exc.headers.get("retry-after") if exc.headers else None)
                    continue
                raise ApiError(f"HTTP {exc.code} from /{endpoint}: {body}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                if attempt < MAX_ATTEMPTS:
                    self._backoff(attempt, None)
                    continue
                raise ApiError(self.scrub(f"network error on /{endpoint}: {exc}")) from None
        raise AssertionError("unreachable")

    def _backoff(self, attempt: int, retry_after: str | None) -> None:
        try:
            wait = min(float(retry_after), 60.0) if retry_after else 0.0
        except ValueError:
            wait = 0.0
        self.sleep(max(wait, (2 ** (attempt - 1)) * (0.5 + random.random() / 2)))


def _pages(client: Client, endpoint: str, start: datetime, end: datetime) -> tuple[list[dict], str | None]:
    """Every row of one endpoint for one chunk, and its data_refreshed_at (identical across pages)."""
    base = [("starting_at", sc.iso(start)), ("ending_at", sc.iso(end)), ("time_bucket_width", "1d"),
            ("limit", str(PAGE_LIMIT))] + [("group_by[]", g) for g in GROUP_BY]
    for _restart in range(3):
        rows: list[dict] = []
        refreshed: str | None = None
        cursor: str | None = None
        try:
            for _ in range(MAX_PAGES):
                body = client.get(endpoint, base + ([("page", cursor)] if cursor else []))
                rows.extend(body.get("data") or [])
                refreshed = body.get("data_refreshed_at")
                if not body.get("has_more"):
                    return rows, refreshed
                cursor = body.get("next_page")
                if not cursor:
                    raise ApiError(f"/{endpoint}: has_more is true but next_page is empty")
            raise ApiError(f"/{endpoint}: more than {MAX_PAGES} pages")
        except _CursorExpired:
            continue  # the data refreshed under us: start this chunk again from page one
    raise ApiError(f"/{endpoint}: the page cursor expired three times (HTTP 410)")


def _revision_note(window: sc.Window, now: datetime) -> str | None:
    last = (window.until - timedelta(days=1)).date()
    next_month = last.replace(day=1) + timedelta(days=32)
    settled = datetime(next_month.year, next_month.month, 1, tzinfo=timezone.utc) + timedelta(days=7)
    if now < settled:
        return (f"figures can still be revised until about {settled:%Y-%m-%d} (7 days after the end of the "
                f"calendar month); re-run then for final totals")
    return None


def fetch(window: sc.Window, key: str, *, opener: Any = None, base_url: str = DEFAULT_BASE,
          now: datetime | None = None, sleep: Callable[[float], None] = time.sleep) -> dict[str, Any]:
    now = now or sc.utc_now()
    client = Client(key, base_url, opener, sleep=sleep)
    rows: list[dict[str, Any]] = []
    notes: list[str] = []
    unknown_chunks = 0
    parts = chunks(window)
    for start, end in parts:
        cost_rows, refreshed = _pages(client, "cost", start, end)
        usage_rows, _ = _pages(client, "usage", start, end)
        if refreshed is None and not cost_rows:
            unknown_chunks += 1
            notes.append(f"UNKNOWN for {sc.iso(start)} to {sc.iso(end)}: no data yet (data_refreshed_at is null)")
            continue
        if refreshed and refreshed < sc.iso(end):
            notes.append(f"data after {refreshed} is missing or partial (data_refreshed_at)")
        for item in cost_rows:
            group, cost = item.get("group") or {}, item.get("cost") or {}
            usd = _cents_to_usd(cost.get("amount"))
            note = "amount is after discounts and before credits"
            if cost.get("currency") not in (None, "USD"):
                usd, note = None, f"currency {cost.get('currency')} is not USD; not priced"
            rows.append(sc.make_row(
                SOURCE, feature="api", day=(item.get("starting_at") or "")[:10] or None, model=group.get("model"),
                user=actor_label(group.get("actor")), workspace=group.get("workspace_id"),
                api_key_id=group.get("api_key_id"), requests=cost.get("requests"), usd=usd,
                list_usd=_cents_to_usd(cost.get("list_amount")), usd_basis="billed", note=note))
        for item in usage_rows:
            group, usage = item.get("group") or {}, item.get("usage") or {}
            cache = usage.get("cache_creation") or {}
            tokens = {"input": usage.get("uncached_input_tokens") or 0, "output": usage.get("output_tokens") or 0,
                      "cache_read": usage.get("cache_read_input_tokens") or 0,
                      "cache_write_5m": cache.get("ephemeral_5m_input_tokens") or 0,
                      "cache_write_1h": cache.get("ephemeral_1h_input_tokens") or 0}
            rows.append(sc.make_row(
                SOURCE, feature="api", day=(item.get("starting_at") or "")[:10] or None, model=group.get("model"),
                user=actor_label(group.get("actor")), workspace=group.get("workspace_id"),
                api_key_id=group.get("api_key_id"), tokens=tokens, requests=usage.get("requests"),
                usd_basis="billed", counts_toward_total=False, note="tokens only; USD is on the cost rows"))
    status = "unknown" if unknown_chunks == len(parts) else "partial" if unknown_chunks else "ok"
    revision = _revision_note(window, now)
    if revision:
        notes.append(revision)
    notes.append("Claude used through AWS Bedrock or Snowflake Cortex is billed by AWS or Snowflake, not here")
    return sc.make_doc(SOURCE, window, rows, status=status, notes=notes, fetched_at=now,
                       meta={"api_requests": client.requests, "anthropic_version": API_VERSION, "beta": BETA})


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sc.add_window_args(p)
    p.add_argument("--key-env", default="ANTHROPIC_ADMIN_KEY",
                   help="NAME of the environment variable that holds the Admin API key (never the key itself)")
    p.add_argument("--base-url", default=DEFAULT_BASE, help=argparse.SUPPRESS)
    return p


def main(argv: Sequence[str] | None = None, *, env: Mapping[str, str] | None = None, opener: Any = None,
         sleep: Callable[[float], None] = time.sleep) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    env = os.environ if env is None else env
    # Before argparse: its error messages echo arguments, and a key on the command line also leaks to `ps`.
    if any(KEY_SHAPE.search(a) for a in argv):
        print("refused: an API key was given on the command line. Put it in an environment variable and pass "
              "that variable's NAME with --key-env (default ANTHROPIC_ADMIN_KEY).", file=sys.stderr)
        return 2
    try:
        args = parser().parse_args(argv)
        window = sc.window_from_args(args)
    except SystemExit as exc:
        return int(exc.code or 0)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if not KEY_ENV_RE.match(args.key_env):
        print("error: --key-env must be an environment variable name", file=sys.stderr)
        return 2
    key = env.get(args.key_env, "")
    if not key:
        print(f"error: set the Admin API key in the environment variable {args.key_env}", file=sys.stderr)
        return 2
    scrub = Scrubber(key)
    try:
        doc = fetch(window, key, opener=opener, base_url=args.base_url, sleep=sleep)
    except BaseException as exc:  # noqa: BLE001 - every failure is reported scrubbed, never as a raw traceback
        if isinstance(exc, KeyboardInterrupt):
            print("interrupted", file=sys.stderr)
            return 130
        message = scrub(f"{type(exc).__name__}: {exc}")
        print(f"error: {message}", file=sys.stderr)
        sc.write_doc(sc.make_doc(SOURCE, window, [], status="error", notes=[message]), args.out)
        return 1
    sc.write_doc(doc, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
