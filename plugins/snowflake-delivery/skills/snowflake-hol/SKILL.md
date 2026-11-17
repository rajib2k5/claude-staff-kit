---
name: snowflake-hol
description: Build a Snowflake hands-on lab (HOL) as four SQL scripts - setup, seed, verify, teardown - in a shared-account variant (one account, N attendees, one clone each) or a single-account variant (each attendee has an account), then prove statically that the teardown drops every object the setup creates. Use when preparing a workshop, training lab, demo environment or any throwaway Snowflake environment that must be created and removed cleanly. Triggers - hands-on lab, HOL setup, workshop environment, lab teardown, attendee accounts, clone per attendee, reset the lab, does teardown drop everything.
---

# Snowflake hands-on lab

A lab is four scripts that an ACCOUNTADMIN runs ahead of the event, never live:

| # | File | Job |
|---|---|---|
| 1 | `01_setup.sql` | Warehouse, resource monitor, roles, users (shared) or role binding (single), database, schema, tables, optional git integration |
| 2 | `02_seed.sql` | Load the data (synthetic `GENERATOR` rows, or CSVs from a git repository). Shared: clone the master once per attendee and grant each role its own clone only |
| 3 | `03_verify.sql` | Read-only checks. Every check prints `actual`, `expected` and `PASS`/`FAIL` |
| 4 | `99_teardown.sql` | Drops everything 1 and 2 created. Also the reset path: teardown, then setup again |

Templates live in `templates/shared-account/` and `templates/single-account/`. Scripts live in
`scripts/`: `hol_scaffold.py` renders a lab, and `teardown_check.py` proves the teardown covers the setup.

## Procedure

1. **Pick the variant.** One account shared by N attendees: `shared`. Each attendee gets an account
   provisioned by someone else: `single`, with `--participant-user` set to that user's name. The single
   variant binds the user; it never creates or drops it.
2. **Render.**
   ```bash
   S=<this skill's directory>/scripts      # plugins/snowflake-delivery/skills/snowflake-hol/scripts in the kit
   python3 "$S/hol_scaffold.py" --variant shared --lab HOL_RETAIL --attendees 25 --out lab_setup/
   ```
   Options: `--git-origin URL --git-prefix PREFIX --seed-path DIR` seeds from CSVs in a git repository
   instead of synthetic rows; `--cross-region AWS_US` sets `CORTEX_ENABLED_CROSS_REGION`;
   `--warehouse-size`, `--credit-quota`, and `--customers/--products/--orders` row counts. The renderer
   refuses to overwrite existing files and refuses output with a `{{PLACEHOLDER}}` left in it.
3. **Replace the example schema** (`CUSTOMERS`, `PRODUCTS`, `ORDERS`) with the lab's own tables. Keep
   the grain in each table `COMMENT`, and keep the verify checks in step with the row counts and keys.
4. **Re-run the teardown check after every edit.** It is the gate:
   ```bash
   python3 "$S/teardown_check.py" lab_setup/          # exit 1 and an ORPHAN line per missed object
   python3 "$S/teardown_check.py" -v lab_setup/       # lists every create and drop it understood
   ```
   It treats every `*.sql` without `verify` or `teardown` in the name as a create file. If an object
   must survive the teardown on purpose, write the reason in the teardown file:
   `-- teardown-check: keep USER LAB_ADMIN owned by the platform team`.
5. **Dry run in a scratch account** before the event: setup, seed, verify (all `PASS`), teardown, then
   verify again and confirm the users, roles and clones are gone. Use the `snowflake-sql` skill to run
   them. Then run setup and seed once more for the event.
6. **Set the attendee password in your worksheet session only** (`SET HOL_PASSWORD = '...';`) before
   running the shared setup. The script reads it with `SELECT $HOL_PASSWORD INTO :hol_pass`. Never write
   it into a file. This read of a session variable inside the anonymous block has not been run against
   a live account in this kit; the step 5 dry run is where it is proved. If it fails, the block stops
   before it creates any user.

## Traps

- **The teardown is destructive.** It drops databases, users and roles. Run it only in the lab account,
  and read the rendered names first. The destructive-ops guard asks before it runs.
- **`ALTER ACCOUNT SET` outlives the lab.** The checker flags a set without an unset. If the parameter had
  a value before the lab (setup prints it with `SHOW PARAMETERS`), restore that value instead of unsetting.
- **Dynamic names.** Users, roles and clones are made in a Snowflake Scripting loop. The checker reads
  the loop and records names like `HOL_RETAIL_USER_{*} for i in 1..25`. A teardown loop with a smaller
  bound, or a different prefix, is an orphan. Keep the attendee count in one `DEFAULT` per block.
- **Snowflake does not enforce `PRIMARY KEY` or `FOREIGN KEY`.** The verify script checks uniqueness and
  orphan keys itself. A seed change that breaks grain shows up there, not at load time.
- **A missing row is not a zero.** The row-count check left-joins the expected list onto the actual
  counts, so a table that does not exist fails rather than reporting 0.
- **What the checker does not see**: objects created by a stored procedure call, by a Streamlit app, or by
  attendees during the lab. Objects attendees create inside their clone go with the clone. Anything they
  create elsewhere needs its own drop.
- **`MINS_TO_BYPASS_MFA`** is a lab-day convenience in the shared setup. Delete that line if the account's
  security policy does not allow it.
- **Single-account binding**: the user name is quoted, so it is case-sensitive. The bind block returns a
  warning instead of failing when the user does not exist yet; re-run setup once it does.

## Report

- The variant, the lab prefix, the attendee count and the output directory.
- The `teardown_check.py` summary line (`N created, M dropped, K kept, 0 orphan(s)`) from the final files.
- The verify results from the dry run, with any `FAIL` row quoted, or "not run against a live account".
- Every `teardown-check: keep` line, with its reason.
