"""Offline tests for the ai-spend fetchers and report. Synthetic fixtures only: no network, no credentials.
Run: cd skills/ai-spend/scripts && python3 -m unittest test_ai_spend -v"""

from __future__ import annotations

import contextlib
import http.server
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
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
        self.assertEqual(cost_calls[0]["Filter"]["Dimensions"]["Values"], names[:3])
        self.assertEqual(doc["meta"]["ce_requests"], 3)
        self.assertIn("3", stderr.getvalue())
        self.assertEqual([Decimal(r["usd"]) for r in doc["rows"]], [Decimal("1.2345678901")] * 2)
        self.assertEqual(doc["rows"][0]["model"], "Claude Sonnet 5.5")


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


if __name__ == "__main__":
    unittest.main()
