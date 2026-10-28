# skill: destructive-ops-guard

Location: live+repo. Lines: 141. Model ids named: none.

Purpose: Use before running, generating or approving a command or statement that deletes, drops, truncates, overwrites, force-pushes or rotates something the user owns — a repository, the user's own folders, a live database (Snowflake or any RDBMS server, through SQL of any dialect, dbt, an ORM or a script) or a published artifact — in any technology (shell, git, Python, Node, Terraform, Kubernetes, cloud CLIs, APIs). Not for Claude's own session scratchpad, task output or session metadata.

Sections:
- Destructive Ops Guard
- Scope: approval is for the user's real things (owner, 2026-10-03)
- The three questions, before any destructive operation
- What counts as destructive — by technology
- Response protocol when a destructive operation is detected
- Standing rules
- What is *not* destructive (do not over-trigger)
