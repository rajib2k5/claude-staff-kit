# SnowDDL CLI and config reference

Source of every line: upstream https://github.com/littleK0i/SnowDDL at version `0.67.5`, file `snowddl/app/base.py`
unless another path is given. Official docs: https://docs.snowddl.com/basic/cli and
https://docs.snowddl.com/basic/yaml-configs. If your pin differs, `snowddl --help` is authoritative.

## Entry points

| Command | Module | Purpose |
|---|---|---|
| `snowddl` | `snowddl/app/base.py` | validate, plan, apply, destroy |
| `snowddl-convert` | `snowddl/app/convert.py` | dump existing Snowflake objects to YAML config |
| `snowddl-singledb` | `snowddl/app/singledb.py` | apply a config to a single database (flags in that file; not reviewed here) |
| `snowddl-fernet` | `snowddl/fernet/cli.py` | encryption helper (not reviewed here) |

## Actions

| Action | Help text in source |
|---|---|
| `plan` | Resolve objects, apply nothing, display suggested changes |
| `apply` | Resolve objects, apply safe changes, display suggested unsafe changes |
| `destroy` | Drop objects with specified `--env-prefix`, use it to reset dev and test environments |
| `validate` | Validate config only, do not connect to Snowflake |

## Connection and context

| Flag | Meaning | Environment default |
|---|---|---|
| `-c` | config directory, or name of a bundled test config | current directory |
| `-a` | account identifier | `SNOWFLAKE_ACCOUNT` |
| `-u` | user | `SNOWFLAKE_USER` |
| `-p` | password | `SNOWFLAKE_PASSWORD` |
| `-k` | private key file | `SNOWFLAKE_PRIVATE_KEY_PATH` |
| `-r` | active role | `SNOWFLAKE_ROLE` |
| `-w` | active warehouse | `SNOWFLAKE_WAREHOUSE` |
| `--authenticator` | `snowflake`, `externalbrowser`, `oauth`, `oauth_snowpark`, `workload_identity` | `SNOWFLAKE_AUTHENTICATOR` |
| `--oauth-token`, `--passphrase`, `--workload-identity-token`, `--workload-identity-provider` | auth inputs | matching `SNOWFLAKE_*` variable |
| `--query-tag` | set `QUERY_TAG` on every query | `SNOWFLAKE_QUERY_TAG` |

Prefer environment variables or key-pair auth over `-p`. A password on the command line shows in process lists and
shell history.

## Environments

| Flag | Meaning |
|---|---|
| `--env-prefix` | prefix added to global object names (for example `DEV`). ASCII letters, digits and underscores; upper-cased; may not end with `_` |
| `--env-prefix-separator` | one of `__` (default), `_`, `$` |
| `--env-admin-role` | admin role that inherits the env-prefixed SnowDDL role |
| `--clone-table` | on `apply` only, requires `--env-prefix`: clone all tables from source databases |
| `--clone-source-env-prefix` | clone from another environment's prefix |
| `--destroy-without-prefix` | allow `destroy` with no `--env-prefix`. **Never use.** |

## Apply gates (all off by default)

| Flag | Opens |
|---|---|
| `--apply-unsafe` | changes that may lose data (ALTER, DROP and similar) |
| `--apply-replace-table` | REPLACE TABLE when ALTER TABLE is not possible |
| `--apply-all-policy` | all policy types listed next |
| `--apply-account-level-policy`, `--apply-aggregation-policy`, `--apply-authentication-policy`, `--apply-join-policy`, `--apply-masking-policy`, `--apply-projection-policy`, `--apply-row-access-policy` | one policy type each |
| `--apply-network-policy` | network policies |
| `--apply-account-params` | account parameters |
| `--apply-resource-monitor` | resource monitors |
| `--apply-outbound-share` | outbound shares |

In `init_settings`: `apply` and `destroy` set safe DDL on; `--apply-unsafe` or the `destroy` action sets unsafe DDL on.
Whether a given statement is safe or unsafe is decided per object type in `snowddl/resolver/<type>.py`
(`execute_safe_ddl` or `execute_unsafe_ddl`). Example: `DROP TABLE` is unsafe, `DROP VIEW` is safe.

## Refresh flags

`--refresh-user-passwords`, `--refresh-workload-identity`, `--refresh-future-grants`, `--refresh-stage-credentials`,
`--refresh-stage-encryption`, `--refresh-secrets`. Each re-applies state that SnowDDL cannot read back from Snowflake.

## Scope and output

| Flag | Meaning |
|---|---|
| `--include-object-types`, `--exclude-object-types` | comma-separated object types to resolve or skip |
| `--max-workers` | parallel workers |
| `--placeholder-path`, `--placeholder-values` | environment-specific placeholders (file, or JSON string) |
| `--show-sql` | print executed DDL |
| `--show-timers`, `--show-unused-files`, `--log-level` | diagnostics |
| `--detailed-exitcode` | exit 0 when no changes, exit 2 when changes exist. Useful in CI as a drift check |

## Fork-only flags

A patched fork adds options that are not in upstream (for example a revision guard with
`--allow-revision-override REASON`). Use them only if `snowddl --help` lists them for your pin.

## Config keys named in `SKILL.md`

| Key | Where | Source |
|---|---|---|
| `is_sandbox` (bool) | database and schema `params.yaml` | `snowddl/parser/database.py`, `snowddl/parser/schema.py` |
| `is_unmanaged` (bool) | same | fork only |
| `permission_model`, `is_transient`, `retention_time`, `comment` | schema `params.yaml` | `snowddl/parser/schema.py` |
| `columns`, `primary_key`, `foreign_keys`, `change_tracking`, `masking_policies` | table YAML | sample configs under `snowddl/_config/` |
| `columns`, `text`, `comment` | view YAML | sample configs |
| `size`, `auto_suspend`, `warehouse_params` | `warehouse.yaml` | sample configs |
| `schema_read`, `schema_write`, `schema_owner`, `warehouse_usage`, `warehouse_monitor`, `technical_roles`, `grants` | role YAML | sample configs |
| `business_roles`, `rsa_public_key`, `session_params` | `user.yaml` | sample configs |

`params.yaml` and the other parsers validate keys with a JSON schema that sets `additionalProperties: False`.
An unknown key stops the run at parse time with an error. A full list of keys per object type is in
`snowddl/parser/<object_type>.py` and at https://docs.snowddl.com/object-types.

## Also seen in the source

- A `snowddl/parser/semantic_view.py` exists in the version reviewed, so SnowDDL can describe semantic views as
  objects (keys: tables, relationships and others). This was not verified against upstream docs.
- `__custom/*.py` files in the config directory run after parsing; each defines `handler(config)` and can add
  blueprints programmatically.
