---
name: staff-security
description: Threat-model and audit code for exploitable security defects — broken authorization, injection, secret exposure, supply-chain risk, crypto misuse, and prompt injection. Use before shipping anything touching auth, untrusted input, secrets, payments, or PII. Triggers - security review, security audit, is this secure, threat model, check for vulnerabilities.
---

# Security audit

Read `~/.claude/rules/security.md`.

A finding is real only if you can describe the attack. Speculative severity inflation destroys the
credibility of the whole report, and the report only matters if it gets acted on.

## Procedure

1. **Map the trust boundaries** before reading line by line: HTTP handlers, file uploads, queue
   consumers, third-party responses, deserialisation points, template rendering, subprocess invocation,
   and — in agentic systems — any content read from a tool.
2. **Threat-model each surface** in four questions: who can reach this · what do they control · what do
   they gain · how would we know. Any "unclear" is itself a finding.
3. **Dispatch `security-auditor`** (Opus) for the deep pass, and `dependency-auditor` (Sonnet) in
   parallel for the supply-chain inventory. Different models on purpose: one is judgement, one is lookup.
4. **Run the real tools and paste the output** — `npm audit`, `pip-audit`, `osv-scanner`, `govulncheck`,
   a secret scanner. Never assert a CVE, a version, or a licence from memory.
5. **Verify each finding is reachable** before ranking it. An unreachable code path is a note, not a
   vulnerability.
6. Rank by **exploitability × impact**, never by category.

## Audit priorities

**Authorization first** — it is the most commonly missed control. Is authz checked at the point of data
access or only at the entry? Can user A pass user B's ID and get their row (test the IDOR explicitly)?
Is the tenant predicate enforced somewhere it cannot be forgotten, or hand-written per query? Is a
client-supplied role, price, tenant, or identity trusted anywhere?

Then: **injection** (SQL — any string-interpolated query is a finding; command; path traversal; SSTI/XSS;
unsafe deserialisation; SSRF including redirect-to-internal) · **secrets** (source, logs, errors, URLs,
commits, fixtures, CI config — a found secret is **rotated, not deleted**) · **crypto** (hand-rolled
primitives, `Math.random()` for tokens, non-constant-time comparison, weak password hashing, disabled TLS
verification) · **supply chain** (unpinned actions, unlocked deps, `curl | bash`) · **data protection**
(PII in logs, deletion that misses backups/caches/indexes) · **prompt injection** (is tool-sourced
content treated as data or as instruction?).

## Report

Per finding: attack path · precondition · concrete impact · fix · your honest confidence. Say what you
could not reach or test. Three real findings that get fixed beat thirty speculative ones that get ignored.
