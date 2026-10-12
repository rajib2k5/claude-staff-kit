# Claim extraction: decomposing code into atomic falsifiable claims

Contents:
1. What makes a claim atomic and falsifiable
2. Category definitions with examples (Python, JavaScript, SQL)
3. Materiality rules
4. The claims ledger format
5. Granularity rule and the triviality-inflation guard
6. Worked example: an ML snippet decomposed into 8 claims

## 1. What makes a claim atomic and falsifiable

A claim is **atomic** when it asserts exactly one checkable fact — no conjunctions.
"`fit()` exists and converges" is two claims. Split it.

A claim is **falsifiable** when there exists a concrete observation that would refute
it. "The code is clean" is not falsifiable. "`LogisticRegression.fit` raises
`TypeError` when passed `epochs=5`" is.

A claim is **decontextualized** when it stands alone: it names the exact symbol,
module, and pinned version, so an auditor who has never seen the surrounding code can
verify it. Replace "this function" with the qualified name; replace "the current
version" with the recorded version number.

Every generated file implicitly makes dozens of claims. Your job is to make the
load-bearing ones explicit so each can be attacked separately.

## 2. Categories, with examples in three languages

### API claims — the symbol/kwarg/signature exists in the installed version

The single most common hallucination class: models fabricate packages, members, and
kwargs, and repeated sampling does not surface it — 43% of hallucinated packages
recur in 10 of 10 repeated generations (arXiv:2406.10279). Fabricated library names
supplied in the prompt are accepted up to 99% of the time (arXiv:2509.22202).

- Python: "`pandas.DataFrame.to_parquet` accepts kwarg `compression` in pandas
  X.Y.Z." / "package `torchmetrics` exists on PyPI and is installed."
- JavaScript: "`node:fs/promises` has a named export `readFile` in Node 22." /
  "`lodash.debounce` exists at the installed lodash version."
- SQL: "function `json_extract` exists in this SQLite build." / "column
  `deleted_at` exists on table `users` in the target schema."

### Semantic claims — the call does what the code assumes

- Python: "`np.std` with default arguments computes population std (ddof=0), which
  is what this normalization intends." / "`sorted()` is stable."
- JavaScript: "`Array.prototype.sort` without a comparator sorts numbers
  lexicographically — this code assumes numeric order." (This one is REFUTED by
  probe: `[10,2,1].sort()` → `[1,10,2]`.)
- SQL: "`LEFT JOIN` preserves unmatched left rows, so the `COUNT(*)` here counts
  customers with zero orders as 1, not 0." (Refutable: `COUNT(*)` counts the row,
  `COUNT(o.id)` counts matches.)

### Algorithmic claims — this correctly implements a named rule/formula

- Python: "this loop implements the Adam update, including bias correction of both
  moment estimates." / "this function computes softmax with max-subtraction for
  stability."
- JavaScript: "this reducer implements Welford's online variance algorithm."
- SQL: "this window expression computes a 7-day trailing average, not a 7-row one."

### Numeric claims — tolerances, complexity, convergence

- "loss at initialization equals -log(1/C) within 0.05."
- "this comparison tolerance (rtol=1e-7) is achievable in float32." (Often REFUTED:
  float32 machine eps is 1.2e-7.)
- "this lookup is O(1) because the container is a set, not a list."

### Environmental claims — version and platform compatibility

- "this code runs under the installed numpy 2.4" (REFUTED if it calls `np.trapz` —
  deprecated in numpy 2.0, removed in 2.4.0; on numpy 2.0–2.3 the same call is
  deprecated-but-present, a different verdict).
- "`penalty='l2'` is non-deprecated in the installed scikit-learn." (REFUTED on
  scikit-learn 1.8+, where `penalty` itself is deprecated for removal in 1.10 —
  measured FutureWarning on 1.9.0. Version-dependent claims like this are exactly
  why the audit runs against the pin, not memory.)
- "this shell script is POSIX sh compatible" (bashisms parse clean under `bash -n`
  and still break dash at runtime).

## 3. Materiality rules

- **Material**: a wrong claim changes outputs, corrupts state, crashes, silently
  degrades the model, or leaks data. All algorithmic claims on the core computation
  are material. All API claims on the executed path are material.
- **Minor**: style, naming, non-hot-path performance, log formatting.
- Defaults: when unsure, material. Claims about error handling on paths that
  plausibly execute: material. Claims about dead code: minor, but add an
  environmental claim "this code path is actually dead."
- Every **material** claim starts REJECTED. Minor claims may start UNVERIFIED and
  never block the verdict.

## 4. The claims ledger format

One row per claim, written to `claims-ledger.md` before either channel runs:

| ID | Category | Materiality | Claim (one sentence) | Falsifier (what observation would refute it) |
|----|----------|-------------|----------------------|----------------------------------------------|
| C1 | api | material | `torch.optim.Adam` accepts kwarg `lr` in torch 2.5.1 | constructor raises TypeError on `lr=` |

In single-context fallback mode, add two columns pre-registering Channel B's probe:
`probe_cmd` (exact argv) and `probe_expect` (pass condition, usually `rc == 0`).

Rules:
- IDs are stable; sub-claims from splits get dotted IDs (C4.1, C4.2, C4.1.1).
- The ledger is frozen after pre-registration. Discovering a missed claim mid-audit
  means recording it separately and running BOTH channels on it as a fresh item —
  never silently editing the ledger.

## 5. Granularity rule and the triviality-inflation guard

**Granularity rule:** decompose to the finest unit at which a *mechanical* check
exists. Symbol existence → registry/reflection lookup. Signature → stub or
reflection. Documented contract → one property-based test. Behavioral claim → one
metamorphic relation or differential comparison. A claim that cannot be reduced to a
mechanical check at any granularity is marked UNVERIFIABLE at extraction time rather
than passed to opinion.

**Triviality guard:** decompose-then-verify metrics are gameable — adding
tautological, repetitive sub-claims raised a factual-precision score from 81.5% to
100% in a measured attack (CORE, arXiv:2407.03572). Since this skill both decomposes
and verifies, it inherits that incentive gradient. Countermeasures, all required:

- Reject duplicate claims (same target, same assertion, reworded).
- Reject claims with no plausible falsifier.
- Reject claims the code does not actually depend on.
- Report the claim *count* alongside the pass rate — a precision-style gate rewards
  asserting less (the CoVe factored variant's precision gain came partly from fewer
  asserted facts, arXiv:2309.11495), so a suspiciously short ledger for a large
  diff is itself a finding.

## 6. Worked example: ML snippet → 8 claims

Code under validation (generated by an AI assistant):

```python
import torch, torch.nn as nn

model = nn.Sequential(nn.Linear(20, 64), nn.ReLU(), nn.Linear(64, 10))
opt = torch.optim.Adam(model.parameters(), lr=3e-4)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(50):
    for X, y in loader:
        probs = torch.softmax(model(X), dim=1)
        loss = loss_fn(probs, y)
        loss.backward()
        opt.step()
```

Ledger:

| ID | Cat | Mat | Claim | Falsifier |
|----|-----|-----|-------|-----------|
| C1 | api | material | `torch.optim.Adam` accepts kwarg `lr` in the installed torch | TypeError on construction |
| C2 | api | material | `nn.CrossEntropyLoss` exists and is callable as `loss_fn(input, target)` | import/call failure |
| C3 | semantic | material | `nn.CrossEntropyLoss` expects raw logits, so feeding `softmax(...)` output is correct | docs/source say it applies log-softmax internally; runtime: tensor fed to the loss is already normalised (rows sum to 1, no negative entries), and the overfit-8 probe plateaus at a high loss floor instead of reaching ~0 |
| C4 | semantic | material | gradients do not accumulate across steps without `opt.zero_grad()` | probe: grad after 2 backward calls = 2× grad after 1 |
| C5 | numeric | material | loss at initialization ≈ -log(1/10) = 2.3026 | measured init loss differs by > 0.05 |
| C6 | algorithmic | material | the training loop can drive loss to ~0 on a tiny batch (learning works end-to-end) | overfit-8-examples probe fails to reach train acc 1.0 |
| C7 | semantic | material | `dim=1` is the class dimension for the (N, 10) output | softmax rows fail to sum to 1 along dim=1 |
| C8 | environmental | material | the installed torch version supports every symbol used here | any import/attribute probe fails |

Expected outcome for this snippet: C3 is REFUTED by both channels (docs: CE applies
log-softmax internally; runtime: the tensor fed to the loss is already normalised —
rows sum to 1 — and the overfit-8 probe plateaus at loss ≈1.46 where the corrected
variant reaches 4e-5) and C4 is REFUTED by the runtime channel (PyTorch accumulates
gradients by default; measured 2.0× accumulation). Note what the init-loss probe
(C5) does NOT catch here: softmax is shift-invariant, so both the shipped and the
corrected variant measure init loss ≈ 2.3026 — C5 is CONFIRMED on the shipped code
even though C3 is wrong, which is why C3 needs its own falsifier. Two material
REJECTED claims ⇒ the code fails validation with two required fixes, even though it
runs without raising and its loss goes down. That is the point: this bug class is
silent, and only claim-level auditing catches it.
