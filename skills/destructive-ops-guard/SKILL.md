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
prod; rewriting published history; `terraform destroy`; `snowddl destroy`; `shred`.

Text that only mentions a verb is not the verb: `grep "DROP DATABASE"`, an `echo`, a commit message, the title,
body or notes of a `gh pr`, `gh issue` or `gh release` command, or a heredoc that writes a `.sql` file runs nothing.
A command substitution inside that text, `$(...)` or backticks, does run, and is judged as a command. A heredoc or string handed to an interpreter or a database client does, and so
does any text on a line that also runs one (`echo "..." > x.sql && snowsql -f x.sql`). A read, a dry run or a plan
excuses only its own command: `ls && git reset --hard` still asks.

Three more cases need no approval. They do not change a deny, and they do not change how SQL text is judged. If
one condition is not true, the old text rule applies and the guard asks.

**The read-only list.** The first two cases need every other command on the line to be one of these: `ls`, `cat`
without a heredoc, `head`, `tail`, `wc`, `grep`, `sed -n` with only print commands, `echo`, `printf`, `stat`,
`diff`, `cmp`, `cd`, `mkdir -p`, `true`, `test`, `[`, `node --check`, `python3 -B -m py_compile`, or a plain
variable assignment. The command name has no folder, and no assignment or wrapper is in front of it. No redirect on
the line writes to a startup or autorun file (see below).

- **A heredoc that `cat` or `tee` writes to a file is data** when all of these are true: it is the only heredoc on
  its line, with no pipe or substitution around it; every other command on the line is on the read-only list; the
  target is not a startup or autorun file; and with `py_compile` on the line, the file name is not a standard
  Python module name. Startup and autorun files are: shell startup files (`.bashrc`, `.profile`, `.bash_profile`,
  `.bash_aliases`, `.zshrc` and the other shells), `.envrc`, `.env`, `.npmrc`, `.yarnrc`, `.gitconfig`,
  `.gitattributes`, `.pre-commit-config.yaml`, crontab, anything in `.git/`, `.husky/`, `.githooks/`, `.github/`,
  `.gitlab/`, `.vscode/`, `.idea/`, `.devcontainer/`, `.direnv/` or `.claude/`, any dot folder or dotfile in the
  home folder (the fish config, `~/.config/autostart`, systemd user units), `Makefile`, `GNUmakefile`, `justfile`,
  a Taskfile, `package.json`, `pyproject.toml`, `setup.py`, `setup.cfg`, `tox.ini`, `noxfile.py`, `tasks.py`,
  `conftest.py`, `sitecustomize.py`, `usercustomize.py`, `*.pth`, `*.service`, `*.timer`, `*.socket`, `*.desktop`,
  a Dockerfile, Containerfile or compose file, a virtualenv `bin/activate`, and a system folder. A symlink to one
  of these counts, and so does a target the guard cannot resolve (a variable, a glob, a relative path after an
  unknown `cd`).
- **Python code given with `-c` or on stdin, and Node code given with `-e`, `--eval` or `-p`, that only mentions a
  delete.** Python is read with its own parser. Node is read with its strings and comments removed and is compiled
  to check the read. A delete word in a string, a comment or a print is text. All of these must be true:
  - The code calls no delete. It writes no file, and it calls nothing that can run other code: `exec`, `eval`,
    `__import__`, `importlib`, `subprocess`, `os.system`, `pickle`, `ctypes`, `runpy`, `yaml.load`,
    `yaml.unsafe_load`, `yaml.full_load`, `operator.methodcaller` or `operator.attrgetter`. In Node, the same
    applies to `child_process`, `eval` and `Function`.
  - Bash expands nothing in the code: it is in single quotes, or the heredoc delimiter is quoted.
  - Every other command on the line is on the read-only list. Output goes into no pipe, except to a reader.
  - Nothing on the line sets `PYTHONPATH`, `PYTHONSTARTUP`, `PYTHONHOME`, `PYTHONINSPECT`, `PYTHONUSERBASE`,
    `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH` or `DYLD_*`.
  - For Python, the code is UTF-8 and at most 64 KB. A coding cookie, if there is one, names utf-8 or ascii.
  - For Node, the code has no U+2028, no U+2029, no bare CR, no `<!--` and no `-->`.
- **A plain `rm` or `rm -f` (not recursive) of a glob that names files.** All of these must be true:
  - The wildcard is in the last part of the path only. That part has a literal stem of 2 or more characters
    before the first wildcard. `_probe*.py`, `out_*.log` and `r26m_*` pass. `*.py`, `*.db`, `?x*`, `*` and `.*`
    do not.
  - The path has no variable, `~user`, brace, extglob or substitution.
  - The folder, resolved through symlinks, is in a git work tree and not under a `.git` folder. If the folder
    cannot be resolved, the rm asks.
  - The work tree root is not `/`, the home folder or a folder above it. Below the home folder, no folder on the
    way to that root starts with a dot. `~/.config/x/repo` and `~/.aws` do not pass.

Two parsing rules support these cases:
- `#` starts a comment only at the start of a word and outside quotes, so `a\ #b` is not a comment. A quote in a
  comment (`# it's done`) does not hide the next lines.
- A line that has `case` and also a `$(...)` or backtick substitution asks, unless it is denied. The guard cannot
  read a `case` pattern's `)` inside a substitution reliably.

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

**Processes** `pkill -f` (it matches whole command lines, so it also matches the shell that runs it and has
killed its own session). Kill a PID or a process group that you recorded when you started the job.

**Snowflake as code** `snowddl apply` changes the live account: run `snowddl plan`, show the plan to the user,
then apply. `snowddl destroy` drops every object the config manages: denied, the user runs it.

**Money** a call that changes a stake: numerapi `stake_increase` / `stake_decrease` / `stake_change` /
`stake_drain`, a Numerai GraphQL stake mutation, or any stake/unstake call. The user places stakes.

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
