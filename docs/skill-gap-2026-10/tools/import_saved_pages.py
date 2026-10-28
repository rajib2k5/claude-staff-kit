"""Import certsafari pages that YOU saved by hand from your browser while studying.

This tool never touches the network. It reads HTML files already on disk, extracts the
schema.org `Quiz` JSON-LD the site embeds, and merges the questions into a local,
gitignored JSONL file, deduplicated against what is already there.

Why offline only: certsafari's robots.txt disallows `/*/quiz/` and its llms.txt says
quizzes are started by people from the certificate page. Saving a page you took
yourself is ordinary personal study; scripting the quiz endpoint is not.

The output holds third-party text. Keep it under `.cache/` (gitignored). Never commit it.
Only derived concept tags belong in the repo.

Usage:
    python3 -I import_saved_pages.py SAVED.html [MORE.html | DIR ...] \
        --into ../../../.cache/certsafari/questions.jsonl
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

LD_JSON_RE = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S)
CERT_SLUGS = {
    "Foundations (CCAR-F)": "claude-certified-architect-foundations",
    "Professional (CCAR-P)": "claude-architect-professional",
    "Associate – Foundations (CCAO-F)": "claude-certified-associate-foundations",
    "Developer – Foundations (CCDV-F)": "claude-developer-foundations",
}


def _as_list(value):
    return value if isinstance(value, list) else [value]


def _comment(option):
    c = option.get("comment")
    return c.get("text") if isinstance(c, dict) else c


def _cert_slug(quiz):
    name = (quiz.get("about") or {}).get("name", "")
    return next((slug for key, slug in CERT_SLUGS.items() if key in name), None)


def parse_saved_page(path):
    """Return (questions, problem). Exactly one of them is empty."""
    html = path.read_text(encoding="utf-8", errors="replace")
    quizzes = []
    for block in LD_JSON_RE.findall(html):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        nodes = data.get("@graph", [data]) if isinstance(data, dict) else data
        quizzes += [n for n in nodes if isinstance(n, dict) and n.get("@type") == "Quiz"]
    if not quizzes:
        return [], "no schema.org Quiz JSON-LD in this file (send one sample so the parser can be adapted)"

    questions = []
    for quiz in quizzes:
        cert = _cert_slug(quiz)
        if cert is None:
            continue  # not one of the four Claude certs
        for part in quiz.get("hasPart", []):
            accepted = _as_list(part["acceptedAnswer"])
            options = sorted(_as_list(part.get("suggestedAnswer", [])) + accepted,
                             key=lambda o: o.get("position", 0))
            questions.append({
                "cert": cert,
                "stem": part["text"],
                "options": [o["text"] for o in options],
                "accepted": [o["text"] for o in accepted],
                "comments": [_comment(o) for o in options],
                "source": f"saved-page:{path.name}",
            })
    if not questions:
        return [], "Quiz JSON-LD found, but not for a Claude certification"
    return questions, ""


def question_key(q):
    """Return a stable identity for one question, used to drop duplicates.

    Context: the same question can come back across practice sessions, and quizzes
    may reshuffle option order between sessions. The key decides when two records
    are "the same question".

    TODO(user): implement in 5-10 lines. Return a short hex string.
    """
    raise NotImplementedError("question_key: see docstring")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("paths", nargs="+", type=Path, help="saved .html files or folders of them")
    ap.add_argument("--into", type=Path, required=True, help="JSONL file to merge into (gitignored)")
    args = ap.parse_args(argv)

    existing = []
    if args.into.exists():
        existing = [json.loads(line) for line in args.into.read_text(encoding="utf-8").splitlines() if line]
    seen = {question_key(q) for q in existing}

    files = [f for p in args.paths for f in (sorted(p.rglob("*.htm*")) if p.is_dir() else [p])]
    added, dupes, failed = [], 0, 0
    for f in files:
        questions, problem = parse_saved_page(f)
        if problem:
            failed += 1
            print(f"SKIP {f.name}: {problem}", file=sys.stderr)
            continue
        for q in questions:
            k = question_key(q)
            if k in seen:
                dupes += 1
                continue
            seen.add(k)
            added.append(q)

    next_idx = {}
    for q in existing:
        next_idx[q["cert"]] = max(next_idx.get(q["cert"], -1), q.get("idx", -1)) + 1
    args.into.parent.mkdir(parents=True, exist_ok=True)
    with args.into.open("a", encoding="utf-8") as out:
        for q in added:
            q["idx"] = next_idx.get(q["cert"], 0)
            next_idx[q["cert"]] = q["idx"] + 1
            out.write(json.dumps(q, ensure_ascii=False) + "\n")

    per_cert = {}
    for q in added:
        per_cert[q["cert"]] = per_cert.get(q["cert"], 0) + 1
    print(json.dumps({"files": len(files), "files_skipped": failed, "parsed_new": len(added),
                      "duplicates": dupes, "new_by_cert": per_cert, "total_now": len(existing) + len(added)}))
    return 1 if failed == len(files) else 0


if __name__ == "__main__":
    sys.exit(main())
