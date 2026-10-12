# Divergence handling, the split protocol, and the final verdict

Contents:
1. The convergence gate, restated
2. Divergence taxonomy — what each disagreement pattern usually means
3. Choosing the split axis
4. Recursion bookkeeping
5. Stopping rules and UNRESOLVED
6. Escalation format
7. Evidence table format
8. Final report template with a filled example

## 1. The convergence gate, restated

Per claim: CONFIRMED+CONFIRMED → ACCEPTED. REFUTED+REFUTED → REJECTED (fix
required). Anything else — one channel diverging from the other, or any
UNVERIFIABLE — → SPLIT.

Non-negotiables:
- **No reconciliation step.** Never let the channels debate, never average, never
  ask one to re-examine "in light of" the other. Consensus-seeking filters out the
  disagreement signal that discriminates right from wrong, and adversarial debate
  measured 15 points BELOW a single agent (arXiv:2510.20963). Debate's measured
  advantage exists only under information asymmetry, which an auditor who can read
  the code does not have (Kenton et al., arXiv:2407.04622). The resolution
  mechanism is decomposition + fresh evidence, nothing else.
- **A verdict that flips on re-audit is downgraded.** Reserve the highest confidence
  for claims accepted with *no revision along the way* — the accept-with-no-change
  signal carried a ~30pp precision gap in the closest measured protocol
  (arXiv:2605.25133). Track a `revised: yes/no` flag per claim; a revised ACCEPTED
  is still accepted but is flagged in the report.
- **Expect false alarms.** In measured practice, only ~56% of flagged divergences in
  an agentic property-testing campaign were genuine bugs (sample-reviewed, wide CI
  42–70% — arXiv:2510.09907).
  Divergence opens a bounded investigation; it does not itself condemn the code.

## 2. Divergence taxonomy

### A CONFIRMED, B REFUTED  (docs say yes, runtime says no)

Most likely causes, in observed order:
1. **Version drift** — Channel A read docs for the wrong version, or the installed
   version changed behavior. First move: re-verify the version pin on both sides.
2. **Docs describe intent, the executed code path differs** — the claim is true of
   the API in isolation but the surrounding code disables/overrides it (wrong
   branch, config, dtype, device).
3. **Probe defect** — the probe hit a known trap (float32 gradient check, kink,
   atol domination, pycache staleness, flaky failure). Re-check the probe against
   `runtime-audit.md` section 8 before splitting.
4. **Environment mismatch** — probe sandbox differs from the target environment.

### A REFUTED, B CONFIRMED  (docs say no, runtime says yes)

Most likely causes:
1. **Undocumented behavior** — it works, but it is contract-free and may break on
   upgrade. Typically resolves to: sub-claim "works at pinned version" ACCEPTED +
   sub-claim "documented/contractual" REJECTED → report as a fragility finding.
2. **Coincidental pass** — the probe was too weak to refute (falsifier check
   missing or inadequate). Rerun the falsifiability check first.
3. **Deprecated-but-functional** — exists and runs today, scheduled for removal.
4. **Doc-audit error** — wrong page, wrong symbol, distribution/import name
   confusion.

### Either channel UNVERIFIABLE

Not a conflict — a gap. Split so that each sub-claim lands squarely inside one
channel's competence: docs-decidable parts (existence, contract, version bounds) vs
probe-decidable parts (observed behavior on named inputs). A verifier operating
outside its competence region is worse than useless (the accept signal inverts,
arXiv:2605.25133), so re-scoping the question IS the fix.

## 3. Choosing the split axis

Pick the axis that separates the two channels' likely disagreement source:

| Symptom | Split axis | Example |
|---|---|---|
| existence vs behavior tangled | API-existence vs semantics | "`fit` handles sparse input" → "`fit` accepts scipy.sparse without raising" + "results match dense to 1e-7" |
| works on some inputs | input subdomain | split by dtype, shape, sign, size, edge values |
| suspicion of drift | version | "true at ≤1.7" + "true at installed 1.9" |
| formula-level dispute | term in the formula | Adam → "m update" + "v update" + "bias correction m" + "bias correction v" + "parameter step" |
| environment-shaped | platform/config | CPU vs GPU, locale, env flags |

Rules: 2–4 sub-claims per split (more = triviality inflation risk — every sub-claim
still needs a falsifier); each sub-claim must be decidable in principle by BOTH
channels or explicitly scoped to one with the other marked N/A-by-construction (an
N/A-scoped sub-claim is accepted on a single channel ONLY if its sibling covering
the other channel's half is also accepted).

## 4. Recursion bookkeeping

- Sub-claims get dotted IDs: C4 → C4.1, C4.2; C4.1 → C4.1.1 (depth = dot count).
- Each sub-claim is a full ledger row: statement, category, materiality, falsifier —
  appended to the ledger with a `parent:` field, then run through BOTH channels
  fresh. Do not recycle the parent's evidence records; new question, new evidence.
- The parent claim's gate result derives from its children: all children ACCEPTED →
  parent ACCEPTED; any child REJECTED → parent REJECTED; any child UNRESOLVED →
  parent UNRESOLVED.
- Keep the full tree in the report; never delete a diverging parent row.

## 5. Stopping rules and UNRESOLVED

Stop splitting a branch when ANY of:
1. depth = 3 (C4.1.1.x would be depth 4 — do not create it);
2. the sub-claim is no longer decomposable (single symbol, single term, single
   input);
3. both channels return UNVERIFIABLE on the same sub-claim (no admissible evidence
   exists on either side).

Then mark the leaf **UNRESOLVED**. UNRESOLVED propagates up (section 4) and BLOCKS
overall acceptance — the code cannot pass with an unresolved material claim.

Why a hard stop instead of "keep digging": investigation reliably manufactures
confidence without accuracy — evaluators grew more confident after research even
when wrong, and the oversight protocol landed below the model's own accuracy
(arXiv:2507.19486). An explicit UNRESOLVED terminal state is the guard against
converging on confident agreement regardless of truth.

## 6. Escalation format

Every UNRESOLVED material claim escalates to the human with this block:

```
UNRESOLVED: <claim id> — <claim statement>
materiality: material
split trail: C4 -> C4.2 -> C4.2.1 (depth 3 reached | not decomposable | dual-UNVERIFIABLE)
channel A evidence (verbatim, all attempts):
  <each evidence record for this branch>
channel B evidence (verbatim, all attempts):
  <each probe record for this branch, including falsifier results>
what would decide it: <the missing artifact or probe access — e.g., "vendor docs
  for the installed fork", "a GPU to run the determinism probe">
risk if wrong: <one sentence on the blast radius>
```

No recommendation, no lean. Both channels' evidence, presented symmetrically — the
one measured aid to human judgment on model-wrong cases was seeing arguments for
both sides (arXiv:2507.19486).

## 7. Evidence table format

One row per leaf claim (parents shown as grouping rows):

| ID | Claim | Cat | Mat | A verdict | A evidence (src, ver, quote-ref) | B verdict | B evidence (cmd, rc, output-ref) | Gate |
|----|-------|-----|-----|-----------|----------------------------------|-----------|----------------------------------|------|

Evidence cells reference the full records in `channel-a.md` / `channel-b.md` by
claim ID; the table carries the pointer plus a one-line digest, never a substitute
for the verbatim record.

## 8. Final report template, with a filled example

```markdown
# Evidence-gated validation report

target:        train.py (git sha / file hash)
environment:   Python 3.12.3, torch 2.5.1, numpy 2.4.6 (pin file: env-pin.txt)
mode:          single-context sequential fallback
ledger:        claims-ledger.md (frozen 2026-08-29T14:02Z, 8 claims, 8 material)
channels:      channel-a.md, channel-b.md

## Verdict: FAIL — 2 material claims REJECTED, 0 UNRESOLVED

## Evidence table

| ID | Claim | Cat | Mat | A | A evidence | B | B evidence | Gate |
|----|-------|-----|-----|---|------------|---|------------|------|
| C1 | Adam accepts kwarg lr in torch 2.5.1 | api | M | CONF | pytorch docs v2.5, Adam signature quote | CONF | construct probe rc=0; falsifier `learning_rate=` rc=1 | ACCEPTED |
| C2 | CrossEntropyLoss callable as loss_fn(input, target) | api | M | CONF | docs v2.5 quote | CONF | call probe rc=0 | ACCEPTED |
| C3 | feeding softmax output to CrossEntropyLoss is correct | sem | M | REF | docs v2.5: "This criterion computes the cross entropy loss between input logits and target" | REF | tensor fed to loss is normalised (rows sum to 1.0, no negatives); overfit-8 plateaus at 1.46 vs 4e-5 for logits variant | REJECTED |
| C4 | grads do not accumulate without zero_grad() | sem | M | REF | docs: backward() accumulates into .grad | REF | measured g2/g1 = 2.0 | REJECTED |
| C5 | init loss ≈ log 10 = 2.3026 | num | M | CONF | -log(1/C) baseline | CONF | 2.302585 measured on the shipped code (softmax shift-invariance makes this probe blind to C3 — see C3's own falsifier) | ACCEPTED |
| C6 | loop overfits 8 examples to acc 1.0 | alg | M | UNVER | (not docs-decidable) → split C6.1/C6.2 | — | — | see children |
| C6.1 | optimizer+loss wiring can reach acc 1.0 on 8 rows (probe-scoped) | alg | M | N/A-by-construction | — | CONF | acc 1.00, loss 0.0079; falsifier (sign flip) acc 0.25 | ACCEPTED |
| C6.2 | the loop matches the documented train-step order (docs-scoped) | alg | M | CONF | docs training-loop reference quote | N/A-by-construction | — | ACCEPTED |
| C7 | dim=1 is the class dimension | sem | M | CONF | docs quote on softmax dim | CONF | rows sum to 1.0 along dim=1 | ACCEPTED |
| C8 | installed torch supports all symbols used | env | M | CONF | changelog scan at 2.5.1 | CONF | import+call probes all rc=0 | ACCEPTED |

## Required fixes
1. C3: pass raw logits to CrossEntropyLoss — delete the softmax call.
2. C4: add opt.zero_grad() at the top of the inner loop.

## Flags
- C6 split once (UNVERIFIABLE-by-scope); both children accepted, no revisions.
- No claim was revised after initial verdicts (revised: no on all rows).

## Not validated
Convergence on the real dataset; GPU determinism (no GPU in sandbox). These remain
open claims, not accepted ones.
```

Report discipline: the "Not validated" section is mandatory — dual-confirmation of
the listed claims is NOT a general correctness certificate, and the report must not
imply multiplicative reliability from two channels (correlated failure through
shared spec misreading is documented at scale, arXiv:2606.20158).
