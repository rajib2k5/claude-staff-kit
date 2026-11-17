#!/usr/bin/env python3
"""prereg: seal a pre-registered holdout plan once, then score it once.

    python3 -P prereg.py seal   --plan PLAN.json --data FILE [--data FILE ...] --dir DIR
    python3 -P prereg.py score  --id ID --dir DIR [--plan PLAN.json]
    python3 -P prereg.py verify --id ID --dir DIR [--plan PLAN.json]

``seal`` validates the plan, hashes it, hashes every data file byte for byte (it never parses
them, so sealing cannot look at the result) and hashes this script and quant_stats.py. ``score``
re-checks every hash, marks the holdout window spent BEFORE computing anything, then runs the
declared test once: a one-sided block sign-flip per candidate, Holm over the full family k, and
the max-statistic family-wise p. ``verify`` re-checks the hashes and reports the state; it writes
nothing. The first ``--data`` file is the paired-difference CSV that gets scored; any further
files are hashed as provenance only.

Exit codes: 0 ok; 1 internal error (a traceback is a bug); 2 usage; 3 integrity failure (plan,
record, data or scorer changed); 4 one-shot violation (reseal, rescore, window already spent);
5 invalid plan or data.

LIMITS: these are tripwires against accidents and shortcuts, not a sandbox. Deleting
spent.jsonl, copying the data elsewhere, or looking at the holdout before sealing defeats them.
Commit ID.sealed.*, spent.jsonl and ID.result.json together so git history is the record.
Hashing the data proves it did not change after the seal; it does not prove nobody looked.
Design: plugins/quant-rigor/DESIGN.md section 4. Standard library only; ``score`` loads
quant_stats.py (numpy) from this script's own folder by path, never from sys.path.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import fcntl
import hashlib
import importlib.util
import io
import json
import math
import os
import platform
import re
import sys
import tempfile
from pathlib import Path

SCHEMA_PLAN = "quant-rigor/prereg-plan/1"
SCHEMA_SEALED = "quant-rigor/prereg-sealed/1"
HERE = Path(__file__).resolve().parent
QS_PATH = HERE / "quant_stats.py"
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_date(x) -> bool:
    """Plain ISO calendar date (YYYY-MM-DD). Times and offsets are refused so windows compare
    exactly: '2024-02-04' vs '2024-02-04T00:00' or two timezones cannot slip past the overlap check."""
    if not isinstance(x, str) or not DATE_RE.match(x):
        return False
    try:
        dt.date.fromisoformat(x)
    except ValueError:
        return False
    return True

EXIT_OK, EXIT_INTERNAL, EXIT_USAGE, EXIT_INTEGRITY, EXIT_ONESHOT, EXIT_INVALID = 0, 1, 2, 3, 4, 5


class PreregError(Exception):
    def __init__(self, code: int, msg: str):
        super().__init__(msg)
        self.code = code


# ----------------------------------------------------------------------------- helpers
def canonical(obj) -> bytes:
    return (json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                       allow_nan=False) + "\n").encode("utf-8")


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _fsync_dir(d: Path) -> None:
    fd = os.open(d, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_new(path: Path, data: bytes) -> None:
    """Write ``data`` to ``path`` atomically; refuse (exit 4) if ``path`` already exists."""
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp = Path(name)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    try:
        os.link(tmp, path)            # fails if path exists: the atomic no-overwrite step
    except FileExistsError:
        raise PreregError(EXIT_ONESHOT, f"{path.name} already exists; refusing to overwrite")
    finally:
        tmp.unlink()
    _fsync_dir(path.parent)


class Lock:
    def __init__(self, d: Path):
        self.path = d / ".prereg.lock"

    def __enter__(self):
        self.f = open(self.path, "a")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def read_ledger(d: Path) -> list[dict]:
    p = d / "spent.jsonl"
    if not p.exists():
        return []
    out = []
    for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                raise PreregError(EXIT_INTEGRITY, f"spent.jsonl line {n} is not JSON")
    return out


def append_ledger(d: Path, event: dict) -> None:
    with open(d / "spent.jsonl", "ab") as f:
        f.write(canonical(event))
        f.flush()
        os.fsync(f.fileno())
    _fsync_dir(d)


# ----------------------------------------------------------------------------- plan
PLAN_KEYS = {"schema", "id", "hypothesis", "metric", "candidates", "k", "orientation", "alpha",
             "sidedness", "correction", "test", "holdout", "amends"}
METRIC_KEYS = {"name", "is_proxy", "decision_metric"}
TEST_KEYS = {"name", "block", "block_rationale", "draws", "seed"}
HOLDOUT_KEYS = {"start", "end", "n_periods"}


def _need(cond, msg):
    if not cond:
        raise PreregError(EXIT_INVALID, f"invalid plan: {msg}")


def _is_int(x):
    return isinstance(x, int) and not isinstance(x, bool)


def _keys(obj, allowed, required, where):
    _need(isinstance(obj, dict), f"{where} must be an object")
    _need(not set(obj) - allowed, f"{where} has unknown keys {sorted(set(obj) - allowed)}")
    _need(not required - set(obj), f"{where} is missing {sorted(required - set(obj))}")


def validate_plan(plan) -> None:
    _keys(plan, PLAN_KEYS, PLAN_KEYS, "plan")
    _need(plan["schema"] == SCHEMA_PLAN, f"schema must be {SCHEMA_PLAN!r}")
    _need(isinstance(plan["id"], str) and ID_RE.match(plan["id"]), "id must match [A-Za-z0-9._-], <= 128 chars")
    for key in ("hypothesis", "orientation"):
        _need(isinstance(plan[key], str) and plan[key].strip(), f"{key} must be a non-empty string")
    m = plan["metric"]
    _keys(m, METRIC_KEYS, {"name", "is_proxy"}, "metric")
    _need(isinstance(m["is_proxy"], bool), "metric.is_proxy must be true or false")
    if m["is_proxy"]:
        _need(isinstance(m.get("decision_metric"), str) and m["decision_metric"].strip(),
              "metric.is_proxy is true, so metric.decision_metric must name what it stands in for")
    c = plan["candidates"]
    _need(isinstance(c, list) and c and all(isinstance(x, str) and x and x != "date" for x in c)
          and len(set(c)) == len(c), "candidates must be a non-empty list of distinct names")
    _need(_is_int(plan["k"]) and plan["k"] >= len(c),
          "k must be an int >= len(candidates): every comparison tried, not just the survivors")
    _need(isinstance(plan["alpha"], (int, float)) and not isinstance(plan["alpha"], bool)
          and 0 < plan["alpha"] <= 0.5, "alpha must be in (0, 0.5]")
    _need(plan["sidedness"] == "greater", "sidedness must be 'greater' (v1)")
    _need(plan["correction"] in ("holm", "maxstat"), "correction must be 'holm' or 'maxstat'")
    _need(plan["correction"] != "maxstat" or plan["k"] == len(c),
          "maxstat only covers the candidates in the data; with k > len(candidates) use holm "
          "(the max over the rows scored says nothing about the k - len(candidates) not scored)")
    t = plan["test"]
    _keys(t, TEST_KEYS, TEST_KEYS, "test")
    _need(t["name"] == "block_signflip", "test.name must be 'block_signflip' (v1)")
    _need(_is_int(t["block"]) and t["block"] >= 1, "test.block must be an int >= 1")
    _need(isinstance(t["block_rationale"], str) and t["block_rationale"].strip(),
          "test.block_rationale must say how the block length was measured")
    _need(_is_int(t["draws"]) and t["draws"] >= 1, "test.draws must be an int >= 1")
    _need(_is_int(t["seed"]) and t["seed"] >= 0, "test.seed must be an int >= 0")
    h = plan["holdout"]
    _keys(h, HOLDOUT_KEYS, HOLDOUT_KEYS, "holdout")
    _need(all(is_date(h[x]) for x in ("start", "end")),
          "holdout.start and holdout.end must be plain ISO dates (YYYY-MM-DD)")
    _need(h["start"] < h["end"], "holdout.start must be before holdout.end")
    _need(_is_int(h["n_periods"]) and h["n_periods"] >= 2, "holdout.n_periods must be an int >= 2")
    a = plan["amends"]
    _need(a is None or (isinstance(a, str) and re.fullmatch(r"[0-9a-f]{64}", a)),
          "amends must be null or the sealed_sha256 of the record it amends")


def load_json(p: Path, code=EXIT_INVALID):
    try:
        return json.loads(p.read_text(encoding="utf-8"),
                          parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))
    except FileNotFoundError:
        raise PreregError(code, f"{p} not found")
    except ValueError as e:
        raise PreregError(code, f"{p} is not valid JSON: {e}")


def check_id(i: str) -> str:
    if not ID_RE.match(i or ""):
        raise PreregError(EXIT_USAGE, f"bad id {i!r}")
    return i


def inside(d: Path, f: str) -> tuple[Path, str]:
    p = (d / f).resolve() if not os.path.isabs(f) else Path(f).resolve()
    try:
        rel = p.relative_to(d.resolve())
    except ValueError:
        raise PreregError(EXIT_INVALID, f"data file {f} resolves outside --dir")
    return p, rel.as_posix()


def scorer_hashes() -> dict:
    return {"prereg_sha256": sha256_file(Path(__file__).resolve()),
            "quant_stats_sha256": sha256_file(QS_PATH)}


def _numpy_version():
    try:
        import numpy
        return numpy.__version__
    except ImportError:
        return None


def overlaps(a_start, a_end, b_start, b_end) -> bool:
    return a_start <= b_end and b_start <= a_end


# ----------------------------------------------------------------------------- seal
def cmd_seal(args) -> int:
    d = Path(args.dir)
    if not d.is_dir():
        raise PreregError(EXIT_USAGE, f"--dir {d} is not a directory")
    plan = load_json(Path(args.plan))
    validate_plan(plan)
    pid = plan["id"]
    data = []
    for f in args.data:
        p, rel = inside(d, f)
        if not p.is_file():
            raise PreregError(EXIT_INVALID, f"data file {f} not found")
        data.append({"path": rel, "sha256": sha256_file(p), "bytes": p.stat().st_size})
    first, _ = inside(d, args.data[0])
    check_layout(first, plan)          # header, row count, dates only: no value is read
    with Lock(d):
        if any(e.get("id") == pid for e in read_ledger(d)):
            raise PreregError(EXIT_ONESHOT, f"id {pid} is already in spent.jsonl")
        for suffix in (".sealed.json", ".sealed.sha256"):
            if (d / f"{pid}{suffix}").exists():
                raise PreregError(EXIT_ONESHOT, f"{pid}{suffix} exists; amend with a new id instead")
        record = {"schema": SCHEMA_SEALED, "id": pid, "plan": plan,
                  "plan_sha256": sha256_bytes(canonical(plan)), "data": data,
                  "scorer": scorer_hashes(), "python": platform.python_version(),
                  "numpy": _numpy_version(), "sealed_at_utc": now_utc()}
        body = canonical(record)
        digest = sha256_bytes(body)
        write_new(d / f"{pid}.sealed.json", body)
        write_new(d / f"{pid}.sealed.sha256", f"{digest}  {pid}.sealed.json\n".encode())
    print(f"sealed {pid}: sealed_sha256 {digest}")
    print(f"commit {pid}.sealed.json and {pid}.sealed.sha256 now, before anyone opens the holdout.")
    return EXIT_OK


# ----------------------------------------------------------------------------- integrity
def check_integrity(d: Path, pid: str, plan_arg: str | None) -> tuple[dict, str]:
    """Steps 1-4 of the score order. Returns (record, sealed_sha256)."""
    sp, hp = d / f"{pid}.sealed.json", d / f"{pid}.sealed.sha256"
    if not sp.is_file() or not hp.is_file():
        raise PreregError(EXIT_INTEGRITY, f"{pid} is not sealed in {d}")
    body = sp.read_bytes()
    digest = sha256_bytes(body)
    stored = hp.read_text(encoding="utf-8").split()
    if not stored or stored[0] != digest:
        raise PreregError(EXIT_INTEGRITY, f"{sp.name} does not match {hp.name}: record tampered")
    record = load_json(sp, EXIT_INTEGRITY)
    if canonical(record) != body:
        raise PreregError(EXIT_INTEGRITY, f"{sp.name} is not in canonical form: record tampered")
    plan = record.get("plan")
    if sha256_bytes(canonical(plan)) != record.get("plan_sha256"):
        raise PreregError(EXIT_INTEGRITY, "plan hash mismatch: plan tampered")
    if plan.get("id") != pid or record.get("id") != pid:
        raise PreregError(EXIT_INTEGRITY, "id in the record does not match --id")
    plan_file = Path(plan_arg) if plan_arg else d / f"{pid}.plan.json"
    if plan_arg or plan_file.exists():
        if canonical(load_json(plan_file, EXIT_INTEGRITY)) != canonical(plan):
            raise PreregError(EXIT_INTEGRITY, f"{plan_file} differs from the sealed plan: plan tampered")
    for item in record["data"]:
        p, _ = inside(d, item["path"])
        if not p.is_file() or p.stat().st_size != item["bytes"] or sha256_file(p) != item["sha256"]:
            raise PreregError(EXIT_INTEGRITY, f"data file {item['path']} changed since the seal")
    if scorer_hashes() != record["scorer"]:
        raise PreregError(EXIT_INTEGRITY, "prereg.py or quant_stats.py changed since the seal; "
                                          "seal an amendment (new id, amends=<sealed_sha256>)")
    return record, digest


def spent_conflict(d: Path, pid: str, plan: dict) -> str | None:
    if (d / f"{pid}.result.json").exists():
        return f"{pid}.result.json exists: already scored"
    h = plan["holdout"]
    for e in read_ledger(d):
        if e.get("event") != "spent":
            continue
        if e.get("id") == pid:
            return f"{pid} is already spent (at {e.get('at')})"
        if overlaps(h["start"], h["end"], e.get("start", ""), e.get("end", "")):
            return f"holdout window overlaps {e.get('id')}'s spent window {e.get('start')}..{e.get('end')}"
    return None


# ----------------------------------------------------------------------------- data + compute
def check_layout(path: Path, plan: dict) -> list[list[str]]:
    """Header, column count, row count and dates. Runs at seal and at score; reads no value
    column, so it cannot reveal the result."""
    h, cands = plan["holdout"], plan["candidates"]
    try:
        text = path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        raise PreregError(EXIT_INVALID, f"{path.name} is not UTF-8")
    if text.startswith("\ufeff"):
        raise PreregError(EXIT_INVALID, f"{path.name} starts with a UTF-8 byte-order mark; save it without one")
    rows = list(csv.reader(io.StringIO(text, newline="")))
    if not rows or rows[0] != ["date", *cands]:
        raise PreregError(EXIT_INVALID, f"header must be date,{','.join(cands)}")
    body = [r for r in rows[1:] if r]
    if len(body) != h["n_periods"]:
        raise PreregError(EXIT_INVALID, f"{len(body)} rows, plan says n_periods {h['n_periods']}")
    if any(len(r) != len(cands) + 1 for r in body):
        raise PreregError(EXIT_INVALID, "a row has the wrong number of columns")
    dates = [r[0] for r in body]
    if not all(is_date(x) for x in dates):
        raise PreregError(EXIT_INVALID, "every date must be a plain ISO date (YYYY-MM-DD)")
    if any(b <= a for a, b in zip(dates, dates[1:])):
        raise PreregError(EXIT_INVALID, "dates must be strictly increasing")
    if dates[0] != h["start"] or dates[-1] != h["end"]:
        raise PreregError(EXIT_INVALID, f"first/last dates {dates[0]}/{dates[-1]} differ from the plan window")
    return body


def parse_data(path: Path, plan: dict):
    cands = plan["candidates"]
    body = check_layout(path, plan)
    cols = []
    for j in range(len(cands)):
        try:
            col = [float(r[j + 1]) for r in body]
        except ValueError:
            raise PreregError(EXIT_INVALID, f"non-numeric value in column {cands[j]}")
        if not all(math.isfinite(v) for v in col):
            raise PreregError(EXIT_INVALID, f"non-finite value in column {cands[j]}")
        cols.append(col)
    return cols


def load_quant_stats():
    spec = importlib.util.spec_from_file_location("quant_rigor_quant_stats", QS_PATH)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def compute(plan: dict, cols, qs) -> dict:
    import numpy as np
    t = plan["test"]
    D = np.array(cols, dtype=np.float64)
    T = D.shape[1]
    r = qs.block_signflip(D, t["block"], draws=t["draws"], seed=t["seed"])
    p_holm = qs.holm(r.p_each, plan["k"])
    can_resolve = qs.resolvable(T, t["block"])
    rows, decision = [], {}
    for j, cand in enumerate(plan["candidates"]):
        try:
            nwt = qs.nw_t(D[j], min(t["block"], T - 1))
        except ValueError:              # constant series: no long-run variance
            nwt = None
        obs = float(r.obs[j])
        p_decl = float(p_holm[j]) if plan["correction"] == "holm" else float(r.p_fw[j])
        if not can_resolve:
            verdict = "UNRESOLVED"          # fewer than MIN_BLOCKS blocks: by construction
        elif p_decl <= plan["alpha"]:
            verdict = "REJECT"
        else:
            verdict = "NOT_REJECTED"
        decision[cand] = verdict
        rows.append({"candidate": cand, "obs_mean": obs, "p_raw": float(r.p_each[j]),
                     "p_holm": float(p_holm[j]), "p_fw_maxstat": float(r.p_fw[j]),
                     "nw_t": nwt})
    return {"rows": rows, "nb": r.nb, "exact": r.exact, "draws_used": r.draws_used,
            "min_p": qs.min_p(T, t["block"]) if r.exact else 1.0 / (r.draws_used + 1),
            "resolvable": can_resolve, "decision": decision, "numpy": np.__version__}


# ----------------------------------------------------------------------------- score / verify
def cmd_score(args) -> int:
    d, pid = Path(args.dir), check_id(args.id)
    record, sealed = check_integrity(d, pid, args.plan)
    plan = record["plan"]
    h = plan["holdout"]
    # Load the scorer (and numpy) BEFORE spending: a broken environment must not burn the window.
    qs = load_quant_stats()
    with Lock(d):
        conflict = spent_conflict(d, pid, plan)
        if conflict:
            raise PreregError(EXIT_ONESHOT, conflict)
        append_ledger(d, {"event": "spent", "id": pid, "sealed_sha256": sealed,
                          "start": h["start"], "end": h["end"], "at": now_utc()})
    # The window is spent from here on: a crash or a bad file below still spends it.
    first, _ = inside(d, record["data"][0]["path"])
    cols = parse_data(first, plan)
    res = compute(plan, cols, qs)
    result = {"id": pid, "sealed_sha256": sealed, "correction": plan["correction"],
              "k": plan["k"], "alpha": plan["alpha"], "metric": plan["metric"],
              "python": platform.python_version(), "scored_at_utc": now_utc(), **res}
    body = canonical(result)
    with Lock(d):
        write_new(d / f"{pid}.result.json", body)
        append_ledger(d, {"event": "result", "id": pid, "result_sha256": sha256_bytes(body),
                          "at": now_utc()})
    print(f"scored {pid} ({'exact' if res['exact'] else 'monte carlo'}, nb={res['nb']}, "
          f"min attainable p={res['min_p']:.6g}, correction={plan['correction']}, k={plan['k']})")
    for row in res["rows"]:
        print(f"  {row['candidate']}: obs={row['obs_mean']:.6g} p_raw={row['p_raw']:.6g} "
              f"p_holm={row['p_holm']:.6g} p_fw={row['p_fw_maxstat']:.6g} -> {res['decision'][row['candidate']]}")
    if plan["metric"]["is_proxy"]:
        print(f"  NOTE: {plan['metric']['name']} is a proxy for {plan['metric']['decision_metric']}.")
    return EXIT_OK


def cmd_verify(args) -> int:
    d, pid = Path(args.dir), check_id(args.id)
    record, sealed = check_integrity(d, pid, args.plan)
    spent = any(e.get("event") == "spent" and e.get("id") == pid for e in read_ledger(d))
    scored = (d / f"{pid}.result.json").exists()
    state = "scored" if scored else ("spent, no result (crashed or invalid data)" if spent else "sealed, not scored")
    print(f"{pid}: integrity ok; sealed_sha256 {sealed}; state: {state}")
    return EXIT_OK


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="prereg", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("seal")
    s.add_argument("--plan", required=True)
    s.add_argument("--data", required=True, action="append")
    s.add_argument("--dir", required=True)
    for name in ("score", "verify"):
        p = sub.add_parser(name)
        p.add_argument("--id", required=True)
        p.add_argument("--dir", required=True)
        p.add_argument("--plan")
    args = ap.parse_args(argv)
    try:
        return {"seal": cmd_seal, "score": cmd_score, "verify": cmd_verify}[args.cmd](args)
    except PreregError as e:
        print(f"prereg: {e}", file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
