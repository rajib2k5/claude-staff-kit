#!/usr/bin/env python3
"""
ship_gate.py - the executable half of the taste-skill pre-flight gate.

The upstream skill calls these checks "mechanical" and then performs them by
re-reading its own output. This runs them. Countable checks only; the judgment
calls are emitted as an explicit attestation list rather than silently ticked.

Usage:
  python ship_gate.py page.html [page2.jsx ...] [--json] [--strict-emdash]

Exit 0 if every countable check passes, 1 otherwise.

Provenance for each rule is printed with the finding, back to the source section
in Leonxlnx/taste-skill so a failure is arguable rather than oracular.
"""
import argparse
import json
import math
import re
import sys

# ---------------------------------------------------------------- rule metadata

RULES = {
    "emdash": "taste-skill SKILL.md §9.G L685-701 (absolute em/en-dash ban in user-visible strings)",
    "eyebrow": "taste-skill SKILL.md §4.7 L253-257 (max 1 eyebrow per 3 sections, hero counts as 1)",
    "zigzag": "taste-skill SKILL.md §4.7 L252 (3rd consecutive image+text split is a fail)",
    "families": "taste-skill SKILL.md §4.7 L251 (>=4 layout families across 8 sections)",
    "marquee": "taste-skill SKILL.md §5 L361 (max 1 marquee per page)",
    "dvh": "taste-skill SKILL.md §3.E L150 (min-h-[100dvh], never h-screen)",
    "nav": "taste-skill SKILL.md §4.7 L247-248 (nav <=80px, single line at desktop)",
    "hero_lines": "taste-skill SKILL.md §4.7 L236-237 (hero headline <=2 lines desktop)",
    "hero_words": "taste-skill SKILL.md §4.7 L236 (hero subtext <=20 words)",
    "hero_stack": "taste-skill SKILL.md §4.7 L239-245 (max 4 text elements in the hero)",
    "cta_words": "taste-skill SKILL.md §4.5 L226 (primary CTA label <=3 words)",
    "list_escalation": "taste-skill SKILL.md §4.9 L307-314 (>5 items must not be a default bulleted list)",
    "nesting": "taste-skill SKILL.md §9.A / image-to-code §16 (no cards-inside-cards-inside-cards)",
    "scroll_cue": "taste-skill SKILL.md §9.F L682 (scroll cues banned)",
    "section_number": "taste-skill SKILL.md §9.F L638-642 (decorative section numbering banned)",
    "banned_font": "taste-skill SKILL.md §4.1 L173-181 (Inter as default, Fraunces, Instrument Serif banned)",
    "banned_palette": "taste-skill SKILL.md §4.2 L192-207 (premium-consumer beige/brass family banned)",
    "slop_name": "taste-skill SKILL.md §9.D L615-620 (startup-slop placeholder brand names)",
    "slop_word": "taste-skill SKILL.md §9.D L615-620 (filler marketing verbs)",
    "fake_precision": "taste-skill SKILL.md §4.9 L327-330 (fake-precise numbers must be real or marked mock)",
    "fake_footer": "taste-skill SKILL.md §9.E L654-656 (fake version/sync footers)",
    "scroll_listener": "taste-skill SKILL.md §5.D L509-515 (window scroll listener hard ban)",
    "state_continuous": "taste-skill SKILL.md §3.B L138 (no useState for continuous input-driven values)",
    "reduced_motion": "taste-skill SKILL.md §6 L526 (prefers-reduced-motion mandatory once motion is present)",
    "pure_black": "evolv-brand (body text is #343434, never #000000) + taste-skill §9.A L599-604",
    "off_palette": "evolv-brand (six approved hex values; overlay rule EV-1 - brand wins over borrowed palettes)",
    "shape_lock": "taste-skill SKILL.md §4.4 L217 (one shape family per page)",
}

# --------------------------------------------------------------- ban vocabulary

BANNED_HEX_PREMIUM = [
    "#f5f1ea", "#f7f5f1", "#fbf8f1", "#efeae0", "#ece6db", "#faf7f1", "#e8dfcb",
    "#b08947", "#b6553a", "#9a2436", "#9c6e2a", "#bc7c3a", "#7d5621",
    "#1a1714", "#1a1814", "#1b1814",
]
EVOLV_APPROVED = {"#d15635", "#d9d9d9", "#ffffff", "#2e3952", "#d68b60", "#343434"}
# soft neutrals the report spec sanctions for page bg / hairlines
EVOLV_TOLERATED = {"#faf8f5", "#e4e0da", "#fbf9f6", "#fff", "#fcfaf8"}

BANNED_FONTS = ["fraunces", "instrument serif"]
SLOP_NAMES = ["acme", "nexus", "flowbit", "quantumly", "novacore", "smartflow", "cloudly", "quantix", "velopay"]
SLOP_WORDS = ["unleash", "elevate your", "revolutionize", "next-gen", "seamless solution",
              "powerful solution", "transformative platform", "game-changer", "tapestry", "delve into"]
SCROLL_CUES = ["scroll to explore", "scroll to walk", "↓ scroll", "scroll down"]
SECTION_NUMBER_PAT = re.compile(r">\s*(00\s*/\s*INDEX|0\d{1,2}\s*[·/]\s*[A-Za-z])", re.I)
FAKE_FOOTER_PAT = re.compile(r"(v\d+\.\d+\.\d+-rc\.\d+|last sync \d+s ago)", re.I)
FAKE_PRECISION_PAT = re.compile(r">\s*(\d{1,3}\.\d{1,2}\s*%|\d{1,2}\.\d\s*[x×]|\d{1,3}\.\d\s*(mm|lb|kg))\s*<")

LAYOUT_FAMILIES = [
    "full-bleed", "split", "asymmetric", "bento", "card-grid",
    "editorial", "rail", "stacked-list", "overlap", "centered-focal",
]

# ------------------------------------------------------------------- extraction


def strip_comments(src):
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return src


def visible_text(src):
    """Crude but adequate: drop script/style, then take text between tags."""
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", src, flags=re.S | re.I)
    s = strip_comments(s)
    chunks = re.findall(r">([^<>]+)<", s)
    return [c.strip() for c in chunks if c.strip()]


def sections(src):
    """Return list of (attrs, inner) for each <section>."""
    return re.findall(r"<section\b([^>]*)>(.*?)</section>", src, flags=re.S | re.I)


def attr(attrs, name):
    m = re.search(name + r'\s*=\s*"([^"]*)"', attrs, re.I)
    return m.group(1) if m else ""


# ----------------------------------------------------------------------- checks


class Report:
    def __init__(self):
        self.results = []

    def add(self, rule, ok, detail, evidence=None):
        self.results.append({
            "rule": rule, "ok": bool(ok), "detail": detail,
            "evidence": evidence or [], "provenance": RULES.get(rule, ""),
        })

    @property
    def failed(self):
        return [r for r in self.results if not r["ok"]]


def run(src, path, strict_emdash=True):
    rep = Report()
    secs = sections(src)
    n = len(secs) or 1
    texts = visible_text(src)
    low = src.lower()

    # 1. em/en dash in visible strings
    hits = [t for t in texts if "—" in t or "–" in t]
    rep.add("emdash", not hits or not strict_emdash,
            "%d visible string(s) contain an em/en dash" % len(hits), hits[:6])

    # 2. eyebrow rationing
    eyebrows = re.findall(r'class="[^"]*\beyebrow\b[^"]*"', src, re.I)
    allowance = math.ceil(n / 3)
    rep.add("eyebrow", len(eyebrows) <= allowance,
            "%d eyebrow(s) across %d sections; allowance is ceil(%d/3) = %d"
            % (len(eyebrows), n, n, allowance))

    # 3/4. layout families + zigzag
    fams = [attr(a, "data-layout") for a, _ in secs]
    unknown = [f for f in fams if f and f not in LAYOUT_FAMILIES]
    run_len, worst = 0, 0
    for f in fams:
        if f == "split":
            run_len += 1
            worst = max(worst, run_len)
        else:
            run_len = 0
    rep.add("zigzag", worst <= 2,
            "longest consecutive run of split layouts is %d (cap 2)" % worst)
    if not any(fams):
        rep.add("families", False,
                "no section carries data-layout, so family variety cannot be verified "
                "(the overlay requires the annotation - upstream never defines the taxonomy at all)")
    else:
        need = 4 if n >= 8 else max(2, math.ceil(n / 2))
        rep.add("families", len(set(f for f in fams if f)) >= need and not unknown,
                "%d distinct families across %d sections (need %d)%s"
                % (len(set(f for f in fams if f)), n, need,
                   "; unrecognized: " + ", ".join(unknown) if unknown else ""),
                sorted(set(fams)))

    # 5. marquee
    mq = len(re.findall(r'(class="[^"]*marquee|<marquee)', src, re.I))
    rep.add("marquee", mq <= 1, "%d marquee element(s) (cap 1)" % mq)

    # 6. viewport unit
    dvh_ok = "h-screen" not in low and "height:100vh" not in low.replace(" ", "")
    rep.add("dvh", dvh_ok, "no h-screen / 100vh" if dvh_ok else "h-screen or 100vh present")

    # 7. nav height
    navh = re.search(r"--nav-h\s*:\s*(\d+)px", src)
    if navh:
        rep.add("nav", int(navh.group(1)) <= 80, "--nav-h is %spx (cap 80)" % navh.group(1))
    else:
        rep.add("nav", True, "no --nav-h token declared; height not machine-checkable (attest manually)")

    # 8-10. hero discipline
    hero = re.search(r'<section\b[^>]*data-hero="true"[^>]*>(.*?)</section>', src, re.S | re.I)
    if hero:
        h = hero.group(1)
        h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", h, re.S | re.I)
        head = re.sub(r"<[^>]+>", " ", h1.group(1)).strip() if h1 else ""
        lines = len([x for x in re.split(r"<br\s*/?>", h1.group(1))]) if h1 else 0
        rep.add("hero_lines", lines <= 2, "hero headline hard-broken into %d line(s) (cap 2)" % lines)
        sub = re.search(r'class="[^"]*hero-sub[^"]*"[^>]*>(.*?)<', h, re.S | re.I)
        words = len(re.sub(r"<[^>]+>", " ", sub.group(1)).split()) if sub else 0
        rep.add("hero_words", words <= 20, "hero subtext is %d word(s) (cap 20)" % words)
        stackm = re.search(r'<div\b[^>]*data-hero-stack[^>]*>(.*?)</div>\s*</div>', h, re.S | re.I)
        target = stackm.group(1) if stackm else h
        slots = 0
        slots += 1 if re.search(r'class="[^"]*eyebrow', target, re.I) else 0
        slots += len(re.findall(r"<h1\b", target, re.I))
        slots += len(re.findall(r'class="[^"]*hero-sub', target, re.I))
        slots += 1 if re.search(r'class="[^"]*hero-actions', target, re.I) else 0
        extra = len(re.findall(r"<p\b", target, re.I)) - (1 if re.search(r'class="[^"]*hero-sub', target, re.I) else 0) \
                - (1 if re.search(r'class="[^"]*eyebrow', target, re.I) else 0)
        slots += max(0, extra)
        rep.add("hero_stack", slots <= 4,
                "%d stack slot(s) in the hero column (cap 4: eyebrow-or-brand / headline / subtext / CTA row)%s"
                % (slots, "" if stackm else " [no data-hero-stack marker; counted whole section]"))
        ctas = re.findall(r'class="[^"]*\bcta\b[^"]*"[^>]*>([^<]+)<', h, re.I)
        bad = [c.strip() for c in ctas if len(c.strip().split()) > 3]
        rep.add("cta_words", not bad, "%d CTA label(s) exceed 3 words" % len(bad), bad)
        _ = head
    else:
        for k in ("hero_lines", "hero_words", "hero_stack", "cta_words"):
            rep.add(k, True, "no section marked data-hero; hero checks skipped")

    # 11. long-list escalation
    bad_lists = []
    for m in re.finditer(r"<ul\b([^>]*)>(.*?)</ul>", src, re.S | re.I):
        items = len(re.findall(r"<li\b", m.group(2), re.I))
        cls = attr(m.group(1), "class")
        if items > 5 and "escalated" not in cls:
            bad_lists.append("%d items, class=%r" % (items, cls))
    rep.add("list_escalation", not bad_lists,
            "%d default list(s) over 5 items without escalation" % len(bad_lists), bad_lists)

    # 12. container nesting depth
    depth_hits = re.findall(r'class="[^"]*\bcard\b[^"]*"[^>]*>\s*<[^>]*class="[^"]*\bcard\b[^"]*"'
                            r'[^>]*>\s*<[^>]*class="[^"]*\bcard\b', src, re.S | re.I)
    rep.add("nesting", not depth_hits, "%d triple-nested card structure(s)" % len(depth_hits))
    del depth_hits

    # 13-14. copy tells
    for rule, needles in (("scroll_cue", SCROLL_CUES), ("slop_name", SLOP_NAMES), ("slop_word", SLOP_WORDS)):
        found = sorted({nd for nd in needles if nd in low})
        rep.add(rule, not found, "%d banned term(s) present" % len(found), found)
    ok = not SECTION_NUMBER_PAT.search(src)
    rep.add("section_number", ok, "clean" if ok else "decorative section numbering present")
    ok = not FAKE_FOOTER_PAT.search(src)
    rep.add("fake_footer", ok, "clean" if ok else "fake version/sync footer present")
    fp = [m.group(1) for m in FAKE_PRECISION_PAT.finditer(src)]
    fp = [x for x in fp if "<!-- mock -->" not in src]
    rep.add("fake_precision", not fp, "%d fake-precise figure(s) with no real source or mock marker" % len(fp), fp[:6])

    # 15-16. fonts and palette
    bf = sorted({f for f in BANNED_FONTS if f in low})
    inter_default = bool(re.search(r"font-family\s*:\s*['\"]?inter", low))
    rep.add("banned_font", not bf and not inter_default,
            "banned display faces: %s%s" % (", ".join(bf) or "none",
                                            "; Inter set as a default family" if inter_default else ""))
    hexes = {h.lower() for h in re.findall(r"#[0-9a-fA-F]{3,8}\b", src)}
    prem = sorted(hexes & set(BANNED_HEX_PREMIUM))
    rep.add("banned_palette", not prem, "%d premium-consumer hex value(s)" % len(prem), prem)
    ok = "#000000" not in hexes and "#000" not in hexes
    rep.add("pure_black", ok, "no pure black" if ok else "pure black present")
    off = sorted(h for h in hexes
                 if h not in EVOLV_APPROVED and h not in EVOLV_TOLERATED and len(h) in (4, 7))
    rep.add("off_palette", not off,
            "%d hex value(s) outside the evolv palette and its sanctioned neutrals" % len(off), off)

    # 17. shape lock
    radii = sorted({r for r in re.findall(r"border-radius\s*:\s*([0-9.]+(?:px|rem)|999px|0)", low)})
    rep.add("shape_lock", len(radii) <= 3,
            "%d distinct border-radius values (%s); one shape family expected"
            % (len(radii), ", ".join(radii) or "none"))

    # 18-20. motion hygiene
    flat = low.replace(" ", "")
    ok = "addeventlistener('scroll'" not in flat and 'addeventlistener("scroll"' not in flat
    rep.add("scroll_listener", ok, "no scroll listener" if ok else "scroll listener attached")
    ok = not re.search(r"usestate[^;]{0,40}(scroll|mouse|pointer)", low)
    rep.add("state_continuous", ok,
            "no continuous value in component state" if ok
            else "useState appears to hold a continuous input value")
    has_motion = bool(re.search(r"(transition|animation|@keyframes|whileinview|gsap)", low))
    rm_ok = (not has_motion) or "prefers-reduced-motion" in low
    rep.add("reduced_motion", rm_ok,
            ("motion present, reduced-motion block found" if has_motion else "no motion detected")
            if rm_ok else "motion present without a prefers-reduced-motion block")

    return rep


ATTESTATIONS = [
    "Every animation can be justified in one sentence (hierarchy / storytelling / feedback / state).",
    "Every visible string re-read for grammar, referent clarity, and accidental cuteness.",
    "Hero visual is a real asset, not a gradient blob or a div-built fake screenshot.",
    "Copy register is consistent page-wide (not mixing technical mono, editorial, and marketing punch).",
    "Contrast measured, not assumed: 4.5:1 body, 3:1 for text >=18px.",
    "Any figure presented as data is real or explicitly marked mock.",
    "Layout-family annotations honestly describe the section they sit on.",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--lenient-emdash", action="store_true",
                    help="report em-dashes as advisory instead of a hard fail")
    a = ap.parse_args()

    payload, exit_code = [], 0
    for p in a.paths:
        src = open(p, encoding="utf-8").read()
        rep = run(src, p, strict_emdash=not a.lenient_emdash)
        payload.append({"file": p, "results": rep.results,
                        "passed": len(rep.results) - len(rep.failed),
                        "total": len(rep.results)})
        if rep.failed:
            exit_code = 1

    if a.json:
        print(json.dumps({"files": payload, "attestations": ATTESTATIONS}, indent=2))
        return exit_code

    for f in payload:
        print("\n\033[1m%s\033[0m  %d/%d countable checks passed"
              % (f["file"], f["passed"], f["total"]))
        print("-" * 72)
        for r in f["results"]:
            mark = "PASS" if r["ok"] else "FAIL"
            print("  [%s] %-18s %s" % (mark, r["rule"], r["detail"]))
            if not r["ok"]:
                if r["evidence"]:
                    print("           evidence: %s" % "; ".join(str(x)[:90] for x in r["evidence"]))
                print("           rule: %s" % r["provenance"])
    print("\nHuman attestation required (not machine-checkable):")
    for x in ATTESTATIONS:
        print("  [ ] " + x)
    print("\nVERDICT: %s" % ("SHIP" if exit_code == 0 else "BLOCKED - fix the failures above"))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
