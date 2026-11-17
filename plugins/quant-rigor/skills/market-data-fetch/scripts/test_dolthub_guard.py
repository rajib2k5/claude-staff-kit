"""Tests for dolthub_guard.py. Run: python3 -m unittest discover -s <this folder> -p 'test_*.py'"""

import unittest

import dolthub_guard as g


class AcceptsReadOnly(unittest.TestCase):
    def test_plain_read_statements_pass(self):
        for sql in [
            "SELECT * FROM t",
            "  select act_symbol, `date` FROM earnings_calendar AS OF 'abc' WHERE `date` > '2024-01-01'  ",
            "WITH x AS (SELECT 1 AS a) SELECT a FROM x",
            "SHOW TABLES",
            "DESCRIBE option_chain",
            "DESC option_chain",
            "EXPLAIN SELECT 1",
            "EXPLAIN FORMAT = tree SELECT 1",
            "SELECT commit_hash FROM dolt_log",       # a dolt_* system TABLE is a read
            "SELECT HASHOF('HEAD') AS h",
            "SELECT 1;",                               # one trailing semicolon
        ]:
            with self.subTest(sql=sql):
                self.assertTrue(g.is_read_only(sql))

    def test_refused_word_inside_a_string_literal_passes(self):
        sql = "SELECT 'delete; drop table x -- #' AS note, \"set\" AS s"
        self.assertEqual(g.check_sql(sql), sql)

    def test_refused_word_inside_a_quoted_identifier_passes(self):
        self.assertTrue(g.is_read_only("SELECT `delete`, `set` FROM `update`"))

    def test_doubled_quote_does_not_end_the_string(self):
        self.assertTrue(g.is_read_only("SELECT 'it''s; DROP TABLE x' AS v"))

    def test_string_functions_named_like_statements_pass(self):
        self.assertTrue(g.is_read_only("SELECT REPLACE(name, 'a', 'b'), INSERT(name, 1, 1, 'x') FROM t"))

    def test_column_that_only_contains_a_refused_word_passes(self):
        self.assertTrue(g.is_read_only("SELECT updated_at, deleted_flag, settings FROM t"))

    def test_check_sql_returns_statement_without_trailing_semicolon(self):
        self.assertEqual(g.check_sql("  SELECT 1 ;  "), "SELECT 1")


class Tokenizer(unittest.TestCase):
    def test_doubled_quote_is_one_string_token_with_one_quote(self):
        toks = g.tokenize("SELECT 'it''s'")
        self.assertEqual([(t.kind, t.text) for t in toks], [("word", "SELECT"), ("string", "it's")])

    def test_doubled_backtick_is_one_identifier_token(self):
        toks = g.tokenize("SELECT `a``b`")
        self.assertEqual([(t.kind, t.text) for t in toks], [("word", "SELECT"), ("quoted_ident", "a`b")])


class RefusesWrites(unittest.TestCase):
    def assertRefused(self, sql, why=""):
        with self.assertRaises(g.UnsafeSqlError, msg=f"{sql!r} {why}"):
            g.check_sql(sql)

    def test_empty_and_non_string(self):
        for sql in ["", "   ", ";", None, 5]:
            self.assertRefused(sql)

    def test_statements_that_do_not_start_with_an_allowed_word(self):
        for sql in ["DELETE FROM t", "INSERT INTO t VALUES (1)", "UPDATE t SET a = 1", "DROP TABLE t",
                    "CREATE TABLE t (a int)", "TRUNCATE t", "CALL dolt_commit('-m', 'x')", "USE db",
                    "REPLACE INTO t VALUES (1)", "TABLE t"]:
            self.assertRefused(sql)

    def test_second_statement_after_semicolon(self):
        self.assertRefused("SELECT 1; DROP TABLE x")
        self.assertRefused("SELECT 1; SELECT 2")
        self.assertRefused("SELECT 1;;")

    def test_semicolon_hidden_after_a_string(self):
        self.assertRefused("SELECT 'a'; DELETE FROM t")

    def test_comments_are_refused_outside_quotes(self):
        for sql in ["SELECT 1 -- x", "SELECT 1 # x", "SELECT 1 /* x */", "SELECT /*! 1; DROP TABLE x */ 1"]:
            self.assertRefused(sql)

    def test_dolt_functions_that_write_are_refused(self):
        for sql in ["SELECT dolt_commit('-am', 'x')", "SELECT DOLT_GC ()", "SELECT `dolt_reset`('--hard')",
                    "SELECT dolt_checkout('b')"]:
            self.assertRefused(sql)

    def test_select_into_is_refused(self):
        self.assertRefused("SELECT * FROM t INTO OUTFILE '/tmp/x'")
        self.assertRefused("SELECT a INTO @v FROM t")

    def test_locking_read_is_refused(self):
        self.assertRefused("SELECT * FROM t FOR UPDATE")
        self.assertRefused("SELECT * FROM t LOCK IN SHARE MODE")

    def test_user_variable_assignment_is_refused(self):
        self.assertRefused("SELECT @a := 1")

    def test_with_leading_to_dml_is_refused(self):
        self.assertRefused("WITH a AS (SELECT 1) DELETE FROM t")
        self.assertRefused("WITH a AS (SELECT 1) UPDATE t SET x = 1")
        self.assertRefused("WITH a AS (SELECT 1) INSERT INTO t SELECT * FROM a")

    def test_with_that_never_reaches_select_is_refused(self):
        # TABLE and VALUES are not on the forbidden-word list: only the WITH walk catches them.
        self.assertRefused("WITH a AS (SELECT 1) TABLE a")
        self.assertRefused("WITH a AS (SELECT 1) VALUES ROW(1)")
        self.assertRefused("WITH a AS (SELECT 1)")

    def test_with_select_inside_parentheses_does_not_satisfy_the_check(self):
        self.assertRefused("WITH a AS (SELECT 1) TABLE a UNION (SELECT 2)")

    def test_explain_analyze_and_explain_of_a_write_are_refused(self):
        self.assertRefused("EXPLAIN ANALYZE SELECT 1")
        self.assertRefused("EXPLAIN DELETE FROM t")
        self.assertRefused("EXPLAIN FORMAT = tree TABLE t")
        self.assertRefused("EXPLAIN")

    def test_backslash_in_a_string_is_refused(self):
        self.assertRefused("SELECT '\\'; DROP TABLE x; -- '")

    def test_unterminated_quotes_are_refused(self):
        self.assertRefused("SELECT 'abc")
        self.assertRefused("SELECT `abc")

    def test_non_ascii_outside_quotes_and_control_characters_are_refused(self):
        self.assertRefused("SELECT 1; DROP TABLE x")   # Greek question mark looks like ';'
        self.assertRefused("SELECT 1\x00 DROP TABLE x")

    def test_lone_non_ascii_or_control_character_is_refused(self):
        # No refused word follows, so only the character rule can catch these.
        self.assertRefused("SELECT 1 \u037e")
        self.assertRefused("SELECT 1\x00")

    def test_backslash_alone_in_a_string_is_refused(self):
        self.assertRefused("SELECT 'a\\b'")

    def test_bare_insert_or_replace_word_is_refused(self):
        self.assertRefused("SELECT insert FROM t")
        self.assertRefused("SELECT replace FROM t")

    def test_is_read_only_is_false_for_a_write(self):
        self.assertFalse(g.is_read_only("DROP TABLE x"))
        self.assertFalse(g.is_read_only("SELECT 1; SELECT 2"))

    def test_non_ascii_inside_a_string_passes(self):
        self.assertTrue(g.is_read_only("SELECT 'café'"))


if __name__ == "__main__":
    unittest.main()
