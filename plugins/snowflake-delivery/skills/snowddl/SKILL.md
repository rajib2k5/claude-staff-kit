---
name: snowddl
description: Author, review and apply SnowDDL YAML configs for Snowflake (databases, schemas, tables, views, roles, warehouses, users), explain exactly what is_sandbox and is_unmanaged do, and run the plan-then-apply workflow safely. Use when writing or reviewing a SnowDDL config, planning or applying a change to Snowflake with snowddl, or deciding how to protect a schema from drops or from management. Triggers - snowddl, snowddl plan, snowddl apply, snowddl destroy, is_sandbox, is_unmanaged, snowddl yaml config, declarative snowflake objects.
---

# SnowDDL

SnowDDL is a declarative tool for Snowflake objects. You describe objects in YAML. `snowddl plan` compares the YAML
with the account and lists the DDL it would run. `snowddl apply` runs the safe part of that DDL.

Upstream project: https://github.com/littleK0i/SnowDDL. Docs: https://docs.snowddl.com/ (getting started, object types,
role hierarchy, CLI, YAML configs). Every flag and key below was read in the upstream source at version `0.67.5`
(paths relative to the upstream repo root). Where something exists only in a patched fork, this file says so. If
your pinned version differs, run `snowddl --help` and compare. Detail is in `references/cli-and-config.md`.

## Procedure

1. **Find the config and the pin.** The config directory is the `-c` path (default: current directory). Record the
   SnowDDL version in use (`pip show snowddl`). Treat the version as part of the change.
2. **Validate offline.** `snowddl -c <dir> validate` parses and validates the config and does not connect to
   Snowflake (`snowddl/app/base.py`, the `validate` subcommand). The auth check still runs first, so pass dummy
   `-a` and `-u` values and a dummy `-p` (or set the matching `SNOWFLAKE_*` variables) or it prints help and exits.
3. **Plan.** `snowddl -c <dir> [--env-prefix DEV] plan`. Add `--show-sql` to see the DDL. `plan` applies nothing.
4. **Review the plan with the human.** Read every line. Look for: `DROP`, `REPLACE`, column type changes, grant
   removals, ownership changes, role hierarchy changes, objects you did not touch. Anything surprising is a finding.
5. **Get explicit approval for the apply.** Say what will run and in which account, role and env prefix.
6. **Apply.** `snowddl ... apply`. By default `apply` runs safe changes and only displays unsafe ones.
   Unsafe changes (ALTER, DROP, anything that may lose data) run only with `--apply-unsafe`. Other opt-in flags exist
   for replacing tables and for each policy type (see the reference). Add a flag only when the plan needs it and the
   human approved it.
7. **Re-plan.** Run `plan` again. It must report no changes. If it does not, the config and the account still
   differ. Find out why before you finish.

`destroy` drops every object of the config under the given `--env-prefix`. See the section below.

## What `is_sandbox` and `is_unmanaged` do

Both are boolean keys in `params.yaml` for a database or a schema. Both inherit from database to schema: a schema
value overrides the database value when set (`snowddl/parser/schema.py`, `combined_params`).

**`is_sandbox`** (upstream). It only stops drops. Objects that exist in Snowflake but are not declared in the config
are left alone. At database level, undeclared schemas are not dropped
(`snowddl/resolver/schema.py`: `if database_bp.is_sandbox: continue`). At schema level, undeclared objects in that
schema are not dropped (`snowddl/resolver/abc_schema_object_resolver.py`: `if schema_bp.is_sandbox: continue`).
Everything the config **does** declare is still created and altered.

**`is_unmanaged`** (**fork only, not in upstream 0.67.5**). A patched fork of SnowDDL adds this second key. A
declared object in an unmanaged schema resolves to SKIP: it is neither created nor altered. Undeclared objects are
still dropped. The key exists for schemas another tier owns, where the applying role may not even see the objects.

| Keys set | Drops undeclared objects | Creates or alters declared objects |
|---|---|---|
| neither | yes | yes |
| `is_sandbox` | no | yes |
| `is_unmanaged` | yes | no |
| both | no | no |

Rules:
- Check your pin before you use `is_unmanaged`. Upstream rejects unknown keys in `params.yaml` (the keys are a JSON
  schema in `snowddl/parser/database.py` and `snowddl/parser/schema.py`), so the config will fail validation on an
  upstream build.
- To leave a schema completely alone, set both keys on a fork. On upstream, there is no way to skip declared
  objects: remove the schema from the config and set `is_sandbox` on its database, or exclude object types with
  `--exclude-object-types`.
- Moving a pin from a version where `is_sandbox` alone skipped everything to one where it does not changes behaviour.
  Read the fork's changelog before you bump, and add `is_unmanaged` in the same change if the schema must stay
  untouched.

## Destructive operations

- **Never run `destroy`, `apply --apply-unsafe` or `apply --apply-replace-table` without explicit human
  confirmation** in this conversation for that run. Name the account, role, `--env-prefix` and the object types.
- `destroy` requires `--env-prefix`, unless `--destroy-without-prefix` is given (`snowddl/app/base.py`). Never pass
  `--destroy-without-prefix`. It would target the objects with no prefix, normally production.
- `destroy` runs with unsafe DDL on (`init_settings` sets `execute_unsafe_ddl` for `destroy`).
- A destructive-ops guard hook blocks unreviewed `apply` and `destroy` runs in this environment. Do not work around
  it. Show the plan to the human and let them run or approve the command.
- Use an env prefix for every non-production run (`--env-prefix DEV` creates `DEV__...` global objects). It
  separates environments in one account.

## Authoring a config

Layout (from the bundled sample configs in `snowddl/_config/`):

```
<config>/
  warehouse.yaml  business_role.yaml  technical_role.yaml  user.yaml  (account-level objects)
  <database>/params.yaml
  <database>/<schema>/params.yaml
  <database>/<schema>/table/<name>.yaml
  <database>/<schema>/view/<name>.yaml
  <database>/<schema>/function/<name>(<arg types>).yaml
```

Names in file names are lower case. Function and procedure files carry the argument types in the file name.

Table:
```yaml
columns:
  order_id:
    type: NUMBER(38,0) NOT NULL
    comment: "Order number"
  customer_id: NUMBER(38,0) NOT NULL
primary_key: [order_id]
foreign_keys:
  - columns: [customer_id]
    ref_table: customers
    ref_columns: [customer_id]
comment: "One row per order."
```

View:
```yaml
columns:
  order_id: "Order number"
text: |-
  SELECT order_id FROM orders
comment: "Orders without cancelled ones."
```

Role, warehouse, user (shape from the sample config):
```yaml
# warehouse.yaml
analyst_wh:
  size: XSMALL
  auto_suspend: 60
  comment: "Warehouse for analysts"

# business_role.yaml
sales_analyst:
  schema_read:
    - sales_db.core
  warehouse_usage:
    - analyst_wh
  comment: "Analysts reading the core schema"
```

Authoring rules:
- Every table has a primary key, and a `comment` that states the grain.
- Never put a password in the config. The bundled samples show a `password:` key for users. Use `rsa_public_key`
  (key-pair auth) for service users, and pass secrets through environment variables (`SNOWFLAKE_PASSWORD`,
  `SNOWFLAKE_PRIVATE_KEY_PATH`, `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE`) or a secret manager, never the command line
  when it can be logged.
- Prefer roles and the built-in role hierarchy over per-object grants (`schema_read`, `schema_write`, `schema_owner`,
  `warehouse_usage`, `warehouse_monitor`). Grant to roles, never to users.
- Check any key you are not sure of against https://docs.snowddl.com/ or the JSON schema in the parser file for that
  object type (`snowddl/parser/<object_type>.py`). Do not invent keys.

## Traps

- **`plan` is not `apply --dry-run`.** There is no such flag. `plan` is the dry run.
- **Plan against the right account.** The plan depends on `-a`, `-u`, `-r`, `-w` and `--env-prefix`, which default
  from `SNOWFLAKE_*` environment variables. Print which account and role you are using before you plan.
- **Unsafe changes are shown, not run.** A plan that "looks complete" after `apply` may have skipped unsafe items.
  Read the output for suggested unsafe changes.
- **Policies need their own flags.** Masking, row access, network and other policies apply only with the matching
  `--apply-*` flag or `--apply-all-policy`. A missing flag looks like a no-op.
- **Placeholders.** `--placeholder-path` and `--placeholder-values` make a config environment-specific. A wrong
  value plans a different account's objects.
- **Drops of undeclared objects.** Without `is_sandbox`, an object that someone created by hand in a managed schema
  is dropped on `apply`. Whether that needs `--apply-unsafe` depends on the object type: in the source, dropping a
  table runs as unsafe DDL (`snowddl/resolver/table.py`), dropping a view runs as safe DDL
  (`snowddl/resolver/view.py`). A plain `apply` can therefore drop views. Run `plan` first and read it.
- **Dependent objects.** A SQL function whose body reads a view may fail on a first apply because functions resolve
  before views. A patched fork adds `depends_on` for functions to fix this; I did not check whether upstream has it.
  If the first apply fails with "object does not exist" on such a function, run `plan` and `apply` once more.
- **Run it live only with the human.** The plan and apply talk to a live account. Use the `snowflake-sql` skill for
  read-only checks of the account state, and let the human run `apply`.

## Report

State: config path and SnowDDL version, the exact commands run with account, role and env prefix, the plan output
(or its summary with the line counts of creates, alters and drops), what you approved to apply and who approved it,
the result of the follow-up `plan`, and every key or flag you were unsure of.
