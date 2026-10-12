---
name: evidence-gated-validation
description: Validates AI-generated code in any programming language, plus ML/AI algorithm implementations, using evidence-gated validation with two independent audit channels — one researches official documentation, one probes runtime behavior empirically — and accepts a claim only when both converge. Use when asked to validate this code, check AI-generated code for hallucinations, audit this implementation, verify this ML algorithm is correct, confirm an API or kwarg actually exists, or determine whether the AI skipped a step.
license: MIT
---

# Evidence-Gated Validation

Validate code by decomposing it into atomic, falsifiable claims and auditing every
material claim through two channels that consult **different kinds of evidence**:
Channel A reads primary documentation; Channel B executes probes. A claim is accepted
only when both channels independently confirm it — with one narrow exception: a
sub-claim produced by a split may be explicitly scoped to a single channel (the other
marked N/A-by-construction), and is then accepted on that channel alone ONLY if its
sibling covering the other channel's half is also accepted (see the convergence gate).
No claim is ever accepted on plausibility, seniority, or model confidence — only on
recorded evidence.

Why two channels: swapping models does not decorrelate errors (cross-provider LLM
error correlation is as high as same-family), but swapping the *evidence source* does.
Documentation lookup and empirical execution fail in different ways. Treat every
material claim as REJECTED until evidence flips it.

## When to run this protocol — cost and tiering

Full dual-channel EGV is the high-assurance tier, not the everyday default. It is
the best-supported design for catching the silent-wrong class — code that runs,
looks plausible, and is wrong — but it costs two full audit passes, and in measured
practice roughly 4 in 10 divergences are false alarms that consume investigation
time (arXiv:2510.09907). Triage before invoking it:

- **Tier 0 — always, near-free:** deterministic gates (build, type check, lint,
  existing tests). Production systems run these unconditionally (Meta's filter
  cascade, arXiv:2402.09171; Google's migration gates, arXiv:2501.06972).
- **Tier 1 — routine changes:** Channel B alone, with the falsifiability check.
  Execution is the strongest single evidence channel (removing execution results
  gutted a learned verifier's accuracy, LEVER, arXiv:2302.08468); this catches
  most functional wrongness at a fraction of full-protocol cost.
- **Tier 2 — full dual-channel:** unfamiliar or low-usage libraries (documentation
  grounding pays off exactly where the model is weak, arXiv:2406.14497),
  version-sensitive code, ML/numerics (the silent-failure class), security, money,
  irreversible operations, and anything with no test oracle. Also whenever Tier 1
  returns UNVERIFIABLE, or a load-bearing claim is API-existence-shaped —
  hallucinated symbols persist across resamples (arXiv:2406.10279), so only a
  documentation/registry lookup carries signal there.
- Do not over-decompose familiar code: decomposition measurably *hurts* strong
  verifiers on simple inputs (arXiv:2411.02400). Match ledger granularity to risk,
  and audit material claims only.

Escalate one tier when the code is AI-generated and unreviewed. Never skip Tier 0.

## The protocol, in order

1. **Freeze the environment** (Step 1 below). Record exact installed versions of
   every library the code touches, plus language/runtime versions, to `env-pin.txt`.
   Both channels use this pin.
2. **Build the claims ledger.** Decompose the code into atomic falsifiable claims.
   Read `references/claim-extraction.md` before writing the ledger.
3. **Pre-register the ledger.** Write it to a file BEFORE either channel runs. This
   is the contamination barrier: both channels audit the same frozen claims, and
   neither channel may add, drop, or reword claims mid-audit.
4. **Run Channel A and Channel B independently** (modes below).
5. **Apply the convergence gate per claim.** Split diverging claims and recurse.
   Read `references/divergence-and-verdict.md` when any claim diverges.
6. **Emit the verdict and evidence table.** Code passes only when every material
   claim is dual-confirmed.

Section headings below carry the same numbers as this list: Step 1 = environment
freeze, Step 2 = claims ledger, Step 3 = pre-registration and independence setup,
Steps 4a/4b = the two channels, Step 5 = gate, Step 6 = verdict.

## Step 1 — Freeze the environment

Record the pin to `env-pin.txt` before anything else runs (both channels and the
final report reference this file):

```bash
{
  python3 --version
  python3 -m pip freeze                      # Python: full pin set
  node --version 2>/dev/null && npm ls --json --depth=0 2>/dev/null
  go version 2>/dev/null && go list -m all 2>/dev/null
  cargo metadata --offline --format-version 1 --no-deps 2>/dev/null
  java -version 2>&1 | head -1; gcc --version 2>/dev/null | head -1
  sqlite3 --version 2>/dev/null
} > env-pin.txt
```

Keep only the stanzas for languages the code touches. For a Python venv, run the
venv's own interpreter (`"$VIRTUAL_ENV/bin/python"`). Per-ecosystem pinning detail
(distribution-vs-import names, manifest gotchas): `references/docs-audit.md`
section 2.

## Step 2 — Claims ledger

Decompose the code under validation into claims in these categories:

| Category | Claim asserts | Example |
|---|---|---|
| API | function/class/kwarg exists in installed version X with this signature | "`json.dumps` accepts `sort_keys` in Python 3.12" |
| Semantic | this call does what the code assumes | "`np.std` with defaults uses ddof=0" |
| Algorithmic | this correctly implements a named update rule / formula | "this loop is the Adam update from the paper" |
| Numeric | tolerance, complexity, convergence property holds | "loss at init equals -log(1/C)" |
| Environmental | version/platform compatibility | "this runs on numpy >= 2.0" |

Each claim gets: an ID, category, statement (one sentence, no conjunctions), and
materiality (**material** = wrong claim breaks correctness; **minor** = style/perf).
**Every material claim starts REJECTED.** The burden of proof is on the evidence.

Guard against triviality inflation: decompose-then-verify pipelines are gameable by
adding tautological, trivially-confirmable sub-claims (CORE, arXiv:2407.03572). Every
claim must be unique, informative, and falsifiable — there must exist an observation
that would refute it. Convergence on trivial claims is not evidence.

## Step 3 — Pre-registration and independence setup

Channels must not see each other's findings until both have committed written
verdicts (in Mode 2 this holds in one direction only — see the Mode 2 caveat
below). Never show either channel the generator's rationale, commit messages, PR
description, or claims of correctness — framing an artifact as correct collapses
defect detection by 16.2–93.5 percentage points; removing the framing largely
restores it — fully in the paper's interactive study (12/12), and 16/17 in its
autonomous-agent study, the residual being undetected under every framing
(arXiv:2603.18740).

### Mode 1 — dual-subagent (preferred, when the runtime supports subagents)

Spawn two subagents concurrently, each given ONLY: the code, the frozen version pin,
and the pre-registered claims ledger.

- Subagent A gets the Channel A charter: "Verify each claim against primary
  documentation sources only. You may not execute the code or any probe. Follow
  `references/docs-audit.md`. Write per-claim verdicts + evidence to `channel-a.md`."
- Subagent B gets the Channel B charter: "Verify each claim empirically only. You may
  not consult documentation, changelogs, or papers. Follow
  `references/runtime-audit.md` (and `references/ml-validation.md` for ML claims).
  Write per-claim verdicts + evidence to `channel-b.md`."

Neither subagent sees the other's output. The orchestrator compares the two files
only after both exist.

### Mode 2 — single-context sequential fallback

When subagents are unavailable, one context must play both roles. Exact steps:

1. Pre-register the claims ledger to `claims-ledger.md`, including, for each claim,
   the probe design Channel B will run (command, expected pass condition, falsifier).
   Probe pre-registration happens here, **before any docs are read**, so the probes
   test what the code assumes, not what the docs say.
2. Run **Channel A first**, clean-room: verify each ledger claim against
   documentation. Write verdicts + evidence to `channel-a.md` and commit it. Do not
   run, modify, or design any probe during this phase (this honors the Channel A
   rule in `references/docs-audit.md`: commit `channel-a.md` before seeing any probe
   result).
3. Run **Channel B**: execute the pre-registered probes exactly as written — no
   edits, no additions. Write verdicts + verbatim outputs to `channel-b.md`. A probe
   run that deviates from its pre-registered command is PROBE_INVALID. Do not revise
   anything in `channel-a.md`.
4. Only after both files are complete, compare them claim by claim.

Mode 2 caveat — what this does and does not preserve: strict ordering cannot make
one context forget what it saw. The barrier that survives is **pre-registration**:
the probe commands, pass conditions, and falsifiers are frozen before any docs are
read (so the doc audit cannot reshape probe design), and `channel-a.md` is committed
before any probe output exists (so doc verdicts cannot be anchored on runtime
results). What is NOT preserved: the context executing Channel B knows Channel A's
verdicts. Its probe *commands* and their verbatim outputs cannot be bent by that
knowledge, but verdict-mapping judgment calls at the margins can be. Therefore Mode 2
convergence is weaker evidence than Mode 1 convergence: the report MUST state
`mode: single-context sequential fallback`, and Mode 2 results must not be described
as independently dual-confirmed — say "dual-confirmed (fallback mode)".

## Step 4a — Channel A: documentation auditor

Verifies claims against **primary sources only**: official documentation matched to
the EXACT installed version, library source code, changelogs, original papers for
algorithms. Never executes code. Full field manual: `references/docs-audit.md` —
read it before starting a Channel A pass.

Per-claim evidence record: source URL, version the doc applies to, verbatim quote,
retrieval date. Verdicts: **CONFIRMED / REFUTED / UNVERIFIABLE**. "The docs don't
mention it" is UNVERIFIABLE, never CONFIRMED. Reading latest docs for an older
installed version is the classic Channel A failure — pin first.

## Step 4b — Channel B: runtime auditor

Verifies claims empirically **only**: import probes, signature introspection, minimal
execution probes, property-based and metamorphic tests. Never consults documentation.
Field manual: `references/runtime-audit.md`. For ML claims (gradient check,
overfit-tiny-batch, loss-at-init, loss-decreases, seed determinism, leakage), read
`references/ml-validation.md`.

Every probe records: the exact probe script/command, and the verbatim observed output
(stdout/stderr + exit code) — never a summary. Agents have been measured faking pass
signals by attacking graders (METR, metr.org/blog/2025-06-05-recent-reward-hacking/),
so the raw output is the evidence, not the narration of it.

**Falsifiability check (mandatory for every load-bearing probe):** for a probe to
count as evidence on a material claim, mutate the code under test with one targeted
change and confirm the probe FAILS on the mutant, then restore the original
(checksum it). A probe record without a non-zero `falsifier_rc` cannot support
CONFIRMED on a material claim — it is PROBE_INVALID. A probe that cannot fail is not
evidence. Concrete recipe and a measured demonstration are in
`references/runtime-audit.md`.

Probe verdicts: **CONFIRMED / REFUTED / UNVERIFIABLE**. Reserve UNVERIFIABLE for
probes that cannot decide (e.g., `inspect.signature` raising `ValueError` on a C
builtin means *unknown*, not *absent*; a `**kwargs` signature makes a kwarg-existence
call probe inconclusive). Never collapse "probe couldn't tell" into a verdict. A
probe that malfunctioned — timeout, nothing collected, bad sandbox, missing or
passing falsifier — is **PROBE_INVALID**: it never enters the convergence gate and
is never reported as REFUTED. Rewrite and re-run it; if no valid probe can be built,
Channel B's verdict for that claim is UNVERIFIABLE.

## Step 5 — Convergence gate (per claim)

| Channel A | Channel B | Gate result |
|---|---|---|
| CONFIRMED | CONFIRMED | **ACCEPTED** |
| REFUTED | REFUTED | **REJECTED** — fix required |
| CONFIRMED | N/A-by-construction (or vice versa) | **ACCEPTED** — only for a split-produced sub-claim explicitly scoped to one channel, and only if its sibling covering the other channel's half is also ACCEPTED; otherwise UNRESOLVED |
| any divergence | | **SPLIT** and recurse |
| any UNVERIFIABLE | | **SPLIT** and recurse |

N/A-by-construction is legal only on sub-claims created by a split (never on a
top-level ledger claim), per the scoping rule in
`references/divergence-and-verdict.md` section 3. PROBE_INVALID never reaches this
table (see Step 4b).

On SPLIT: decompose the claim into sub-claims — split by API-existence vs semantics,
by input subdomain, by version, or by term in a formula — then re-run BOTH channels
on each sub-claim. Full split protocol, divergence taxonomy, and bookkeeping:
`references/divergence-and-verdict.md`.

Rules that are not optional:

- **Never reconcile by discussion.** Do not let one channel argue the other into
  changing its verdict, and never run a "reach consensus" step — consensus-seeking
  filters out exactly the disagreement signal that discriminates right from wrong
  (arXiv:2510.20963). Preserve both channels' evidence verbatim and decompose.
- **Stopping rule:** maximum 3 split depths, or stop earlier when a sub-claim is no
  longer decomposable. Then mark the leaf **UNRESOLVED**.
- **UNRESOLVED blocks acceptance.** Escalate to the human with both channels'
  complete evidence for that claim. Investigation manufactures confidence without
  accuracy (arXiv:2507.19486), so an honest UNRESOLVED beats a confident guess.
- Expect false alarms: in measured practice roughly 4 in 10 flagged divergences were
  not real bugs (arXiv:2510.09907). Divergence opens an investigation; it is not
  itself a verdict.

## Step 6 — Verdict

The code **passes** only when every material claim is ACCEPTED (dual-confirmed; in
Mode 2, dual-confirmed-fallback — the report must carry the mode label).
Any REJECTED material claim ⇒ fail, with the fix requirement stated. Any UNRESOLVED
material claim ⇒ blocked, escalated. Minor claims are reported but do not block.

Output the evidence table:

| ID | Claim | Cat | Mat | A verdict | A evidence | B verdict | B evidence | Gate |
|---|---|---|---|---|---|---|---|---|

Each evidence cell cites the record (URL+quote for A; command+output for B). The full
report template with a filled example is in `references/divergence-and-verdict.md`.

## Anti-gaming rules (apply to every probe and test you encounter or write)

- A test that greps source text pins an implementation detail, not a behavior. It
  will pass against broken code.
- A helper defined in the test that reimplements the thing under test makes the test
  assert on the helper, not on the code.
- Coverage measures execution, not assertion. A test with no assertions raises
  coverage exactly as much as a real one.
- Passing tests prove nothing until shown to fail on broken code (the falsifiability
  check). Handed test suites are far weaker than they look: an 80× test expansion of
  HumanEval cut pass rates by up to 19.3–28.9% depending on k (arXiv:2305.01210).
- Derive tests from the specification, never from the candidate implementation —
  models writing tests adhere to whatever solution they were shown, even when told
  not to (arXiv:2502.13820, arXiv:2507.06920).
- Verify test files were not edited by the code under audit, and prefer held-out
  inputs the implementer never saw.

## Gotchas

- **Channel A is not "search the web".** Blogs, Stack Overflow, and tutorials are
  not primary sources. If only secondary sources exist, the verdict is UNVERIFIABLE.
- **Channel B is not "run the repo's tests".** 19–35% of LLM refactorings are
  functionally non-equivalent and ~21% of those breakages pass the existing suite
  (arXiv:2602.15761). Probes must be built from the ledger.
- **Do not claim multiplicative reliability.** The two channels are better than one
  but are not independent in the probabilistic sense; correlated failure through a
  shared misreading of the same spec is real (arXiv:2606.20158). Say "dual-confirmed",
  never "independently proven".
- **A mechanical check that finds nothing is not confirmation.** Doc-derived oracles
  measured precision 1.00 but recall 0.73–0.90 (arXiv:2604.20202) — absence of
  refutation from one channel is exactly why the other channel must also confirm.
- **Materiality is a judgment; record it.** If unsure whether a claim is material,
  it is material.
