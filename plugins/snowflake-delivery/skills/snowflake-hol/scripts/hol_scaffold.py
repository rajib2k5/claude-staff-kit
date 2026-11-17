#!/usr/bin/env python3
"""Render a Snowflake hands-on-lab (setup, seed, verify, teardown) from the bundled templates,
then run teardown_check.py on the result.

Examples:
    hol_scaffold.py --variant shared --lab HOL_RETAIL --attendees 25 --out lab_setup/
    hol_scaffold.py --variant single --lab HOL_RETAIL --participant-user USER --out lab_setup/single_account
    hol_scaffold.py --variant shared --lab HOL_RETAIL --attendees 30 \\
        --git-origin https://github.com/acme/lab.git --git-prefix https://github.com/acme \\
        --seed-path seed_data --cross-region AWS_US --out lab_setup/

Templates hold {{PLACEHOLDER}} values and optional sections between "-- @if <feature>" and
"-- @endif". Features: synthetic (on unless --git-origin is given), git, cross_region.
The renderer refuses to overwrite existing files and refuses output with a placeholder left.
Exit codes: 0 rendered and teardown-checked; 1 teardown check found orphans; 2 usage error.
Standard library only.
"""
import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATES = HERE.parent / "templates"
sys.path.insert(0, str(HERE))
import teardown_check  # noqa: E402

VARIANTS = {"shared": "shared-account", "single": "single-account"}
IDENT_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,40}$")
IF_RE = re.compile(r"^\s*--\s*@if\s+(\w+)\s*$")
ENDIF_RE = re.compile(r"^\s*--\s*@endif\s*$")


def render_text(text, values, features):
    out, stack = [], []
    for n, line in enumerate(text.splitlines(keepends=True), 1):
        m = IF_RE.match(line)
        if m:
            stack.append(m.group(1) in features)
            continue
        if ENDIF_RE.match(line):
            if not stack:
                raise ValueError(f"line {n}: @endif without @if")
            stack.pop()
            continue
        if all(stack):
            out.append(line)
    if stack:
        raise ValueError("unclosed @if section")
    text = "".join(out)
    for k, v in values.items():
        text = text.replace("{{" + k + "}}", str(v))
    left = sorted(set(re.findall(r"\{\{(\w+)\}\}", text)))
    if left:
        raise ValueError(f"placeholders without a value: {', '.join(left)}")
    return text


def build_values(a):
    if not IDENT_RE.match(a.lab):
        raise ValueError(f"--lab must be an upper-case identifier like HOL_RETAIL, got {a.lab!r}")
    if not 1 <= a.attendees <= 99:
        raise ValueError("--attendees must be 1..99 (names are zero-padded to two digits)")
    if a.variant == "single" and not a.participant_user:
        raise ValueError("--variant single needs --participant-user (the externally provisioned user)")
    if a.participant_user and '"' in a.participant_user:
        raise ValueError("--participant-user must not contain a double quote")
    if bool(a.git_origin) != bool(a.git_prefix):
        raise ValueError("--git-origin and --git-prefix go together")
    if a.git_origin and not a.git_origin.startswith(a.git_prefix):
        raise ValueError("--git-origin must start with --git-prefix (the integration allows only that prefix)")
    for name in ("git_origin", "git_prefix", "seed_path", "cross_region"):
        v = getattr(a, name)
        if v and "'" in v:
            raise ValueError(f"--{name.replace('_', '-')} must not contain a single quote")
    features = {"git"} if a.git_origin else {"synthetic"}
    if a.cross_region:
        features.add("cross_region")
    values = {
        "LAB": a.lab, "ATTENDEES": a.attendees, "WAREHOUSE_SIZE": a.warehouse_size,
        "CREDIT_QUOTA": a.credit_quota, "CUSTOMERS_ROWS": a.customers, "PRODUCTS_ROWS": a.products,
        "ORDERS_ROWS": a.orders, "PARTICIPANT_USER": a.participant_user or "",
        "GIT_ORIGIN": a.git_origin or "", "GIT_PREFIX": a.git_prefix or "",
        "SEED_PATH": a.seed_path, "CORTEX_REGION": a.cross_region or "",
    }
    return values, features


def render(variant, values, features, out_dir):
    src = TEMPLATES / VARIANTS[variant]
    out_dir = Path(out_dir)
    files = sorted(src.glob("*.sql"))
    clash = [out_dir / f.name for f in files if (out_dir / f.name).exists()]
    if clash:
        raise ValueError("refusing to overwrite: " + ", ".join(str(c) for c in clash))
    rendered = {f.name: render_text(f.read_text(encoding="utf-8"), values, features) for f in files}
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, text in rendered.items():
        (out_dir / name).write_text(text, encoding="utf-8")
    return [out_dir / n for n in rendered]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variant", choices=sorted(VARIANTS), required=True)
    ap.add_argument("--lab", required=True, help="identifier prefix for every object, e.g. HOL_RETAIL")
    ap.add_argument("--out", required=True, help="output directory (must not already hold the files)")
    ap.add_argument("--attendees", type=int, default=25)
    ap.add_argument("--participant-user", help="single variant: the externally provisioned user name")
    ap.add_argument("--warehouse-size", default="XSMALL")
    ap.add_argument("--credit-quota", type=int, default=20, help="resource monitor quota in credits")
    ap.add_argument("--customers", type=int, default=500)
    ap.add_argument("--products", type=int, default=50)
    ap.add_argument("--orders", type=int, default=5000)
    ap.add_argument("--git-origin", help="seed from this git repository instead of synthetic data")
    ap.add_argument("--git-prefix", help="API_ALLOWED_PREFIXES value; must prefix --git-origin")
    ap.add_argument("--seed-path", default="seed_data", help="folder of CSVs in the git repository")
    ap.add_argument("--cross-region", metavar="REGION", help="set CORTEX_ENABLED_CROSS_REGION (e.g. AWS_US)")
    a = ap.parse_args(argv)
    try:
        values, features = build_values(a)
        written = render(a.variant, values, features, a.out)
    except ValueError as e:
        print(f"hol_scaffold: {e}", file=sys.stderr)
        return 2
    for p in written:
        print(f"wrote {p}")
    create = [str(p) for p in written if "teardown" not in p.name and "verify" not in p.name]
    teardown = [str(p) for p in written if "teardown" in p.name]
    _, orphans = teardown_check.check(create, teardown)
    print(f"teardown-check: {len(orphans)} orphan(s)")
    for o in orphans:
        print(f"ORPHAN {o}")
    return 1 if orphans else 0


if __name__ == "__main__":
    sys.exit(main())
