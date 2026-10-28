#!/usr/bin/env python3
"""sf.py: run Snowflake SQL through the SQL API (POST /api/v2/statements) with a programmatic access token (PAT).

Standard library only. No Snowflake driver and no MCP server is needed.

Commands (``sf.py <command> --help`` shows the options of each):
  whoami                  user, role, warehouse, database, schema, account, region, version
  sql SQL | -f FILE | -   run SQL; read-only unless --write (and --destructive for DROP, TRUNCATE, DELETE, ...)
  explain SQL             the plan of a query (EXPLAIN USING TEXT), without running it
  ls KIND [--in X]        SHOW databases | schemas | tables | views | procedures | functions | tasks | streams |
                          stages | warehouses | roles | users | dynamic-tables | pipes | sequences | file-formats
  describe NAME           DESCRIBE TABLE / VIEW / ... (--kind)
  ddl NAME                GET_DDL (--kind TABLE by default)
  grants                  SHOW GRANTS (--to-role R | --of-role R | --on "TABLE X" | --to-user U)
  history                 recent queries (INFORMATION_SCHEMA.QUERY_HISTORY, real time)
  credits                 warehouse credits per day (ACCOUNT_USAGE, up to 3 h late)
  submit SQL              start SQL asynchronously and print its statement handle
  status HANDLE           state of a submitted statement, and its rows when it finished
  cancel HANDLE           cancel a running statement
  sample NAME [-n N]      the first N rows of a table or view (default 10)
  count NAME              COUNT(*) of a table or view
  classify SQL | -f FILE  offline: how the guard reads each statement and which flags it needs (no token used)

Safety:
  * The token comes from an environment variable (default TMP_PAT, see config.json). When the variable is not in the
    environment (a non-interactive shell does not read ~/.zshrc), a plain ``export NAME=value`` line is read from
    ~/.zshenv, ~/.zprofile, ~/.zshrc and ~/.zlogin, in zsh's order. Nothing in the file is executed. The token is never
    printed: it is sent only to the configured account origin, redirects are refused, and it is removed from every
    error message.
  * Statements are classified before they are sent. Read-only (SELECT, SHOW, DESCRIBE, EXPLAIN, LIST, ...) runs
    as is. Anything else needs --write. DROP, TRUNCATE, DELETE, REMOVE, UNDROP, REVOKE, MERGE, CREATE OR REPLACE,
    ALTER ... DROP/SWAP/RENAME, UPDATE without WHERE also need --destructive. This is a guard against accidents,
    not a security boundary: the role's grants are the boundary.
  * Retries (HTTP 429, 503, timeouts) re-send the same requestId with retry=true, so Snowflake never runs a statement
    twice. Every result partition is fetched and its row count checked.

Exit codes: 0 ok, 1 Snowflake or HTTP error, 2 usage or configuration error, 3 refused by the safety guard.
"""

from __future__ import annotations

import argparse
import gzip
import http.client
import io
import json
import os
import random
import re
import shlex
import sys
import time
import tomllib
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, NoReturn, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
# The files zsh reads, in the order it reads them, so the last assignment here is the one a zsh login shell keeps.
RC_FILES = ("~/.zshenv", "~/.zprofile", "~/.zshrc", "~/.zlogin")

STATEMENTS_PATH = "/api/v2/statements"
IN_PROGRESS = "333334"  # SQL API code of a statement that has not finished
RETRYABLE_STATUS = frozenset({429, 503})
MAX_RESPONSE_BYTES = 256 * 1024 * 1024
MAX_MESSAGE_CHARS = 2000
AUTH_KIND = "PROGRAMMATIC_ACCESS_TOKEN"
QUERY_TAG = "claude-snowflake-sql"
# Read-only by the DQ accelerator's rule (owner, 2026-09-30); config.json protected_schemas replaces it.
DEFAULT_PROTECTED = ("DQ_AI_ACCELERATOR.DEMO", "DQ_AI_ACCELERATOR.DQ_METRICS", "DQ_AI_ACCELERATOR.PUBLIC")
HANDLE_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
EPOCH = datetime(1970, 1, 1)
EPOCH_DATE = date(1970, 1, 1)

EXIT_OK, EXIT_SNOWFLAKE, EXIT_USAGE, EXIT_REFUSED = 0, 1, 2, 3


class SfError(RuntimeError):
    """A Snowflake or HTTP failure. ``code`` is Snowflake's error code (or an HTTP status) when known."""

    def __init__(self, message: str, code: str | None = None, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class UsageError(RuntimeError):
    """Bad arguments or configuration (exit 2)."""


class Refused(RuntimeError):
    """The safety guard refused a statement (exit 3)."""


class _Transient(Exception):
    def __init__(self, reason: str, code: str | None = None, retry_after_s: float | None = None) -> None:
        super().__init__(reason)
        self.reason, self.code, self.retry_after_s = reason, code, retry_after_s


# ---------------------------------------------------------------------------------------------------------------------
# Configuration and token
# ---------------------------------------------------------------------------------------------------------------------


def load_config(path: Path = CONFIG_PATH, profile: str | None = None) -> dict[str, Any]:
    """The chosen profile of config.json, merged over its "default" profile."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise UsageError(f"no config at {path}; copy the example in SKILL.md") from None
    except ValueError as exc:
        raise UsageError(f"{path} is not valid JSON: {exc}") from None
    profiles = data.get("profiles") or {}
    name = profile or data.get("default_profile") or "default"
    if name not in profiles:
        raise UsageError(f"profile {name!r} is not in {path} (have: {', '.join(sorted(profiles)) or 'none'})")
    merged = dict(profiles.get("default") or {})
    merged.update(profiles[name])
    return merged


_EXPORT_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


def token_from_rc(name: str, files: Iterable[str] = RC_FILES) -> str | None:
    """The value of ``export NAME=value`` in a shell rc file, read as text; the last assignment wins, like a shell.

    Only a literal is accepted (bare, 'single' or "double" quoted). A value that would need the shell (a $ expansion,
    a command substitution) is refused, because nothing here runs the file."""
    found: str | None = None
    for raw in files:
        path = Path(raw).expanduser()
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            match = _EXPORT_RE.match(line)
            if not match or match.group(1) != name:
                continue
            rhs = match.group(2).strip()
            try:
                parts = shlex.split(rhs, comments=True)
            except ValueError:
                raise UsageError(f"{name} in {path} is not a plain quoted value") from None
            if len(parts) != 1:
                raise UsageError(f"{name} in {path} is not a single plain value")
            if _expands(rhs):
                raise UsageError(f"{name} in {path} needs the shell to expand it; export it in the environment instead")
            if any(q in parts[0] for q in "\u2018\u2019\u201c\u201d"):
                raise UsageError(f"{name} in {path} contains a typographic quote; use plain ' or \"")
            found = parts[0]
    return found


def _expands(rhs: str) -> bool:
    """True when a shell would expand something in ``rhs``: an unescaped $ or ` outside single quotes. A ' inside double
    quotes is a plain character there, so it does not open a single-quoted run (round 2: "a'$HOME'")."""
    state, i = "", 0  # "" bare, "'" single-quoted, '"' double-quoted
    while i < len(rhs):
        ch = rhs[i]
        if ch == "\\" and state != "'":
            i += 2  # an escaped character never expands
            continue
        if ch == "'" and state != '"':
            state = "" if state == "'" else "'"
        elif ch == '"' and state != "'":
            state = "" if state == '"' else '"'
        elif ch in "$`" and state != "'":
            return True
        i += 1
    return False


def resolve_token(name: str) -> str:
    value = os.environ.get(name, "").strip() or (token_from_rc(name) or "").strip()
    if not value:
        raise UsageError(f"no token: set {name} in the environment or as `export {name}=...` in ~/.zshrc")
    if any(c.isspace() for c in value):
        raise UsageError(f"the token in {name} contains whitespace; check its quoting")
    return value


SNOWFLAKE_CLI_CONFIG = Path("~/.snowflake/config.toml")


def connection_from_toml(name: str | None, path: Path = SNOWFLAKE_CLI_CONFIG) -> dict[str, str]:
    """account_url, warehouse, database and schema of a connection in the Snowflake CLI's config.toml (``name`` None:
    its default_connection_name). Never the role or any authentication field: the PAT decides those."""
    path = path.expanduser()
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise UsageError(f"no Snowflake CLI config at {path}") from None
    except tomllib.TOMLDecodeError as exc:
        raise UsageError(f"{path} is not valid TOML: {exc}") from None
    conn_name = name or data.get("default_connection_name")
    conn = (data.get("connections") or {}).get(conn_name or "")
    if not isinstance(conn, dict):
        raise UsageError(f"connection {conn_name!r} is not in {path}")
    out: dict[str, str] = {}
    account = str(conn.get("account") or "").strip()
    if account:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", account):
            raise UsageError(f"connection {conn_name!r}: the account {account!r} is not a plain account identifier")
        out["account_url"] = f"https://{account.lower()}.snowflakecomputing.com"
    for key in ("warehouse", "database", "schema"):
        if conn.get(key):
            out[key] = str(conn[key])
    return out


def check_origin(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.path not in ("", "/") or parts.query or parts.fragment:
        raise UsageError("account_url must be a bare https origin, e.g. https://<org>-<account>.snowflakecomputing.com")
    if not parts.hostname.endswith(".snowflakecomputing.com"):
        raise UsageError("account_url must be a *.snowflakecomputing.com host")
    return f"https://{parts.netloc}"


# ---------------------------------------------------------------------------------------------------------------------
# Statement classification (the safety guard)
# ---------------------------------------------------------------------------------------------------------------------

READ_ONLY = frozenset({"SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "LIST", "LS", "VALUES", "USE"})
DESTRUCTIVE_VERBS = frozenset({"DROP", "TRUNCATE", "DELETE", "REMOVE", "RM", "UNDROP", "REVOKE", "MERGE"})
WRITE_WORDS = frozenset({"INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "DROP", "ALTER", "TRUNCATE", "GRANT",
                         "REVOKE", "CALL", "COPY", "PUT", "REMOVE", "UNDROP", "EXECUTE"})
_IDENT_CHARS = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$")


def _lex(sql: str) -> list[tuple[str, str]]:
    """``sql`` as (kind, text) pieces: code, string, ident ("quoted"), dollar ($$ body), comment, stage (@path) and
    end (a ``;``). One lexer serves the guard and ``--each``, so they never disagree about where a statement ends.
    Rules that follow Snowflake (adversarial validation, 2026-10-19): a ``--`` or ``//`` comment ends at a line feed
    or a bare carriage return; ``$$`` opens a body only where it cannot be part of an identifier (``a$$`` is a name);
    an ``@`` stage path runs to whitespace or ``;,()``, so ``//`` inside it is not a comment."""
    pieces: list[tuple[str, str]] = []
    i, n = 0, len(sql)
    while i < n:
        ch, two = sql[i], sql[i:i + 2]
        if two in ("--", "//"):
            ends = [k for k in (sql.find("\n", i), sql.find("\r", i)) if k >= 0]
            j = min(ends) if ends else n
            pieces.append(("comment", sql[i:j]))
            i = j
        elif two == "/*":
            j = sql.find("*/", i + 2)
            j = n if j < 0 else j + 2
            pieces.append(("comment", sql[i:j]))
            i = j
        elif two == "$$" and (i == 0 or sql[i - 1] not in _IDENT_CHARS):
            j = sql.find("$$", i + 2)
            j = n if j < 0 else j + 2
            pieces.append(("dollar", sql[i:j]))
            i = j
        elif ch in ("'", '"'):
            j = i + 1
            while j < n:
                if sql[j] == "\\" and ch == "'":
                    j += 2
                    continue
                if sql[j] == ch:
                    if j + 1 < n and sql[j + 1] == ch:  # a doubled quote inside the literal
                        j += 2
                        continue
                    break
                j += 1
            j = min(j + 1, n)
            pieces.append(("string" if ch == "'" else "ident", sql[i:j]))
            i = j
        elif ch == "@":
            j = i + 1
            while j < n and not sql[j].isspace() and sql[j] not in ";,()":
                # A quoted name part only right after @ or a dot (@"My Stage", @DB."S"); a " inside a path is a plain
                # character to Snowflake, and treating it as a quote hid a ->> chain (round 2, B1).
                if sql[j] == '"' and sql[j - 1] in "@.":
                    k = sql.find('"', j + 1)
                    j = n if k < 0 else k + 1
                    continue
                j += 1
            pieces.append(("stage", sql[i:j]))
            i = j
        elif ch == ";":
            pieces.append(("end", ";"))
            i += 1
        else:
            j = i + 1
            while j < n and sql[j] not in "-/$'\"@;" :
                j += 1
            if j == i + 1 and sql[i] in "-/$":  # a lone - / or $ that opened nothing
                pieces.append(("code", ch))
                i += 1
                continue
            pieces.append(("code", sql[i:j]))
            i = j
    return pieces


def _strip_literals(sql: str, keep_identifiers: bool = False) -> str:
    """SQL with comments removed and string, quoted-identifier and $$ bodies blanked, keeping ';' that separate.
    ``keep_identifiers`` keeps a "quoted" identifier's text (without its quotes), for name matching."""
    out: list[str] = []
    for kind, text in _lex(sql):
        if kind in ("code", "end"):
            out.append(text)
        elif kind == "stage":
            out.append(" @stage ")
        elif kind == "comment":
            out.append(" ")
        elif kind == "ident":
            out.append(text[1:-1].replace('""', '"') if keep_identifiers else ' "x" ')
        else:  # string, dollar
            out.append(" '' ")
    return "".join(out)


def _flow_split(text: str) -> list[str]:
    """Split stripped text at the flow operator ``->>``, which chains one statement into the next (B1)."""
    return re.split(r"->>", text)


def split_statements(sql: str) -> list[str]:
    """The statements of ``sql`` as their stripped texts (comments and literals blanked), empty ones dropped. A ``;``
    and the flow operator ``->>`` both end a statement here, so a chained DROP is classified on its own."""
    return [s.strip() for part in _strip_literals(sql).split(";") for s in _flow_split(part) if s.strip()]


def split_script(sql: str) -> list[str]:
    """The statements of ``sql`` as the text to send (literals, $$ bodies and comments kept), split on each ``;`` the
    lexer sees; a statement that is only comments or blanks is dropped. Used by ``sql --each``. A ``->>`` chain stays
    in one piece: Snowflake runs a chain as one request."""
    parts, current = [], []
    for kind, text in _lex(sql):
        if kind == "end":
            parts.append("".join(current))
            current = []
        else:
            current.append(text)
    parts.append("".join(current))
    return [s.strip() for s in parts if _strip_literals(s).strip()]


# Statements that need --destructive although they remove nothing: they start spend or change security or the
# account (this token's secondary roles include ACCOUNTADMIN; rules from the snowflake-tool session), or their
# effect cannot be read from their text (adversarial validation, 2026-10-19).
GUARDED_PATTERNS = (
    r"^INSERT\s+OVERWRITE\b",
    r"^UPDATE\b",  # a WHERE can still match every row (WHERE TRUE)
    r"^ALTER\s+(TASK|ALERT)\b.*\bRESUME\b",
    r"^ALTER\s+(WAREHOUSE|COMPUTE\s+POOL)\b.*\bRESUME\b",
    r"^ALTER\s+WAREHOUSE\b.*\b(WAREHOUSE_SIZE|MAX_CLUSTER_COUNT|MIN_CLUSTER_COUNT|AUTO_SUSPEND)\b",
    r"^ALTER\s+(USER|ACCOUNT|NETWORK\s+POLICY|SECURITY\s+INTEGRATION|NETWORK\s+RULE|AUTHENTICATION\s+POLICY)\b",
    r"^ALTER\b.*\b(DATA_RETENTION_TIME_IN_DAYS|MAX_DATA_EXTENSION_TIME_IN_DAYS)\b",  # shortens Time Travel
    r"^ALTER\b.*\bUNSET\b",
    r"^COPY\s+INTO\b.*\bOVERWRITE\s*=\s*TRUE\b",
    r"^(CREATE|ALTER)\b.*\bPROGRAMMATIC\s+ACCESS\s+TOKEN\b",
    r"^CREATE\s+OR\s+(REPLACE|ALTER)\b",
    r"^GRANT\s+OWNERSHIP\b",
    r"^GRANT\b.*\b(ACCOUNTADMIN|SECURITYADMIN|USERADMIN|ORGADMIN)\b",
    r"^(EXECUTE|CALL|DECLARE)\b",  # a task, a procedure or a script: what it does is not in this text
    r"^BEGIN\b(?!\s*(TRANSACTION\b|WORK\b|NAME\b|$))",  # a Snowflake Scripting block, not a transaction
    # Round 2 (2026-10-19): spend, security and removal that only needed --write.
    r"^CREATE\s+(OR\s+REPLACE\s+)?(WAREHOUSE|COMPUTE\s+POOL|RESOURCE\s+MONITOR|USER|DYNAMIC\s+TABLE|SHARE|"
    r"NETWORK\s+(POLICY|RULE)|(EXTERNAL\s+ACCESS|SECURITY|API|STORAGE|NOTIFICATION)\s+INTEGRATION)\b",
    r"^ALTER\b.*\bRESUME\b",  # a dynamic table, materialized view, task, alert, warehouse or pool starts spending
    r"\bPIPE_EXECUTION_PAUSED\s*=\s*FALSE\b",
    r"^ALTER\b.*\b(ADD\s+SEARCH\s+OPTIMIZATION|CLUSTER\s+BY|RESOURCE_MONITOR)\b",
    r"^ALTER\s+(RESOURCE\s+MONITOR|SHARE)\b",
    r"^COPY\s+INTO\b.*\bPURGE\s*=\s*TRUE\b",  # deletes the stage files
    r"^GRANT\b.*\b(MANAGE\s+GRANTS|SYSADMIN|ON\s+ACCOUNT)\b",
    r"\bSET\s+MASKING\s+POLICY\b.*\bFORCE\b",
    r"^WITH\b.*\bCALL\b",  # an anonymous procedure: WITH p AS PROCEDURE ... CALL p()
)
# SYSTEM$ functions that only read. Any other SYSTEM$ call needs --destructive: many cancel queries, send mail,
# enable tasks or change the account, and this token can do all of that (B3).
READ_SYSTEM_FUNCTIONS = frozenset({
    "WAIT", "TYPEOF", "CLUSTERING_INFORMATION", "CLUSTERING_DEPTH", "CLUSTERING_RATIO", "STREAM_HAS_DATA",
    "PIPE_STATUS", "GET_TAG", "GET_TAG_ALLOWED_VALUES", "GET_TAG_ON_CURRENT_COLUMN", "GET_TAG_ON_CURRENT_TABLE",
    "EXPLAIN_PLAN_JSON", "EXPLAIN_JSON_TO_TEXT", "GET_PREDECESSOR_RETURN_VALUE", "CURRENT_USER_TASK_NAME",
    "TASK_RUNTIME_INFO", "GET_TASK_GRAPH_CONFIG", "ALLOWLIST", "ALLOWLIST_PRIVATELINK", "WHITELIST",
    "WHITELIST_PRIVATELINK", "GET_SNOWFLAKE_PLATFORM_INFO", "BEHAVIOR_CHANGE_BUNDLE_STATUS", "GET_PRIVATELINK_CONFIG",
    "LAST_CHANGE_COMMIT_TIME", "DATABASE_REFRESH_PROGRESS", "ESTIMATE_SEARCH_OPTIMIZATION_COSTS",
    "ESTIMATE_QUERY_ACCELERATION", "GET_CLASSIFICATION_RESULT", "LIST_APPLICATION_RESTRICTED_FEATURES",
})


def classify(statement: str) -> str:
    """"read", "write" or "destructive" for one stripped statement (see split_statements). "destructive" is anything
    that needs a person's yes: it removes or replaces something, starts spend, changes security, or does what its
    text does not show."""
    words = re.findall(r"[A-Za-z_][A-Za-z0-9_$]*", statement.upper())
    if not words:
        return "read"
    verb = words[0]
    normal = " ".join(statement.upper().split())
    if any(re.search(p, normal) for p in GUARDED_PATTERNS):
        return "destructive"
    if any(name not in READ_SYSTEM_FUNCTIONS for name in re.findall(r"\bSYSTEM\$(\w+)", normal)):
        return "destructive"
    if verb == "WITH":  # a CTE: read only when no write verb follows anywhere
        hits = WRITE_WORDS.intersection(words)
        if not hits:
            return "read"
        return "destructive" if hits & DESTRUCTIVE_VERBS or "UPDATE" in hits else "write"
    if verb in READ_ONLY:
        return "read"
    if verb in DESTRUCTIVE_VERBS:
        return "destructive"
    if verb == "ALTER" and {"DROP", "SWAP", "RENAME"} & set(words):
        return "destructive"
    return "write"


def _ident(name: str) -> str:
    """One identifier as Snowflake resolves it: unquoted is upper-cased, "quoted" keeps its case."""
    name = name.strip()
    return name[1:-1].replace('""', '"') if len(name) > 1 and name[0] == name[-1] == '"' else name.upper()


_USE_RE = re.compile(r'^USE\s+(?:(DATABASE|SCHEMA)\s+)?((?:"[^"]+"|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|[\w$]+))?)\s*$',
                     re.IGNORECASE)


def _use(statement: str, db: str | None, schema: str | None) -> tuple[str | None, str | None]:
    """The (database, schema) after a USE statement; unchanged for USE ROLE / WAREHOUSE / SECONDARY ROLES. USE
    DATABASE selects its PUBLIC schema (measured 2026-10-19: CURRENT_SCHEMA() was PUBLIC after it)."""
    match = _USE_RE.match(" ".join(statement.split()))
    if not match:
        return db, schema
    kind = (match.group(1) or "").upper()
    parts = [p.strip() for p in re.findall(r'"[^"]+"|[\w$]+', match.group(2))]
    if kind in ("", "DATABASE") and len(parts) == 1:
        if kind == "" and parts[0].upper() in ("ROLE", "WAREHOUSE", "SECONDARY"):
            return db, schema
        return _ident(parts[0]), "PUBLIC"
    if len(parts) == 2:
        return _ident(parts[0]), _ident(parts[1])
    return db, _ident(parts[0])


def _statements(sql: str) -> list[tuple[str, str]]:
    """Each statement of ``sql`` (split at ``;`` and ``->>``) as (stripped, flat), both upper-cased with whitespace
    collapsed. ``stripped`` blanks literals, for classifying. ``flat`` turns comments into a space but keeps the text
    of strings, $$ bodies and "quoted" names without their quotes, for finding names: a comment inside a name
    (DB./**/DEMO), a name in IDENTIFIER('...') or EXECUTE IMMEDIATE '...', and "SYSTEM$..." (round 2, 2026-10-19)."""
    out: list[tuple[str, str]] = []
    strip: list[str] = []
    flat: list[str] = []

    def push() -> None:
        a, b = " ".join("".join(strip).upper().split()), " ".join("".join(flat).upper().split())
        if a or b:
            out.append((a, b))
        strip.clear()
        flat.clear()

    for kind, text in _lex(sql):
        if kind == "end":
            push()
        elif kind == "code":
            for k, part in enumerate(text.split("->>")):
                if k:
                    push()
                strip.append(part)
                flat.append(part)
        elif kind == "stage":
            strip.append(" @stage ")
            flat.append(f" {text} ")
        elif kind == "comment":
            strip.append(" ")
            flat.append(" ")
        elif kind == "ident":
            strip.append(' "x" ')
            flat.append(text[1:-1].replace('""', '"'))
        elif kind == "string":
            strip.append(" '' ")
            flat.append(f" {text[1:-1]} ")
        else:  # dollar
            strip.append(" '' ")
            flat.append(f" {text[2:-2]} ")
    push()
    return out


def hidden_system_calls(sql: str) -> list[str]:
    """SYSTEM$ functions outside the read-only list that ``sql`` names anywhere, quoted or in a string included
    ("SYSTEM$CANCEL_ALL_QUERIES"(1), IDENTIFIER('SYSTEM$...')): each needs a person's yes."""
    names = {n for _, flat in _statements(sql) for n in re.findall(r"\bSYSTEM\$(\w+)", flat)}
    return sorted(n for n in names if n not in READ_SYSTEM_FUNCTIONS)


def protected_hits(sql: str, protected: Sequence[str], database: str | None = None,
                   schema: str | None = None) -> list[str]:
    """The protected DB.SCHEMA entries ``sql`` touches, for SQL that changes Snowflake:
    (a) anywhere in the text, comments, strings and $$ bodies included: DB.SCHEMA, and DB..x for PUBLIC (``..`` is
        the PUBLIC schema, measured);
    (b) in a statement that changes Snowflake (USE excepted): the protected database at database scope (CREATE OR
        REPLACE / ALTER / SWAP WITH / GRANT ... IN DATABASE DB), since it holds the protected schemas;
    (c) in such a statement, under a session database of that name (from --database or USE DATABASE / USE SCHEMA, which
        are followed through the SQL): SCHEMA.x, SCHEMA s and SWAP WITH s, in strings and $$ bodies too;
    (d) any such statement while the session itself is in a protected schema."""
    targets = []
    for item in protected:
        db, _, sch = item.upper().partition(".")
        if db and sch:
            targets.append((item, db, sch))
    statements = _statements(sql)
    raw = " ".join(sql.upper().replace('"', "").split())
    texts = [raw] + [flat for _, flat in statements]
    hits = set()
    for item, db, sch in targets:
        names = [rf"(?<![\w$]){re.escape(db)}\s*\.\s*{re.escape(sch)}(?![\w$])"]
        if sch == "PUBLIC":
            names.append(rf"(?<![\w$]){re.escape(db)}\s*\.\s*\.")
        if any(re.search(name, text) for name in names for text in texts):
            hits.add(item)
    db_ctx = _ident(database) if database else None
    schema_ctx = _ident(schema) if schema else None
    for stripped, flat in statements:
        if stripped.startswith("USE "):
            db_ctx, schema_ctx = _use(flat, db_ctx, schema_ctx)
            continue
        if classify(stripped) == "read":
            continue
        for item, db, sch in targets:
            name = re.escape(sch)
            if re.search(rf"\b(DATABASE\s+(IF\s+(NOT\s+)?EXISTS\s+)?|SWAP\s+WITH\s+){re.escape(db)}(?![\w$.])", flat):
                hits.add(item)
            elif db_ctx == db and (re.search(rf"(?<![\w$.]){name}\s*\.\s*[\w$]", flat)
                                   or re.search(rf"\b(SCHEMA\s+(IF\s+(NOT\s+)?EXISTS\s+)?|SWAP\s+WITH\s+){name}(?![\w$.])",
                                                flat)):
                hits.add(item)
            elif (db_ctx, schema_ctx) == (db, sch):
                hits.add(item)
    return sorted(hits)


# A write whose target is a variable or a bind cannot be checked against the protected schemas, so it is refused when
# any are configured: IDENTIFIER($v) / IDENTIFIER(:v) / IDENTIFIER(?) and EXECUTE IMMEDIATE of a variable, also inside
# a $$ body.
_OPAQUE_TARGET = re.compile(r"\bIDENTIFIER\s*\(\s*[$:?]|\bEXECUTE\s+IMMEDIATE\s+[$:]", re.IGNORECASE)


def opaque_target(sql: str) -> bool:
    return any(_OPAQUE_TARGET.search(flat) for _, flat in _statements(sql))


def guard(sql: str, *, write: bool, destructive: bool, protected: Sequence[str] = (), database: str | None = None,
          schema: str | None = None) -> list[str]:
    """Refuse ``sql`` unless the flags allow every statement in it, and refuse any SQL that changes Snowflake and
    names a protected schema (no flag overrides that). Returns the statements' classes."""
    statements = split_statements(sql)
    if not statements:
        raise UsageError("no SQL statement given")
    classes = [classify(s) for s in statements]
    if protected and any(kind != "read" for kind in classes):
        hits = protected_hits(sql, protected, database, schema)
        if hits:
            raise Refused(f"refused: this SQL changes Snowflake and names the protected schema(s) {', '.join(hits)} "
                          "(read-only by the project rule; config.json protected_schemas)")
        if opaque_target(sql):
            raise Refused("refused: this SQL changes Snowflake through a variable name (IDENTIFIER($v) or EXECUTE "
                          "IMMEDIATE :v), which cannot be checked against the protected schemas; write the name out")
    system = hidden_system_calls(sql)
    if system and not (write and destructive):
        raise Refused(f"refused: this SQL calls SYSTEM${', SYSTEM$'.join(system)}, which may cancel queries, send mail, "
                      "start tasks or change the account. Confirm with the user, then pass --write --destructive")
    for text, kind in zip(statements, classes):
        head = " ".join(text.split())[:80]
        if kind == "destructive" and not (write and destructive):
            raise Refused(f"refused a statement that needs a person's yes ({head} ...): it removes or replaces "
                          "something, starts spend, changes security, or does what its text does not show. Confirm "
                          "with the user, then pass --write --destructive")
        if kind == "write" and not write:
            raise Refused(f"refused a statement that changes Snowflake ({head} ...): pass --write if that is intended")
    return classes


# ---------------------------------------------------------------------------------------------------------------------
# Bindings and result decoding
# ---------------------------------------------------------------------------------------------------------------------


def parse_bind(spec: str) -> dict[str, Any]:
    """``type:value`` -> a SQL API binding. Types: str, int, num, float, bool, date, ts (naive UTC), null."""
    kind, sep, value = spec.partition(":")
    if not sep:
        kind, value = "str", spec
    kind = kind.lower()
    try:
        if kind in ("str", "text"):
            return {"type": "TEXT", "value": value}
        if kind == "null":
            return {"type": "TEXT", "value": None}
        if kind == "int":
            return {"type": "FIXED", "value": str(int(value))}
        if kind in ("num", "decimal"):
            number = Decimal(value)
            if not number.is_finite():
                raise ValueError("not finite")
            return {"type": "FIXED", "value": format(number, "f")}
        if kind in ("float", "real"):
            real = float(value)
            if real != real or real in (float("inf"), float("-inf")):
                raise ValueError("not finite")
            return {"type": "REAL", "value": repr(real)}
        if kind == "bool":
            if value.lower() not in ("true", "false", "1", "0"):
                raise ValueError("not a boolean")
            return {"type": "BOOLEAN", "value": "true" if value.lower() in ("true", "1") else "false"}
        if kind == "date":
            day = date.fromisoformat(value)
            return {"type": "DATE", "value": str((day - EPOCH_DATE).days * 86_400_000)}
        if kind in ("ts", "timestamp"):
            moment = datetime.fromisoformat(value)
            if moment.tzinfo is not None:
                raise ValueError("pass naive UTC, without an offset")
            delta = moment - EPOCH
            nanos = (delta.days * 86_400 + delta.seconds) * 1_000_000_000 + delta.microseconds * 1_000
            return {"type": "TIMESTAMP_NTZ", "value": str(nanos)}
    except (ValueError, InvalidOperation) as exc:
        raise UsageError(f"bad --bind {spec!r}: {exc}") from None
    raise UsageError(f"bad --bind type {kind!r}: use str, int, num, float, bool, date, ts or null")


def _epoch_split(text: str) -> tuple[int, str]:
    """"1695945600.123456789" -> (whole seconds, floor-rounded; the fraction's digits, trailing zeros dropped). Every
    digit is kept, so TIMESTAMP(9) and TIME(9) lose nothing; a " <offset>" suffix is ignored."""
    value = Decimal(text.split(" ", 1)[0])
    whole = int(value.to_integral_value(rounding="ROUND_FLOOR"))
    fraction = format(value - whole, "f")
    digits = fraction.split(".", 1)[1].rstrip("0") if "." in fraction else ""
    return whole, digits


def _to_timestamp(text: str, kind: str) -> str:
    whole, digits = _epoch_split(text)
    moment = EPOCH + timedelta(seconds=whole)
    tail = f".{digits}" if digits else ""
    if kind == "tz" and " " in text:  # TIMESTAMP_TZ: "<epoch> <offset minutes + 1440>"; the epoch part is UTC
        offset = int(text.split(" ", 1)[1]) - 1440
        local = moment + timedelta(minutes=offset)
        sign = "+" if offset >= 0 else "-"
        hours, minutes = divmod(abs(offset), 60)
        return f"{local.isoformat(sep=' ')}{tail}{sign}{hours:02d}:{minutes:02d}"
    # TIMESTAMP_LTZ arrives as the UTC instant without the session's zone, so it is labelled UTC, never left bare.
    return f"{moment.isoformat(sep=' ')}{tail}" + ("+00:00" if kind == "ltz" else "")


class _JsonNull:
    """A VARIANT holding JSON null, which the SQL API sends as the text "null" (a SQL NULL arrives as no value at
    all). It prints as null in a table and in CSV, where a SQL NULL prints as NULL / an empty field; JSON output
    writes both as null. It is falsy, like None."""

    __slots__ = ()

    def __repr__(self) -> str:
        return "null"

    __str__ = __repr__

    def __bool__(self) -> bool:
        return False


JSON_NULL = _JsonNull()
_JSON_TOKENS = re.compile(r'"(?:\\.|[^"\\])*"|\bundefined\b')


def _to_json(text: str) -> Any:
    """A VARIANT, OBJECT or ARRAY: exact decimals (never floats), and SQL NULL inside an ARRAY (which Snowflake writes
    as a bare ``undefined``) as None; Infinity / NaN (an overflowed double) as Decimal, so JSON output stays valid. A
    JSON null and a SQL NULL both decode to None."""
    if text.strip() == "null":
        return JSON_NULL
    try:
        return json.loads(text, parse_float=Decimal, parse_constant=Decimal)
    except ValueError:
        pass
    fixed = _JSON_TOKENS.sub(lambda m: m.group(0) if m.group(0).startswith('"') else "null", text)
    try:
        return json.loads(fixed, parse_float=Decimal, parse_constant=Decimal)
    except ValueError:
        return text


def converter(type_name: str, scale: Any) -> Callable[[str], Any]:
    """The decoder of one column. The SQL API returns every value as a string (or null)."""
    kind = type_name.lower()
    if kind == "fixed":
        return (lambda t: int(t) if "." not in t and "e" not in t.lower() else int(Decimal(t))) if not scale \
            else Decimal
    if kind == "real":
        return float
    if kind == "boolean":
        return lambda t: t.strip().lower() in ("true", "1")
    if kind == "timestamp_ntz":
        return lambda t: _to_timestamp(t, "ntz")
    if kind == "timestamp_ltz":
        return lambda t: _to_timestamp(t, "ltz")
    if kind == "timestamp_tz":
        return lambda t: _to_timestamp(t, "tz")
    if kind == "date":
        return lambda t: (EPOCH_DATE + timedelta(days=int(t))).isoformat()
    if kind == "time":
        def to_time(t: str) -> str:
            whole, digits = _epoch_split(t)
            clock = (datetime.min + timedelta(seconds=whole)).time().isoformat()
            return f"{clock}.{digits}" if digits else clock
        return to_time
    if kind in ("variant", "object", "array"):
        return _to_json
    return lambda t: t


class Result:
    """One statement's result: column names and types, decoded rows, and the statement handle."""

    def __init__(self, columns: list[str], types: list[str], rows: list[list[Any]], handle: str | None,
                 message: str | None = None) -> None:
        self.columns, self.types, self.rows, self.handle, self.message = columns, types, rows, handle, message

    def as_dicts(self) -> list[dict[str, Any]]:
        return [dict(zip(self.columns, row)) for row in self.rows]


# ---------------------------------------------------------------------------------------------------------------------
# The SQL API client
# ---------------------------------------------------------------------------------------------------------------------


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse redirects: urllib would send the Authorization header to the redirect target."""

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> NoReturn:
        raise SfError(f"refused a redirect (HTTP {code})", code="redirect_refused")


class Client:
    def __init__(self, account_url: str, token: str, *, role: str | None = None, warehouse: str | None = None,
                 database: str | None = None, schema: str | None = None, timeout_s: float = 300,
                 http_timeout_s: float = 60, max_retries: int = 4, opener: Any = None,
                 sleep: Callable[[float], None] = time.sleep) -> None:
        self.origin = check_origin(account_url)
        if not token:
            raise UsageError("empty token")
        self._token = token
        # The SQL API matches these case-sensitively ("compute_wh" set no warehouse, measured 2026-10-19), so each is
        # resolved as SQL would resolve it: unquoted upper-cased, "quoted" kept.
        self.context = {k: _ident(v) for k, v in (("role", role), ("warehouse", warehouse), ("database", database),
                                                  ("schema", schema)) if v}
        self.timeout_s = float(timeout_s)
        self.http_timeout_s = float(http_timeout_s)
        self.max_retries = max_retries
        self._opener = opener or urllib.request.build_opener(_NoRedirect())
        self._sleep = sleep
        self._headers = {
            "Authorization": f"Bearer {token}",
            "X-Snowflake-Authorization-Token-Type": AUTH_KIND,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "User-Agent": "claude-snowflake-sql/1.0",
        }

    def __repr__(self) -> str:  # the token never appears in a repr
        return f"Client({self.origin!r}, context={self.context!r})"

    # -- public --------------------------------------------------------------------------------------------------------

    def run(self, sql: str, bindings: Sequence[dict[str, Any]] = (), *, multi: bool = False) -> list[Result]:
        """Run ``sql`` and wait for it. One Result per statement (several when ``multi``)."""
        payload = self._post(sql, bindings, multi=multi, run_async=False)
        payload = self._wait(payload)
        handles = payload.get("statementHandles")
        if multi and isinstance(handles, list) and handles:
            return [self._result(self._wait(self._call("GET", self._statement_path(h)))) for h in handles]
        return [self._result(payload)]

    def submit(self, sql: str, bindings: Sequence[dict[str, Any]] = (), *, multi: bool = False) -> str:
        payload = self._post(sql, bindings, multi=multi, run_async=True)
        handle = payload.get("statementHandle")
        if not isinstance(handle, str) or not HANDLE_RE.match(handle):
            raise SfError("the SQL API returned no statement handle", code="malformed_response")
        return handle

    def status(self, handle: str) -> tuple[str, Result | None]:
        """("running", None), or ("done", result) once it finished; a failed statement raises SfError."""
        payload = self._call("GET", self._statement_path(handle))
        if payload.get("code") == IN_PROGRESS:
            return "running", None
        return "done", self._result(payload)

    def cancel(self, handle: str) -> str:
        payload = self._call("POST", self._statement_path(handle) + "/cancel", body={})
        return str(payload.get("message") or "cancel requested")

    # -- internals -----------------------------------------------------------------------------------------------------

    def _post(self, sql: str, bindings: Sequence[dict[str, Any]], *, multi: bool, run_async: bool) -> dict[str, Any]:
        body: dict[str, Any] = {"statement": sql, "timeout": int(self.timeout_s), **self.context,
                                "parameters": {"QUERY_TAG": QUERY_TAG}}
        if multi:
            body["parameters"]["MULTI_STATEMENT_COUNT"] = "0"
        if bindings:
            body["bindings"] = {str(i): b for i, b in enumerate(bindings, start=1)}
        query = {"async": "true"} if run_async else {}
        return self._call("POST", STATEMENTS_PATH, body=body, query=query, request_id=str(uuid.uuid4()))

    @staticmethod
    def _statement_path(handle: str) -> str:
        if not HANDLE_RE.match(handle):
            raise UsageError(f"not a statement handle: {handle!r}")
        return f"{STATEMENTS_PATH}/{handle}"

    def _status_path(self, payload: Mapping[str, Any]) -> str:
        url = payload.get("statementStatusUrl")
        if isinstance(url, str) and url:
            path = urlsplit(url).path
            if not path.startswith(STATEMENTS_PATH + "/"):
                raise SfError("refused a status URL outside /api/v2/statements/", code="unsafe_url")
            return urlunsplit(("", "", path, urlsplit(url).query, ""))
        handle = payload.get("statementHandle")
        if not isinstance(handle, str):
            raise SfError("the response has no statement handle", code="malformed_response")
        return self._statement_path(handle)

    def _wait(self, payload: dict[str, Any]) -> dict[str, Any]:
        deadline = time.monotonic() + self.timeout_s + 30
        interval = 0.5
        while payload.get("code") == IN_PROGRESS:
            if time.monotonic() > deadline:
                handle = payload.get("statementHandle")
                raise SfError(f"still running after {self.timeout_s:.0f} s; check it with `status {handle}`",
                              code="client_timeout")
            self._sleep(interval)
            interval = min(interval * 1.5, 5.0)
            payload = self._call("GET", self._status_path(payload))
        return payload

    def _result(self, payload: dict[str, Any]) -> Result:
        meta = payload.get("resultSetMetaData") or {}
        row_type = meta.get("rowType") or []
        columns = [str(c.get("name")) for c in row_type]
        types = [str(c.get("type", "")).lower() for c in row_type]
        decoders = [converter(t, c.get("scale")) for t, c in zip(types, row_type)]
        partitions = meta.get("partitionInfo") or [{"rowCount": len(payload.get("data") or [])}]
        raw_parts = [payload.get("data") or []]
        if len(partitions) > 1:
            path = self._status_path(payload)
            for index in range(1, len(partitions)):
                part = self._call("GET", _with_query(path, {"partition": str(index)}))
                raw_parts.append(part.get("data") or [])
        rows: list[list[Any]] = []
        for index, (raw, info) in enumerate(zip(raw_parts, partitions)):
            declared = info.get("rowCount")
            if declared is not None and int(declared) != len(raw):
                raise SfError(f"partition {index} has {len(raw)} rows but partitionInfo says {declared}",
                              code="truncated_result")
            for row in raw:
                if not isinstance(row, list) or len(row) != len(columns):
                    raise SfError("a result row does not match the column list", code="malformed_response")
                rows.append([None if cell is None else dec(cell) for dec, cell in zip(decoders, row)])
        total = meta.get("numRows")
        if total is not None and int(total) != len(rows):
            raise SfError(f"got {len(rows)} rows but numRows says {total}", code="truncated_result")
        return Result(columns, types, rows, payload.get("statementHandle"), payload.get("message"))

    def _call(self, method: str, path: str, *, body: dict[str, Any] | None = None,
              query: Mapping[str, str] | None = None, request_id: str | None = None) -> dict[str, Any]:
        for attempt in range(self.max_retries + 1):
            params = dict(query or {})
            if request_id is not None:
                params["requestId"] = request_id
                if attempt > 0:
                    params["retry"] = "true"  # the same request id: Snowflake will not run the statement twice
            url = _with_query(path, params) if params else path
            try:
                return self._once(method, url, body)
            except _Transient as exc:
                if attempt == self.max_retries:
                    raise SfError(f"{method} failed after {attempt + 1} attempts: {self._scrub(exc.reason)}",
                                  code=exc.code, retryable=True) from None
                delay = min(30.0, 1.0 * 2 ** attempt)
                wait = delay / 2 + random.uniform(0, delay / 2)  # noqa: S311 (jitter, not security)
                if exc.retry_after_s is not None:
                    wait = max(wait, min(60.0, exc.retry_after_s))
                self._sleep(wait)
        raise AssertionError("unreachable")

    def _once(self, method: str, path: str, body: dict[str, Any] | None) -> dict[str, Any]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(self.origin + path, data=data, headers=self._headers, method=method)
        try:
            with self._opener.open(request, timeout=self.http_timeout_s) as response:
                status = int(response.status)
                raw = _read_body(response, response.headers.get("Content-Encoding"))
        except urllib.error.HTTPError as exc:
            self._raise_http(exc)
        except TimeoutError:
            raise _Transient("timed out", code="timeout") from None
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise _Transient("timed out", code="timeout") from None
            if isinstance(exc.reason, (ConnectionResetError, ConnectionAbortedError)):
                raise _Transient("connection reset", code="connection_reset") from None
            raise SfError(f"connection failed: {self._scrub(str(exc.reason))}", code="connection_error") from None
        except (ConnectionResetError, ConnectionAbortedError, http.client.IncompleteRead):
            raise _Transient("connection reset", code="connection_reset") from None
        except OSError as exc:
            raise SfError(f"connection failed: {self._scrub(str(exc))}", code="connection_error") from None
        try:
            payload = json.loads(raw) if raw else {}
        except ValueError:
            raise SfError(f"HTTP {status}: the response is not JSON", code="malformed_response") from None
        if not isinstance(payload, dict):
            raise SfError(f"HTTP {status}: the response is not a JSON object", code="malformed_response")
        return payload

    def _raise_http(self, exc: urllib.error.HTTPError) -> NoReturn:
        try:
            raw = _read_body(exc, exc.headers.get("Content-Encoding") if exc.headers else None)
            detail = json.loads(raw) if raw else {}
        except (OSError, ValueError, SfError):
            detail = {}
        code = str(detail.get("code")) if isinstance(detail, dict) and detail.get("code") is not None else None
        message = str(detail.get("message") or "") if isinstance(detail, dict) else ""
        if exc.code in RETRYABLE_STATUS:
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            try:
                seconds = float(retry_after) if retry_after is not None else None
            except ValueError:
                seconds = None
            raise _Transient(f"HTTP {exc.code}", code=code or str(exc.code), retry_after_s=seconds)
        hint = ""
        if exc.code == 401:
            hint = " (the token is invalid, expired or not allowed from this network)"
        text = f"HTTP {exc.code}{hint}: {message}" if message else f"HTTP {exc.code}{hint}"
        raise SfError(self._scrub(text), code=code or str(exc.code)) from None

    def _scrub(self, text: str) -> str:
        return text.replace(self._token, "***")[:MAX_MESSAGE_CHARS]


def _with_query(path: str, extra: Mapping[str, str]) -> str:
    parts = urlsplit(path)
    query = dict(parse_qsl(parts.query))
    query.update(extra)
    return urlunsplit(("", "", parts.path, urlencode(query), ""))


def _read_body(response: Any, encoding: str | None) -> bytes:
    raw: bytes = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise SfError("the response is too large", code="response_too_large")
    if encoding and encoding.lower() == "gzip":
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as fh:
                raw = fh.read(MAX_RESPONSE_BYTES + 1)
        except (OSError, EOFError):
            raise SfError("the response is not valid gzip", code="malformed_response") from None
        if len(raw) > MAX_RESPONSE_BYTES:
            raise SfError("the response is too large", code="response_too_large")
    return raw


# ---------------------------------------------------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------------------------------------------------


def _cell(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str, ensure_ascii=False)
    return str(value)


def _jsonable(value: Any) -> Any:
    """``value`` made safe for strict JSON (RFC 8259): a non-finite float or Decimal becomes its name as a string
    (FLOAT 'inf' / '-inf' / 'nan'), JSON_NULL becomes null, and everything else that json cannot write becomes str."""
    if value is JSON_NULL:
        return None
    if isinstance(value, float) and value != value:
        return "NaN"
    if isinstance(value, float) and value in (float("inf"), float("-inf")):
        return "Infinity" if value > 0 else "-Infinity"
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _csv_field(text: str) -> str:
    """RFC 4180 quoting, plus quotes around an empty string so it reads apart from NULL (an empty field)."""
    if text == "" or any(c in text for c in ',"\r\n') or text != text.strip():
        return '"' + text.replace('"', '""') + '"'
    return text


def render(result: Result, fmt: str, max_rows: int | None, width: int, out: Any = sys.stdout) -> None:
    rows = result.rows if max_rows is None else result.rows[:max_rows]
    if fmt == "json":
        json.dump([{c: _jsonable(v) for c, v in zip(result.columns, r)} for r in rows], out, ensure_ascii=False,
                  indent=2, allow_nan=False)
        out.write("\n")
    elif fmt == "jsonl":
        for r in rows:
            out.write(json.dumps({c: _jsonable(v) for c, v in zip(result.columns, r)}, ensure_ascii=False,
                                 allow_nan=False) + "\n")
    elif fmt == "csv":
        out.write(",".join(_csv_field(c) for c in result.columns) + "\n")
        for r in rows:
            out.write(",".join("" if v is None else _csv_field(_cell(v)) for v in r) + "\n")
    else:
        if not result.columns:
            out.write((result.message or "ok") + "\n")
            return
        cells = [[_cell(v).replace("\n", "\\n") for v in r] for r in rows]
        cells = [[c if len(c) <= width else c[:width - 1] + "…" for c in r] for r in cells]
        widths = [max([len(h)] + [len(r[i]) for r in cells]) for i, h in enumerate(result.columns)]
        line = "  ".join(h.ljust(w) for h, w in zip(result.columns, widths))
        out.write(line.rstrip() + "\n" + "  ".join("-" * w for w in widths) + "\n")
        for r in cells:
            out.write("  ".join(c.ljust(w) for c, w in zip(r, widths)).rstrip() + "\n")
    shown = len(rows)
    if fmt == "table" or shown < len(result.rows):
        more = f" (showing {shown}; raise --max-rows)" if shown < len(result.rows) else ""
        sys.stderr.write(f"[{len(result.rows)} row(s){more}; statement {result.handle}]\n")


# ---------------------------------------------------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------------------------------------------------

SHOW_KINDS = {
    "databases": "DATABASES", "schemas": "SCHEMAS", "tables": "TABLES", "views": "VIEWS",
    "procedures": "PROCEDURES", "functions": "USER FUNCTIONS", "tasks": "TASKS", "streams": "STREAMS",
    "stages": "STAGES", "warehouses": "WAREHOUSES", "roles": "ROLES", "users": "USERS",
    "dynamic-tables": "DYNAMIC TABLES", "pipes": "PIPES", "sequences": "SEQUENCES", "file-formats": "FILE FORMATS",
    "alerts": "ALERTS", "integrations": "INTEGRATIONS", "secrets": "SECRETS", "columns": "COLUMNS",
    "masking-policies": "MASKING POLICIES", "objects": "OBJECTS",
}
NAME_RE = re.compile(r'^(?:[A-Za-z_][A-Za-z0-9_$]*|"[^"]+")(?:\.(?:[A-Za-z_][A-Za-z0-9_$]*|"[^"]+")){0,2}$')
KIND_RE = re.compile(r"^[A-Za-z_ ]{2,40}$")


def _name(value: str, what: str = "object name") -> str:
    if not NAME_RE.match(value):
        raise UsageError(f"not a valid {what}: {value!r} (use NAME, SCHEMA.NAME or DB.SCHEMA.NAME)")
    return value


def _kind(value: str) -> str:
    if not KIND_RE.match(value):
        raise UsageError(f"not a valid object kind: {value!r}")
    return value.upper()


def _sql_literal(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def read_sql(args: argparse.Namespace) -> str:
    if getattr(args, "file", None):
        return Path(args.file).expanduser().read_text(encoding="utf-8")
    if args.sql in (None, "-"):
        return sys.stdin.read()
    return str(args.sql)


def build_sql(args: argparse.Namespace) -> tuple[str, bool]:
    """The SQL a command runs, and whether it is generated (and so known to be read-only)."""
    cmd = args.command
    if cmd == "whoami":
        return ("SELECT CURRENT_USER() AS USER_NAME, CURRENT_ROLE() AS ROLE, CURRENT_SECONDARY_ROLES() AS "
                "SECONDARY_ROLES, CURRENT_WAREHOUSE() AS WAREHOUSE, CURRENT_DATABASE() AS DATABASE, "
                "CURRENT_SCHEMA() AS SCHEMA, CURRENT_ACCOUNT() AS ACCOUNT, CURRENT_ORGANIZATION_NAME() AS "
                "ORGANIZATION, CURRENT_REGION() AS REGION, CURRENT_VERSION() AS VERSION, "
                "CURRENT_TIMESTAMP() AS NOW"), True
    if cmd == "explain":
        return "EXPLAIN USING TEXT " + read_sql(args).strip().rstrip(";"), False
    if cmd == "ls":
        if args.kind not in SHOW_KINDS:
            raise UsageError(f"unknown kind {args.kind!r}; one of: {', '.join(SHOW_KINDS)}")
        sql = f"SHOW {SHOW_KINDS[args.kind]}"
        if args.like:
            sql += f" LIKE {_sql_literal(args.like)}"
        if args.in_:
            scope = _name(args.in_, "scope")
            parts = len(re.findall(r'"[^"]+"|[^."]+', scope))
            if parts == 3 and args.kind != "columns":
                raise UsageError("--in DB.SCHEMA.TABLE is only for `ls columns`")
            sql += f" IN {('DATABASE', 'SCHEMA', 'TABLE')[parts - 1]} {scope}"
        elif args.account:
            sql += " IN ACCOUNT"
        return sql, True
    if cmd == "describe":
        return f"DESCRIBE {_kind(args.kind)} {_name(args.name)}", True
    if cmd == "sample":
        n = int(args.n)
        if not 1 <= n <= 100_000:
            raise UsageError("-n must be 1 to 100000")
        return f"SELECT * FROM {_name(args.name)} LIMIT {n}", True
    if cmd == "count":
        return f"SELECT COUNT(*) AS ROW_COUNT FROM {_name(args.name)}", True
    if cmd == "ddl":
        return f"SELECT GET_DDL({_sql_literal(_kind(args.kind))}, {_sql_literal(_name(args.name))}, TRUE) AS DDL", True
    if cmd == "grants":
        if args.to_role:
            return f"SHOW GRANTS TO ROLE {_name(args.to_role, 'role')}", True
        if args.of_role:
            return f"SHOW GRANTS OF ROLE {_name(args.of_role, 'role')}", True
        if args.to_user:
            return f"SHOW GRANTS TO USER {_name(args.to_user, 'user')}", True
        if args.on:
            kind, _, name = args.on.strip().rpartition(" ")
            return f"SHOW GRANTS ON {_kind(kind or 'TABLE')} {_name(name)}", True
        return "SHOW GRANTS", True
    if cmd == "history":
        minutes = int(args.minutes)
        if not 1 <= minutes <= 10_080:
            raise UsageError("--minutes must be 1 to 10080 (7 days)")
        sql = ("SELECT START_TIME, QUERY_ID, USER_NAME, ROLE_NAME, WAREHOUSE_NAME, EXECUTION_STATUS, "
               "TOTAL_ELAPSED_TIME/1000 AS ELAPSED_S, ROWS_PRODUCED, BYTES_SCANNED, ERROR_MESSAGE, "
               "LEFT(QUERY_TEXT, 200) AS QUERY_TEXT "
               "FROM TABLE(SNOWFLAKE.INFORMATION_SCHEMA.QUERY_HISTORY("
               f"END_TIME_RANGE_START => DATEADD('minute', -{minutes}, CURRENT_TIMESTAMP()), "
               f"RESULT_LIMIT => {int(args.limit)}))")
        if args.failed:
            sql += " WHERE EXECUTION_STATUS = 'FAIL'"
        return sql + " ORDER BY START_TIME DESC", True
    if cmd == "credits":
        days = int(args.days)
        if not 1 <= days <= 365:
            raise UsageError("--days must be 1 to 365")
        return ("SELECT TO_DATE(START_TIME) AS DAY, WAREHOUSE_NAME, ROUND(SUM(CREDITS_USED), 3) AS CREDITS, "
                "ROUND(SUM(CREDITS_USED_COMPUTE), 3) AS COMPUTE, ROUND(SUM(CREDITS_USED_CLOUD_SERVICES), 3) AS "
                "CLOUD_SERVICES FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY "
                f"WHERE START_TIME >= DATEADD('day', -{days}, CURRENT_DATE()) GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC"), \
            True
    return read_sql(args), False


def make_client(args: argparse.Namespace) -> Client:
    config = load_config(Path(args.config).expanduser() if args.config else CONFIG_PATH, args.profile)
    if getattr(args, "connection", None) is not None:  # Snowflake CLI connection: over the profile, under flags
        config.update(connection_from_toml(args.connection or None))
    token_var = args.token_var or config.get("token_var") or "TMP_PAT"
    account_url = args.account_url or config.get("account_url")
    if not account_url:
        raise UsageError("no account_url: set it in config.json or pass --account-url")
    token = resolve_token(token_var)
    client = Client(account_url, token, role=args.role or config.get("role"),
                    warehouse=args.warehouse or config.get("warehouse"),
                    database=args.database or config.get("database"), schema=args.schema or config.get("schema"),
                    timeout_s=args.timeout)
    client.token_note = f"{len(token)} chars from {token_var}"  # the length and the name, never the value
    return client


FLAGS_NEEDED = {"read": "(no flag)", "write": "--write", "destructive": "--write --destructive"}


def classify_report(sql: str, protected: Sequence[str], database: str | None, schema: str | None) -> list[str]:
    """One line per statement: number, class, the flags it needs, and its head; nothing is sent."""
    order = {"read": 0, "write": 1, "destructive": 2}
    db, sch = (_ident(database) if database else None), (_ident(schema) if schema else None)
    lines = []
    for i, text in enumerate(split_script(sql), 1):
        # The strictest part decides: a ->> chain is one piece here but several statements to the guard.
        kind = max((classify(part) for part in split_statements(text)), key=order.__getitem__, default="read")
        need = FLAGS_NEEDED[kind]
        if kind != "read" and (protected_hits(text, protected, db, sch)
                               or (protected and _OPAQUE_TARGET.search(_strip_literals(text)))):
            need = "REFUSED (protected schema or a variable target, no flag overrides it)"
        lines.append(f"#{i} {kind} {need} | {' '.join(text.split())[:100]}")
        stripped = " ".join(_strip_literals(text, keep_identifiers=True).split())
        if stripped.upper().startswith("USE "):  # later statements run in the database and schema it selects
            db, sch = _use(stripped, db, sch)
    # The per-statement lines explain; the guard over the whole SQL decides (round 2: a protected name or a variable
    # target in one statement refuses the SQL that another statement writes with). This line is the verdict.
    for flags, write, destructive in (("(no flag)", False, False), ("--write", True, False),
                                      ("--write --destructive", True, True)):
        try:
            guard(sql, write=write, destructive=destructive, protected=protected, database=database, schema=schema)
        except Refused:
            continue
        lines.append(f"guard: runs with {flags}")
        return lines
    lines.append("guard: REFUSED whatever the flags (a protected schema, or a target it cannot check)")
    return lines


def run(args: argparse.Namespace) -> int:
    if args.command in ("status", "cancel"):
        if args.command == "cancel" and not args.write:  # it stops a statement, possibly another user's
            raise Refused("cancel changes Snowflake (it stops a running statement, perhaps someone else's): confirm "
                          "the handle is yours, then pass --write")
        client = make_client(args)
        if args.command == "cancel":
            print(client.cancel(args.handle))
            return EXIT_OK
        try:
            state, result = client.status(args.handle)
        except SfError as exc:
            if exc.code != "000604":  # Snowflake's code for "SQL execution canceled"
                raise
            state, result = "canceled", None
        if result is None:
            print(f"{args.handle}: {state}")
            return EXIT_OK
        render(result, args.format, args.max_rows, args.width)
        return EXIT_OK
    if args.command == "classify":
        try:
            config = load_config(Path(args.config).expanduser() if args.config else CONFIG_PATH, args.profile)
        except UsageError:
            config = {}
        protected = config.get("protected_schemas")
        for line in classify_report(read_sql(args), DEFAULT_PROTECTED if protected is None else protected,
                                    args.database or config.get("database"), args.schema or config.get("schema")):
            print(line)
        return EXIT_OK
    sql, generated = build_sql(args)
    bindings = [parse_bind(b) for b in getattr(args, "bind", None) or []]
    multi = bool(getattr(args, "multi", False))
    each = bool(getattr(args, "each", False))
    if each and multi:
        raise UsageError("--each sends one request per statement and --multi one request for all: pick one")
    if each and bindings:
        raise UsageError("--each cannot take --bind: say which statement a value belongs to by running it alone")
    if not generated:
        try:
            config = load_config(Path(args.config).expanduser() if args.config else CONFIG_PATH, args.profile)
        except UsageError:
            config = {}  # the guard still runs, with the built-in protected list; the connection reports the error
        protected = config.get("protected_schemas")
        classes = guard(sql, write=getattr(args, "write", False), destructive=getattr(args, "destructive", False),
                        protected=DEFAULT_PROTECTED if protected is None else protected,
                        database=args.database or config.get("database"), schema=args.schema or config.get("schema"))
        count = len(split_script(sql))  # as Snowflake counts them: a ->> chain is one statement, a ; ends one
        if count > 1 and not (multi or each):
            raise UsageError(f"{count} statements given: pass --multi (one request) or --each (one request "
                             "per statement)")
    if getattr(args, "dry_run", False):
        print(sql)
        return EXIT_OK
    client = make_client(args)
    if args.command == "whoami":
        sys.stderr.write(f"connection: {client.origin}; token {getattr(client, 'token_note', 'set')}; context "
                         f"{client.context or '(the token defaults)'}\n")
    if args.command == "submit":
        print(client.submit(sql, bindings, multi=multi))
        return EXIT_OK
    out_path = getattr(args, "out", None)
    out = open(Path(out_path).expanduser(), "w", encoding="utf-8", newline="") if out_path else sys.stdout
    try:
        if each:
            statements = split_script(sql)
            results = []
            for i, text in enumerate(statements, 1):
                try:
                    results.extend(client.run(text))
                except SfError as exc:
                    ran = f"statements 1 to {i - 1} ran" if i > 1 else "none ran"
                    raise SfError(f"statement {i} of {len(statements)} failed ({' '.join(text.split())[:80]}); "
                                  f"{ran}: {exc}", code=exc.code) from None
        else:
            results = client.run(sql, bindings, multi=multi)
        if args.command == "explain" and args.format == "table":  # the plan is one text cell: print it whole
            for row in results[0].rows:
                out.write(f"{row[0]}\n")
            return EXIT_OK
        for i, result in enumerate(results):
            if len(results) > 1:
                sys.stderr.write(f"-- statement {i + 1} of {len(results)}\n")
            render(result, args.format, args.max_rows, args.width, out)
    finally:
        if out is not sys.stdout:
            out.close()
            sys.stderr.write(f"wrote {out_path}\n")
    return EXIT_OK


def parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    conn = common.add_argument_group("connection (defaults from config.json)")
    conn.add_argument("--profile", help="profile in config.json (default: its default_profile)")
    conn.add_argument("--config", help=f"config file (default {CONFIG_PATH})")
    conn.add_argument("--connection", nargs="?", const="", metavar="NAME",
                      help="take account, warehouse, database and schema from a ~/.snowflake/config.toml "
                           "connection (no NAME: its default); never its role or authentication")
    conn.add_argument("--account-url", help="https://<org>-<account>.snowflakecomputing.com")
    conn.add_argument("--token-var", help="environment variable that holds the PAT (default from config: TMP_PAT)")
    conn.add_argument("--role")
    conn.add_argument("--warehouse")
    conn.add_argument("--database")
    conn.add_argument("--schema")
    conn.add_argument("--timeout", type=float, default=300, help="statement timeout in seconds (default 300)")
    out = common.add_argument_group("output")
    out.add_argument("--format", choices=("table", "json", "jsonl", "csv"), default="table")
    out.add_argument("--max-rows", type=int, default=None, help="rows to print (default: 200 for table, all else)")
    out.add_argument("--width", type=int, default=60, help="widest table cell before it is cut (default 60)")
    out.add_argument("--out", metavar="FILE", help="write the result to FILE instead of standard output")

    sql_opts = argparse.ArgumentParser(add_help=False)
    sql_opts.add_argument("sql", nargs="?", help="the SQL text, or - for stdin")
    sql_opts.add_argument("-f", "--file", help="read the SQL from this file")
    sql_opts.add_argument("--bind", action="append", metavar="TYPE:VALUE",
                          help="a ? bind value: str:, int:, num:, float:, bool:, date:, ts:, null: (repeat in order)")
    sql_opts.add_argument("--multi", action="store_true",
                          help="several ;-separated statements in ONE request (one session: USE, SET, "
                               "RESULT_SCAN and BEGIN..COMMIT carry over)")
    sql_opts.add_argument("--each", action="store_true",
                          help="several statements, ONE request each, in order; stops at the first failure and "
                               "says which ran (each is its own session; no --bind)")
    sql_opts.add_argument("--write", action="store_true", help="allow statements that change Snowflake")
    sql_opts.add_argument("--destructive", action="store_true",
                          help="also allow DROP, TRUNCATE, DELETE, CREATE OR REPLACE, ... (needs --write)")
    sql_opts.add_argument("--dry-run", action="store_true", help="print the SQL after the guard, do not run it")

    p = argparse.ArgumentParser(prog="sf.py", description=__doc__.split("\n\n")[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("whoami", parents=[common], help="who and where the token runs as")
    sub.add_parser("sql", parents=[common, sql_opts], help="run SQL")
    sub.add_parser("explain", parents=[common, sql_opts], help="the plan of a query")
    sub.add_parser("submit", parents=[common, sql_opts], help="start SQL asynchronously; prints the handle")
    ls = sub.add_parser("ls", parents=[common], help="SHOW objects of a kind")
    ls.add_argument("kind", choices=sorted(SHOW_KINDS))
    ls.add_argument("--in", dest="in_", metavar="DB[.SCHEMA[.TABLE]]")
    ls.add_argument("--like", help="SQL LIKE pattern on the name, e.g. '%%NAME%%'")
    ls.add_argument("--account", action="store_true", help="IN ACCOUNT (for schemas, tables, ...)")
    desc = sub.add_parser("describe", parents=[common], help="DESCRIBE an object")
    desc.add_argument("name")
    desc.add_argument("--kind", default="TABLE", help="TABLE (default), VIEW, PROCEDURE, TASK, STAGE, ...")
    ddl = sub.add_parser("ddl", parents=[common], help="GET_DDL of an object")
    ddl.add_argument("name")
    ddl.add_argument("--kind", default="TABLE", help="TABLE (default), VIEW, SCHEMA, DATABASE, PROCEDURE, ...")
    grants = sub.add_parser("grants", parents=[common], help="SHOW GRANTS")
    group = grants.add_mutually_exclusive_group()
    group.add_argument("--to-role")
    group.add_argument("--of-role")
    group.add_argument("--to-user")
    group.add_argument("--on", help='e.g. "TABLE DB.SCHEMA.T" or "SCHEMA DB.S"')
    hist = sub.add_parser("history", parents=[common], help="recent queries (real time, up to 7 days)")
    hist.add_argument("--minutes", type=int, default=60)
    hist.add_argument("--limit", type=int, default=100)
    hist.add_argument("--failed", action="store_true", help="only failed queries")
    cred = sub.add_parser("credits", parents=[common], help="warehouse credits per day (ACCOUNT_USAGE, ~3 h late)")
    cred.add_argument("--days", type=int, default=7)
    sample = sub.add_parser("sample", parents=[common], help="the first N rows of a table or view")
    sample.add_argument("name")
    sample.add_argument("-n", type=int, default=10, help="rows (default 10, at most 100000)")
    count = sub.add_parser("count", parents=[common], help="COUNT(*) of a table or view")
    count.add_argument("name")
    classify_p = sub.add_parser("classify", parents=[common],
                                help="offline: how the guard reads each statement and the flags it needs")
    classify_p.add_argument("sql", nargs="?", help="the SQL text, or - for stdin")
    classify_p.add_argument("-f", "--file", help="read the SQL from this file")
    for name in ("status", "cancel"):
        sp = sub.add_parser(name, parents=[common], help=f"{name} a submitted statement")
        sp.add_argument("handle")
        if name == "cancel":
            sp.add_argument("--write", action="store_true", help="required: cancelling changes Snowflake")
    return p


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.max_rows is None and args.format == "table":
        args.max_rows = 200
    try:
        if args.max_rows is not None and args.max_rows < 0:
            raise UsageError("--max-rows must be 0 or more")
        return run(args)
    except Refused as exc:
        sys.stderr.write(f"sf.py: {exc}\n")
        return EXIT_REFUSED
    except UsageError as exc:
        sys.stderr.write(f"sf.py: {exc}\n")
        return EXIT_USAGE
    except SfError as exc:
        code = f" [{exc.code}]" if exc.code else ""
        sys.stderr.write(f"sf.py: Snowflake error{code}: {exc}\n")
        return EXIT_SNOWFLAKE
    except KeyboardInterrupt:
        sys.stderr.write("sf.py: interrupted (a submitted statement may still run: use `cancel`)\n")
        return 130


if __name__ == "__main__":
    sys.exit(main())
