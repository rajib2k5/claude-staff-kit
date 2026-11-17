---
description: Scaffold a Snowflake hands-on lab (setup, seed, verify, teardown) and prove the teardown drops everything the setup creates
argument-hint: <shared|single> <LAB_PREFIX> [attendees or participant user] [out dir]
---

Invoke the `snowflake-hol` skill.

Request: $ARGUMENTS

1. Render the lab with `scripts/hol_scaffold.py` from the skill. Ask only for what is missing: the variant,
   the lab prefix (an upper-case identifier such as `HOL_RETAIL`), the attendee count (shared) or the
   participant user name (single), and whether to seed from a git repository.
2. Show the summary line that the renderer prints from `teardown_check.py`. It must say `0 orphan(s)`.
3. If the user edits the scripts afterwards, run `teardown_check.py <dir>` again and show the result.

Do not run any of the scripts against a live account unless the user asks. The teardown drops users,
roles and databases.
