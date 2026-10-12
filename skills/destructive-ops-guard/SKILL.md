---
name: destructive-ops-guard
description: Use before running, generating or approving a command or statement that deletes, drops, truncates, overwrites, force-pushes or rotates something the user owns — a repository, the user's own folders, a live database (Snowflake or any RDBMS server, through SQL of any dialect, dbt, an ORM or a script) or a published artifact — in any technology (shell, git, Python, Node, Terraform, Kubernetes, cloud CLIs, APIs). Not for Claude's own session scratchpad, task output or session metadata.
license: MIT
---

# Destructive Ops Guard

**Principle: nothing irreversible happens on inference.** If the user did not explicitly ask for
the destructive act, do not perform it — propose it, name what it destroys, and wait for a yes.

This is the T4 line from `~/.claude/rules/engineering-bar.md` made operational across every stack.
A hook (`~/.claude/hooks/evolv-destructive-guard.js`, tests in `evolv-destructive-guard.test.js`) intercepts
these at the tool boundary and judges a delete by where it points, but the hook is a backstop, not the
control — **you are expected to catch these first**.

## Scope: approval is for the user's real things (owner, 2026-10-03)

Judge an operation by what it points at.

**Needs approval:**
- a repository or the user's own folders (anything not listed under "No approval");
- a live database, Snowflake or any RDBMS server (the SQL list below);
- a published artifact, an external service, a cloud resource.

**No approval — Claude's own session and task files, not the user's data:**
- `/private/tmp/claude-*/` and `/tmp/claude-*/`: session scratchpads and task output;
- `~/.claude/projects/<project>/<session-id>/` and `<session-id>.jsonl`: a session's folder and transcript;
- `~/.claude/` `session-env`, `sessions`, `shell-snapshots`, `file-history`, `debug`, `paste-cache`, `cache`,
  `telemetry`, `ide`, `todos`, `tasks` and `statsig`.

`~/.claude/projects/<project>/memory/`, skills, rules, hooks, settings, plans, backups and `history.jsonl` belong
to the user: they need approval.

**Denied outright (the user runs these by hand):** `DROP DATABASE`; a recursive or wildcard delete of `/`, a home
folder, a system folder or the whole `~/.claude`; `mkfs` or `dd` to a device; a force-push to main, master or
prod; rewriting published history; `terraform destroy`; `shred`.

Text that only mentions a verb is not the verb: `grep "DROP DATABASE"`, an `echo`, a commit message, or a heredoc
that writes a `.sql` file runs nothing. A heredoc or string handed to an interpreter or a database client does, and so
does any text on a line that also runs one (`echo "..." > x.sql && snowsql -f x.sql`). A read, a dry run or a plan
excuses only its own command: `ls && git reset --hard` still asks.

## The three questions, before any destructive operation

1. **What exactly is destroyed?** Name the object, the row count, the blast radius. "Some rows"
   is not an answer — run the `SELECT` with the identical `WHERE` and state the count.
2. **How do we get it back?** A backup, a clone, Time Travel, a revert, a re-run. If the answer
   is "we don't", that is a T4 operation and needs explicit human confirmation, every time.
3. **Is there a non-destructive path?** Soft delete, a new table beside the old, a flag, a view,
   an expand/contract migration. Prefer it, and say why the destructive path is necessary if it is.

## What counts as destructive — by technology

**SQL (any dialect: Snowflake, BigQuery, Postgres, MySQL, SQL Server, SQLite, DuckDB, Spark SQL)**
`DROP` (table/schema/database/view/index/user/role) · `TRUNCATE` · `DELETE` without a `WHERE`, or
with a `WHERE` that was not row-counted first · `UPDATE` without a `WHERE` · `ALTER TABLE ... DROP
COLUMN` · `REPLACE`/`CREATE OR REPLACE` over an existing object · `GRANT`/`REVOKE` widening or
removing access · `MERGE` whose `WHEN NOT MATCHED BY SOURCE THEN DELETE` is unbounded

**dbt** `--full-refresh` on a large or expensive incremental · `dbt run-operation` with DDL ·
dropping a model that other models or exposures `ref()` · changing a `unique_key` on an
incremental (silently rewrites history) · `on_schema_change: sync_all_columns` on a mart

**Snowflake** `DROP`/`UNDROP` juggling · lowering `DATA_RETENTION_TIME_IN_DAYS` (shortens your
undo window) · `CREATE OR REPLACE TABLE` on production · dropping a warehouse with running work ·
`ACCOUNTADMIN` grants · resource-monitor changes that could suspend production

**Version control** `git push --force` / `--force-with-lease` to a shared branch · `git reset
--hard` with uncommitted work · `git clean -fdx` · `git branch -D` unmerged · rewriting published
history (`rebase`/`filter-branch`/`filter-repo`) · deleting a remote branch or tag

**Shell / filesystem** (outside Claude's session and task folders) `rm -rf` · `find -delete` and
`find -exec rm` · `rm` with a glob or variable that could expand wide ·
`mv` onto an existing path · `>` truncating a file · `chmod -R` / `chown -R` on a broad path ·
`dd` · `mkfs` · `shred` · emptying trash

**Python / Node / app code** `shutil.rmtree` · `os.remove`/`unlink` in a loop · `Path.unlink` ·
`fs.rm`/`rmSync` with `recursive: true` · `DROP` issued through an ORM (`drop_all`, `migrate
reset`, `db push --accept-data-loss`) · `truncate()` on a file handle · overwriting a data file
in place without a backup copy

**React / TypeScript / frontend** `localStorage.clear()` / `sessionStorage.clear()` /
`indexedDB.deleteDatabase()` (wipes other apps on the same origin) · a destructive action with no
confirm step and no undo · deleting user content without a soft-delete path

**Infrastructure** `terraform destroy` · `terraform apply` whose plan shows a **replace** or
**destroy** on stateful resources · `kubectl delete` (namespace/pvc/statefulset) ·
`helm uninstall` · `docker system prune -a` / `volume rm` · cloud CLI deletes
(`aws s3 rm --recursive`, `gcloud ... delete`, `az ... delete`) · disabling versioning or
deletion protection · lifecycle rules that expire objects

**APIs and data services** `DELETE` verbs against production · bulk-delete endpoints · webhook or
integration removal · key/secret **rotation or revocation** · unsubscribing or disabling an
account · anything that sends external communication (that is irreversible in a different way)

## Response protocol when a destructive operation is detected

Do **not** run it. Instead, produce this, and stop:

```
DESTRUCTIVE OPERATION DETECTED — confirmation required

Operation:    <the exact command or statement>
Technology:   <SQL / git / shell / terraform / ...>
Destroys:     <named objects; row/file counts measured, not guessed>
Reversible?:  <backup / clone / Time Travel window / revert — or NO>
Blast radius: <one file / one table / one tenant / production / everyone>

Safer alternative: <soft delete, clone-first, new object beside old, expand-contract,
                    dry-run flag — or "none exists, and here is why">

Confirm you want this executed, or tell me to take the alternative.
```

Then wait. A reply that does not clearly authorise *this specific operation* is not a yes.

## Standing rules

- **Measure before mutating.** Before any `UPDATE`/`DELETE`, run the `SELECT` with the identical
  `WHERE` and report the count. A count that surprises you is the finding.
- **Clone before destructive DDL.** On Snowflake, `CREATE TABLE t_bak CLONE t;` is a one-second
  insurance policy. Elsewhere: a backup, a branch, a copied file.
- **Batch and bound.** Large `DELETE`/`UPDATE` go in batches by key range, never one unbounded DML.
- **Never widen a blast radius to be helpful.** "While I was in there I also cleaned up..." is how
  an incident starts. Note it, do not do it.
- **Approval is per-operation and per-session.** A yes to dropping one table is not a yes to the
  next one, and not a yes tomorrow.
- **Production is different.** In production, prefer reversible-by-construction: soft deletes,
  new objects beside old, flags, and expand → migrate → contract.
- The hook may **ask** or **deny**. If it denies, do not attempt a workaround, a re-word, or a
  different tool to achieve the same effect — bring it back to the user.

## What is *not* destructive (do not over-trigger)

Reading, `SELECT`, `EXPLAIN`, dry runs, `--dry-run`/`--plan`/`--check` flags, creating new objects,
adding a nullable column, writing a new file, committing locally, a scratchpad file, deleting
something this session created and nothing else references, or deleting Claude's own scratchpad, task
output or session files (see Scope). Over-prompting trains people to click
through prompts, which defeats the guard — reserve it for genuine irreversibility.
