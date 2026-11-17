#!/usr/bin/env python3
"""Check that a Snowflake lab teardown drops every object its setup scripts create.

Usage:
    teardown_check.py --create 01_setup.sql 02_seed.sql --teardown 99_teardown.sql
    teardown_check.py LAB_DIR          # create = every *.sql except *verify* and *teardown*

The checker reads the SQL statically. It does not connect to Snowflake.

What it understands:
  * CREATE [OR REPLACE] [modifiers] <type> [IF NOT EXISTS] <name>, for account, database
    and schema objects. Unqualified names resolve against USE DATABASE / USE SCHEMA and
    against CREATE DATABASE / CREATE SCHEMA, which also change the session context.
  * DROP <type> [IF EXISTS] <name>. Dropping a database covers every schema and object in
    it; dropping a schema covers every object in it.
  * Snowflake Scripting blocks ($$ ... $$) with DECLARE defaults, FOR i IN a TO b loops,
    LET variables, and EXECUTE IMMEDIATE '<sql>' || :var || ... . A name built from a
    non-literal value (for example LPAD(i, 2, '0')) becomes a pattern such as
    HOL_USER_{*}, and its loop range is recorded. The teardown must drop the same pattern
    over a range that covers the setup range.
  * ALTER ACCOUNT SET <param> needs ALTER ACCOUNT UNSET <param> in the teardown.

To keep an object on purpose, put this line in the teardown file:
    -- teardown-check: keep <TYPE> <NAME> <reason>
    -- teardown-check: keep PARAMETER <ACCOUNT_PARAM> <reason>
The reason is required. <NAME> is the fully qualified name or its last part; {*} matches
a looped name.

Exit codes: 0 = every created object is dropped or kept; 1 = orphans found; 2 = usage error.
Standard library only.
"""
import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Longest first, so "API INTEGRATION" wins over "INTEGRATION".
TYPES = sorted([
    "API INTEGRATION", "STORAGE INTEGRATION", "NOTIFICATION INTEGRATION", "SECURITY INTEGRATION",
    "EXTERNAL ACCESS INTEGRATION", "CATALOG INTEGRATION", "INTEGRATION",
    "GIT REPOSITORY", "SEMANTIC VIEW", "MATERIALIZED VIEW", "DYNAMIC TABLE", "EXTERNAL TABLE",
    "HYBRID TABLE", "ICEBERG TABLE", "EVENT TABLE", "NETWORK RULE", "NETWORK POLICY",
    "PASSWORD POLICY", "SESSION POLICY", "MASKING POLICY", "ROW ACCESS POLICY",
    "RESOURCE MONITOR", "DATABASE ROLE", "APPLICATION ROLE", "COMPUTE POOL", "EXTERNAL VOLUME",
    "FILE FORMAT", "CORTEX SEARCH SERVICE", "IMAGE REPOSITORY", "SERVICE", "WAREHOUSE",
    "DATABASE", "SCHEMA", "ROLE", "USER", "TABLE", "VIEW", "STAGE", "AGENT", "STREAMLIT",
    "NOTEBOOK", "PROCEDURE", "FUNCTION", "TASK", "STREAM", "PIPE", "SEQUENCE", "SECRET",
    "SHARE", "ALERT", "TAG",
], key=len, reverse=True)
ACCOUNT_TYPES = {"WAREHOUSE", "DATABASE", "ROLE", "USER", "INTEGRATION", "NETWORK POLICY",
                 "RESOURCE MONITOR", "SHARE", "COMPUTE POOL", "EXTERNAL VOLUME"}
DATABASE_TYPES = {"SCHEMA", "DATABASE ROLE"}
MODIFIERS = r"(?:(?:OR\s+REPLACE|OR\s+ALTER|TEMPORARY|TEMP|TRANSIENT|VOLATILE|SECURE|RECURSIVE|LOCAL|GLOBAL)\s+)*"
TYPE_RX = "|".join(t.replace(" ", r"\s+") for t in TYPES)
IDENT = r'(?:"(?:[^"]|"")*"|[A-Za-z_{][A-Za-z0-9_${}*]*)'
NAME_RX = rf"{IDENT}(?:\s*\.\s*{IDENT}){{0,2}}"
CREATE_RE = re.compile(rf"^\s*CREATE\s+{MODIFIERS}({TYPE_RX})\s+(?:IF\s+NOT\s+EXISTS\s+)?({NAME_RX})", re.I | re.S)
DROP_RE = re.compile(rf"^\s*DROP\s+({TYPE_RX})\s+(?:IF\s+EXISTS\s+)?({NAME_RX})", re.I | re.S)
USE_RE = re.compile(rf"^\s*USE\s+(DATABASE|SCHEMA)\s+({NAME_RX})", re.I | re.S)
ALTER_SET_RE = re.compile(r"^\s*ALTER\s+ACCOUNT\s+SET\s+([A-Za-z0-9_]+)", re.I)
ALTER_UNSET_RE = re.compile(r"^\s*ALTER\s+ACCOUNT\s+UNSET\s+([A-Za-z0-9_]+)", re.I)
KEEP_RE = re.compile(rf"--\s*teardown-check:\s*keep\s+({TYPE_RX}|PARAMETER)\s+(\S+)\s+(\S.*)$", re.I | re.M)
WILD = "{*}"


@dataclass(frozen=True)
class Obj:
    kind: str            # canonical type, e.g. "WAREHOUSE", "INTEGRATION"
    name: str            # fully qualified where it applies: DB, DB.SCHEMA, DB.SCHEMA.OBJ
    rng: tuple = None    # (lo, hi) loop range for a pattern name, None when not looped
    where: str = ""      # file:line for reports

    def label(self):
        r = f" for i in {self.rng[0]}..{self.rng[1]}" if self.rng else ""
        return f"{self.kind} {self.name}{r}"


@dataclass
class Result:
    created: list = field(default_factory=list)
    dropped: list = field(default_factory=list)
    acct_set: dict = field(default_factory=dict)     # param -> where
    acct_unset: set = field(default_factory=set)
    keeps: list = field(default_factory=list)        # (kind, name, reason)


def canon_kind(kind):
    k = re.sub(r"\s+", " ", kind.upper())
    return "INTEGRATION" if k.endswith("INTEGRATION") else k


def norm_ident(part):
    part = part.strip()
    if part.startswith('"') and part.endswith('"'):
        return part[1:-1].replace('""', '"')
    return part.upper().replace("{*}", WILD)


def split_name(name):
    return [norm_ident(p) for p in re.findall(IDENT, name)]


def qualify(kind, name, ctx):
    parts = split_name(name)
    if kind in ACCOUNT_TYPES:
        return parts[-1]
    if kind in DATABASE_TYPES:
        if len(parts) == 1:
            return f"{ctx.get('db') or '?'}.{parts[0]}"
        return ".".join(parts[-2:])
    if len(parts) == 3:
        return ".".join(parts)
    if len(parts) == 2:
        return f"{ctx.get('db') or '?'}.{parts[0]}.{parts[1]}"
    return f"{ctx.get('db') or '?'}.{ctx.get('schema') or 'PUBLIC'}.{parts[0]}"


def strip_comments(sql):
    """Remove -- and /* */ comments outside string literals and $$ blocks."""
    out, i, n = [], 0, len(sql)
    while i < n:
        if sql.startswith("$$", i):
            j = sql.find("$$", i + 2)
            j = n if j < 0 else j + 2
            out.append(strip_comments_in_block(sql[i:j]))
            i = j
        elif sql[i] == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'" and j + 1 < n and sql[j + 1] == "'":
                    j += 2
                elif sql[j] == "'":
                    break
                else:
                    j += 1
            out.append(sql[i:j + 1])
            i = j + 1
        elif sql.startswith("--", i) or sql.startswith("//", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(sql[i])
            i += 1
    return "".join(out)


def strip_comments_in_block(block):
    inner = block[2:-2] if block.endswith("$$") and len(block) >= 4 else block[2:]
    return "$$" + strip_comments(inner) + "$$"


def split_statements(sql):
    """Yield (text, line) for each top-level statement; a $$ block stays inside its statement."""
    stmts, buf, i, n, line, start_line = [], [], 0, len(sql), 1, 1
    while i < n:
        c = sql[i]
        if sql.startswith("$$", i):
            j = sql.find("$$", i + 2)
            j = n if j < 0 else j + 2
            buf.append(sql[i:j]); line += sql[i:j].count("\n"); i = j
            continue
        if c == "'":
            j = i + 1
            while j < n and not (sql[j] == "'" and not sql.startswith("''", j)):
                j += 2 if sql.startswith("''", j) else 1
            buf.append(sql[i:j + 1]); line += sql[i:j + 1].count("\n"); i = j + 1
            continue
        if c == ";":
            text = "".join(buf).strip()
            if text:
                stmts.append((text, start_line))
            buf = []; i += 1
            start_line = line
            continue
        if c == "\n":
            line += 1
            if not "".join(buf).strip():
                start_line = line
        buf.append(c); i += 1
    text = "".join(buf).strip()
    if text:
        stmts.append((text, start_line))
    return stmts


def literal_values(expr, env):
    """Evaluate 'a' || :v || 'b' into a string; non-literal parts become {*}."""
    pieces, i, n, cur = [], 0, len(expr), []
    # split on || outside quotes
    while i < n:
        if expr[i] == "'":
            j = i + 1
            while j < n and not (expr[j] == "'" and not expr.startswith("''", j)):
                j += 2 if expr.startswith("''", j) else 1
            cur.append(expr[i:j + 1]); i = j + 1
        elif expr.startswith("||", i):
            pieces.append("".join(cur).strip()); cur = []; i += 2
        else:
            cur.append(expr[i]); i += 1
    pieces.append("".join(cur).strip())
    out = []
    for p in pieces:
        if len(p) >= 2 and p[0] == "'" and p[-1] == "'":
            out.append(p[1:-1].replace("''", "'"))
        elif re.fullmatch(r":?[A-Za-z_][A-Za-z0-9_]*", p) and p.lstrip(":").lower() in env:
            out.append(env[p.lstrip(":").lower()])
        else:
            out.append(WILD)
    return "".join(out)


def resolve_int(token, ints):
    token = token.strip()
    if re.fullmatch(r"-?\d+", token):
        return int(token)
    return ints.get(token.lstrip(":").lower())


def block_statements(block):
    """Yield (sql_text, loop_range) for each EXECUTE IMMEDIATE inside a Snowflake Scripting block."""
    body = block[2:-2]
    ints, env, out = {}, {}, []
    for m in re.finditer(r"\b([A-Za-z_][A-Za-z0-9_]*)\s+(?:INTEGER|INT|NUMBER|VARCHAR|STRING)\s+DEFAULT\s+('(?:[^']|'')*'|-?\d+)", body, re.I):
        v = m.group(2)
        if v.startswith("'"):
            env[m.group(1).lower()] = v[1:-1].replace("''", "'")
        else:
            ints[m.group(1).lower()] = int(v)
    loop_stack = []
    # Tokenise into FOR / END FOR / LET / EXECUTE IMMEDIATE statements in order.
    pat = re.compile(
        r"(?P<for>\bFOR\s+\w+\s+IN\s+(?:REVERSE\s+)?(?P<lo>\S+?)\s+TO\s+(?P<hi>\S+?)\s+(?:DO|LOOP)\b)"
        r"|(?P<endfor>\bEND\s+(?:FOR|LOOP)\b)"
        r"|(?P<let>\bLET\s+(?P<var>\w+)\s+(?:\w+(?:\([^)]*\))?\s*)?:=\s*(?P<lexpr>(?:'(?:[^']|'')*'|[^;'])*);)"
        r"|(?P<exec>\bEXECUTE\s+IMMEDIATE\s+(?P<eexpr>(?:'(?:[^']|'')*'|[^;'])*);)",
        re.I | re.S)
    for m in pat.finditer(body):
        if m.group("for"):
            lo, hi = resolve_int(m.group("lo"), ints), resolve_int(m.group("hi"), ints)
            loop_stack.append((lo, hi))
        elif m.group("endfor"):
            if loop_stack:
                loop_stack.pop()
        elif m.group("let"):
            env[m.group("var").lower()] = literal_values(m.group("lexpr"), env)
        elif m.group("exec"):
            sql = literal_values(m.group("eexpr"), env)
            rng = loop_stack[-1] if loop_stack else None
            if rng and WILD not in sql:
                rng = None
            out.append((sql, rng))
    return out


def parse_file(path, res, collect):
    """collect: 'create' or 'drop'. Context (USE DATABASE/SCHEMA) is tracked per file."""
    raw = Path(path).read_text(encoding="utf-8")
    if collect == "drop":
        for m in KEEP_RE.finditer(raw):
            res.keeps.append((canon_kind(m.group(1)), m.group(2), m.group(3).strip()))
    ctx = {"db": None, "schema": None}
    for text, line in split_statements(strip_comments(raw)):
        where = f"{Path(path).name}:{line}"
        # An anonymous block (EXECUTE IMMEDIATE $$ ... $$) is read for its dynamic statements.
        # A CREATE PROCEDURE / AGENT ... $$ body is not: it is a definition, not executed here.
        if re.match(r"^\s*(?:EXECUTE\s+IMMEDIATE\s+)?\$\$", text, re.I):
            items = block_statements(text[text.find("$$"):])
        else:
            items = [(text, None)]
        for sql, rng in items:
            handle(sql, rng, ctx, res, collect, where)


def handle(sql, rng, ctx, res, collect, where):
    m = USE_RE.match(sql)
    if m:
        parts = split_name(m.group(2))
        if m.group(1).upper() == "DATABASE":
            ctx["db"], ctx["schema"] = parts[-1], "PUBLIC"
        else:
            if len(parts) == 2:
                ctx["db"], ctx["schema"] = parts
            else:
                ctx["schema"] = parts[-1]
        return
    m = ALTER_SET_RE.match(sql)
    if m and collect == "create":
        res.acct_set.setdefault(m.group(1).upper(), where)
        return
    m = ALTER_UNSET_RE.match(sql)
    if m and collect == "drop":
        res.acct_unset.add(m.group(1).upper())
        return
    rx = CREATE_RE if collect == "create" else DROP_RE
    m = rx.match(sql)
    if not m:
        return
    kind = canon_kind(m.group(1))
    name = qualify(kind, m.group(2), ctx)
    obj = Obj(kind, name, rng, where)
    (res.created if collect == "create" else res.dropped).append(obj)
    if collect == "create" and kind == "DATABASE":
        ctx["db"], ctx["schema"] = name, "PUBLIC"
    elif collect == "create" and kind == "SCHEMA":
        ctx["db"], ctx["schema"] = name.split(".")


def name_match(pattern, name):
    """Equal, or equal after treating {*} in either side as a wildcard."""
    if pattern == name:
        return True
    def rx(s):
        return "^" + ".*".join(re.escape(p) for p in s.split(WILD)) + "$"
    return bool(re.match(rx(pattern), name)) and (WILD in pattern) == (WILD in name)


def range_covers(drop_rng, create_rng):
    if create_rng is None:
        return True
    if drop_rng is None or None in drop_rng or None in create_rng:
        return drop_rng == create_rng
    return drop_rng[0] <= create_rng[0] and drop_rng[1] >= create_rng[1]


def covered(obj, drops):
    for d in drops:
        if d.kind == obj.kind and name_match(d.name, obj.name) and range_covers(d.rng, obj.rng):
            return d
    parts = obj.name.split(".")
    if obj.kind not in ACCOUNT_TYPES and len(parts) >= 2:
        for d in drops:
            if d.kind == "DATABASE" and name_match(d.name, parts[0]):
                return d
            if d.kind == "SCHEMA" and len(parts) == 3 and name_match(d.name, ".".join(parts[:2])):
                return d
    return None


def keep_matches(keep_name, obj_name):
    """A keep line names the object fully qualified, or by its last part."""
    want = ".".join(split_name(keep_name))
    return name_match(want, obj_name) or name_match(want, obj_name.split(".")[-1])


def check(create_files, teardown_files):
    res = Result()
    for f in create_files:
        parse_file(f, res, "create")
    for f in teardown_files:
        parse_file(f, res, "drop")
    orphans = []
    seen = set()
    for obj in res.created:
        key = (obj.kind, obj.name, obj.rng)
        if key in seen:
            continue
        seen.add(key)
        if covered(obj, res.dropped):
            continue
        if any(k == obj.kind and keep_matches(n, obj.name) for k, n, _ in res.keeps):
            continue
        orphans.append(f"{obj.where}: {obj.label()} is created but never dropped")
    for param, where in res.acct_set.items():
        if param not in res.acct_unset and not any(n.upper() == param for k, n, _ in res.keeps if k == "PARAMETER"):
            orphans.append(f"{where}: ALTER ACCOUNT SET {param} has no ALTER ACCOUNT UNSET {param} in the teardown")
    return res, orphans


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("lab_dir", nargs="?", help="directory of lab SQL files")
    ap.add_argument("--create", nargs="+", default=[], help="setup and seed SQL files")
    ap.add_argument("--teardown", nargs="+", default=[], help="teardown SQL files")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every created and dropped object")
    a = ap.parse_args(argv)
    create, teardown = list(a.create), list(a.teardown)
    if a.lab_dir:
        d = Path(a.lab_dir)
        if not d.is_dir():
            ap.error(f"not a directory: {d}")
        for p in sorted(d.glob("*.sql")):
            low = p.name.lower()
            if "teardown" in low:
                teardown.append(str(p))
            elif "verify" not in low:
                create.append(str(p))
    if not create or not teardown:
        ap.error("need at least one create file and one teardown file")
    res, orphans = check(create, teardown)
    if a.verbose:
        for o in res.created:
            print(f"  create  {o.where}: {o.label()}")
        for o in res.dropped:
            print(f"  drop    {o.where}: {o.label()}")
        for k, n, why in res.keeps:
            print(f"  keep    {k} {n}: {why}")
    print(f"teardown-check: {len(res.created)} created, {len(res.dropped)} dropped, "
          f"{len(res.keeps)} kept, {len(orphans)} orphan(s)")
    for o in orphans:
        print(f"ORPHAN {o}")
    return 1 if orphans else 0


if __name__ == "__main__":
    sys.exit(main())
