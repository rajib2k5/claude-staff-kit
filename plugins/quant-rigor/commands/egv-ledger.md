---
description: Scaffold docs/validation/{claims-ledger,channel-a,channel-b}.md for an evidence-gated validation, without overwriting existing files
argument-hint: [claim-id-prefix, default C]
---

Invoke the `evidence-gated-validation` skill (Step 2 of its procedure builds the ledger this command scaffolds).

Claim id prefix: $ARGUMENTS (use `C` when empty). Letters and digits only, for example `C` or `M1`.

Create these three files in the current repository, in `docs/validation/` (create the folder if needed):

1. Run `date -u +%Y-%m-%dT%H:%MZ` once and use that value as the frozen-at time. Run `git rev-parse --short HEAD` for the
   target commit (write `no-git` if it fails).
2. For each of `claims-ledger.md`, `channel-a.md`, `channel-b.md`: if the file already exists, **do not read it for
   rewriting and do not overwrite or append to it**; skip it and say so. Write only the files that are missing.
3. Fill the templates below, replacing `<PREFIX>`, `<TIME>` and `<HEAD>`. Do not invent claims: the ledger table keeps
   one example row marked `(example, delete)` so the format is visible.
4. Report which files were created and which were skipped. Remind the user that the ledger must be committed before either
   channel runs, that every material claim starts REJECTED, and that channel A (documentation only, no execution) and
   channel B (probes only, no documentation) must not read each other's file until both are committed.

## Template: docs/validation/claims-ledger.md

```markdown
# Claims ledger (pre-registered, frozen)

- Target: `<path or module>`, commit `<HEAD>`
- Frozen: <TIME>, before any documentation was read and before any probe was run.
- Mode: 1 = Channel A in a separate subagent (documentation only), Channel B probes only; neither reads the other's file
  before its own is committed. 2 = one context (fallback; say so in channel-b.md).
- Every material claim starts REJECTED. The burden of proof is on the evidence.

Probe conventions (Channel B): interpreter and version pins, where probes live, how a falsifier is run.

| ID | Cat | Mat | Claim (one sentence, no conjunction) | Falsifier (the observation that refutes it) | probe_cmd | probe_expect | mutation for falsifier |
|----|-----|-----|--------------------------------------|---------------------------------------------|-----------|--------------|------------------------|
| <PREFIX>1 | api / semantic / algorithmic / numeric / environmental | material / minor | (example, delete) `np.std` with defaults uses ddof=0 | a sample whose default result differs from the ddof=0 value | `python probes/p01.py` | rc 0 | `ddof_one` |

Categories: API (it exists with this signature), semantic (it does what the code assumes), algorithmic (it implements the
named rule), numeric (a tolerance or property holds), environmental (version or platform). A numeric-value claim is split
into its method (Channel A) and its value (Channel B); the value's significance is a statistics question, not an EGV claim.
```

## Template: docs/validation/channel-a.md

```markdown
# Channel A: documentation audit

- Auditor: (subagent or session). Documentation and installed-library source only. No project code executed, no probe
  written or run, and `channel-b.md` not read.
- Target: `<path or module>` at commit `<HEAD>`. Versions audited against: (pin them).
- Retrieved: <TIME>

## Sources that could not be retrieved

(list each, and what was used instead)

## Evidence records

### <PREFIX>1 (claim text)

- Verdict: CONFIRMED / REFUTED / UNVERIFIABLE
- Evidence: source URL or file:line, with the retrieval date and the version it describes.
- Note: the reasoning, when a verdict rests on an argument.
```

## Template: docs/validation/channel-b.md

```markdown
# Channel B: runtime audit

- Interpreter and pins: (exact versions).
- Probes: `docs/validation/probes/`. Falsifiers: one named mutation per probe, applied to a copy, never to the repository.
- Tier 0: (build, lint, existing tests: the command and its printed counts).

## Independence disclosure

State the mode. If Channel A's findings reached this context before the probes were written, say so and treat the result
as Mode 2 (fallback).

## Per-claim records

### <PREFIX>1 (claim text)

- Verdict: CONFIRMED / REFUTED / UNVERIFIABLE
- Probe: command, return code, verbatim output.
- Falsifier: the mutation applied and the probe's return code under it (a probe that passes on a mutant proves nothing).
```
