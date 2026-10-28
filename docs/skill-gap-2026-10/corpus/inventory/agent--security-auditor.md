# agent: security-auditor

Location: live+repo. Lines: 57. Model ids named: none.

Purpose: Threat-models and audits code for injection, broken authorization, secret exposure, supply-chain risk, crypto misuse, and prompt injection. Use before shipping anything handling auth, untrusted input, secrets, payments, or PII. Produces exploitable findings, not a checklist. Runs on Opus.

Sections:
- Threat model first — four questions per surface
- Audit checklist — with the attack, not just the category
- Reporting
