"""Offline tests for the ai-spend fetchers and report. Synthetic fixtures only: no network, no credentials.
Run: cd skills/ai-spend/scripts && python3 -m unittest test_ai_spend -v"""

from __future__ import annotations

import contextlib
import http.server
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import anthropic_api  # noqa: E402
import bedrock  # noqa: E402
import claude_code_local  # noqa: E402
import report  # noqa: E402
import snowflake_cortex  # noqa: E402
import spend_common  # noqa: E402

CANARY = "sk-ant-admin01-CANARY"
NOW = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)
WINDOW = spend_common.parse_window(since="2026-11-10", until="2026-11-17", now=NOW)


class FakeResponse(io.BytesIO):
    def __init__(self, payload: dict) -> None:
        super().__init__(json.dumps(payload).encode())
        self.status = 200
        self.headers = {}

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class FakeOpener:
    """Answers each endpoint from a list of pages, keyed by the 'page' parameter (None for the first page)."""

    def __init__(self, pages: dict[str, dict[str | None, dict]]) -> None:
        self.pages, self.urls, self.headers = pages, [], []

    def open(self, request, timeout=None):  # noqa: ANN001
        self.urls.append(request.full_url)
        self.headers.append(dict(request.header_items()))
        parts = urlsplit(request.full_url)
        endpoint = parts.path.rsplit("/", 1)[1]
        page = parse_qs(parts.query).get("page", [None])[0]
        return FakeResponse(self.pages[endpoint][page])


def cost_row(day: str, amount: str, group: dict | None = None) -> dict:
    return {"starting_at": f"{day}T00:00:00Z", "ending_at": f"{day}T00:00:00Z",
            "group": {"model": "claude-opus-5-5", "workspace_id": "wrkspc_1", "api_key_id": "apikey_1",
                      "actor": None, **(group or {})},
            "cost": {"currency": "USD", "amount": amount, "list_amount": amount, "requests": 1}}


def page(rows: list, nxt: str | None = None, refreshed: str | None = "2026-11-18T04:00:00Z") -> dict:
    return {"data": rows, "has_more": nxt is not None, "next_page": nxt, "data_refreshed_at": refreshed}


EMPTY_USAGE = {"usage": {None: page([])}}


class AnthropicPagination(unittest.TestCase):
    def test_follows_next_page_until_has_more_is_false(self) -> None:
        opener = FakeOpener({"cost": {None: page([cost_row("2026-11-10", "100.000000")], nxt="p2"),
                                      "p2": page([cost_row("2026-11-11", "200.000000")])}, **EMPTY_USAGE})
        doc = anthropic_api.fetch(WINDOW, "k", opener=opener, now=NOW)
        self.assertEqual(sorted(r["day"] for r in doc["rows"] if r["usd"] is not None), ["2026-11-10", "2026-11-11"])
        cost_urls = [u for u in opener.urls if "/cost?" in u]
        self.assertEqual(len(cost_urls), 2)
        first, second = (parse_qs(urlsplit(u).query) for u in cost_urls)
        self.assertEqual(second.pop("page"), ["p2"])
        self.assertEqual(first, second, "the other parameters must stay unchanged on the next page")
        self.assertEqual(first["time_bucket_width"], ["1d"])
        self.assertEqual(sorted(first["group_by[]"]), ["actor", "api_key_id", "model", "workspace_id"])


class AnthropicCents(unittest.TestCase):
    def test_amount_is_cents_parsed_as_decimal(self) -> None:
        rows = [cost_row("2026-11-10", "41280.000000"),
                cost_row("2026-11-10", "123456789012.345678", {"model": "big"})] + \
               [cost_row("2026-11-11", "10.000000", {"model": f"m{i}"}) for i in range(3)]
        opener = FakeOpener({"cost": {None: page(rows)}, **EMPTY_USAGE})
        doc = anthropic_api.fetch(WINDOW, "k", opener=opener, now=NOW)
        usd = {r["model"]: Decimal(r["usd"]) for r in doc["rows"] if r["usd"] is not None}
        self.assertEqual(usd["claude-opus-5-5"], Decimal("412.80"))
        # 18 significant digits: a float keeps about 17, so float parsing loses the last cent fraction
        self.assertEqual(usd["big"], Decimal("1234567890.12345678"))
        totals = report.build([doc])["subtotals"]
        # 0.10 three times: exact in Decimal (a float sum gives 0.30000000000000004)
        self.assertEqual(Decimal(totals["billed"]["usd"]), Decimal("1234568303.22345678"))


class AnthropicNulls(unittest.TestCase):
    def test_null_workspace_actor_and_key_are_kept_and_labelled(self) -> None:
        rows = [cost_row("2026-11-10", "100.000000", {"workspace_id": None, "actor": None, "api_key_id": None}),
                cost_row("2026-11-10", "50.000000", {"actor": {"type": "user_actor", "user_id": "user_1",
                                                               "email_address": None, "name": None,
                                                               "deleted": True}}),
                cost_row("2026-11-10", "25.000000", {"actor": {"type": "api_actor", "api_key_id": "apikey_9"}})]
        opener = FakeOpener({"cost": {None: page(rows)}, **EMPTY_USAGE})
        doc = anthropic_api.fetch(WINDOW, "k", opener=opener, now=NOW)
        priced = [r for r in doc["rows"] if r["usd"] is not None]
        self.assertEqual(len(priced), 3)
        self.assertEqual([r["user"] for r in priced], [None, "user_1", "apikey_9"])
        self.assertIsNone(priced[0]["workspace"])
        text = report.render(report.build([doc]))
        self.assertIn("(unattributed)", text)


class AnthropicUnknown(unittest.TestCase):
    def test_empty_data_with_null_refresh_is_unknown_not_zero(self) -> None:
        opener = FakeOpener({"cost": {None: page([], refreshed=None)}, "usage": {None: page([], refreshed=None)}})
        doc = anthropic_api.fetch(WINDOW, "k", opener=opener, now=NOW)
        self.assertEqual(doc["status"], "unknown")
        built = report.build([doc])
        self.assertNotIn("billed", built["subtotals"])
        text = report.render(built)
        self.assertIn("UNKNOWN", text)
        self.assertNotIn("0.00", text)

    def test_empty_data_with_a_refresh_time_is_a_measured_zero(self) -> None:
        opener = FakeOpener({"cost": {None: page([])}, "usage": {None: page([])}})
        doc = anthropic_api.fetch(WINDOW, "k", opener=opener, now=NOW)
        self.assertEqual(doc["status"], "ok")


class AnthropicChunks(unittest.TestCase):
    def test_windows_over_31_days_are_split_half_open(self) -> None:
        window = spend_common.parse_window(since="2026-09-01", until="2026-11-01", now=NOW)
        chunks = anthropic_api.chunks(window)
        self.assertEqual([(a.date().isoformat(), b.date().isoformat()) for a, b in chunks],
                         [("2026-09-01", "2026-10-02"), ("2026-10-02", "2026-11-01")])


def transcript_line(msg_id: str, model: str, output: int, ts: str = "2026-11-12T10:00:00.000Z") -> str:
    return json.dumps({"type": "assistant", "timestamp": ts, "message": {
        "id": msg_id, "model": model, "usage": {
            "input_tokens": 10, "output_tokens": output, "cache_read_input_tokens": 100,
            "cache_creation_input_tokens": 50, "cache_creation": {"ephemeral_1h_input_tokens": 20,
                                                                  "ephemeral_5m_input_tokens": 30}}}})


PRICES = {"models": {"claude-opus-5": {"input": 5, "cache_write_5m": 6.25, "cache_write_1h": 10,
                                       "cache_read": 0.5, "output": 25}}}


class LocalDedup(unittest.TestCase):
    def test_message_id_counted_once_last_line_wins_across_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "proj-a").mkdir()
            (root / "proj-a" / "s1.jsonl").write_text("\n".join([
                transcript_line("msg_1", "claude-opus-5", 1), transcript_line("msg_1", "claude-opus-5", 5),
                transcript_line("msg_2", "claude-opus-5", 7),
                transcript_line("msg_old", "claude-opus-5", 9, ts="2026-11-01T00:00:00Z"),
                transcript_line("msg_syn", "<synthetic>", 3)]) + "\n")
            (root / "proj-a" / "resumed.jsonl").write_text(transcript_line("msg_1", "claude-opus-5", 5) + "\n")
            doc = claude_code_local.scan(root, WINDOW, PRICES)
        tokens = [r["tokens"] for r in doc["rows"]]
        self.assertEqual(sum(t["output"] for t in tokens), 12)
        self.assertEqual(sum(t["input"] for t in tokens), 20)
        self.assertNotIn("<synthetic>", {r["model"] for r in doc["rows"]})


class LocalPricing(unittest.TestCase):
    def test_date_suffix_priced_version_suffix_and_unknown_unpriced(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "p").mkdir()
            (root / "p" / "s.jsonl").write_text("\n".join([
                transcript_line("a", "claude-opus-5-20261001", 5), transcript_line("b", "claude-opus-5-6", 5),
                transcript_line("c", "mystery-model", 5)]) + "\n")
            doc = claude_code_local.scan(root, WINDOW, PRICES)
        by_model = {r["model"]: r for r in doc["rows"]}
        dated = by_model["claude-opus-5-20261001"]
        # (10*5 + 5*25 + 100*0.5 + 30*6.25 + 20*10) / 1e6
        self.assertEqual(Decimal(dated["usd"]), Decimal("0.0006125"))
        self.assertEqual(dated["usd_basis"], "estimated_api_equivalent")
        for name in ("claude-opus-5-6", "mystery-model"):
            self.assertIsNone(by_model[name]["usd"], name)
            self.assertEqual(by_model[name]["tokens"]["output"], 5)
        self.assertIn("unpriced", report.render(report.build([doc])))


def doc_with(source: str, basis: str, usd: str) -> dict:
    row = spend_common.make_row(source, usd=Decimal(usd), usd_basis=basis, model="m")
    return spend_common.make_doc(source, WINDOW, [row], fetched_at=NOW)


class Subtotals(unittest.TestCase):
    def test_each_basis_has_its_own_subtotal_and_none_are_added(self) -> None:
        docs = [doc_with("anthropic_api", "billed", "1.00"), doc_with("snowflake_cortex", "list", "2.00"),
                doc_with("claude_code_local", "estimated_api_equivalent", "4.00"),
                doc_with("aws_bedrock", "billed", "8.00")]
        built = report.build(docs)
        self.assertEqual({k: Decimal(v["usd"]) for k, v in built["subtotals"].items()},
                         {"billed": Decimal("9.00"), "list": Decimal("2.00"),
                          "estimated_api_equivalent": Decimal("4.00")})
        text = report.render(built)
        for mixed in ("15.00", "13.00", "11.00", "6.00", "12.00"):
            self.assertNotIn(mixed, text)

    def test_unknown_basis_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            spend_common.make_row("x", usd=Decimal("1"), usd_basis="dollars")


class CortexSearchDoubleCount(unittest.TestCase):
    def test_search_embeddings_are_not_attributed_twice(self) -> None:
        results = {
            "metering": [{"USAGE_DAY": "2026-11-10", "SERVICE_TYPE": "AI_SERVICES", "CREDITS_BILLED": Decimal("6")}],
            "ai_functions": [{"USAGE_DAY": "2026-11-10", "USER_ID": "7", "FUNCTION_NAME": "AI_COMPLETE",
                              "MODEL_NAME": "m", "CREDITS": Decimal("2")},
                             {"USAGE_DAY": "2026-11-10", "USER_ID": None, "FUNCTION_NAME": "EMBED_TEXT_768",
                              "MODEL_NAME": "e5", "CREDITS": Decimal("1")}],
            "search": [{"USAGE_DAY": "2026-11-10", "SERVICE_NAME": "DB.S.SVC", "CONSUMPTION_TYPE": "SERVING",
                        "MODEL_NAME": None, "CREDITS": Decimal("2")},
                       {"USAGE_DAY": "2026-11-10", "SERVICE_NAME": "DB.S.SVC",
                        "CONSUMPTION_TYPE": "EMBED_TEXT_TOKENS", "MODEL_NAME": "e5", "CREDITS": Decimal("1")}],
        }
        rows, meta, _notes = snowflake_cortex.normalize(results, rate=Decimal("2.00"))
        self.assertEqual(Decimal(meta["attributed_credits"]), Decimal("5"))
        self.assertEqual(Decimal(meta["metered_credits"]), Decimal("6"))
        totals = [r for r in rows if r["counts_toward_total"]]
        self.assertEqual([Decimal(r["usd"]) for r in totals], [Decimal("12.00")])
        self.assertEqual({r["usd_basis"] for r in totals}, {"list"})


class BedrockFilter(unittest.TestCase):
    NAMES = ["Amazon Bedrock", "Claude Sonnet 5.5 (Amazon Bedrock Edition)", "Amazon Bedrock AgentCore",
             "Amazon SageMaker", "Amazon Elastic Compute Cloud - Compute"]

    def test_patterns_catch_bedrock_edition_services(self) -> None:
        self.assertEqual(bedrock.matching_services(self.NAMES), self.NAMES[:3])

    def test_fetch_filters_on_matched_services_and_counts_requests(self) -> None:
        names = self.NAMES

        class FakeCE:
            calls: list = []

            def get_dimension_values(self, **kw):  # noqa: ANN003
                self.calls.append(("dims", kw))
                return {"DimensionValues": [{"Value": n} for n in names]}

            def get_cost_and_usage(self, **kw):  # noqa: ANN003
                self.calls.append(("cost", kw))
                group = {"Keys": ["Claude Sonnet 5.5 (Amazon Bedrock Edition)", "USE1-MP:USE1_InputTokens"],
                         "Metrics": {"UnblendedCost": {"Amount": "1.2345678901", "Unit": "USD"}}}
                if "NextPageToken" not in kw:
                    return {"ResultsByTime": [{"TimePeriod": {"Start": "2026-11-10"}, "Estimated": True,
                                               "Groups": [group]}], "NextPageToken": "t2"}
                return {"ResultsByTime": [{"TimePeriod": {"Start": "2026-11-11"}, "Estimated": False,
                                           "Groups": [group]}]}

        ce = FakeCE()
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            doc = bedrock.fetch(ce, WINDOW, now=NOW)
        cost_calls = [kw for kind, kw in ce.calls if kind == "cost"]
        self.assertEqual(cost_calls[0]["Filter"]["And"][0]["Dimensions"]["Values"], names[:3])
        self.assertEqual(doc["meta"]["ce_requests"], 3)
        self.assertIn("3", stderr.getvalue())
        self.assertEqual([Decimal(r["usd"]) for r in doc["rows"]], [Decimal("1.2345678901")] * 2)
        self.assertEqual(doc["rows"][0]["model"], "Claude Sonnet 5.5")

    def test_cost_request_keeps_usage_records_only(self) -> None:
        # 4fd2620 sent no RECORD_TYPE filter, so credits and refunds netted into "billed".
        class FakeCE:
            calls: list = []

            def get_dimension_values(self, **kw):  # noqa: ANN003
                return {"DimensionValues": [{"Value": "Amazon Bedrock"}]}

            def get_cost_and_usage(self, **kw):  # noqa: ANN003
                self.calls.append(kw)
                return {"ResultsByTime": []}

        ce = FakeCE()
        with contextlib.redirect_stderr(io.StringIO()):
            doc = bedrock.fetch(ce, WINDOW, now=NOW)
        self.assertEqual(ce.calls[0]["Filter"], {"And": [
            {"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Bedrock"]}},
            {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}}]})
        self.assertTrue(any("credits" in n and "Usage" in n for n in doc["notes"]))


class _EchoKey(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        body = json.dumps({"error": {"message": f"bad key {self.headers.get('x-api-key')}"}}).encode()
        self.send_response(401)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        pass


class CanaryKey(unittest.TestCase):
    def test_key_never_reaches_stdout_stderr_files_or_tracebacks(self) -> None:
        server = http.server.HTTPServer(("127.0.0.1", 0), _EchoKey)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                env = {**os.environ, "ANTHROPIC_ADMIN_KEY": CANARY}
                proc = subprocess.run(
                    [sys.executable, str(HERE / "anthropic_api.py"), "--since", "2026-11-10", "--until",
                     "2026-11-17", "--base-url", f"http://127.0.0.1:{server.server_port}",
                     "--out", str(Path(tmp) / "anthropic.json")],
                    env=env, capture_output=True, text=True, timeout=60)
                self.assertNotEqual(proc.returncode, 0)
                self.assertIn("401", proc.stderr)
                self.assertNotIn(CANARY, proc.stdout + proc.stderr)
                self.assertNotIn("Traceback", proc.stderr)
                files = list(Path(tmp).rglob("*"))
                self.assertTrue(files, "an error document is written")
                for f in files:
                    self.assertNotIn(CANARY, f.read_text(), f)
        finally:
            server.shutdown()
            server.server_close()

    def test_unexpected_exception_text_is_scrubbed(self) -> None:
        class Boom:
            def open(self, request, timeout=None):  # noqa: ANN001
                raise urllib.error.URLError(f"proxy said {CANARY}")

        out, err = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = anthropic_api.main(["--days", "2", "--out", str(Path(tmp) / "a.json")],
                                      env={"ANTHROPIC_ADMIN_KEY": CANARY}, opener=Boom(), sleep=lambda s: None)
            written = (Path(tmp) / "a.json").read_text()
        self.assertEqual(code, 1)
        self.assertNotIn(CANARY, out.getvalue() + err.getvalue() + written)

    def test_key_on_the_command_line_is_refused_without_echo(self) -> None:
        for argv in (["--days", "2", "--key-env", CANARY], ["--days", "2", "--key", CANARY], [CANARY]):
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                code = anthropic_api.main(argv, env={})
            self.assertEqual(code, 2, argv)
            self.assertNotIn(CANARY, err.getvalue(), argv)


# A fake key with no repeated 8-character run, so "no 8-character piece of it" is a strict check.
LONG_KEY = "sk-ant-admin01-aB3dE6gH9jK2mN5pQ8sT1vW4yZ7_cF0iL3oR6uX9-bE2hK5nQ8tW1zC4fI7lO0rU3xA6"


def key_pieces(text: str, key: str = LONG_KEY) -> list[str]:
    """Every 8-character piece of ``key`` that appears in ``text``."""
    return [key[i:i + 8] for i in range(len(key) - 7) if key[i:i + 8] in text]


def run_main(argv: list[str], key: str, opener, **kw) -> tuple[object, str]:  # noqa: ANN001
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            code = anthropic_api.main(argv, env={"ANTHROPIC_ADMIN_KEY": key}, opener=opener, sleep=lambda s: None,
                                      **kw)
        except BaseException as exc:  # noqa: BLE001 - the test reports an escaped exception as a failure
            code = f"raised {type(exc).__name__}"
    return code, out.getvalue() + err.getvalue()


class _RecordKey(http.server.BaseHTTPRequestHandler):
    seen: list = []

    def do_GET(self) -> None:  # noqa: N802
        type(self).seen.append((self.path, self.headers.get("x-api-key")))
        if self.path.startswith("/v1/organizations/analytics/") and getattr(self.server, "redirect", False):
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{self.server.server_port}/elsewhere")
            self.end_headers()
            return
        body = json.dumps({"error": {"message": f"bad key {self.headers.get('x-api-key')}"}}).encode()
        self.send_response(200 if self.path == "/elsewhere" else 401)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body if self.path != "/elsewhere" else json.dumps(page([])).encode())

    def log_message(self, *args: object) -> None:
        pass


@contextlib.contextmanager
def local_server(redirect: bool = False):  # noqa: ANN201
    _RecordKey.seen = []
    server = http.server.HTTPServer(("127.0.0.1", 0), _RecordKey)
    server.redirect = redirect
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()


class HTTPErrorOpener:
    def __init__(self, body: str, code: int = 400) -> None:
        self.body, self.code, self.calls = body, code, 0

    def open(self, request, timeout=None):  # noqa: ANN001
        self.calls += 1
        raise urllib.error.HTTPError(request.full_url, self.code, "x", {}, io.BytesIO(self.body.encode()))


class KeyHygiene(unittest.TestCase):
    ARGS = ["--since", "2026-11-10", "--until", "2026-11-17"]

    def test_key_with_trailing_newline_or_spaces_is_stripped_before_it_reaches_a_header(self) -> None:
        # 4fd2620: http.client refused the header with a ValueError that quoted the whole key, unscrubbed.
        for suffix in ("\n", "\r\n", "  "):
            with local_server() as server, tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / "a.json"
                code, text = run_main(self.ARGS + ["--base-url", f"http://127.0.0.1:{server.server_port}",
                                                   "--out", str(out)], LONG_KEY + suffix, None)
                written = out.read_text() if out.exists() else ""
            self.assertEqual(code, 1, repr(suffix))
            self.assertEqual(key_pieces(text + written), [], repr(suffix))
            self.assertTrue(_RecordKey.seen, repr(suffix))
            self.assertEqual({k for _, k in _RecordKey.seen}, {LONG_KEY}, repr(suffix))

    def test_key_with_characters_outside_the_allowlist_is_refused_and_never_sent(self) -> None:
        for bad in (LONG_KEY[:30] + "\n" + LONG_KEY[30:], LONG_KEY[:30] + " " + LONG_KEY[30:],
                    LONG_KEY[:30] + "é" + LONG_KEY[30:], LONG_KEY + "\x00"):
            opener = FakeOpener({"cost": {None: page([])}, **EMPTY_USAGE})
            code, text = run_main(self.ARGS, bad, opener)
            self.assertEqual(code, 2, repr(bad))
            self.assertEqual(opener.urls, [], repr(bad))
            self.assertEqual(key_pieces(text), [], repr(bad))

    def test_key_in_an_error_body_is_masked_in_place_and_the_rest_is_kept(self) -> None:
        code, text = run_main(self.ARGS, LONG_KEY, HTTPErrorOpener(f"bad key {LONG_KEY} for workspace wrkspc_9"))
        self.assertEqual(code, 1)
        self.assertIn("bad key [REDACTED] for workspace wrkspc_9", text)
        self.assertEqual(key_pieces(text), [])

    def test_error_body_cut_at_2000_bytes_does_not_leak_a_key_prefix(self) -> None:
        code, text = run_main(self.ARGS, LONG_KEY, HTTPErrorOpener("x" * 1960 + "key=" + LONG_KEY))
        self.assertEqual(code, 1)
        self.assertIn("400", text)
        self.assertEqual(key_pieces(text), [])

    def test_percent_and_backslash_escaped_key_in_an_error_body_is_redacted(self) -> None:
        percent = "".join(f"%{b:02X}" for b in LONG_KEY.encode())
        escaped = "".join(f"\\u{ord(c):04x}" for c in LONG_KEY)
        for body in (f"echo {percent}", '{"error": "' + escaped + '"}', f"echo {LONG_KEY!r}"):
            code, text = run_main(self.ARGS, LONG_KEY, HTTPErrorOpener(body))
            self.assertEqual(code, 1, body[:20])
            decoded = urllib.parse.unquote(text)
            decoded = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), decoded)
            self.assertEqual(key_pieces(decoded), [], body[:20])

    def test_unwritable_out_after_a_keyed_exception_returns_1_without_a_traceback(self) -> None:
        class Boom:
            def open(self, request, timeout=None):  # noqa: ANN001
                raise RuntimeError("boom " + LONG_KEY)

        with tempfile.TemporaryDirectory() as tmp:
            blocker = Path(tmp) / "a-file"
            blocker.write_text("")
            code, text = run_main(self.ARGS + ["--out", str(blocker / "x.json")], LONG_KEY, Boom())
        self.assertEqual(code, 1)
        self.assertNotIn("Traceback", text)
        self.assertEqual(key_pieces(text), [])


class AnthropicWindowLimits(unittest.TestCase):
    KEY = "sk-ant-admin01-test"

    def test_window_before_2026_is_a_usage_error_and_nothing_is_sent(self) -> None:
        opener = FakeOpener({})
        code, text = run_main(["--since", "2025-12-30", "--until", "2026-01-05"], self.KEY, opener)
        self.assertEqual(code, 2)
        self.assertIn("2026-01-01", text)
        self.assertEqual(opener.urls, [])

    def test_window_older_than_365_days_is_a_usage_error(self) -> None:
        opener = FakeOpener({})
        code, text = run_main(["--since", "2026-01-02", "--until", "2026-01-09"], self.KEY, opener,
                              now=datetime(2027, 2, 1, tzinfo=timezone.utc))
        self.assertEqual(code, 2)
        self.assertIn("365", text)
        self.assertEqual(opener.urls, [])


class AnthropicStatus(unittest.TestCase):
    def test_refresh_before_the_window_end_marks_the_source_and_subtotal_partial(self) -> None:
        opener = FakeOpener({"cost": {None: page([cost_row("2026-11-10", "100.000000")],
                                                 refreshed="2026-11-12T03:00:00Z")},
                             "usage": {None: page([], refreshed="2026-11-12T03:00:00Z")}})
        doc = anthropic_api.fetch(WINDOW, "k", opener=opener, now=NOW)
        self.assertEqual(doc["status"], "partial")
        self.assertTrue(any("2026-11-12T03:00:00Z" in n for n in doc["notes"]))
        built = report.build([doc])
        self.assertTrue(built["subtotals"]["billed"]["partial"])
        self.assertIn("PARTIAL", report.render(built))

    def test_one_unknown_chunk_of_two_is_partial(self) -> None:
        class ByChunk:
            def open(self, request, timeout=None):  # noqa: ANN001
                start = parse_qs(urlsplit(request.full_url).query)["starting_at"][0]
                if start.startswith("2026-09-01"):
                    return FakeResponse(page([], refreshed=None))
                return FakeResponse(page([cost_row("2026-10-05", "100.000000")]))

        window = spend_common.parse_window(since="2026-09-01", until="2026-11-01", now=NOW)
        doc = anthropic_api.fetch(window, "k", opener=ByChunk(), now=NOW)
        self.assertEqual(doc["status"], "partial")

    def test_non_usd_currency_is_not_priced(self) -> None:
        row = cost_row("2026-11-10", "100.000000")
        row["cost"]["currency"] = "EUR"
        doc = anthropic_api.fetch(WINDOW, "k", opener=FakeOpener({"cost": {None: page([row])}, **EMPTY_USAGE}),
                                  now=NOW)
        self.assertEqual([r["usd"] for r in doc["rows"] if r["counts_toward_total"]], [None])
        self.assertNotIn("billed", report.build([doc])["subtotals"])


class AnthropicTransport(unittest.TestCase):
    def test_redirect_is_refused_and_the_key_is_not_resent(self) -> None:
        with local_server(redirect=True) as server:
            client = anthropic_api.Client(LONG_KEY, f"http://127.0.0.1:{server.server_port}", sleep=lambda s: None)
            with self.assertRaises(anthropic_api.ApiError) as ctx:
                client.get("cost", [])
        self.assertIn("redirect", str(ctx.exception))
        self.assertEqual([p for p, _ in _RecordKey.seen if p == "/elsewhere"], [])

    def test_expired_cursor_restarts_the_chunk_from_page_one(self) -> None:
        class Expire(FakeOpener):
            expired = False

            def open(self, request, timeout=None):  # noqa: ANN001
                if "page=p2" in request.full_url and not self.expired:
                    self.expired = True
                    raise urllib.error.HTTPError(request.full_url, 410, "gone", {}, io.BytesIO(b"{}"))
                return super().open(request, timeout)

        opener = Expire({"cost": {None: page([cost_row("2026-11-10", "100.000000")], nxt="p2"),
                                  "p2": page([cost_row("2026-11-11", "200.000000")])}, **EMPTY_USAGE})
        doc = anthropic_api.fetch(WINDOW, "k", opener=opener, now=NOW, sleep=lambda s: None)
        self.assertEqual(sorted(r["day"] for r in doc["rows"] if r["usd"] is not None), ["2026-11-10", "2026-11-11"])

    def test_a_4xx_is_not_retried(self) -> None:
        opener = HTTPErrorOpener("{}", code=400)
        client = anthropic_api.Client("k", sleep=lambda s: None, opener=opener)
        with self.assertRaises(anthropic_api.ApiError):
            client.get("cost", [])
        self.assertEqual(opener.calls, 1)


class ReportRules(unittest.TestCase):
    def test_unknown_source_rows_are_never_counted(self) -> None:
        doc = doc_with("anthropic_api", "billed", "5.00")
        doc["status"] = "unknown"
        built = report.build([doc])
        self.assertEqual(built["subtotals"], {})
        self.assertTrue(any("UNKNOWN" in line for line in built["not_in_any_subtotal"]))

    def test_unpriced_counting_row_is_listed_not_summed_as_zero(self) -> None:
        row = spend_common.make_row("aws_bedrock", usd=None, usd_basis="billed", service="Amazon Bedrock")
        built = report.build([spend_common.make_doc("aws_bedrock", WINDOW, [row], fetched_at=NOW)])
        self.assertNotIn("billed", built["subtotals"])
        self.assertTrue(any("unpriced" in line for line in built["not_in_any_subtotal"]))

    def test_partial_source_marks_its_subtotal_partial(self) -> None:
        doc = doc_with("aws_bedrock", "billed", "5.00")
        doc["status"] = "partial"
        self.assertTrue(report.build([doc])["subtotals"]["billed"]["partial"])

    def test_display_rounds_half_up(self) -> None:
        text = report.render(report.build([doc_with("aws_bedrock", "billed", "0.125")]))
        self.assertIn("0.13", text)
        self.assertNotIn("0.12 ", text)


def write_transcript(root: Path, name: str, lines: list[str], mtime: datetime | None = None) -> Path:
    path = root / "p" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")
    if mtime is not None:
        os.utime(path, (mtime.timestamp(), mtime.timestamp()))
    return path


class LocalWindowAndChoice(unittest.TestCase):
    def test_messages_count_only_the_window(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            write_transcript(Path(tmp), "s.jsonl", [
                transcript_line("in", "claude-opus-5", 1),
                transcript_line("before", "claude-opus-5", 1, ts="2026-11-01T00:00:00Z")])
            doc = claude_code_local.scan(Path(tmp), WINDOW, PRICES)
        self.assertEqual(doc["meta"]["messages"], 1)

    def test_duplicate_id_keeps_the_copy_with_most_output_whatever_the_file_order(self) -> None:
        # a.jsonl sorts first; "last line wins" across files took the smaller, earlier copy from b.jsonl
        with tempfile.TemporaryDirectory() as tmp:
            write_transcript(Path(tmp), "a.jsonl", [transcript_line("m1", "claude-opus-5", 9)])
            write_transcript(Path(tmp), "b.jsonl", [transcript_line("m1", "claude-opus-5", 5)])
            doc = claude_code_local.scan(Path(tmp), WINDOW, PRICES)
        self.assertEqual([r["tokens"]["output"] for r in doc["rows"]], [9])

    def test_window_end_is_exclusive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            write_transcript(Path(tmp), "s.jsonl", [
                transcript_line("first", "claude-opus-5", 3, ts="2026-11-10T00:00:00Z"),
                transcript_line("at_end", "claude-opus-5", 4, ts="2026-11-17T00:00:00Z")])
            doc = claude_code_local.scan(Path(tmp), WINDOW, PRICES)
        self.assertEqual(sum(r["tokens"]["output"] for r in doc["rows"]), 3)

    def test_file_last_written_inside_the_window_is_read(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            write_transcript(Path(tmp), "s.jsonl", [transcript_line("m", "claude-opus-5", 3)],
                             mtime=datetime(2026, 11, 12, 11, tzinfo=timezone.utc))
            doc = claude_code_local.scan(Path(tmp), WINDOW, PRICES)
        self.assertEqual(sum(r["tokens"]["output"] for r in doc["rows"]), 3)

    def test_prompt_over_the_tier_cap_is_flagged(self) -> None:
        capped = {"models": {"claude-opus-5": {**PRICES["models"]["claude-opus-5"], "tier_max_prompt_tokens": 100}}}
        with tempfile.TemporaryDirectory() as tmp:
            write_transcript(Path(tmp), "s.jsonl", [transcript_line("m", "claude-opus-5", 3)])
            doc = claude_code_local.scan(Path(tmp), WINDOW, capped)
        self.assertTrue(any(n.startswith("price_tier_exceeded") for n in doc["notes"]))


class FakeSfResult:
    def __init__(self, rows: list) -> None:
        self.rows = rows

    def as_dicts(self) -> list:
        return self.rows


class FakeSfClient:
    """Answers the metering query with ``metering`` and every attribution query with no rows."""

    def __init__(self, metering: list) -> None:
        self.metering, self.statements = metering, []

    def run(self, sql: str, binds: list) -> list:
        self.statements.append(sql)
        return [FakeSfResult(self.metering if "metering_daily_history" in sql.lower() else [])]


def metering_row(credits: object, offset: object = "+00:00") -> dict:
    return {"USAGE_DAY": "2026-11-10", "SERVICE_TYPE": "AI_SERVICES", "CREDITS_BILLED": credits,
            "CREDITS_USED": credits, "DAY_UTC_OFFSET": offset}


class CortexStatus(unittest.TestCase):
    """fetch() with the real snowflake-sql guard and binds, and a fake client (no Snowflake call)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.sf = snowflake_cortex._load_sf()

    def fetch(self, metering: list) -> tuple[dict, FakeSfClient]:
        client = FakeSfClient(metering)
        return snowflake_cortex.fetch(self.sf, client, WINDOW, rate=Decimal("2.00"), now=NOW), client

    def test_every_query_is_read_only_and_every_dollar_is_list(self) -> None:
        doc, client = self.fetch([metering_row(Decimal("3"))])
        self.assertEqual(len(client.statements), len(snowflake_cortex.QUERIES))
        self.assertEqual(doc["status"], "ok")
        self.assertEqual({r["usd_basis"] for r in doc["rows"]}, {"list"})
        self.assertEqual([Decimal(r["usd"]) for r in doc["rows"]], [Decimal("6.00")])

    def test_empty_metering_is_unknown_not_zero(self) -> None:
        doc, _ = self.fetch([])
        self.assertEqual(doc["status"], "unknown")
        text = report.render(report.build([doc]))
        self.assertIn("UNKNOWN", text)
        self.assertNotIn("0.00", text)

    def test_null_credits_billed_is_unpriced_not_zero(self) -> None:
        doc, _ = self.fetch([metering_row(None), {**metering_row(Decimal("1")), "SERVICE_TYPE": "CORTEX_CODE_CLI"}])
        null_row = next(r for r in doc["rows"] if r["service"] == "AI_SERVICES")
        self.assertIsNone(null_row["usd"])
        self.assertIsNone(null_row["credits"])
        self.assertEqual(doc["status"], "partial")
        built = report.build([doc])
        self.assertEqual(Decimal(built["subtotals"]["list"]["usd"]), Decimal("2.00"))
        self.assertTrue(any("AI_SERVICES" in line for line in built["not_in_any_subtotal"]))

    def test_session_time_zone_days_are_labelled_not_passed_off_as_utc(self) -> None:
        doc, _ = self.fetch([metering_row(Decimal("3"), offset="-08:00")])
        self.assertEqual(doc["status"], "partial")
        self.assertTrue(any("-08:00" in n and "not UTC" in n for n in doc["notes"]))
        self.assertTrue(report.build([doc])["subtotals"]["list"]["partial"])


if __name__ == "__main__":
    unittest.main()
