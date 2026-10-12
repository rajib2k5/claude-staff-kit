---
name: staff-onboard
description: Rapid reconnaissance of an unfamiliar codebase — entry points, architecture, data flow, test and deploy commands, conventions, and the risky areas. Use when starting work in a repo you do not know. Triggers - explain this codebase, onboard me, what does this repo do, get me up to speed, understand this project.
---

# Codebase reconnaissance

Build an accurate map fast, without burning the context budget on files you do not need.

Read `~/.claude/rules/context-discipline.md`.

## Procedure

1. **Read the metadata first** — it is dense and cheap: `README`, `CLAUDE.md`/`AGENTS.md`, manifests
   (`package.json`, `pyproject.toml`, `go.mod`, `dbt_project.yml`), CI config, `Makefile`/task runner,
   `docker-compose`, `.env.example`, `docs/adr/`.
2. **Establish the commands that must work**: install, test, lint, typecheck, build, run. **Run the test
   command** — a repo whose documented test command fails is the single most useful early finding.
3. **Find the entry points** — `main`, the server bootstrap, the CLI definition, the DAG definitions, the
   dbt sources. Work outward from there, not alphabetically through the tree.
4. **Trace one real request or one real record end to end.** One concrete path teaches more than reading
   ten modules, because it shows which layers actually participate.
5. **Dispatch `codebase-explorer`** (Sonnet) for the wide mechanical sweeps — where is auth enforced,
   where are the migrations, which modules have no tests, what talks to the database.
6. **Read the git history for signal**: the most-changed files (churn indicates either core or trouble),
   recent commits, revert commits (each one marks something that broke).

## Report

```
WHAT IT IS          one paragraph: purpose, users, and how it earns its keep
STACK               languages, frameworks, datastores, warehouse, orchestrator, deploy target
COMMANDS            install / test / lint / typecheck / build / run — and which you VERIFIED
ARCHITECTURE        the 5–8 components that matter and how data moves between them
DATA MODEL          the core entities and the system of record for each
CONVENTIONS         naming, error handling, test style, module layout — what to conform to
SEAMS               where a change of this kind belongs
RISKY AREAS         no tests, high churn, obvious complexity, TODO clusters, known-stale docs
UNKNOWNS            what you could not determine, and where the answer probably lives
```

## Discipline

Do not read whole large files to answer narrow questions. Do not review or judge the code — this is
mapping, not critique. Report what you **verified** separately from what you **inferred**; an inferred
test command reported as verified is how the next hour gets wasted.
