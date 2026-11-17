---
description: Scaffold a new MCP server from the fast-mcp-template repo, in the template's own order, and run its gate
argument-hint: <package-name> [target-dir] [--template <url-or-path>]
---

Scaffold a new MCP server named `$ARGUMENTS`.

Parse the arguments as `<package-name> [target-dir] [--template <url-or-path>]`.

- `package-name`: lower-case kebab case, `^[a-z][a-z0-9-]*$` (for example `acme-orders-mcp`). Stop and ask if it does
  not match. Derive `PKG_MODULE` (hyphens to underscores: `acme_orders_mcp`) and `ENV_PREFIX` (upper case, hyphens to
  underscores, trailing underscore: `ACME_ORDERS_MCP_`).
- `target-dir`: default `./<package-name>`. Stop if it exists and is not empty.
- `--template`: default `https://github.com/evolvconsulting/fast-mcp-template.git`. At the time this command was
  written the repository was public (`gh repo view ... --json visibility` returned `PUBLIC`). If the clone fails with an
  access error, the repository has become private: tell the user they need access, and ask for a `--template` URL or a
  local path they can read. Do not look for credentials.

Requirements: `git`, `uv`, Python 3.11 or later (the template's `pyproject.toml` says which). Check with
`uv --version` first.

The steps below are the template's README section "Start a project from this", in its order. Steps marked MEASURED
exist because skipping them failed silently on a real repository. Do them in order. Do not skip one because the
build is green.

## Steps

1. **Clone without history.** Clone the template into `target-dir`, then `rm -rf .git && git init -b main`. A
   template must not carry its history into its children. (Use the repository's default branch name in place of
   `main` if the user said otherwise.)
2. **MEASURED: set the default branch in the CI trigger first.** In `.github/workflows/ci.yml`, edit
   `on: push: branches:` (it ships as `[main, master, dev]`) so it contains the project's default branch. If you
   skip this, Gate, CodeQL and actionlint are silently off: the jobs are absent and absent renders grey, not red.
3. **Rename, in this order.**
   1. Directory `src/fast_mcp_template/` to `src/<PKG_MODULE>/` (use `git mv`).
   2. Text in tracked files: `fast_mcp_template` to `<PKG_MODULE>`, `fast-mcp-template` to `<package-name>`,
      `MCP_TEMPLATE_` to `<ENV_PREFIX>`. This covers `pyproject.toml` (`name`, `[project.scripts]`, the hatch
      tables, `[tool.coverage.run] source`, `[tool.<name>.advisory-ignores]`), `FastMCP("...")` in `server.py`, the
      `env_prefix` in `config.py`, the README title, the tests, the Dockerfile, `.env.example` and `infra/`. Leave
      `CHANGELOG.md`, `NOTICE`, `LICENSE` and `TEMPLATE-BUILD-REPORT.md` alone (history and licence text).
   3. File names that contain the old name: `git ls-files | grep -E 'fast[-_]mcp[-_]template'`, then `git mv` each
      (the `infra/iam/*.json` policy and trust files are the known ones). Text replacement alone leaves tests that
      open these files failing.
   4. `uv lock && uv sync`, then `uv run --frozen ruff format .` (the longer names change line wrapping, and the gate's
      Format step fails otherwise).
   5. Report what is left: `git grep -nIE 'fast[-_]mcp[-_]template|MCP_TEMPLATE'` outside the excluded files. Anything
      listed needs a human decision. The AWS resource names in `infra/` are deployment-specific: say so and ask whether
      they match the real account before the user deploys.
4. **Record the two baselines.** Neither has a default. Run the suite first and confirm it passes, then:
   ```bash
   uv run --frozen pytest --cov --cov-report=json:coverage.json
   uv run --frozen python docs/reviews/check-coverage-ratchet.py --record
   uv run --frozen python docs/reviews/check-mypy-ratchet.py --record
   git add docs/coverage-baseline.txt docs/mypy-baseline.txt
   ```
   If pytest reports a collection error, do not record. A coverage baseline taken from a failed run is wrong. Fix the
   failure and run the suite again.
5. **Delete the placeholder `ping` tool**, its tests, `docs/research/FASTMCP.md` once the user has read it, and every
   `TODO` in the document shapes. `ping` is also used as the example tool in several tests, so a delete is a real
   edit: run `git grep -nw ping` and list every use before you remove anything. Replace each use with the project's
   first real tool, or ask the user what that tool is. Do not delete tests to get green. The coverage baseline from
   step 4 was taken with `ping` present: if the gate then reports coverage below the baseline, tell the user and ask
   before re-recording. Re-recording lowers a ratchet.
6. **Freeze the design.** The user writes `docs/DESIGN.md` (ask for it; do not invent a design). Commit it, then:
   ```bash
   bash scripts/refreeze.sh && git add docs/DESIGN-FREEZE.txt && git commit
   ```
   This takes two commits, because no commit can contain its own SHA. Until it is done, the freeze gate exits 2. That
   is a task, not a failure.
7. **Fill `docs/OBLIGATIONS.md`** with the standards clauses the project owes. All five rows ship as placeholders
   anchored on the template's own config values, so a green result there says nothing until they are replaced. If
   `line-length` changes, edit row B1 in the same commit.

Make local commits in the new repository as the steps need them (rename and baselines, then design, then freeze).
Do not push, do not create a remote repository and do not touch any other repository.

## Run the gate and report

The gate needs `refs/remotes/origin/HEAD` to prove the default branch. In a fresh `git init` with no remote it stops
at the default-branch step with: "refs/remotes/origin/HEAD is unset". If the user gave a remote URL, add it as
`origin` and run `git remote set-head origin -a`. If not, create a local stand-in and say so:
`git update-ref refs/remotes/origin/<branch> HEAD && git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/<branch>`.
Tell the user to remove the stand-in when they add the real remote.

Then run the template's gate script and print its output:

```bash
uv run --frozen python scripts/run-gate-locally.py
```

It replays the CI `gate` job from `.github/workflows/ci.yml`, one `STEP <name>: rc=<n>` line per step. Other options:
`--list` (jobs and steps), `--job X`, `--tail N`, `--verbose`. Do not replace it with a hand-copied list of commands.
The `uses:` steps are not replayed locally and say so.

Report:

- the command output, with each step's `rc`;
- the final replay line and its exit code. Exit 2 at the design-freeze step before step 6 is done is expected. Say
  which step stopped it and what is still to do;
- the project path, package name, module name, env prefix and default branch;
- the `git grep` leftovers from step 3.5;
- every step you did not complete, and why.

Never say the project is "green" unless the replay ended with exit 0. Never mark a `uses:` step as passed.
