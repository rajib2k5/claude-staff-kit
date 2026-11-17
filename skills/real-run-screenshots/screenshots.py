#!/usr/bin/env python3
"""Make README screenshots from REAL runs: terminal shots of real commands, page shots of a live app.

Nothing is typed or faked. The command text you see in a terminal shot is the string that ran, and
the output is what it printed. A privacy scan fails the run if an image holds a home path, a user
name, an email address or a token.

Usage:
    screenshots.py run SPEC.json                       # every shot in a spec
    screenshots.py term --cmd "mytool --help" --name 01-help [--out-dir docs/images]
    screenshots.py page --url http://127.0.0.1:8000 --name 02-home [--selector main] [--full-page]

Terminal shots need `rich`. PNG output and page shots need `playwright` plus a Chromium build
(`python3 -m playwright install chromium`). Both are imported only when used. Without them,
parsing, the privacy scan and running commands still work. SVG terminal shots need only `rich`.

Spec (JSON; YAML too when PyYAML is installed):
    {
      "out_dir": "docs/images",          # default "docs/images"
      "workdir": "/tmp/demo-myapp",      # neutral dir; the script deletes it only if it made it
      "setup": ["git init -q"],          # real commands run in workdir before the shots
      "width": 100, "format": "svg",     # format: svg | png | both
      "max_kb": 500,                     # every written image must stay below this
      "forbidden": ["my-secret-word"],   # extra regexes for the privacy scan
      "allow": ["github.com/me/tool"],   # strings removed before scanning (public URLs)
      "env": {"MYTOOL_MODE": "demo"},    # extra env for commands
      "path": "/usr/local/bin:/usr/bin:/bin",
      "shots": [
        {"kind": "terminal", "name": "01-help", "title": "mytool --help",
         "commands": ["mytool --help"], "max_lines": 40, "expect_exit": 0},
        {"kind": "page", "name": "02-home", "url": "http://127.0.0.1:8000/",
         "selector": "main", "full_page": false, "viewport": [1280, 800],
         "wait_for": "#ready", "expect_text": "Dashboard"}
      ]
    }

The app for a page shot must already be running. This script does not start it.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

MARKER = ".real-run-screenshots"
DEFAULT_PATH = "/usr/local/bin:/usr/bin:/bin"
DEFAULT_FORBIDDEN = [
    r"/home/",
    r"/Users/",
    r"/root/",
    r"[A-Za-z]:\\Users\\",
    r"[\w.+-]+@[\w-]+\.[\w.-]+",  # email address
    r"gh[pousr]_[A-Za-z0-9]",
    r"github_pat_",
    r"(?<![A-Za-z0-9])sk-[A-Za-z0-9]",
    r"AKIA[0-9A-Z]{8}",
]
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


class SpecError(ValueError):
    """The spec or arguments are not valid."""


class PrivacyError(RuntimeError):
    """An image or its text holds private data."""


# --------------------------------------------------------------------------- pure helpers


def parse_viewport(text) -> tuple[int, int]:
    """'1280x800', '1280,800' or [1280, 800] to (1280, 800). Raises SpecError."""
    if isinstance(text, (list, tuple)) and len(text) == 2:
        parts = list(text)
    else:
        parts = re.split(r"[x,X]", str(text).strip())
    try:
        w, h = (int(p) for p in parts)
    except (ValueError, TypeError):
        raise SpecError(f"bad viewport {text!r}; use WIDTHxHEIGHT") from None
    if not (100 <= w <= 8000 and 100 <= h <= 8000):
        raise SpecError(f"viewport {w}x{h} is outside 100..8000")
    return w, h


def safe_name(name: str) -> str:
    if not isinstance(name, str) or not NAME_RE.match(name) or ".." in name:
        raise SpecError(f"bad shot name {name!r}; use letters, digits, '.', '_', '-'")
    return name


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text)


def private_patterns(extra: list[str] | None = None, home: str | None = None, user: str | None = None) -> list[str]:
    """Default patterns, plus this machine's home path and user name, plus the caller's own."""
    pats = list(DEFAULT_FORBIDDEN)
    home = home if home is not None else str(Path.home())
    if home and home not in ("/", ""):
        pats.append(re.escape(home))
    if user is None:
        try:
            user = getpass.getuser()
        except Exception:  # no passwd entry in some containers
            user = ""
    if user and len(user) >= 3 and user not in ("root", "demo", "user"):
        pats.append(r"(?i)(?<![A-Za-z0-9])" + re.escape(user) + r"(?![A-Za-z0-9])")
    pats.extend(extra or [])
    return pats


def scan_text(text: str, patterns: list[str], allow: list[str] | None = None) -> list[str]:
    """Return one message per pattern that matches. Allowed strings are removed first."""
    cleaned = text
    for a in allow or []:
        cleaned = cleaned.replace(a, "")
    hits = []
    for pat in patterns:
        m = re.search(pat, cleaned)
        if m:
            ctx = cleaned[max(0, m.start() - 30): m.end() + 30].replace("\n", " ")
            hits.append(f"/{pat}/ near {ctx!r}")
    return hits


def svg_text_content(svg: str) -> str:
    """Text a viewer can read in an SVG: <text> nodes and <title>. CSS in <style> is not content."""
    nodes = re.findall(r"<text[^>]*>(.*?)</text>", svg, flags=re.S) + re.findall(r"<title>(.*?)</title>", svg, flags=re.S)
    joined = "\n".join(nodes)
    for ent, ch in (("&#160;", " "), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#x27;", "'"), ("&amp;", "&")):
        joined = joined.replace(ent, ch)
    return joined


def check_size(path: Path, max_kb: int) -> None:
    size = path.stat().st_size
    if size > max_kb * 1024:
        raise RuntimeError(f"{path.name} is {size / 1024:.1f} KB; limit is {max_kb} KB")


def trim_lines(output: str, max_lines: int | None) -> str:
    """Keep the last max_lines lines and mark the cut. 0 or None keeps all."""
    lines = output.rstrip("\n").split("\n")
    if not max_lines or len(lines) <= max_lines:
        return output
    return "...\n" + "\n".join(lines[-max_lines:])


def clean_env(workdir: Path, extra: dict | None = None, path: str = DEFAULT_PATH, width: int = 100) -> dict:
    """A small environment: no real HOME, no keys, no user PATH entries."""
    env = {
        "HOME": str(workdir),
        "PATH": path,
        "LANG": "C.UTF-8",
        "NO_COLOR": "1",
        "COLUMNS": str(width),
        "PS1": "$ ",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_SYSTEM": "/dev/null",
    }
    env.update({str(k): str(v) for k, v in (extra or {}).items()})
    return env


def load_spec(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() in (".yaml", ".yml"):
        try:
            import yaml  # type: ignore
        except ImportError:
            raise SpecError("YAML spec needs PyYAML (pip install pyyaml); or use a JSON spec") from None
        data = yaml.safe_load(text)
    else:
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise SpecError(f"{path}: invalid JSON: {exc}") from None
    return validate_spec(data)


def validate_spec(data) -> dict:
    """Check types and fill defaults. Returns a new dict. Raises SpecError with the field name."""
    if not isinstance(data, dict):
        raise SpecError("spec must be an object")
    spec = {
        "out_dir": str(data.get("out_dir", "docs/images")),
        "workdir": str(data.get("workdir", "/tmp/demo-screenshots")),
        "setup": list(data.get("setup", [])),
        "width": int(data.get("width", 100)),
        "format": str(data.get("format", "svg")),
        "max_kb": int(data.get("max_kb", 500)),
        "forbidden": list(data.get("forbidden", [])),
        "allow": list(data.get("allow", [])),
        "env": dict(data.get("env", {})),
        "path": str(data.get("path", DEFAULT_PATH)),
    }
    if spec["format"] not in ("svg", "png", "both"):
        raise SpecError(f"format must be svg, png or both, not {spec['format']!r}")
    if not 40 <= spec["width"] <= 300:
        raise SpecError("width must be 40..300")
    if not all(isinstance(c, str) for c in spec["setup"]):
        raise SpecError("setup must be a list of command strings")
    shots = data.get("shots")
    if not isinstance(shots, list) or not shots:
        raise SpecError("shots must be a non-empty list")
    seen, out = set(), []
    for i, s in enumerate(shots):
        if not isinstance(s, dict):
            raise SpecError(f"shots[{i}] must be an object")
        kind = s.get("kind", "terminal")
        name = safe_name(s.get("name"))
        if name in seen:
            raise SpecError(f"duplicate shot name {name!r}")
        seen.add(name)
        if kind == "terminal":
            cmds = s.get("commands")
            if not isinstance(cmds, list) or not cmds or not all(isinstance(c, str) and c.strip() for c in cmds):
                raise SpecError(f"shots[{i}] ({name}): commands must be a non-empty list of strings")
            shot = {"kind": kind, "name": name, "title": str(s.get("title", name)), "commands": cmds,
                    "max_lines": int(s.get("max_lines", 0)), "expect_exit": s.get("expect_exit", 0),
                    "show_exit": bool(s.get("show_exit", False))}
        elif kind == "page":
            url = s.get("url")
            if not isinstance(url, str) or not re.match(r"^https?://", url):
                raise SpecError(f"shots[{i}] ({name}): url must start with http:// or https://")
            shot = {"kind": kind, "name": name, "url": url, "selector": s.get("selector"),
                    "full_page": bool(s.get("full_page", False)),
                    "viewport": parse_viewport(s.get("viewport", [1280, 800])),
                    "wait_for": s.get("wait_for"), "expect_text": s.get("expect_text")}
        else:
            raise SpecError(f"shots[{i}] ({name}): kind must be terminal or page, not {kind!r}")
        out.append(shot)
    spec["shots"] = out
    return spec


# --------------------------------------------------------------------------- real runs


def run_command(cmd: str, cwd: Path, env: dict, timeout: int = 300) -> tuple[int, str]:
    """Run one real command through bash. Returns (exit code, stdout and stderr together)."""
    p = subprocess.run(
        ["bash", "--noprofile", "--norc", "-c", cmd], cwd=cwd, env=env, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, check=False,
    )
    return p.returncode, p.stdout


def prepare_workdir(workdir: Path) -> None:
    """Create a fresh neutral dir. Delete an old one only if this script made it (marker file)."""
    if workdir.exists():
        if not (workdir / MARKER).is_file():
            raise SpecError(f"{workdir} exists but this script did not create it; move it away first")
        shutil.rmtree(workdir)
    workdir.mkdir(parents=True)
    (workdir / MARKER).touch()


# --------------------------------------------------------------------------- rendering (lazy imports)


def _need(module: str, hint: str):
    try:
        return __import__(module, fromlist=["_"])
    except ImportError:
        raise SystemExit(f"error: this step needs `{module}`. Install it: {hint}") from None


def render_terminal_svg(steps: list[tuple[str, str]], title: str, width: int) -> str:
    """steps: (command, output). Returns SVG text drawn with rich."""
    _need("rich", "pip install rich   (or: uv run --with rich python screenshots.py ...)")
    from rich.console import Console
    from rich.text import Text

    console = Console(record=True, width=width, force_terminal=True, color_system="truecolor",
                      file=open(os.devnull, "w"))
    for cmd, output in steps:
        console.print(Text("$ ", style="bold green") + Text(cmd, style="bold"))
        if output.strip():
            console.print(Text(strip_ansi(output).rstrip("\n")))
    return console.export_svg(title=title)


def svg_to_png(svg: str, dest: Path) -> None:
    pw = _need("playwright.sync_api", "pip install playwright && python3 -m playwright install chromium")
    with pw.sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=2)
        page.set_content(f'<body style="margin:0">{svg}</body>')
        page.locator("svg").first.screenshot(path=str(dest), omit_background=True)
        browser.close()


def page_screenshot(shot: dict, dest: Path, patterns: list[str], allow: list[str]) -> None:
    """Screenshot a running app. The page text is scanned for private data before saving."""
    pw = _need("playwright.sync_api", "pip install playwright && python3 -m playwright install chromium")
    w, h = shot["viewport"]
    with pw.sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            page.goto(shot["url"], wait_until="networkidle", timeout=45000)
            if shot["wait_for"]:
                page.wait_for_selector(shot["wait_for"], timeout=15000)
            text = page.inner_text("body")
            if shot["expect_text"] and shot["expect_text"] not in text:
                raise RuntimeError(f"{shot['name']}: expected text {shot['expect_text']!r} not on the page; "
                                   "is the app running and is this the right URL?")
            hits = scan_text(text, patterns, allow)
            if hits:
                raise PrivacyError(f"private data on page {shot['url']}: " + "; ".join(hits))
            if shot["selector"]:
                page.locator(shot["selector"]).first.screenshot(path=str(dest))
            else:
                page.screenshot(path=str(dest), full_page=shot["full_page"])
        finally:
            browser.close()


# --------------------------------------------------------------------------- orchestration


def make_terminal_shot(shot: dict, spec: dict, workdir: Path, env: dict, out_dir: Path, patterns: list[str]) -> list[Path]:
    steps = []
    for cmd in shot["commands"]:
        rc, out = run_command(cmd, workdir, env)
        expect = shot["expect_exit"]
        if expect is not None and rc != expect:
            raise RuntimeError(f"{shot['name']}: `{cmd}` exited {rc}, expected {expect}. Output:\n{out}")
        out = trim_lines(out, shot["max_lines"])
        if shot["show_exit"]:
            out = out.rstrip("\n") + f"\n[exit {rc}]"
        steps.append((cmd, out))
    plain = "\n".join(f"$ {c}\n{o}" for c, o in steps)
    hits = scan_text(plain + "\n" + shot["title"], patterns, spec["allow"])
    if hits:
        raise PrivacyError(f"{shot['name']}: " + "; ".join(hits))
    svg = render_terminal_svg(steps, shot["title"], spec["width"])
    hits = scan_text(svg_text_content(svg), patterns, spec["allow"])
    if hits:
        raise PrivacyError(f"{shot['name']} svg: " + "; ".join(hits))
    written = []
    if spec["format"] in ("svg", "both"):
        p = out_dir / f"{shot['name']}.svg"
        p.write_text(svg, encoding="utf-8")
        written.append(p)
    if spec["format"] in ("png", "both"):
        p = out_dir / f"{shot['name']}.png"
        svg_to_png(svg, p)
        written.append(p)
    return written


def run_spec(spec: dict) -> list[Path]:
    workdir = Path(spec["workdir"])
    out_dir = Path(spec["out_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    prepare_workdir(workdir)
    env = clean_env(workdir, spec["env"], spec["path"], spec["width"])
    patterns = private_patterns(spec["forbidden"])
    for cmd in spec["setup"]:
        rc, out = run_command(cmd, workdir, env)
        if rc != 0:
            raise RuntimeError(f"setup `{cmd}` exited {rc}:\n{out}")
    written: list[Path] = []
    for shot in spec["shots"]:
        if shot["kind"] == "terminal":
            written += make_terminal_shot(shot, spec, workdir, env, out_dir, patterns)
        else:
            dest = out_dir / f"{shot['name']}.png"
            page_screenshot(shot, dest, patterns, spec["allow"])
            written.append(dest)
    for p in written:
        check_size(p, spec["max_kb"])
        print(f"{p} {p.stat().st_size / 1024:.1f} KB")
    return written


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Screenshots from real runs (terminal and live page).")
    sub = ap.add_subparsers(dest="mode", required=True)
    r = sub.add_parser("run", help="run every shot in a spec file")
    r.add_argument("spec", type=Path)
    t = sub.add_parser("term", help="one terminal shot of a real command")
    t.add_argument("--cmd", action="append", required=True, help="command to run (repeat for several)")
    t.add_argument("--name", required=True)
    t.add_argument("--title")
    t.add_argument("--format", choices=["svg", "png", "both"], default="svg")
    t.add_argument("--width", type=int, default=100)
    t.add_argument("--expect-exit", type=int, default=0)
    pg = sub.add_parser("page", help="one screenshot of a running app")
    pg.add_argument("--url", required=True)
    pg.add_argument("--name", required=True)
    pg.add_argument("--selector")
    pg.add_argument("--wait-for")
    pg.add_argument("--expect-text")
    pg.add_argument("--viewport", default="1280x800")
    pg.add_argument("--full-page", action="store_true")
    for sp in (t, pg):
        sp.add_argument("--out-dir", default="docs/images")
        sp.add_argument("--workdir", default="/tmp/demo-screenshots")
    return ap


def spec_from_args(a: argparse.Namespace) -> dict:
    if a.mode == "term":
        shot = {"kind": "terminal", "name": a.name, "title": a.title or a.cmd[0], "commands": a.cmd,
                "expect_exit": a.expect_exit}
        base = {"format": a.format, "width": a.width}
    else:
        shot = {"kind": "page", "name": a.name, "url": a.url, "selector": a.selector, "wait_for": a.wait_for,
                "expect_text": a.expect_text, "viewport": a.viewport, "full_page": a.full_page}
        base = {}
    return validate_spec({**base, "out_dir": a.out_dir, "workdir": a.workdir, "shots": [shot]})


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        spec = load_spec(args.spec) if args.mode == "run" else spec_from_args(args)
        run_spec(spec)
    except SpecError as exc:
        print(f"spec error: {exc}", file=sys.stderr)
        return 2
    except PrivacyError as exc:
        print(f"privacy check failed: {exc}", file=sys.stderr)
        return 3
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
