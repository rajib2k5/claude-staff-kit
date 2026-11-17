#!/usr/bin/env python3
"""Read-only SQL guard for DoltHub (SQL API or a local `dolt sql`). Stdlib only.

`check_sql(sql)` returns the statement if it is exactly one read-only statement and
raises `UnsafeSqlError` otherwise. Allowed: SELECT, WITH ... SELECT, SHOW,
DESCRIBE/DESC, EXPLAIN (of a SELECT or WITH ... SELECT).

The check runs on tokens, not on substrings: string literals and quoted identifiers
are opaque, so `SELECT 'delete'` passes and `SELECT 1; DROP TABLE x` does not.
Refused, wherever they appear outside quotes:

  - any second statement (one trailing `;` is allowed)
  - any comment (`--`, `#`, `/* */`): `/*! ... */` is executed by MySQL-family servers
  - DML / DDL / privilege / session words, INTO (INTO OUTFILE, INTO @var), LOCK and
    FOR UPDATE, `:=` assignment
  - any `dolt_*(` call: Dolt exposes its write procedures as functions too
    (`SELECT dolt_commit('-am', 'x')` is a SELECT that writes). `dolt_log` as a table
    name, without `(`, is a read and passes.
  - a backslash inside a string literal: whether `\\'` ends the string depends on the
    server's sql_mode, so the same text can parse two ways
  - EXPLAIN ANALYZE (it executes the statement)

The price of token matching without a full parser: an unquoted column named like a
refused word (`set`, `load`, `lock`, `call`) is refused. Backtick-quote it.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass


class UnsafeSqlError(ValueError):
    """The SQL is not a single read-only statement."""


@dataclass(frozen=True)
class Token:
    kind: str   # word | quoted_ident | string | number | punct
    text: str   # raw text (word: as written; quoted_ident/string: contents, quotes removed)

    @property
    def upper(self) -> str:
        return self.text.upper()


_START_WORDS = {"SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"}

# Refused anywhere outside quotes. START/BEGIN/COMMIT/USE/DO and similar are absent on
# purpose: they can only act as a statement, and a single statement must start with an
# allowed word, so an unquoted column called `start` is not refused for nothing.
_FORBIDDEN = {
    "INTO", "OUTFILE", "DUMPFILE", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE",
    "RENAME", "GRANT", "REVOKE", "CALL", "SET", "LOCK", "UNLOCK", "LOAD", "HANDLER", "KILL",
    "ANALYZE", "OPTIMIZE", "FLUSH", "PREPARE", "EXECUTE", "DEALLOCATE", "LOAD_FILE", "SLEEP",
    "BENCHMARK", "GET_LOCK",
}
# INSERT(str, pos, len, new) and REPLACE(str, from, to) are string functions: refused
# unless directly followed by "(". As a statement start they are already refused.
_FUNCTION_ALSO_STATEMENT = {"INSERT", "REPLACE"}
_DML_AFTER_WITH = {"SELECT", "INSERT", "UPDATE", "DELETE", "REPLACE", "TABLE", "VALUES"}


def tokenize(sql: str) -> list[Token]:
    """Split `sql` into tokens; raise UnsafeSqlError on a comment, a control character,
    an unterminated quote, a backslash inside a string, or a non-ASCII character
    outside quotes."""
    tokens: list[Token] = []
    i, n = 0, len(sql)
    while i < n:
        c = sql[i]
        if c in " \t\r\n\f\v":
            i += 1
        elif ord(c) < 32 or ord(c) == 127:
            raise UnsafeSqlError(f"control character {c!r} at offset {i}")
        elif c == "#" or sql.startswith("--", i) or sql.startswith("/*", i):
            raise UnsafeSqlError(f"comment at offset {i}: comments can hide or execute SQL")
        elif c in "'\"":
            j = i + 1
            while True:
                if j >= n:
                    raise UnsafeSqlError(f"unterminated string starting at offset {i}")
                if sql[j] == "\\":
                    raise UnsafeSqlError(f"backslash in a string at offset {j}: parses differently by sql_mode")
                if sql[j] == c:
                    if j + 1 < n and sql[j + 1] == c:   # doubled quote is an escaped quote
                        j += 2
                        continue
                    break
                j += 1
            tokens.append(Token("string", sql[i + 1:j].replace(c + c, c)))
            i = j + 1
        elif c == "`":
            j = i + 1
            while True:
                if j >= n:
                    raise UnsafeSqlError(f"unterminated identifier starting at offset {i}")
                if sql[j] == "`":
                    if j + 1 < n and sql[j + 1] == "`":
                        j += 2
                        continue
                    break
                j += 1
            tokens.append(Token("quoted_ident", sql[i + 1:j].replace("``", "`")))
            i = j + 1
        elif c.isascii() and (c.isalpha() or c in "_$@"):
            j = i + 1
            while j < n and sql[j].isascii() and (sql[j].isalnum() or sql[j] in "_$@"):
                j += 1
            tokens.append(Token("word", sql[i:j]))
            i = j
        elif c.isascii() and c.isdigit():
            j = i + 1
            while j < n and sql[j].isascii() and (sql[j].isalnum() or sql[j] == "."):
                j += 1
            tokens.append(Token("number", sql[i:j]))
            i = j
        elif not c.isascii():
            raise UnsafeSqlError(f"non-ASCII character {c!r} outside quotes at offset {i}")
        elif sql.startswith(":=", i):
            tokens.append(Token("punct", ":="))
            i += 2
        else:
            tokens.append(Token("punct", c))
            i += 1
    return tokens


def _is_punct(tok: Token | None, text: str) -> bool:
    return tok is not None and tok.kind == "punct" and tok.text == text


def check_sql(sql: str) -> str:
    """Return the statement (stripped, one trailing `;` removed) or raise UnsafeSqlError."""
    if not isinstance(sql, str) or not sql.strip():
        raise UnsafeSqlError("empty query")
    toks = tokenize(sql)
    if toks and _is_punct(toks[-1], ";"):
        toks.pop()   # one trailing semicolon only; a second one is caught below
    if not toks:
        raise UnsafeSqlError("empty query")
    for t in toks:
        if _is_punct(t, ";"):
            raise UnsafeSqlError("more than one statement: a semicolon is allowed only at the end")
        if _is_punct(t, ":="):
            raise UnsafeSqlError("':=' assignment is refused")
    first = toks[0]
    if first.kind != "word" or first.upper not in _START_WORDS:
        raise UnsafeSqlError(f"must start with one of {sorted(_START_WORDS)}, got {first.text!r}")

    for idx, t in enumerate(toks):
        nxt = toks[idx + 1] if idx + 1 < len(toks) else None
        name = t.text.lower() if t.kind in ("word", "quoted_ident") else ""
        if name.startswith("dolt_") and _is_punct(nxt, "("):
            raise UnsafeSqlError(f"call to {t.text!r}: Dolt procedures and functions can write")
        if t.kind != "word":
            continue
        up = t.upper
        if up in _FORBIDDEN:
            raise UnsafeSqlError(f"word {t.text!r} is refused")
        if up in _FUNCTION_ALSO_STATEMENT and not _is_punct(nxt, "("):
            raise UnsafeSqlError(f"word {t.text!r} is refused")

    if first.upper == "EXPLAIN":
        rest = toks[1:]
        # EXPLAIN FORMAT = <word> <statement>
        if len(rest) >= 3 and rest[0].upper == "FORMAT" and _is_punct(rest[1], "="):
            rest = rest[3:]
        if not rest or rest[0].kind != "word" or rest[0].upper not in {"SELECT", "WITH"}:
            raise UnsafeSqlError("EXPLAIN must be followed directly by SELECT or WITH")
        toks = rest
        first = toks[0]
    if first.upper == "WITH":
        depth = 0
        for idx, t in enumerate(toks):
            if _is_punct(t, "("):
                depth += 1
            elif _is_punct(t, ")"):
                depth -= 1
            elif depth == 0 and t.kind == "word" and t.upper in _DML_AFTER_WITH:
                if t.upper != "SELECT":
                    raise UnsafeSqlError(f"WITH must lead to SELECT, found {t.text!r}")
                break
        else:
            raise UnsafeSqlError("WITH is not followed by a SELECT")
    return sql.strip().rstrip(";").rstrip()


def is_read_only(sql: str) -> bool:
    try:
        check_sql(sql)
    except UnsafeSqlError:
        return False
    return True


def _main(argv: list[str]) -> int:
    sql = " ".join(argv) if argv else sys.stdin.read()
    try:
        check_sql(sql)
    except UnsafeSqlError as e:
        print(f"REFUSED: {e}", file=sys.stderr)
        return 1
    print("OK: one read-only statement")
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
