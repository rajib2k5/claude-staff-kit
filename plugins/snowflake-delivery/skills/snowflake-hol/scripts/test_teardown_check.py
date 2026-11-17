#!/usr/bin/env python3
"""Tests for teardown_check.py and hol_scaffold.py. Run: python3 -B test_teardown_check.py"""
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import hol_scaffold  # noqa: E402
import teardown_check as tc  # noqa: E402


def run_check(setup, teardown, extra_create=()):
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / "setup.sql").write_text(setup)
        (d / "teardown.sql").write_text(teardown)
        files = [str(d / "setup.sql")]
        for i, text in enumerate(extra_create):
            (d / f"extra{i}.sql").write_text(text)
            files.append(str(d / f"extra{i}.sql"))
        _, orphans = tc.check(files, [str(d / "teardown.sql")])
        return orphans


def scaffold(tmp, *args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
        rc = hol_scaffold.main(list(args) + ["--out", str(tmp)])
    return rc, out.getvalue()


class RenderedTemplates(unittest.TestCase):
    """Every shipped variant and feature mix must render with zero orphans."""

    MIXES = [
        ("shared", []),
        ("shared", ["--cross-region", "AWS_US"]),
        ("shared", ["--git-origin", "https://github.com/acme/lab.git", "--git-prefix", "https://github.com/acme"]),
        ("single", ["--participant-user", "USER"]),
        ("single", ["--participant-user", "USER", "--cross-region", "AWS_US",
                    "--git-origin", "https://github.com/acme/lab.git", "--git-prefix", "https://github.com/acme"]),
    ]

    def test_all_variants_render_clean(self):
        for variant, extra in self.MIXES:
            with self.subTest(variant=variant, extra=extra), tempfile.TemporaryDirectory() as d:
                rc, out = scaffold(Path(d) / "lab", "--variant", variant, "--lab", "HOL_T", *extra)
                self.assertEqual(rc, 0, out)
                self.assertIn("0 orphan(s)", out)
                for f in (Path(d) / "lab").glob("*.sql"):
                    self.assertNotIn("{{", f.read_text(), f.name)
                    self.assertNotIn("@if", f.read_text(), f.name)

    def test_planted_orphan_in_rendered_setup_is_caught(self):
        with tempfile.TemporaryDirectory() as d:
            lab = Path(d) / "lab"
            self.assertEqual(scaffold(lab, "--variant", "shared", "--lab", "HOL_T")[0], 0)
            setup = lab / "01_setup.sql"
            setup.write_text(setup.read_text() + "\nCREATE WAREHOUSE IF NOT EXISTS HOL_T_ORPHAN_WH;\n"
                             "USE SCHEMA SOMEWHERE_ELSE.CORE;\nCREATE TABLE STRAY (x INT);\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = tc.main([str(lab)])
            self.assertEqual(rc, 1)
            self.assertIn("WAREHOUSE HOL_T_ORPHAN_WH", out.getvalue())
            self.assertIn("TABLE SOMEWHERE_ELSE.CORE.STRAY", out.getvalue())
            self.assertIn("2 orphan(s)", out.getvalue())

    def test_deleting_a_drop_line_from_rendered_teardown_is_caught(self):
        with tempfile.TemporaryDirectory() as d:
            lab = Path(d) / "lab"
            self.assertEqual(scaffold(lab, "--variant", "single", "--lab", "HOL_T", "--participant-user", "U")[0], 0)
            td = lab / "99_teardown.sql"
            td.write_text(td.read_text().replace("DROP RESOURCE MONITOR IF EXISTS HOL_T_RM;", ""))
            _, orphans = tc.check([str(lab / "01_setup.sql"), str(lab / "02_seed.sql")], [str(td)])
            self.assertEqual(len(orphans), 1)
            self.assertIn("RESOURCE MONITOR HOL_T_RM", orphans[0])


class Coverage(unittest.TestCase):
    def test_static_orphan(self):
        o = run_check("CREATE WAREHOUSE A_WH; CREATE ROLE R;", "DROP ROLE R;")
        self.assertEqual(len(o), 1)
        self.assertIn("WAREHOUSE A_WH", o[0])

    def test_matching_drop_covers(self):
        self.assertEqual(run_check("CREATE OR REPLACE WAREHOUSE a_wh;", "DROP WAREHOUSE IF EXISTS A_WH;"), [])

    def test_quoted_names_are_case_sensitive(self):
        self.assertEqual(len(run_check('CREATE ROLE "lab";', "DROP ROLE LAB;")), 1)
        self.assertEqual(run_check('CREATE ROLE "LAB";', "DROP ROLE lab;"), [])

    def test_database_drop_covers_contents(self):
        setup = "CREATE DATABASE D; CREATE SCHEMA S; CREATE TABLE T (x INT); CREATE STAGE D.S.ST;"
        self.assertEqual(run_check(setup, "DROP DATABASE D;"), [])

    def test_schema_drop_covers_only_its_objects(self):
        setup = "USE DATABASE D; CREATE SCHEMA S1; CREATE TABLE T1 (x INT); USE SCHEMA D.S2; CREATE VIEW V AS SELECT 1;"
        o = run_check(setup, "DROP SCHEMA D.S1;")
        self.assertEqual(len(o), 1)
        self.assertIn("VIEW D.S2.V", o[0])

    def test_object_in_undropped_database_is_orphan(self):
        o = run_check("USE SCHEMA KEEP_DB.CORE; CREATE OR REPLACE SEMANTIC VIEW SV TABLES (x);", "DROP DATABASE OTHER;")
        self.assertEqual(len(o), 1)
        self.assertIn("SEMANTIC VIEW KEEP_DB.CORE.SV", o[0])

    def test_integration_subtypes_match(self):
        self.assertEqual(run_check("CREATE API INTEGRATION GI API_PROVIDER = git_https_api;",
                                   "DROP INTEGRATION GI;"), [])

    def test_type_must_match(self):
        self.assertEqual(len(run_check("USE SCHEMA D.S; CREATE DYNAMIC TABLE DT TARGET_LAG='1 hour' AS SELECT 1;",
                                       "DROP TABLE D.S.DT;")), 1)

    def test_commented_create_is_ignored(self):
        setup = "-- CREATE WAREHOUSE X;\n/* CREATE ROLE Y; */\nSELECT '-- CREATE USER Z';"
        self.assertEqual(run_check(setup, "SELECT 1;"), [])

    def test_procedure_body_is_not_parsed_as_creates(self):
        setup = ("USE SCHEMA D.S;\nCREATE OR REPLACE PROCEDURE P() RETURNS INT LANGUAGE SQL AS $$\n"
                 "BEGIN EXECUTE IMMEDIATE 'CREATE WAREHOUSE INSIDE_WH'; RETURN 1; END; $$;")
        self.assertEqual(run_check(setup, "DROP DATABASE D;"), [])

    def test_agent_spec_body_is_not_parsed(self):
        setup = "CREATE OR REPLACE AGENT D.S.A FROM SPECIFICATION $$\nmodels:\n  orchestration: auto\n$$;"
        self.assertEqual(run_check(setup, "DROP DATABASE D;"), [])


LOOP_SETUP = """EXECUTE IMMEDIATE $$
DECLARE
    num_users INTEGER DEFAULT 25;
BEGIN
    FOR i IN 1 TO :num_users DO
        LET suffix VARCHAR := LPAD(i::VARCHAR, 2, '0');
        LET role_name VARCHAR := 'LAB_ROLE_' || :suffix;
        EXECUTE IMMEDIATE 'CREATE ROLE IF NOT EXISTS ' || :role_name;
        EXECUTE IMMEDIATE 'GRANT ROLE ' || :role_name || ' TO ROLE SYSADMIN';
    END FOR;
END;
$$;"""


def loop_teardown(n, prefix="LAB_ROLE_"):
    return f"""EXECUTE IMMEDIATE $$
DECLARE
    n INTEGER DEFAULT {n};
BEGIN
    FOR i IN 1 TO :n DO
        LET sfx VARCHAR := LPAD(i::VARCHAR, 2, '0');
        EXECUTE IMMEDIATE 'DROP ROLE IF EXISTS {prefix}' || :sfx;
    END FOR;
END;
$$;"""


class Loops(unittest.TestCase):
    def test_loop_drop_covers_loop_create(self):
        self.assertEqual(run_check(LOOP_SETUP, loop_teardown(25)), [])

    def test_wider_drop_range_covers(self):
        self.assertEqual(run_check(LOOP_SETUP, loop_teardown(30)), [])

    def test_short_drop_range_is_orphan(self):
        o = run_check(LOOP_SETUP, loop_teardown(20))
        self.assertEqual(len(o), 1)
        self.assertIn("ROLE LAB_ROLE_{*} for i in 1..25", o[0])

    def test_wrong_prefix_is_orphan(self):
        self.assertEqual(len(run_check(LOOP_SETUP, loop_teardown(25, "LAB_RL_"))), 1)

    def test_single_static_drop_does_not_cover_a_loop(self):
        self.assertEqual(len(run_check(LOOP_SETUP, "DROP ROLE LAB_ROLE_01;")), 1)

    def test_loop_drop_pattern_does_not_cover_a_static_name(self):
        # LAB_{*} over 1..25 drops LAB_01..LAB_25; it must not be read as dropping LAB_MASTER.
        setup = "CREATE DATABASE LAB_MASTER;\n" + LOOP_SETUP.replace("'LAB_ROLE_'", "'LAB_'").replace(
            "CREATE ROLE", "CREATE DATABASE")
        teardown = loop_teardown(25, "LAB_").replace("DROP ROLE", "DROP DATABASE")
        o = run_check(setup, teardown)
        self.assertEqual(len(o), 1)
        self.assertIn("DATABASE LAB_MASTER", o[0])

    def test_grant_inside_loop_is_not_an_object(self):
        self.assertEqual(run_check(LOOP_SETUP, loop_teardown(25)), [])


class AccountParamsAndKeeps(unittest.TestCase):
    def test_alter_account_set_needs_unset(self):
        o = run_check("ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'AWS_US';", "SELECT 1;")
        self.assertEqual(len(o), 1)
        self.assertIn("CORTEX_ENABLED_CROSS_REGION", o[0])
        self.assertEqual(run_check("ALTER ACCOUNT SET P1 = 1;", "ALTER ACCOUNT UNSET P1;"), [])

    def test_keep_annotation_with_reason(self):
        td = "-- teardown-check: keep USER LAB_ADMIN owned by the platform team\n"
        self.assertEqual(run_check("CREATE USER LAB_ADMIN;", td), [])

    def test_keep_annotation_without_reason_is_ignored(self):
        td = "-- teardown-check: keep USER LAB_ADMIN\n"
        self.assertEqual(len(run_check("CREATE USER LAB_ADMIN;", td)), 1)

    def test_keep_parameter(self):
        td = "-- teardown-check: keep PARAMETER P1 the account already relied on it\n"
        self.assertEqual(run_check("ALTER ACCOUNT SET P1 = 1;", td), [])

    def test_keep_only_matches_its_type(self):
        td = "-- teardown-check: keep ROLE LAB_ADMIN shared\n"
        self.assertEqual(len(run_check("CREATE USER LAB_ADMIN;", td)), 1)


class ScaffoldGuards(unittest.TestCase):
    def test_bad_lab_name(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(scaffold(Path(d) / "x", "--variant", "shared", "--lab", "hol; drop")[0], 2)

    def test_single_needs_participant(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(scaffold(Path(d) / "x", "--variant", "single", "--lab", "HOL_T")[0], 2)

    def test_git_origin_must_be_under_prefix(self):
        with tempfile.TemporaryDirectory() as d:
            rc, _ = scaffold(Path(d) / "x", "--variant", "shared", "--lab", "HOL_T",
                             "--git-origin", "https://evil.example/x.git", "--git-prefix", "https://github.com/acme")
            self.assertEqual(rc, 2)

    def test_refuses_to_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            lab = Path(d) / "lab"
            self.assertEqual(scaffold(lab, "--variant", "shared", "--lab", "HOL_T")[0], 0)
            before = (lab / "01_setup.sql").read_text()
            self.assertEqual(scaffold(lab, "--variant", "shared", "--lab", "HOL_OTHER")[0], 2)
            self.assertEqual((lab / "01_setup.sql").read_text(), before)

    def test_leftover_placeholder_is_refused(self):
        with self.assertRaises(ValueError):
            hol_scaffold.render_text("CREATE ROLE {{MISSING}};", {}, set())

    def test_unclosed_if_is_refused(self):
        with self.assertRaises(ValueError):
            hol_scaffold.render_text("-- @if git\nX\n", {}, {"git"})


if __name__ == "__main__":
    unittest.main(verbosity=1)
