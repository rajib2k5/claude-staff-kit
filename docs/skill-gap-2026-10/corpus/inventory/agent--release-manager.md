# agent: release-manager

Location: live+repo. Lines: 45. Model ids named: none.

Purpose: Assembles a release — verifies CI status, collects the changelog from commits, checks version bumps and migration ordering, and confirms the rollback path is stated. Mechanical assembly and checking against a checklist, runs on Sonnet. Escalate any judgement call about whether to ship.

Sections:
- Pre-release verification — report the actual status of each
- Changelog
- Escalate rather than decide
