"""Offline tests for sf.py: the safety guard, token reading, bindings, decoding and the HTTP client (with a fake
opener). Run: python3 -m unittest ~/.claude/skills/snowflake-sql/test_sf.py -v"""

from __future__ import annotations

import gzip
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from decimal import Decimal
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sf  # noqa: E402

TOKEN = "ver:1-hint:123-SECRETTOKENVALUE"


class Guard(unittest.TestCase):
    def kinds(self, sql: str) -> list[str]:
        return [sf.classify(s) for s in sf.split_statements(sql)]

    def test_reads_need_no_flag(self) -> None:
        for sql in ("select 1", "SHOW TABLES", "describe table t", "desc view v", "EXPLAIN select 1",
                    "with a as (select 1) select * from a", "list @stage", "  -- c\nselect 1"):
            self.assertEqual(self.kinds(sql), ["read"], sql)

    def test_writes_need_write(self) -> None:
        for sql in ("insert into t values (1)", "create table t (a int)", "grant select on t to role r",
                    "alter table t add column c int", "copy into t from @s"):
            self.assertEqual(self.kinds(sql), ["write"], sql)
            with self.assertRaises(sf.Refused):
                sf.guard(sql, write=False, destructive=False)
            sf.guard(sql, write=True, destructive=False)

    def test_destructive_needs_both_flags(self) -> None:
        for sql in ("drop table t", "truncate table t", "delete from t where a = 1", "create or replace table t (a int)",
                    "alter table t drop column c", "alter table a swap with b", "alter table a rename to b",
                    "update t set a = 1", "merge into t using s on t.a = s.a when matched then delete",
                    "revoke select on t from role r", "undrop table t", "remove @s",
                    "with s as (select 1) delete from t using s"):
            self.assertEqual(self.kinds(sql), ["destructive"], sql)
            with self.assertRaises(sf.Refused):
                sf.guard(sql, write=True, destructive=False)
            with self.assertRaises(sf.Refused):
                sf.guard(sql, write=False, destructive=True)
            sf.guard(sql, write=True, destructive=True)

    def test_keywords_inside_literals_and_comments_do_not_count(self) -> None:
        self.assertEqual(self.kinds("select 'drop table t; delete from x' as s"), ["read"])
        self.assertEqual(self.kinds('select 1 as "DROP"'), ["read"])
        self.assertEqual(self.kinds("select 1 /* drop table t; */"), ["read"])
        self.assertEqual(self.kinds("select 'it''s; drop' from t"), ["read"])
        self.assertEqual(self.kinds("select $$ ; drop table t; $$"), ["read"])

    def test_a_hidden_second_statement_is_seen(self) -> None:
        self.assertEqual(self.kinds("select 1; drop table t"), ["read", "destructive"])
        with self.assertRaises(sf.Refused):
            sf.guard("select 1; drop table t", write=False, destructive=False)
        self.assertEqual(self.kinds("explain select 1; delete from t"), ["read", "destructive"])

    def test_spend_security_and_account_changes_need_destructive(self) -> None:
        """Reported by the snowflake-tool session, 2026-10-19 (each passed with --write alone, reproduced)."""
        for sql in ("ALTER TASK DQ_AI_ACCELERATOR.APP.TSK_RUN_PIPELINE RESUME", "EXECUTE TASK APP.T",
                    "alter warehouse compute_wh resume", "ALTER WAREHOUSE W SET WAREHOUSE_SIZE='XLARGE'",
                    "ALTER WAREHOUSE W SET MAX_CLUSTER_COUNT = 10", "ALTER COMPUTE POOL P RESUME",
                    "ALTER ALERT A RESUME", "ALTER USER X SET DEFAULT_ROLE=ACCOUNTADMIN", "ALTER ACCOUNT SET X = 1",
                    "ALTER NETWORK POLICY NP SET ALLOWED_IP_LIST = ('0.0.0.0/0')",
                    "ALTER USER X ADD PROGRAMMATIC ACCESS TOKEN T", "GRANT ROLE ACCOUNTADMIN TO USER X",
                    "GRANT OWNERSHIP ON TABLE T TO ROLE R", "INSERT OVERWRITE INTO T SELECT 1"):
            self.assertEqual(self.kinds(sql), ["destructive"], sql)
        self.assertEqual(self.kinds("ALTER TASK T SUSPEND"), ["write"])
        self.assertEqual(self.kinds("ALTER WAREHOUSE W SUSPEND"), ["write"])
        self.assertEqual(self.kinds("GRANT SELECT ON TABLE T TO ROLE R"), ["write"])

    def test_empty_sql_is_a_usage_error(self) -> None:
        with self.assertRaises(sf.UsageError):
            sf.guard("  ; -- nothing\n", write=True, destructive=True)


PROTECTED = ("DQ_AI_ACCELERATOR.DEMO", "DQ_AI_ACCELERATOR.DQ_METRICS", "DQ_AI_ACCELERATOR.PUBLIC")


class Protected(unittest.TestCase):
    """A write that names DEMO, DQ_METRICS or PUBLIC of DQ_AI_ACCELERATOR is refused, whatever the flags."""

    def refused(self, sql: str, database: str | None = None, schema: str | None = None) -> bool:
        try:
            sf.guard(sql, write=True, destructive=True, protected=PROTECTED, database=database, schema=schema)
        except sf.Refused:
            return True
        return False

    def test_qualified_quoted_and_session_relative_names_are_caught(self) -> None:
        self.assertTrue(self.refused("INSERT INTO DQ_AI_ACCELERATOR.DEMO.X VALUES (1)"))
        self.assertTrue(self.refused('insert into "DQ_AI_ACCELERATOR"."DEMO".X values (1)'))
        self.assertTrue(self.refused("delete from dq_ai_accelerator . dq_metrics.x"))
        self.assertTrue(self.refused("INSERT INTO DEMO.X VALUES (1)", database="dq_ai_accelerator"))
        self.assertTrue(self.refused("CREATE TABLE X (A INT)", database="DQ_AI_ACCELERATOR", schema="public"))
        self.assertTrue(self.refused("DROP SCHEMA IF EXISTS DQ_AI_ACCELERATOR.PUBLIC"))
        self.assertTrue(self.refused("INSERT INTO DQ_AI_ACCELERATOR.APP.Y SELECT * FROM DQ_AI_ACCELERATOR.DEMO.X"))

    def test_other_schemas_reads_and_lookalikes_pass(self) -> None:
        self.assertFalse(self.refused("INSERT INTO DQ_AI_ACCELERATOR.APP.X VALUES (1)"))
        self.assertFalse(self.refused("INSERT INTO DEMO.X VALUES (1)"))  # no session database: not DQ_AI_ACCELERATOR
        self.assertFalse(self.refused("INSERT INTO DQ_AI_ACCELERATOR.DEMO_V2.X VALUES (1)"))
        # A protected name inside a string literal counts (it may be IDENTIFIER('...') or EXECUTE IMMEDIATE '...'):
        # the safe direction, decided after the 2026-10-19 validation.
        self.assertTrue(self.refused("INSERT INTO DQ_AI_ACCELERATOR.APP.X VALUES ('DQ_AI_ACCELERATOR.DEMO')"))
        sf.guard("SELECT * FROM DQ_AI_ACCELERATOR.DEMO.X", write=False, destructive=False, protected=PROTECTED)

    def test_the_cli_refuses_with_the_built_in_list_even_without_a_config(self) -> None:
        argv = ["sql", "INSERT INTO DQ_AI_ACCELERATOR.DEMO.X VALUES (1)", "--write", "--destructive", "--dry-run"]
        self.assertEqual(sf.main(argv + ["--config", "/nonexistent.json"]), sf.EXIT_REFUSED)
        self.assertEqual(sf.main(argv), sf.EXIT_REFUSED)


class Identifiers(unittest.TestCase):
    def test_context_names_are_resolved_as_sql_would(self) -> None:
        c = sf.Client("https://a-b.snowflakecomputing.com", TOKEN, warehouse="compute_wh", role='"MixedRole"',
                      database="Dq_Ai_Accelerator")
        self.assertEqual(c.context, {"warehouse": "COMPUTE_WH", "role": "MixedRole", "database": "DQ_AI_ACCELERATOR"})


class ValidatorFindings(unittest.TestCase):
    """Opus adversarial validation, 2026-10-19: each case got past the guard or lost data, reproduced first."""

    def kinds(self, sql: str) -> list[str]:
        return [sf.classify(s) for s in sf.split_statements(sql)]

    def test_b1_the_flow_operator_starts_a_new_statement(self) -> None:
        self.assertEqual(self.kinds("SELECT 1 ->> DROP TABLE DQ_AI_ACCELERATOR.DEMO.T"), ["read", "destructive"])
        self.assertEqual(self.kinds("SELECT 1 AS X ->> SELECT 22 AS HIDDEN"), ["read", "read"])
        self.assertEqual(self.kinds("SELECT '->>' AS A"), ["read"])
        with self.assertRaises(sf.Refused):
            sf.guard("SELECT 1 ->> DROP TABLE T", write=False, destructive=False)

    def test_b2_the_lexer_splits_where_snowflake_splits(self) -> None:
        for sql in ("SELECT 1 AS a$$; SELECT 22 AS HIDDEN; --$$", "SELECT 1 AS A --c\r; SELECT 22 AS HIDDEN",
                    "LIST @~/zzq//q; SELECT 22 AS HIDDEN", "SELECT 1 AS A //c\r; SELECT 22 AS HIDDEN"):
            self.assertEqual(len(sf.split_statements(sql)), 2, repr(sql))
            self.assertEqual(len(sf.split_script(sql)), 2, repr(sql))
        self.assertEqual(self.kinds("SELECT $$ ; drop $$ AS A"), ["read"])  # a real $$ body still hides its text

    def test_b3_a_system_function_with_side_effects_needs_a_person(self) -> None:
        for sql in ("SELECT SYSTEM$CANCEL_ALL_QUERIES(1)", "select system$send_email('i', 'a@b.c', 's', 'b')",
                    "SELECT SYSTEM$TASK_DEPENDENTS_ENABLE('T')", "WITH A AS (SELECT 1) SELECT SYSTEM$ABORT_SESSION(1)"):
            self.assertEqual(self.kinds(sql), ["destructive"], sql)
        for sql in ("SELECT SYSTEM$WAIT(1)", "SELECT SYSTEM$CLUSTERING_INFORMATION('T')", "SELECT SYSTEM$TYPEOF(1)",
                    "SELECT SYSTEM$STREAM_HAS_DATA('S')", "SELECT SYSTEM$PIPE_STATUS('P')"):
            self.assertEqual(self.kinds(sql), ["read"], sql)

    def test_statements_whose_effect_cannot_be_read_need_destructive(self) -> None:
        for sql in ("EXECUTE IMMEDIATE 'DROP TABLE T'", "EXECUTE IMMEDIATE $$DROP TABLE T$$", "CALL P()",
                    "BEGIN DROP TABLE T; END", "DECLARE X INT; BEGIN RETURN 1; END", "CREATE OR ALTER TABLE T (A INT)",
                    "UPDATE T SET A=1 WHERE TRUE", "UPDATE T SET A=(SELECT 1 FROM U WHERE 1=1)",
                    "ALTER TABLE T SET DATA_RETENTION_TIME_IN_DAYS=0", "ALTER TABLE T UNSET COMMENT",
                    "COPY INTO @S FROM T OVERWRITE = TRUE"):
            self.assertIn("destructive", self.kinds(sql), sql)

    def test_protected_names_in_strings_variables_and_use_are_caught(self) -> None:
        protected = sf.DEFAULT_PROTECTED
        for sql in ("DELETE FROM IDENTIFIER('DQ_AI_ACCELERATOR.DEMO.T')",
                    "EXECUTE IMMEDIATE 'DELETE FROM DQ_AI_ACCELERATOR.DEMO.T'",
                    "USE DATABASE DQ_AI_ACCELERATOR; USE SCHEMA DEMO; DELETE FROM T",
                    "USE SCHEMA DQ_AI_ACCELERATOR.DQ_METRICS; INSERT INTO T VALUES (1)",
                    "SET S = 'X'; DELETE FROM IDENTIFIER($S)", "EXECUTE IMMEDIATE :STMT"):
            with self.assertRaises(sf.Refused, msg=sql):
                sf.guard(sql, write=True, destructive=True, protected=protected)
        sf.guard("USE DATABASE DQ_AI_ACCELERATOR; USE SCHEMA APP; DELETE FROM T", write=True, destructive=True,
                 protected=protected)

    def test_no_value_is_lost_in_decoding(self) -> None:
        self.assertEqual(sf.converter("time", 9)("3723.123456789"), "01:02:03.123456789")
        self.assertEqual(sf.converter("timestamp_ltz", 9)("1695945600.000000000"), "2023-09-29 00:00:00+00:00")
        self.assertEqual(sf.converter("variant", None)("0.12345678901234567890123"),
                         Decimal("0.12345678901234567890123"))
        self.assertEqual(sf.converter("variant", None)("1e400"), Decimal("1e400"))
        self.assertEqual(sf.converter("array", None)("[\n  1,\n  undefined\n]"), [1, None])
        self.assertEqual(sf.converter("variant", None)('"undefined"'), "undefined")
        # Snowflake stores PARSE_JSON('1e400') as an overflowed double and sends the token Infinity (live, 2026-10-19)
        for token in ("Infinity", "-Infinity", "NaN"):
            value = sf.converter("variant", None)(token)
            self.assertIsInstance(value, Decimal, token)
            out = io.StringIO()
            sf.render(sf.Result(["V"], ["variant"], [[value]], None), "json", None, 60, out)
            json.loads(out.getvalue())  # valid JSON: the value is a string

    def test_json_and_csv_output_stay_valid_and_keep_null_apart_from_empty(self) -> None:
        result = sf.Result(["A", "B"], ["variant", "text"], [[Decimal("1e400"), None], [{"x": Decimal("0.1")}, ""]],
                           None)
        out = io.StringIO()
        sf.render(result, "json", None, 60, out)
        self.assertEqual(json.loads(out.getvalue())[0]["A"], "1E+400")
        out = io.StringIO()
        sf.render(result, "csv", None, 60, out)
        self.assertEqual(out.getvalue().splitlines()[1:], ["1E+400,", '"{""x"": ""0.1""}",""'])


class ClassifyReport(unittest.TestCase):
    def test_the_report_agrees_with_the_guard(self) -> None:
        """The offline `classify` command must see what the guard sees (a ->> chain, USE across statements)."""
        chain = sf.classify_report("SELECT 1 ->> DROP TABLE T", sf.DEFAULT_PROTECTED, None, None)
        self.assertIn("destructive", chain[0])
        use = sf.classify_report("USE DATABASE DQ_AI_ACCELERATOR; USE SCHEMA DEMO; DELETE FROM T",
                                 sf.DEFAULT_PROTECTED, None, None)
        self.assertIn("REFUSED", use[2])
        hidden = sf.classify_report("SELECT 1 AS a$$; DROP TABLE T; --$$", sf.DEFAULT_PROTECTED, None, None)
        self.assertEqual(len([line for line in hidden if line.startswith("#")]), 2)  # plus the final guard: line
        self.assertIn("destructive", hidden[1])


class OutputValues(unittest.TestCase):
    """Reported by the onboarding session, 2026-10-19, reproduced live: FLOAT inf / -inf / nan made --format json
    invalid, and a VARIANT JSON null printed like a SQL NULL."""

    @staticmethod
    def strict(text: str) -> Any:
        def refuse(constant: str) -> Any:
            raise ValueError(constant)
        return json.loads(text, parse_constant=refuse)

    def test_non_finite_floats_are_strings_in_json_and_jsonl(self) -> None:
        result = sf.Result(["F"], ["real"], [[sf.converter("real", None)(t)] for t in ("inf", "-inf", "NaN")], None)
        for fmt in ("json", "jsonl"):
            out = io.StringIO()
            sf.render(result, fmt, None, 60, out)
            text = out.getvalue()
            rows = self.strict(text) if fmt == "json" else [self.strict(line) for line in text.splitlines()]
            self.assertEqual([r["F"] for r in rows], ["Infinity", "-Infinity", "NaN"], fmt)

    def test_a_json_null_prints_apart_from_a_sql_null(self) -> None:
        jn = sf.converter("variant", None)("null")
        result = sf.Result(["JN", "SN"], ["variant", "variant"], [[jn, None]], None)
        table = io.StringIO()
        sf.render(result, "table", None, 60, table)
        self.assertEqual(table.getvalue().splitlines()[2].split(), ["null", "NULL"])
        csv_out = io.StringIO()
        sf.render(result, "csv", None, 60, csv_out)
        self.assertEqual(csv_out.getvalue().splitlines()[1], "null,")
        js = io.StringIO()
        sf.render(result, "json", None, 60, js)
        self.assertEqual(self.strict(js.getvalue()), [{"JN": None, "SN": None}])
        self.assertFalse(jn)  # it reads as false, like None, for library callers that test truthiness


class Round2(unittest.TestCase):
    """Second Opus adversarial validation, 2026-10-19: each case reproduced before the fix."""

    P = sf.DEFAULT_PROTECTED

    def verdict(self, sql: str, database: str | None = None) -> str:
        for write, destructive in ((False, False), (True, False), (True, True)):
            try:
                sf.guard(sql, write=write, destructive=destructive, protected=self.P, database=database)
                return ("none", "write", "destructive")[write + destructive]
            except sf.Refused:
                continue
        return "refused"

    def test_b1_a_quote_inside_a_stage_path_does_not_hide_a_chain(self) -> None:
        self.assertEqual(self.verdict('LIST @~/a"b ->> DELETE FROM APP.CUSTOMER --"'), "destructive")
        self.assertEqual(self.verdict('LIST @"My Stage"/x'), "none")
        self.assertEqual(self.verdict('LIST @DB."My Stage"/x'), "none")

    def test_b2_a_system_function_named_through_quotes_or_identifier_needs_a_person(self) -> None:
        for sql in ('SELECT "SYSTEM$CANCEL_ALL_QUERIES"(1)', "SELECT IDENTIFIER('SYSTEM$CANCEL_ALL_QUERIES')(1)",
                    "SELECT system$abort_session(1)"):
            self.assertEqual(self.verdict(sql), "destructive", sql)
        self.assertEqual(self.verdict('SELECT "SYSTEM$TYPEOF"(1)'), "none")

    def test_b3_to_b6_protected_schemas_reached_another_way_are_refused(self) -> None:
        for sql, db in (("DELETE FROM DQ_AI_ACCELERATOR..T", None),
                        ("DELETE FROM DQ_AI_ACCELERATOR./**/DEMO.CUSTOMER", None),
                        ("DELETE FROM DQ_AI_ACCELERATOR--x\n.DEMO.CUSTOMER", None),
                        ("ALTER DATABASE DQ_AI_ACCELERATOR SET DATA_RETENTION_TIME_IN_DAYS = 0", None),
                        ("CREATE OR REPLACE DATABASE DQ_AI_ACCELERATOR", None),
                        ("ALTER DATABASE OTHER SWAP WITH DQ_AI_ACCELERATOR", None),
                        ("GRANT ALL ON ALL TABLES IN DATABASE DQ_AI_ACCELERATOR TO ROLE R", None),
                        ("ALTER SCHEMA APP SWAP WITH DEMO", "DQ_AI_ACCELERATOR"),
                        ("EXECUTE IMMEDIATE 'DELETE FROM DEMO.CUSTOMER'", "DQ_AI_ACCELERATOR"),
                        ("DELETE FROM IDENTIFIER('DEMO.CUSTOMER')", "DQ_AI_ACCELERATOR"),
                        ("USE SCHEMA DQ_AI_ACCELERATOR.APP; EXECUTE IMMEDIATE $$DELETE FROM DEMO.CUSTOMER$$", None),
                        ("DELETE FROM IDENTIFIER(?)", None),
                        ("EXECUTE IMMEDIATE $$ BEGIN DELETE FROM IDENTIFIER($T); END $$", None)):
            self.assertEqual(self.verdict(sql, db), "refused", sql)
        self.assertEqual(self.verdict("DELETE FROM DQ_AI_ACCELERATOR.APP.T"), "destructive")
        self.assertEqual(self.verdict("INSERT INTO APP.T VALUES (1)", "DQ_AI_ACCELERATOR"), "write")

    def test_spend_security_and_removal_that_only_needed_write_now_need_a_person(self) -> None:
        for sql in ("CREATE WAREHOUSE W", "CREATE DYNAMIC TABLE D TARGET_LAG='1 minute' WAREHOUSE=W AS SELECT 1",
                    "ALTER DYNAMIC TABLE D RESUME", "ALTER MATERIALIZED VIEW M RESUME",
                    "ALTER PIPE P SET PIPE_EXECUTION_PAUSED = FALSE", "ALTER TABLE T ADD SEARCH OPTIMIZATION",
                    "ALTER TABLE T CLUSTER BY (A)", "ALTER WAREHOUSE W SET RESOURCE_MONITOR = NULL",
                    "CREATE RESOURCE MONITOR RM WITH CREDIT_QUOTA = 1000", "CREATE COMPUTE POOL P MIN_NODES=1",
                    "COPY INTO T FROM @S PURGE = TRUE", "GRANT MANAGE GRANTS ON ACCOUNT TO ROLE R",
                    "GRANT ROLE SYSADMIN TO ROLE R", "CREATE USER U", "ALTER SHARE S ADD ACCOUNTS = X",
                    "CREATE EXTERNAL ACCESS INTEGRATION I ALLOWED_NETWORK_RULES = (R) ENABLED = TRUE",
                    "ALTER TABLE T MODIFY COLUMN C SET MASKING POLICY M FORCE",
                    "WITH P AS PROCEDURE () RETURNS INT LANGUAGE SQL AS $$ SELECT 1 $$ CALL P()"):
            self.assertEqual(self.verdict(sql), "destructive", sql)

    def test_classify_report_ends_with_the_guards_own_verdict(self) -> None:
        for sql in ("USE DATABASE DQ_AI_ACCELERATOR ->> SELECT 1; DELETE FROM DEMO.CUSTOMER",
                    "SELECT * FROM DQ_AI_ACCELERATOR.DEMO.T; INSERT INTO APP.T VALUES (1)",
                    "SELECT IDENTIFIER($T); INSERT INTO APP.T VALUES (1)"):
            report = sf.classify_report(sql, self.P, None, None)
            self.assertTrue(report[-1].startswith("guard: REFUSED"), (sql, report))
        self.assertTrue(sf.classify_report("SELECT 1", self.P, None, None)[-1].startswith("guard: runs with (no flag)"))

    def test_cancel_changes_snowflake_so_it_needs_write(self) -> None:
        self.assertEqual(sf.main(["cancel", "01b2c3d4-0000-1111-2222-333344445555", "--config", "/nonexistent.json"]),
                         sf.EXIT_REFUSED)

    def test_a_dollar_inside_double_quotes_after_a_single_quote_still_expands(self) -> None:
        self.assertTrue(sf._expands('"a\'$HOME\'"'))
        self.assertFalse(sf._expands("'a$b'"))
        self.assertFalse(sf._expands('"a\\$b"'))


class Hardening(unittest.TestCase):
    def rc(self, text: str) -> str:
        fh = tempfile.NamedTemporaryFile("w", suffix=".rc", delete=False)
        fh.write(text)
        fh.close()
        self.addCleanup(os.unlink, fh.name)
        return fh.name

    def test_rc_values_that_expand_after_a_quote_or_use_smart_quotes_are_refused(self) -> None:
        for line in ("export TMP_PAT='abc'$HOME", "export TMP_PAT='abc'$(touch x)", "export TMP_PAT='abc'`id`",
                     "export TMP_PAT=\u2018abc\u2019", "export TMP_PAT=\u201cabc\u201d"):
            with self.assertRaises(sf.UsageError, msg=line):
                sf.token_from_rc("TMP_PAT", [self.rc(line + "\n")])

    def test_rc_files_are_read_in_zsh_order_and_bash_files_are_not(self) -> None:
        self.assertEqual(sf.RC_FILES, ("~/.zshenv", "~/.zprofile", "~/.zshrc", "~/.zlogin"))

    def test_a_reset_connection_is_retried_with_the_same_request_id(self) -> None:
        ok = {"statementHandle": HANDLE, "resultSetMetaData": {"numRows": 0, "rowType": META["rowType"]}, "data": []}
        opener = FakeOpener([ConnectionResetError(54, "reset"), FakeResponse(ok)])
        client(opener).run("select n")
        self.assertIn("retry=true", opener.requests[1].full_url)

    def test_a_negative_max_rows_is_a_usage_error(self) -> None:
        self.assertEqual(sf.main(["sql", "select 1", "--max-rows", "-1", "--dry-run"]), sf.EXIT_USAGE)


class Token(unittest.TestCase):
    def rc(self, text: str) -> str:
        fh = tempfile.NamedTemporaryFile("w", suffix=".rc", delete=False)
        fh.write(text)
        fh.close()
        self.addCleanup(os.unlink, fh.name)
        return fh.name

    def test_plain_and_quoted_exports_are_read_and_the_last_wins(self) -> None:
        path = self.rc("export OTHER=1\nexport TMP_PAT=first\nexport TMP_PAT='second'\n")
        self.assertEqual(sf.token_from_rc("TMP_PAT", [path]), "second")
        self.assertEqual(sf.token_from_rc("TMP_PAT", [self.rc('TMP_PAT="abc"  # note\n')]), "abc")

    def test_a_value_the_shell_would_expand_is_refused(self) -> None:
        for line in ('export TMP_PAT="$(security find-generic-password -w)"', "export TMP_PAT=$OTHER",
                     "export TMP_PAT=`cat f`"):
            with self.assertRaises(sf.UsageError, msg=line):
                sf.token_from_rc("TMP_PAT", [self.rc(line + "\n")])
        self.assertEqual(sf.token_from_rc("TMP_PAT", [self.rc("export TMP_PAT='a$b'\n")]), "a$b")

    def test_missing_name_and_missing_file_give_none(self) -> None:
        self.assertIsNone(sf.token_from_rc("TMP_PAT", [self.rc("export X=1\n"), "/nonexistent/rc"]))

    def test_the_environment_wins_over_the_rc_file(self) -> None:
        os.environ["SF_TEST_TOKEN_VAR"] = "from-env"
        self.addCleanup(os.environ.pop, "SF_TEST_TOKEN_VAR")
        self.assertEqual(sf.resolve_token("SF_TEST_TOKEN_VAR"), "from-env")


class Origin(unittest.TestCase):
    def test_only_a_bare_https_snowflake_origin_is_accepted(self) -> None:
        self.assertEqual(sf.check_origin("https://a-b.snowflakecomputing.com/"), "https://a-b.snowflakecomputing.com")
        for bad in ("http://a-b.snowflakecomputing.com", "https://a-b.snowflakecomputing.com/x",
                    "https://evil.example.com", "https://a-b.snowflakecomputing.com.evil.com",
                    "https://a-b.snowflakecomputing.com?x=1"):
            with self.assertRaises(sf.UsageError, msg=bad):
                sf.check_origin(bad)


class Decode(unittest.TestCase):
    def test_numbers_keep_their_precision(self) -> None:
        self.assertEqual(sf.converter("fixed", 0)("12345678901234567890123"), 12345678901234567890123)
        self.assertEqual(sf.converter("fixed", 2)("0.10"), Decimal("0.10"))
        self.assertEqual(sf.converter("real", None)("1.5"), 1.5)

    def test_times_dates_and_variants(self) -> None:
        self.assertEqual(sf.converter("date", None)("19632"), "2023-10-02")
        self.assertEqual(sf.converter("timestamp_ntz", 9)("1695945600.123456789"), "2023-09-29 00:00:00.123456789")
        self.assertEqual(sf.converter("timestamp_ntz", 9)("-1.500000000"), "1969-12-31 23:59:58.5")
        self.assertEqual(sf.converter("timestamp_tz", 9)("1695945600.000000000 1800"),
                         "2023-09-29 06:00:00+06:00")
        self.assertEqual(sf.converter("timestamp_tz", 9)("1695945600.000000000 1140"),
                         "2023-09-28 19:00:00-05:00")
        self.assertEqual(sf.converter("time", 9)("3723.5"), "01:02:03.5")
        self.assertEqual(sf.converter("variant", None)('{"a": [1, 2]}'), {"a": [1, 2]})
        self.assertTrue(sf.converter("boolean", None)("true"))


class Binds(unittest.TestCase):
    def test_each_type(self) -> None:
        self.assertEqual(sf.parse_bind("int:5"), {"type": "FIXED", "value": "5"})
        self.assertEqual(sf.parse_bind("plain"), {"type": "TEXT", "value": "plain"})
        self.assertEqual(sf.parse_bind("str:a:b"), {"type": "TEXT", "value": "a:b"})
        self.assertEqual(sf.parse_bind("null:"), {"type": "TEXT", "value": None})
        self.assertEqual(sf.parse_bind("num:1.50"), {"type": "FIXED", "value": "1.50"})
        self.assertEqual(sf.parse_bind("date:1970-01-02"), {"type": "DATE", "value": "86400000"})
        self.assertEqual(sf.parse_bind("ts:1970-01-01T00:00:01"), {"type": "TIMESTAMP_NTZ", "value": "1000000000"})
        self.assertEqual(sf.parse_bind("bool:TRUE"), {"type": "BOOLEAN", "value": "true"})

    def test_bad_values_are_usage_errors(self) -> None:
        for spec in ("int:x", "num:nan", "float:inf", "bool:maybe", "date:2026-13-01",
                     "ts:2026-01-01T00:00:00+02:00", "blob:00"):
            with self.assertRaises(sf.UsageError, msg=spec):
                sf.parse_bind(spec)


class FakeResponse(io.BytesIO):
    def __init__(self, payload: Any, status: int = 200, gz: bool = False) -> None:
        raw = json.dumps(payload).encode()
        super().__init__(gzip.compress(raw) if gz else raw)
        self.status = status
        self.headers = {"Content-Encoding": "gzip"} if gz else {}

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()


class FakeOpener:
    def __init__(self, replies: list[Any]) -> None:
        self.replies, self.requests = list(replies), []

    def open(self, request: Any, timeout: float = 0) -> Any:
        self.requests.append(request)
        reply = self.replies.pop(0)
        if isinstance(reply, BaseException):
            raise reply
        return reply


def http_error(status: int, payload: Any, headers: dict[str, str] | None = None) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://x", status, "err", headers or {}, io.BytesIO(json.dumps(payload).encode()))


META = {"numRows": 3, "rowType": [{"name": "N", "type": "fixed", "scale": 0}],
        "partitionInfo": [{"rowCount": 2}, {"rowCount": 1}]}
HANDLE = "01b2c3d4-0000-1111-2222-333344445555"


def client(opener: FakeOpener) -> sf.Client:
    return sf.Client("https://a-b.snowflakecomputing.com", TOKEN, opener=opener, sleep=lambda s: None, max_retries=2)


class Http(unittest.TestCase):
    def test_every_partition_is_fetched_and_decoded(self) -> None:
        opener = FakeOpener([
            FakeResponse({"code": "090001", "statementHandle": HANDLE, "resultSetMetaData": META,
                          "data": [["1"], ["2"]], "statementStatusUrl": f"/api/v2/statements/{HANDLE}"}),
            FakeResponse({"data": [["3"]]}, gz=True),
        ])
        [result] = client(opener).run("select n")
        self.assertEqual(result.rows, [[1], [2], [3]])
        self.assertIn("partition=1", opener.requests[1].full_url)
        first = opener.requests[0]
        self.assertEqual(first.get_header("Authorization"), f"Bearer {TOKEN}")
        self.assertEqual(json.loads(first.data)["parameters"]["QUERY_TAG"], sf.QUERY_TAG)

    def test_a_short_partition_raises_instead_of_returning_fewer_rows(self) -> None:
        opener = FakeOpener([
            FakeResponse({"statementHandle": HANDLE, "resultSetMetaData": META, "data": [["1"], ["2"]]}),
            FakeResponse({"data": []}),
        ])
        with self.assertRaises(sf.SfError) as caught:
            client(opener).run("select n")
        self.assertEqual(caught.exception.code, "truncated_result")
        no_total = {k: v for k, v in META.items() if k != "numRows"}  # the per-partition check alone
        opener = FakeOpener([
            FakeResponse({"statementHandle": HANDLE, "resultSetMetaData": no_total, "data": [["1"], ["2"]]}),
            FakeResponse({"data": []}),
        ])
        with self.assertRaises(sf.SfError) as caught:
            client(opener).run("select n")
        self.assertIn("partition 1", str(caught.exception))

    def test_a_retry_resends_the_same_request_id_with_retry_true(self) -> None:
        ok = {"statementHandle": HANDLE, "resultSetMetaData": {"numRows": 0, "rowType": META["rowType"]}, "data": []}
        opener = FakeOpener([http_error(503, {}), http_error(429, {}, {"Retry-After": "0"}), FakeResponse(ok)])
        client(opener).run("select n")
        urls = [r.full_url for r in opener.requests]
        ids = {u.split("requestId=")[1].split("&")[0] for u in urls}
        self.assertEqual(len(ids), 1)
        self.assertNotIn("retry=true", urls[0])
        self.assertTrue(all("retry=true" in u for u in urls[1:]))

    def test_retries_stop_and_a_non_retryable_error_is_not_retried(self) -> None:
        opener = FakeOpener([http_error(503, {})] * 3)
        with self.assertRaises(sf.SfError) as caught:
            client(opener).run("select 1")
        self.assertTrue(caught.exception.retryable)
        self.assertEqual(len(opener.requests), 3)
        opener = FakeOpener([http_error(422, {"code": "002003", "message": "Object does not exist"})])
        with self.assertRaises(sf.SfError) as caught:
            client(opener).run("select 1")
        self.assertEqual((caught.exception.code, len(opener.requests)), ("002003", 1))

    def test_the_token_is_scrubbed_from_errors_and_absent_from_repr(self) -> None:
        opener = FakeOpener([http_error(401, {"message": f"bad token {TOKEN}"})])
        c = client(opener)
        with self.assertRaises(sf.SfError) as caught:
            c.run("select 1")
        self.assertNotIn(TOKEN, str(caught.exception))
        self.assertIn("***", str(caught.exception))
        self.assertNotIn(TOKEN, repr(c))

    def test_a_running_statement_is_polled_until_done(self) -> None:
        done = {"statementHandle": HANDLE, "resultSetMetaData": {"numRows": 1, "rowType": META["rowType"]},
                "data": [["7"]]}
        opener = FakeOpener([FakeResponse({"code": sf.IN_PROGRESS, "statementHandle": HANDLE,
                                           "statementStatusUrl": f"/api/v2/statements/{HANDLE}"}, status=202),
                             FakeResponse({"code": sf.IN_PROGRESS, "statementHandle": HANDLE}, status=202),
                             FakeResponse(done)])
        [result] = client(opener).run("select 7")
        self.assertEqual(result.rows, [[7]])

    def test_a_status_url_outside_the_statements_path_is_refused(self) -> None:
        opener = FakeOpener([FakeResponse({"code": sf.IN_PROGRESS, "statementStatusUrl": "/other/path"})])
        with self.assertRaises(sf.SfError) as caught:
            client(opener).run("select 1")
        self.assertEqual(caught.exception.code, "unsafe_url")

    def test_a_handle_must_look_like_a_handle(self) -> None:
        with self.assertRaises(sf.UsageError):
            client(FakeOpener([])).status("../../oauth")


class Commands(unittest.TestCase):
    def sql_of(self, *argv: str) -> str:
        return sf.build_sql(sf.parser().parse_args(list(argv)))[0]

    def test_generated_sql(self) -> None:
        self.assertEqual(self.sql_of("ls", "tables", "--in", "DB.S", "--like", "N%"), "SHOW TABLES LIKE 'N%' IN SCHEMA DB.S")
        self.assertEqual(self.sql_of("ls", "columns", "--in", "DB.S.T"), "SHOW COLUMNS IN TABLE DB.S.T")
        self.assertEqual(self.sql_of("ls", "schemas", "--in", "DB"), "SHOW SCHEMAS IN DATABASE DB")
        self.assertEqual(self.sql_of("describe", "DB.S.T"), "DESCRIBE TABLE DB.S.T")
        self.assertIn("GET_DDL('VIEW', 'DB.S.V', TRUE)", self.sql_of("ddl", "DB.S.V", "--kind", "view"))
        self.assertEqual(self.sql_of("grants", "--to-role", "R1"), "SHOW GRANTS TO ROLE R1")
        self.assertEqual(self.sql_of("grants", "--on", "TABLE DB.S.T"), "SHOW GRANTS ON TABLE DB.S.T")

    def test_names_that_could_inject_are_refused(self) -> None:
        for argv in (("describe", "t; drop table x"), ("ddl", "t')--"), ("grants", "--to-role", "r; drop"),
                     ("ls", "tables", "--in", "db; drop"), ("describe", "t", "--kind", "table; drop")):
            with self.assertRaises(sf.UsageError, msg=argv):
                sf.build_sql(sf.parser().parse_args(list(argv)))

    def test_like_is_quoted(self) -> None:
        self.assertEqual(self.sql_of("ls", "tables", "--like", "a'b"), "SHOW TABLES LIKE 'a''b'")

    def test_the_cli_refuses_a_write_before_any_network_call(self) -> None:
        self.assertEqual(sf.main(["sql", "drop table t", "--config", "/nonexistent.json"]), sf.EXIT_REFUSED)
        self.assertEqual(sf.main(["sql", "select 1; select 2", "--config", "/nonexistent.json"]), sf.EXIT_USAGE)
        self.assertEqual(sf.main(["sql", "insert into t values (1)", "--write", "--dry-run"]), sf.EXIT_OK)



class Merged(unittest.TestCase):
    """Features merged in from the parallel snowflake-tool (owner, 2026-10-19: "merge features from both")."""

    def sql_of(self, *argv: str) -> str:
        return sf.build_sql(sf.parser().parse_args(list(argv)))[0]

    def test_every_subcommand_prints_its_help(self) -> None:
        for name in ("whoami", "sql", "explain", "submit", "ls", "describe", "ddl", "grants", "history", "credits",
                     "status", "cancel", "sample", "count", "classify"):
            with self.assertRaises(SystemExit) as ctx, open(os.devnull, "w") as null:
                stdout, sys.stdout = sys.stdout, null
                try:
                    sf.parser().parse_args([name, "--help"])
                finally:
                    sys.stdout = stdout
            self.assertEqual(ctx.exception.code, 0, name)

    def test_sample_and_count_are_generated_and_bounded(self) -> None:
        self.assertEqual(self.sql_of("sample", "DB.S.T", "-n", "5"), "SELECT * FROM DB.S.T LIMIT 5")
        self.assertEqual(self.sql_of("count", "DB.S.T"), "SELECT COUNT(*) AS ROW_COUNT FROM DB.S.T")
        for argv in (("sample", "t; drop table x"), ("count", "t--"), ("sample", "T", "-n", "0"),
                     ("sample", "T", "-n", "100001")):
            with self.assertRaises(sf.UsageError, msg=argv):
                sf.build_sql(sf.parser().parse_args(list(argv)))

    def test_more_show_kinds(self) -> None:
        self.assertEqual(self.sql_of("ls", "masking-policies", "--in", "DB.S"), "SHOW MASKING POLICIES IN SCHEMA DB.S")
        self.assertEqual(self.sql_of("ls", "objects", "--in", "DB.S"), "SHOW OBJECTS IN SCHEMA DB.S")

    def test_split_script_keeps_the_text_that_is_sent(self) -> None:
        script = ("-- c; c\nSELECT 'a;b' AS x;\n"
                  "CREATE PROCEDURE p() RETURNS INT LANGUAGE SQL AS $$ BEGIN RETURN 1; END; $$;\n"
                  "SELECT \"we;ird\" FROM t; ;")
        parts = sf.split_script(script)
        self.assertEqual(len(parts), 3)
        self.assertIn("'a;b'", parts[0])
        self.assertIn("$$ BEGIN RETURN 1; END; $$", parts[1])
        self.assertEqual(parts[2], 'SELECT "we;ird" FROM t')

    def test_classify_runs_offline_and_names_the_flags(self) -> None:
        out = io.StringIO()
        stdout, sys.stdout = sys.stdout, out
        try:
            code = sf.main(["classify", "SELECT 1; INSERT INTO t VALUES (1); DROP TABLE t", "--config", "/nonexistent"])
        finally:
            sys.stdout = stdout
        self.assertEqual(code, sf.EXIT_OK)
        lines = out.getvalue().splitlines()
        self.assertEqual([line.split()[1] for line in lines[:3]], ["read", "write", "destructive"])
        self.assertIn("--write --destructive", lines[2])

    def _fake_client(self, fail_at: int | None = None) -> Any:
        sent: list[str] = []

        class Fake:
            def run(self, sql: str, bindings: Any = (), *, multi: bool = False) -> list[sf.Result]:
                sent.append(sql)
                if fail_at is not None and len(sent) == fail_at:
                    raise sf.SfError("boom", code="002003")
                return [sf.Result(["N"], ["fixed"], [[len(sent)]], f"h{len(sent)}")]

        return Fake(), sent

    def _main_with(self, fake: Any, argv: list[str]) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        saved = sf.make_client, sys.stdout, sys.stderr
        sf.make_client = lambda args: fake
        sys.stdout, sys.stderr = out, err
        try:
            code = sf.main(argv)
        finally:
            sf.make_client, sys.stdout, sys.stderr = saved
        return code, out.getvalue(), err.getvalue()

    def test_each_sends_one_request_per_statement_in_order(self) -> None:
        fake, sent = self._fake_client()
        code, _, _ = self._main_with(fake, ["sql", "SELECT 'x;y'; SELECT 2", "--each"])
        self.assertEqual(code, sf.EXIT_OK)
        self.assertEqual(sent, ["SELECT 'x;y'", "SELECT 2"])

    def test_each_stops_at_the_first_failure_and_says_what_ran(self) -> None:
        fake, sent = self._fake_client(fail_at=2)
        code, _, err = self._main_with(fake, ["sql", "SELECT 1; SELECT 2; SELECT 3", "--each"])
        self.assertEqual(code, sf.EXIT_SNOWFLAKE)
        self.assertEqual(len(sent), 2)
        self.assertIn("statement 2 of 3 failed", err)
        self.assertIn("1 to 1 ran", err)

    def test_each_refuses_binds_and_multi(self) -> None:
        fake, sent = self._fake_client()
        self.assertEqual(self._main_with(fake, ["sql", "SELECT ?; SELECT 2", "--each", "--bind", "int:1"])[0],
                         sf.EXIT_USAGE)
        self.assertEqual(self._main_with(fake, ["sql", "SELECT 1; SELECT 2", "--each", "--multi"])[0], sf.EXIT_USAGE)
        self.assertEqual(sent, [])

    def test_each_still_guards_the_whole_script_first(self) -> None:
        fake, sent = self._fake_client()
        self.assertEqual(self._main_with(fake, ["sql", "SELECT 1; DROP TABLE t", "--each", "--write"])[0],
                         sf.EXIT_REFUSED)
        self.assertEqual(sent, [])

    def test_out_writes_the_result_to_a_file(self) -> None:
        fake, _ = self._fake_client()
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "r.csv"
            code, stdout, _ = self._main_with(fake, ["sql", "SELECT 1", "--format", "csv", "--out", str(target)])
            self.assertEqual(code, sf.EXIT_OK)
            self.assertEqual(target.read_text(encoding="utf-8").splitlines(), ["N", "1"])
            self.assertEqual(stdout, "")

    def test_a_snowflake_cli_connection_supplies_account_and_context_but_never_auth(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            toml = Path(d) / "config.toml"
            toml.write_text('default_connection_name = "c1"\n[connections.c1]\naccount = "ORG-ACCT"\n'
                            'warehouse = "compute_wh"\ndatabase = "DB1"\nrole = "R1"\npassword = "pw"\n',
                            encoding="utf-8")
            conn = sf.connection_from_toml(None, toml)
        self.assertEqual(conn, {"account_url": "https://org-acct.snowflakecomputing.com", "warehouse": "compute_wh",
                                "database": "DB1"})

    def test_whoami_states_the_connection_without_the_token(self) -> None:
        class Fake:
            origin = "https://x.snowflakecomputing.com"
            context = {"warehouse": "COMPUTE_WH"}
            token_note = f"{len(TOKEN)} chars from $TMP_PAT"

            def run(self, sql: str, bindings: Any = (), *, multi: bool = False) -> list[sf.Result]:
                return [sf.Result(["USER_NAME"], ["text"], [["U"]], "h1")]

        code, _, err = self._main_with(Fake(), ["whoami"])
        self.assertEqual(code, sf.EXIT_OK)
        self.assertIn("https://x.snowflakecomputing.com", err)
        self.assertIn(f"{len(TOKEN)} chars", err)
        self.assertNotIn(TOKEN, err)

if __name__ == "__main__":
    unittest.main()
