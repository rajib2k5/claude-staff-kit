#!/usr/bin/env python3
"""Release a Claude Code plugin: check versions, bump, validate, and tag. Refuses a version regression.

    release.py check --plugin-dir PATH                 report every known version; exit 1 on regression
    release.py bump  --plugin-dir PATH (--part patch|minor|major | --to X.Y.Z) [--marketplace FILE]
    release.py tag   --plugin-dir PATH                 tag HEAD after the bump is committed

A version is known from four places: plugin.json in the working tree, plugin.json at HEAD,
existing git tags for the plugin, and the plugin's marketplace entry. "bump" refuses any new
version that is not strictly greater than every one of them. That is the check that stops an
uncommitted edit from moving a version backward (working tree 1.3.4 while HEAD says 1.4.0).

"bump" writes plugin.json and the marketplace entry ("version", and "source.ref" when the
source is a git source with a ref), runs scripts/sync-index.py --write when the repository has
it, then runs `claude plugin validate --strict` on the plugin and the marketplace. It never
commits and never pushes. "tag" makes an annotated tag only when the tree is clean and HEAD
holds the bumped version. Pushing the tag is left to a human.

Exit codes: 0 ok; 1 refused (regression, dirty tree, failed validation); 2 usage error.
Standard library only.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
GIT_TIMEOUT_S = 30
VALIDATE_TIMEOUT_S = 120


class Refused(Exception):
    """A release step that must not proceed."""


def parse(v):
    m = SEMVER.match(v or "")
    if not m:
        raise ValueError(f"not a MAJOR.MINOR.PATCH version: {v!r}")
    return tuple(int(x) for x in m.groups())


def fmt(t):
    return ".".join(str(x) for x in t)


def bump(t, part):
    major, minor, patch = t
    return {"major": (major + 1, 0, 0), "minor": (major, minor + 1, 0), "patch": (major, minor, patch + 1)}[part]


def git(repo, *args, check=True):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=GIT_TIMEOUT_S)
    if check and r.returncode != 0:
        raise Refused(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r


def repo_root(path):
    return Path(git(path, "rev-parse", "--show-toplevel").stdout.strip())


def manifest_path(plugin_dir):
    p = Path(plugin_dir) / ".claude-plugin" / "plugin.json"
    if not p.is_file():
        raise ValueError(f"no plugin manifest at {p}")
    return p


def tag_name(fmt_str, name, version):
    return fmt_str.format(name=name, version=version)


def tag_regex(fmt_str, name):
    pat = re.escape(fmt_str).replace(re.escape("{name}"), re.escape(name)).replace(
        re.escape("{version}"), r"(\d+\.\d+\.\d+)")
    return re.compile("^" + pat + "$")


def find_marketplace_entry(market_file, name):
    data = json.loads(Path(market_file).read_text(encoding="utf-8"))
    for entry in data.get("plugins", []):
        if entry.get("name") == name:
            return data, entry
    return data, None


def known_versions(plugin_dir, market_file, tag_fmt):
    """Return (name, {source: version_tuple}) for every place a version is recorded."""
    mpath = manifest_path(plugin_dir)
    manifest = json.loads(mpath.read_text(encoding="utf-8"))
    name = manifest.get("name")
    if not name:
        raise ValueError(f"{mpath} has no name")
    versions = {}
    if manifest.get("version"):
        versions["working tree plugin.json"] = parse(manifest["version"])
    root = repo_root(mpath.parent)
    rel = mpath.resolve().relative_to(root.resolve())
    head = git(root, "show", f"HEAD:{rel.as_posix()}", check=False)
    if head.returncode == 0:
        hv = json.loads(head.stdout).get("version")
        if hv:
            versions["HEAD plugin.json"] = parse(hv)
    rx = tag_regex(tag_fmt, name)
    tags = [rx.match(t).group(1) for t in git(root, "tag", "--list").stdout.split() if rx.match(t)]
    if tags:
        versions["highest tag"] = max(parse(t) for t in tags)
    if market_file and Path(market_file).is_file():
        _, entry = find_marketplace_entry(market_file, name)
        if entry and entry.get("version"):
            versions["marketplace entry"] = parse(entry["version"])
    return name, versions


def regression_problems(versions):
    """The working tree must not be behind HEAD, a tag, or the marketplace."""
    wt = versions.get("working tree plugin.json")
    if wt is None:
        return []
    return [f"working tree plugin.json {fmt(wt)} is behind {src} {fmt(v)}"
            for src, v in versions.items() if src != "working tree plugin.json" and v > wt]


def default_marketplace(plugin_dir):
    root = repo_root(Path(plugin_dir).resolve())
    p = root / ".claude-plugin" / "marketplace.json"
    return p if p.is_file() else None


def run_validate(paths, skip):
    if skip:
        print("validate: SKIPPED (--skip-validate); run `claude plugin validate --strict` before tagging")
        return
    if not shutil.which("claude"):
        raise Refused("claude CLI not on PATH; cannot run `claude plugin validate --strict` (or pass --skip-validate)")
    for p in paths:
        r = subprocess.run(["claude", "plugin", "validate", "--strict", str(p)], capture_output=True, text=True,
                           timeout=VALIDATE_TIMEOUT_S)
        print(f"validate {p}: exit {r.returncode}")
        if r.returncode != 0:
            raise Refused(f"`claude plugin validate --strict {p}` failed:\n{r.stdout}{r.stderr}")


def write_json_preserving(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def cmd_check(a):
    name, versions = known_versions(a.plugin_dir, a.marketplace, a.tag_format)
    for src, v in versions.items():
        print(f"{name}: {src} = {fmt(v)}")
    problems = regression_problems(versions)
    for p in problems:
        print(f"REGRESSION {p}")
    return 1 if problems else 0


def cmd_bump(a):
    name, versions = known_versions(a.plugin_dir, a.marketplace, a.tag_format)
    if not versions:
        raise Refused("no version found anywhere; set \"version\" in plugin.json first")
    highest = max(versions.values())
    base = versions.get("HEAD plugin.json") or versions.get("working tree plugin.json")
    new = parse(a.to) if a.to else bump(max(base, highest), a.part)
    if new <= highest:
        where = ", ".join(f"{s} {fmt(v)}" for s, v in versions.items())
        raise Refused(f"refusing {fmt(new)}: it is not greater than every known version ({where})")
    mpath = manifest_path(a.plugin_dir)
    manifest = json.loads(mpath.read_text(encoding="utf-8"))
    manifest["version"] = fmt(new)
    write_json_preserving(mpath, manifest)
    print(f"{mpath}: version {fmt(new)}")
    tag = tag_name(a.tag_format, name, fmt(new))
    if a.marketplace and Path(a.marketplace).is_file():
        data, entry = find_marketplace_entry(a.marketplace, name)
        if entry is None:
            raise Refused(f"{a.marketplace} has no entry named {name!r}; add it before releasing")
        if "version" in entry or isinstance(entry.get("source"), str):
            entry["version"] = fmt(new)
        src = entry.get("source")
        if isinstance(src, dict) and "ref" in src:
            src["ref"] = tag
        write_json_preserving(a.marketplace, data)
        print(f"{a.marketplace}: entry {name} -> {fmt(new)}" + (f", ref {tag}" if isinstance(src, dict) and "ref" in src else ""))
    root = repo_root(mpath.parent)
    sync = root / "scripts" / "sync-index.py"
    if sync.is_file():
        r = subprocess.run([sys.executable, str(sync), "--write"], cwd=root, capture_output=True, text=True,
                           timeout=VALIDATE_TIMEOUT_S)
        print(f"sync-index --write: exit {r.returncode}")
        if r.returncode != 0:
            raise Refused(f"sync-index.py --write failed:\n{r.stdout}{r.stderr}")
    run_validate([mpath] + ([a.marketplace] if a.marketplace else []), a.skip_validate)
    print(f"next: commit, then `release.py tag --plugin-dir {a.plugin_dir}` to create {tag}")
    return 0


def cmd_tag(a):
    mpath = manifest_path(a.plugin_dir)
    root = repo_root(mpath.parent)
    if git(root, "status", "--porcelain").stdout.strip():
        raise Refused("working tree is not clean; commit the bump first")
    name, versions = known_versions(a.plugin_dir, a.marketplace, a.tag_format)
    head = versions.get("HEAD plugin.json")
    if head is None:
        raise Refused("HEAD has no plugin.json version")
    problems = regression_problems(versions)
    if "highest tag" in versions and versions["highest tag"] >= head:
        problems.append(f"a tag at {fmt(versions['highest tag'])} already exists; HEAD is {fmt(head)}")
    if problems:
        raise Refused("; ".join(problems))
    tag = tag_name(a.tag_format, name, fmt(head))
    git(root, "tag", "-a", tag, "-m", f"{name} {fmt(head)}")
    print(f"tagged {tag} at {git(root, 'rev-parse', '--short', 'HEAD').stdout.strip()}; push it with: git push origin {tag}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("check", "bump", "tag"):
        p = sub.add_parser(name)
        p.add_argument("--plugin-dir", required=True, help="directory holding .claude-plugin/plugin.json")
        p.add_argument("--marketplace", help="marketplace.json (default: <repo>/.claude-plugin/marketplace.json)")
        p.add_argument("--tag-format", default="{name}-v{version}", help="default {name}-v{version}")
        if name == "bump":
            g = p.add_mutually_exclusive_group(required=True)
            g.add_argument("--part", choices=["patch", "minor", "major"])
            g.add_argument("--to", help="explicit MAJOR.MINOR.PATCH")
            p.add_argument("--skip-validate", action="store_true", help="skip `claude plugin validate` (tests only)")
    a = ap.parse_args(argv)
    try:
        if a.marketplace is None:
            a.marketplace = default_marketplace(a.plugin_dir)
        return {"check": cmd_check, "bump": cmd_bump, "tag": cmd_tag}[a.cmd](a)
    except Refused as e:
        print(f"REFUSED: {e}", file=sys.stderr)
        return 1
    except (ValueError, json.JSONDecodeError) as e:
        print(f"release: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
