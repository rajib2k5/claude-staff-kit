#!/usr/bin/env python3
"""Cert Safari quiz engine for the Cowork skill. Python 3.8+, standard library only.

The engine holds the answer key so the conversation never sees it before the
learner answers: `next` prints a question without its key, `answer` grades it.

Commands (every command takes --progress PATH, default ./cert-safari-progress.json):
  next   [--domain D1..D5] [--no-multi]   the next question to study, as JSON, no key
  answer ID --picked B[,E] --confidence sure|unsure|guess
                                          grade it, update spaced repetition, print the reveal
  skip   ID                               move past a question without recording an answer
  stats  [--text]                         readiness by domain, due count, streak
  flag   ID [--note TEXT]                 record a question as wrong or outdated
  flags                                   list flagged questions
  reset  --confirm                        clear progress (flags are kept)
"""
import argparse
import json
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BANK_PATH = os.path.join(HERE, "..", "references", "bank.json")

DOMAINS = [
    {"id": "D1", "name": "Agentic Architecture & Orchestration", "weight": 27},
    {"id": "D2", "name": "Tool Design & MCP Integration", "weight": 18},
    {"id": "D3", "name": "Claude Code Configuration & Workflows", "weight": 20},
    {"id": "D4", "name": "Prompt Engineering & Structured Output", "weight": 20},
    {"id": "D5", "name": "Context Management & Reliability", "weight": 15},
]
DOMAIN = {d["id"]: d for d in DOMAINS}
SCENARIOS = {
    "customer-support-agent": "Customer support resolution agent",
    "claude-code-codegen": "Code generation with Claude Code",
    "multi-agent-research": "Multi-agent research system",
    "dev-productivity-tools": "Developer productivity tools",
    "claude-code-ci-cd": "Claude Code for CI/CD",
    "structured-data-extraction": "Structured data extraction",
}
MINUTE = 60_000
DAY = 86_400_000
INTERVALS = [0, 10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 21 * DAY]
CREDIT = {"sure": 1.0, "unsure": 0.75, "guess": 0.5}
CURRENT_WEIGHT = 0.35
LETTERS = "ABCDEF"
HISTORY_CAP = 500


def now_ms():
    return int(time.time() * 1000)


def day_key(ms):
    t = time.localtime(ms / 1000)
    return "%04d-%02d-%02d" % (t.tm_year, t.tm_mon, t.tm_mday)


def load_bank():
    with open(BANK_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return [q for q in data["questions"] if q.get("verified")], data.get("version", "")


def load_progress(path):
    empty = {"progress": {}, "history": [], "streak": {"days": 0, "lastDay": ""}, "flags": [], "last": None}
    if not os.path.exists(path):
        return empty
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    for k, v in empty.items():
        data.setdefault(k, v)
    return data


def save_progress(path, data):
    folder = os.path.dirname(os.path.abspath(path))
    os.makedirs(folder, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    os.replace(tmp, path)


def letter_of(q, opt_id):
    for i, o in enumerate(q["options"]):
        if o["id"] == opt_id:
            return LETTERS[i]
    return opt_id.upper()


def parse_picked(q, raw):
    ids = []
    for token in raw.replace(",", " ").split():
        t = token.strip().strip(").").lower()
        if len(t) == 1 and t.upper() in LETTERS[: len(q["options"])]:
            ids.append(q["options"][LETTERS.index(t.upper())]["id"])
        else:
            raise SystemExit(json.dumps({"error": "Could not read answer %r; use letters like B or B,E" % raw}))
    if len(set(ids)) != len(ids):
        raise SystemExit(json.dumps({"error": "Answer repeats a letter"}))
    return ids


def next_record(prev, correct, confidence, now):
    frm = (prev or {}).get("box", 0)
    if not correct:
        box = 1
    elif confidence == "sure":
        box = min(frm + 1, len(INTERVALS) - 1)
    elif confidence == "unsure":
        box = max(1, min(frm + 1, 2))
    else:
        box = 1
    cw = (prev or {}).get("confidentlyWrong", False)
    if not correct and confidence == "sure":
        cw = True
    if correct and confidence == "sure":
        cw = False
    return {
        "box": box,
        "due": now + INTERVALS[box],
        "seen": (prev or {}).get("seen", 0) + 1,
        "correct": (prev or {}).get("correct", 0) + (1 if correct else 0),
        "lastAt": now,
        "confidentlyWrong": cw,
    }


def readiness(bank, prog, history):
    rows = []
    for d in DOMAINS:
        in_domain = [q for q in bank if q["domain"] == d["id"]]
        answers = [a for a in history if a["domain"] == d["id"]]
        recent = answers[-10:]
        score = None
        if len(recent) >= 2:
            score = sum(CREDIT[a["confidence"]] if a["isCorrect"] else 0 for a in recent) / len(recent)
        rows.append({
            "id": d["id"], "name": d["name"], "weight": d["weight"], "score": score,
            "answers": len(answers), "seen": sum(1 for q in in_domain if q["id"] in prog), "total": len(in_domain),
        })
    return rows


def pick_next(bank, prog, now, domain=None, exclude=(), rows=None, multi_ok=True):
    pool = [q for q in bank if q["id"] not in exclude and (not domain or q["domain"] == domain)
            and (multi_ok or q["type"] != "multi")]
    if not pool:
        return None
    due = [q for q in pool if q["id"] in prog and prog[q["id"]]["due"] <= now]
    due.sort(key=lambda q: (not prog[q["id"]]["confidentlyWrong"], prog[q["id"]]["due"]))
    fresh = [q for q in pool if q["id"] not in prog]
    if due and prog[due[0]["id"]]["confidentlyWrong"]:
        return due[0]
    if due and (not fresh or random.random() < 0.5):
        return due[0]
    if fresh:
        def weight(q):
            score = next((r["score"] for r in (rows or []) if r["id"] == q["domain"]), None)
            boost = 1.5 if score is None else 2 - score
            return DOMAIN[q["domain"]]["weight"] * boost * (CURRENT_WEIGHT if q.get("relevance") == "current" else 1)
        weights = [weight(q) for q in fresh]
        return random.choices(fresh, weights=weights, k=1)[0]
    return sorted(pool, key=lambda q: prog[q["id"]]["due"])[0]


def until_text(ms):
    if ms <= 0:
        return "now"
    if ms < 90 * MINUTE:
        return "in %d min" % max(1, round(ms / MINUTE))
    days = round(ms / DAY)
    return "tomorrow" if days <= 1 else "in %d days" % days


def pct(score):
    return "--" if score is None else "%d%%" % round(score * 100)


def cmd_next(args):
    bank, version = load_bank()
    data = load_progress(args.progress)
    prog, now = data["progress"], now_ms()
    rows = readiness(bank, prog, data["history"])
    exclude = [data["last"]] if data.get("last") else []
    q = pick_next(bank, prog, now, args.domain, exclude, rows, args.multi_ok) or pick_next(bank, prog, now, args.domain, (), rows, args.multi_ok)
    if not q:
        print(json.dumps({"error": "No verified questions match"}))
        return
    rec = prog.get(q["id"])
    print(json.dumps({
        "id": q["id"],
        "domain": q["domain"],
        "domain_name": DOMAIN[q["domain"]]["name"],
        "scenario": SCENARIOS.get(q["scenario"]) if q.get("scenario") else None,
        "type": q["type"],
        "select": q["select"],
        "stem": q["stem"],
        "options": [{"letter": LETTERS[i], "text": o["text"]} for i, o in enumerate(q["options"])],
        "relevance": q.get("relevance", "core"),
        "status": "review (missed while sure)" if rec and rec["confidentlyWrong"] else ("review" if rec else "new"),
        "bank": version,
    }, indent=1))


def cmd_answer(args):
    bank, version = load_bank()
    q = next((x for x in bank if x["id"] == args.id), None)
    if not q:
        raise SystemExit(json.dumps({"error": "Unknown question id %s" % args.id}))
    picked = parse_picked(q, args.picked)
    if len(picked) != q["select"]:
        raise SystemExit(json.dumps({"error": "This question needs exactly %d answer(s)" % q["select"]}))
    data = load_progress(args.progress)
    now = now_ms()
    correct = sorted(picked) == sorted(q["correct"])
    rec = next_record(data["progress"].get(q["id"]), correct, args.confidence, now)
    data["progress"][q["id"]] = rec
    data["history"] = (data["history"] + [{
        "qid": q["id"], "domain": q["domain"], "at": now, "isCorrect": correct,
        "confidence": args.confidence, "via": "cowork",
    }])[-HISTORY_CAP:]
    s = data["streak"]
    today = day_key(now)
    if s.get("lastDay") != today:
        s = {"days": s.get("days", 0) + 1 if s.get("lastDay") == day_key(now - DAY) else 1, "lastDay": today}
    data["streak"] = s
    data["last"] = q["id"]
    save_progress(args.progress, data)

    back = until_text(rec["due"] - now)
    if correct:
        result = {"sure": "Correct and sure. Next review %s." % back,
                  "unsure": "Correct, but unsure. Back %s." % back,
                  "guess": "Correct guess. Counted as not known yet: back %s." % back}[args.confidence]
    else:
        result = "Missed while sure. This one comes back first." if args.confidence == "sure" else "Missed. Back %s." % back
    note = q.get("verification_note", "")
    drift = note[note.index("Drift:"):] if "Drift:" in note else ""
    print(json.dumps({
        "id": q["id"],
        "correct": correct,
        "result": result,
        "picked": [letter_of(q, i) for i in picked],
        "key": [letter_of(q, i) for i in q["correct"]],
        "options": [{
            "letter": LETTERS[i], "text": o["text"], "is_key": o["id"] in q["correct"],
            "picked": o["id"] in picked, "rationale": o["rationale"],
        } for i, o in enumerate(q["options"])],
        "explanation": q["explanation"],
        "sources": q["sources"],
        "relevance": q.get("relevance", "core"),
        "volatile": q.get("volatile", False),
        "verified_against": q.get("verified_against"),
        "drift": drift,
    }, indent=1))


def cmd_skip(args):
    data = load_progress(args.progress)
    data["last"] = args.id
    save_progress(args.progress, data)
    print(json.dumps({"skipped": args.id}))


def cmd_stats(args):
    bank, version = load_bank()
    data = load_progress(args.progress)
    now = now_ms()
    rows = readiness(bank, data["progress"], data["history"])
    scored = [r for r in rows if r["score"] is not None]
    overall = None
    if len(scored) == len(rows):
        overall = sum(r["score"] * r["weight"] for r in rows) / sum(r["weight"] for r in rows)
    weakest = min(scored, key=lambda r: (r["score"], -r["weight"])) if scored else None
    s = data["streak"]
    streak = s.get("days", 0) if s.get("lastDay") in (day_key(now), day_key(now - DAY)) else 0
    due = sum(1 for q in bank if q["id"] in data["progress"] and data["progress"][q["id"]]["due"] <= now)
    out = {"domains": rows, "overall": overall, "weakest": weakest and weakest["id"], "due": due,
           "streak_days": streak, "answers": len(data["history"]), "flags": len(data["flags"]),
           "bank": version, "questions": len(bank)}
    if not args.text:
        print(json.dumps(out, indent=1))
        return
    lines = ["Cert Safari readiness (last 10 answers per domain, weighted by confidence)"]
    for r in rows:
        lines.append("  %s %s (%d%%): %s over %d answers, %d/%d seen" % (
            r["id"], r["name"], r["weight"], pct(r["score"]), r["answers"], r["seen"], r["total"]))
    lines.append("  Weighted estimate: %s" % (pct(overall) if overall is not None else "answer at least 2 per domain first"))
    lines.append("  Weakest: %s | due now: %d | streak: %d days | flags: %d | bank %s" % (
        weakest["id"] if weakest else "--", due, streak, len(data["flags"]), version))
    lines.append("  Study feedback, not a prediction of the scaled exam score.")
    print("\n".join(lines))


def cmd_flag(args):
    bank, version = load_bank()
    if not any(q["id"] == args.id for q in bank):
        raise SystemExit(json.dumps({"error": "Unknown question id %s" % args.id}))
    data = load_progress(args.progress)
    if not any(f["qid"] == args.id for f in data["flags"]):
        data["flags"].append({"qid": args.id, "at": now_ms(), "bank": version, "note": args.note or ""})
        save_progress(args.progress, data)
    print(json.dumps({"flagged": args.id, "total_flags": len(data["flags"])}))


def cmd_flags(args):
    bank, _ = load_bank()
    data = load_progress(args.progress)
    out = []
    for f in data["flags"]:
        q = next((x for x in bank if x["id"] == f["qid"]), None)
        out.append({"id": f["qid"], "bank": f["bank"], "note": f.get("note", ""),
                    "stem": (q["stem"][:100] + "...") if q and len(q["stem"]) > 100 else (q["stem"] if q else None)})
    print(json.dumps(out, indent=1))


def cmd_reset(args):
    if not args.confirm:
        raise SystemExit(json.dumps({"error": "reset needs --confirm"}))
    data = load_progress(args.progress)
    data.update({"progress": {}, "history": [], "streak": {"days": 0, "lastDay": ""}, "last": None})
    save_progress(args.progress, data)
    print(json.dumps({"reset": True, "flags_kept": len(data["flags"])}))


def main(argv=None):
    p = argparse.ArgumentParser(description="Cert Safari quiz engine")
    p.add_argument("--progress", default="cert-safari-progress.json")
    sub = p.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("next")
    n.add_argument("--domain", choices=[d["id"] for d in DOMAINS])
    n.add_argument("--no-multi", dest="multi_ok", action="store_false", help="skip Select TWO items")
    a = sub.add_parser("answer")
    a.add_argument("id")
    a.add_argument("--picked", required=True)
    a.add_argument("--confidence", required=True, choices=["sure", "unsure", "guess"])
    k = sub.add_parser("skip")
    k.add_argument("id")
    s = sub.add_parser("stats")
    s.add_argument("--text", action="store_true")
    f = sub.add_parser("flag")
    f.add_argument("id")
    f.add_argument("--note")
    sub.add_parser("flags")
    r = sub.add_parser("reset")
    r.add_argument("--confirm", action="store_true")
    # Accept --progress after the subcommand too.
    for sp in (n, a, k, s, f, r):
        sp.add_argument("--progress", dest="progress_sub")
    fl = sub.choices["flags"]
    fl.add_argument("--progress", dest="progress_sub")
    args = p.parse_args(argv)
    if getattr(args, "progress_sub", None):
        args.progress = args.progress_sub
    if not hasattr(args, "multi_ok"):
        args.multi_ok = True
    {"next": cmd_next, "answer": cmd_answer, "skip": cmd_skip, "stats": cmd_stats,
     "flag": cmd_flag, "flags": cmd_flags, "reset": cmd_reset}[args.cmd](args)


if __name__ == "__main__":
    main()
