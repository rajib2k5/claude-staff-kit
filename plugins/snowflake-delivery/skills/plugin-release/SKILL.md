---
name: plugin-release
description: Release a Claude Code plugin from a marketplace repository - check every recorded version, bump plugin.json and the marketplace entry (version, or source ref for a git source), resync the kit indexes, run claude plugin validate --strict, then tag the release commit - and refuse any version that would move backward. Use when shipping a new version of a plugin, after editing plugin.json by hand, or when versions in plugin.json, the marketplace and the tags disagree. Triggers - release the plugin, bump the plugin version, tag a plugin release, update the marketplace ref, plugin version regression, publish plugin.
---

# Plugin release

`scripts/release.py` in this skill's directory does the mechanical part (below, `release.py` means that
file; run it from the repository root). It reads the version from four places: `plugin.json` in
the working tree, `plugin.json` at `HEAD`, the git tags for the plugin (`<name>-vX.Y.Z` by default), and
the plugin's entry in `.claude-plugin/marketplace.json`. A new version must be greater than all four.
This stops the failure where an uncommitted edit moved a version backward (working tree 1.3.4 while HEAD
said 1.4.0) and the build shipped it.

## Procedure

1. **Check.** `python3 release.py check --plugin-dir plugins/<name>`. Exit 1 with a `REGRESSION`
   line means the working tree is behind HEAD, a tag or the marketplace. Find out why before you go on;
   do not edit the number to make the line go away.
2. **Bump.** `python3 release.py bump --plugin-dir plugins/<name> --part patch|minor|major`
   (or `--to X.Y.Z`). It writes `plugin.json` and the marketplace entry, runs `scripts/sync-index.py
   --write` when the repository has it, and runs `claude plugin validate --strict` on the plugin and the
   marketplace. Any failure stops it with exit 1. It never commits or pushes.
   Pick the part from the change: a removed or renamed skill, agent, command or option is `major`; a new
   one is `minor`; a fix is `patch`.
3. **Changelog.** Move the plugin's `[Unreleased]` lines under the new version heading.
4. **Run the repository gate** (in this kit: `bash scripts/validate.sh`) and read its output.
5. **Commit** the bump, the changelog and the index changes as one commit, when the user asks for a commit.
6. **Tag.** `python3 release.py tag --plugin-dir plugins/<name>`. It refuses a dirty tree, a HEAD
   version that is not above every tag, and a tag that already exists. It prints the push command; pushing
   the tag is for the user to approve.

For a plugin in another repository that the marketplace lists with `"source": {"source": "github",
"repo": ..., "ref": ...}`, release and tag in that repository first, then run `bump --to <same version>`
here so the marketplace `ref` points at the new tag.

## Traps

- **Do not lower a version to match something else.** If the marketplace says 1.9.0 and the plugin says
  1.5.0, the next release is above 1.9.0.
- **The tag must point at the commit that holds the bump.** That is why `tag` is a separate step that
  needs a clean tree.
- **`--skip-validate` is for tests.** A release without `claude plugin validate --strict` is not checked.
  If the CLI is missing, `bump` stops and says so rather than skipping quietly.
- **Another plugin's tags do not count.** Only tags that match the plugin's own tag format are read.

## Report

- The version found in each of the four places before the bump, and the new version.
- The exit code and output of `claude plugin validate --strict` and of the repository gate.
- The commit and tag created, or which of them is still waiting for the user's go-ahead.
