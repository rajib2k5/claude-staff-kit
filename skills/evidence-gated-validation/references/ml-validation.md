# ML/AI-specific probe library (Channel B extension)

Contents:
1. Finite-difference gradient check
2. Overfit-a-tiny-batch
3. Initial-loss sanity
4. Loss-decreases probe
5. Seed determinism (in-process and cross-process)
6. Shape / dtype audit
7. Metamorphic relations for ML
8. Reference-implementation comparison and tolerance policy
9. Data leakage checks
10. Commonly hallucinated / silently-wrong ML API patterns

All numeric behaviors below were measured on Python 3.12 / numpy 2.4 / torch 2.5 /
scikit-learn 1.9 (CPU) during skill development; re-measure locally when versions
differ materially.

## 1. Finite-difference gradient check

Centered difference and the relative-error metric (source:
https://cs231n.github.io/neural-networks-3/):

```
numeric  g_n = (f(x + h) - f(x - h)) / (2h)
rel_err  = |g_a - g_n| / max(|g_a|, |g_n|)        # both-zero counts as pass
```

Thresholds (CS231n): rel_err > 1e-2 → gradient probably wrong; 1e-2..1e-4 →
uncomfortable; < 1e-4 acceptable only for objectives with kinks; ≤ 1e-7 → good.
Deeper networks legitimately accumulate larger error.

Epsilon: use h in 1e-4..1e-6 for float64. The cbrt(machine eps) ≈ 6e-6 optimum for
centered differences is a standard numerical-analysis result, not from CS231n —
and it was confirmed empirically here (measured error minimum ≈ 3e-6–6e-6 on a
smooth function; log-log slopes 1.00 forward, 2.00 centered). Smaller is NOT
better — below ~1e-7 the measured error curve turns back up from cancellation.

**float64 is mandatory.** Measured: a CORRECT gradient checked in float32 scores
rel_err 6e-2 to 1.0 across the recommended epsilon band — it fails the "probably
wrong" threshold on correct code. Cast to float64 first or skip the probe and say so.

**Kinks cause false failures.** At |preactivation| < h, ReLU/max/abs produce large
spurious rel_err (measured 4.5e-1 on correct code). Before reporting FAIL, check
whether any preactivation lies within h of a kink; if so report INCONCLUSIVE and
re-draw inputs away from the kink.

Reference implementation (runnable):

```python
import numpy as np
def grad_check(f, gradf, x, eps=1e-5):
    x = np.asarray(x, dtype=np.float64)          # not optional
    ga = np.asarray(gradf(x), dtype=np.float64)
    gn = np.zeros_like(x)
    it = np.nditer(x, flags=["multi_index"])
    while not it.finished:
        i = it.multi_index; old = x[i]
        x[i] = old + eps; fp = f(x)
        x[i] = old - eps; fm = f(x)
        x[i] = old
        gn[i] = (fp - fm) / (2 * eps)
        it.iternext()
    denom = np.maximum(np.abs(ga), np.abs(gn))
    rel = np.where(denom == 0, 0.0, np.abs(ga - gn) / np.maximum(denom, 1e-30))
    return rel.max()
```

Framework checkers first, hand-roll second:
- `torch.autograd.gradcheck(fn, inputs)` — designed for double precision; float32
  inputs warn and then fail on correct code. Raises `GradcheckError` (a RuntimeError
  subclass — measured on torch 2.5.1; the docs page does not name the class). Docs:
  https://docs.pytorch.org/docs/2.9/generated/torch.autograd.gradcheck.gradcheck.html
- `scipy.optimize.check_grad` — returns an ABSOLUTE 2-norm (normalize by ‖grad‖
  before thresholding) and uses a FORWARD difference (O(h), one order worse than
  centered). Good smoke test only.
  https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.check_grad.html

Preconditions (CS231n): reg=0 first (check data loss alone), dropout/augmentation
off, check a few dimensions from EVERY parameter tensor (not a uniform sample of the
flattened vector), use 2–3 datapoints.

## 2. Overfit-a-tiny-batch

Train on ≤20 examples (as few as 2) with regularization, dropout, and augmentation
disabled; assert **train accuracy reaches 1.0** (or loss < 1e-2). Sources: CS231n
("make sure you can achieve zero cost"); Karpathy's recipe ("overfit a single
batch", https://karpathy.github.io/2019/04/25/recipe/); Google's ML Test Score
("purposefully train a model for overfitting" — quote is in the paper PDF,
https://storage.googleapis.com/gweb-research2023-media/pubtools/4156.pdf; landing
page:
https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/).

Measured discrimination: correct gradient → loss 1.0986→0.0079, acc 1.00; gradient
with one sign flipped → loss 1.0986→406, acc 0.25. Threshold on final accuracy/loss,
never on "loss went down a bit" — a broken gradient can still reduce loss. Avoid
golden-file assertions ("loss == last run's 0.00734"); the ML Test Score paper warns
they break without insight.

## 3. Initial-loss sanity

At initialization with a near-zero final layer, expected loss is a known constant:

| Head | Expected init loss |
|---|---|
| softmax CE, C classes | `-log(1/C) = log C` (C=10 → 2.302585, C=2 → 0.693147) |
| binary CE at p=0.5 | `log 2 = 0.693147` |
| imbalanced BCE, bias = log-odds of p | `-(p·log p + (1-p)·log(1-p))` |
| MSE, output bias = mean(y) | `Var(y)` |

Measured to machine epsilon with zero-init final layers, so `|L0 - log C| < 0.05` is
a generous gate. Failure signatures: loss far above log C → bad init or logit scale;
loss ≈ 0 at init → label leakage into the input.

**What this probe canNOT see: double-softmax.** Softmax is shift-invariant, so with
a near-zero final layer both `CE(logits)` and `CE(softmax(logits))` evaluate to
exactly log C (measured: 2.3025853633880615 bit-identical for both variants, C=10).
Feeding softmax output to `CrossEntropyLoss` does NOT move the init loss; detect it
with a logit-scale check (the tensor handed to CE must be unnormalised — rows must
not sum to 1, entries should go negative) or with the overfit-tiny-batch loss floor
(measured: correct variant reaches 4e-5, double-softmax plateaus at ≈1.46 on the
same 8-row batch). See section 10.
Also cheap: the input-independent baseline (zero out all inputs; the model should
learn nothing beyond the base rate — if it still performs, labels are leaking).

## 4. Loss-decreases probe

One-step and k-step versions. ML Test Score: training a model "for a single step of
gradient descent" on random data catches a host of library mistakes. For full-batch
GD on a near-convex objective, assert strict monotone decrease over ~50 steps
(measured: sign-flipped gradient breaks monotonicity immediately). For SGD, assert
`mean(last k losses) < mean(first k)` — strict monotonicity false-fails on minibatch
noise.

## 5. Seed determinism

In-process: seed everything (`random.seed`, `np.random.seed`, `torch.manual_seed`),
run twice, require bitwise-identical outputs (`torch.equal` / array bytes hash).
Enable `torch.use_deterministic_algorithms(True)` so known-nondeterministic ops raise
(PyTorch notes: https://docs.pytorch.org/docs/stable/notes/randomness.html — also
states results are NOT guaranteed reproducible across versions, platforms, or
CPU↔GPU).

**Cross-process is a separate probe and catches different bugs.** Measured: hashing
`"".join(vocab_set)` produced three distinct values across three fresh subprocesses
(Python string-hash randomization varies BETWEEN processes only), while the sorted
join was stable. So: (a) re-run in a fresh subprocess, (b) hash output bytes,
(c) compare; and separately flag any iteration over an unsorted set/dict-of-str used
to build vocabularies or label maps. **This probe must run with `PYTHONHASHSEED`
unset** — the sandbox wrapper's `PYTHONHASHSEED=0` pin disables hash randomization
and makes the probe falsely CONFIRM determinism on order-dependent code (measured:
identical hashes across three subprocesses with the pin, three distinct without).
This is the documented exception in `runtime-audit.md` section 4.

scikit-learn nuance (https://scikit-learn.org/stable/common_pitfalls.html):
`random_state=int` → same result every `fit`/`split` call; a RandomState instance or
None → different each call, and `clone()` shares the instance. Passing ints to CV
splitters is the safest option; a global `np.random.seed(0)` is explicitly advised
against.

## 6. Shape / dtype audit

- Assert `pred.shape == target.shape` before every loss call. The silent killer:
  `mse_loss(pred_(n,1), target_(n,))` broadcasts to (n,n) with only a UserWarning
  (measured loss 2.0033 vs correct 2.0003). NumPy warns not at all.
- Promote UserWarning to error for the probe's duration.
- `torch.testing.assert_close` checks values, dtype, and device in one call.
- NaN/Inf tripwires: `np.isfinite(x).all()`, `torch.isfinite(t).all()`,
  `torch.autograd.set_detect_anomaly(True)`; also monitor the dead-ReLU fraction.
- Integer/precision traps (measured): `np.arange(5)//2` floors silently;
  float32 counters stall at 2**24 (`float32(2**24)+1 == 2**24` is True), float16 at
  2**11; bfloat16 eps is 7.8e-3.

## 7. Metamorphic relations for ML

When no oracle exists, relate the outputs of two runs (Segura et al., IEEE TSE 2016,
https://eprints.whiterose.ac.uk/id/eprint/110335/1/segura16-tse.pdf). The battery
below is *adapted from* Xie et al. 2011
(https://pmc.ncbi.nlm.nih.gov/articles/PMC3082144/) — where a relation deliberately
differs from Xie's original, the difference is stated, because the original and the
variant have different validity classes:

Each relation is necessary only for the learner class noted — asserting it outside
that class produces false REFUTED on correct code:

- training-row permutation → same predictions — **batch/closed-form learners only**
  (k-NN, exact least squares, tree with deterministic ties); not one of Xie et al.'s
  MRs — added from common practice. NOT necessary for SGD or any online/minibatch
  learner: the update sequence depends on row order by construction (measured: a
  correct SGD-trained net, identical seed and shuffling stream, row order alone
  changed → 0.86 label agreement).
- feature-order permutation (applied to train AND test) → same predictions —
  general, modulo tie-breaking.
- class-label permutation → correspondingly permuted predictions — general.
- affine transform kx+b (k≠0) of features in train AND test → same predictions —
  **unregularized, scale-equivariant learners only** (see the L2 measurement below).
- duplicate-all-samples → same predictions — a deliberately *stronger* variant of
  Xie's MR-3.2, which duplicates only the samples of ONE label class (Xie's
  original is a necessary property for k-NN; duplicate-ALL is not). Valid for
  **unregularized, non-distance-based learners only**: duplicating every row
  doubles the data term, which halves effective regularization (measured: L2
  logistic regression at C=0.05 → 0.99 agreement, i.e. a real prediction change on
  correct code), and halves effective k for k-NN.
- add uninformative feature → same predictions — two distinct relations, do not
  conflate them: Xie's MR-2.1 adds a **constant** uninformative attribute and IS
  necessary even for k-NN (a constant feature leaves every Euclidean distance
  unchanged); the variant used here adds a **varying** uninformative feature, which
  is **NOT necessary for distance-based models** (measured: 3-NN → 0.875–0.897
  agreement on correct code) and is necessary only for learners that can assign it
  zero weight — and even then only approximately under regularization.

**Declare relations per algorithm — Xie et al. split them into "necessary" (violation
= bug) vs "validation-only" (violation = design property), and the split differs by
model.** Measured: k-NN legitimately violates duplicate-all (94.7% agreement —
duplicating every point halves effective k); L2-regularized logistic regression
violates exact affine invariance (k=0.01 scaling → only 66% label agreement, because
the penalty is not scale-invariant). For regularized models: assert labels only with
moderate k, or set penalty off, or wrap in a StandardScaler pipeline (measured 1.000).
A metamorphic REFUTED counts only when the relation is necessary for the learner
class under test; otherwise the probe is invalid for that claim — record it as
PROBE_INVALID, not REFUTED.

High-yield relations beyond the classic battery (all one forward+backward):
- **Batch-mixing probe**: `d out[i] / d x[j] == 0` for j≠i (Karpathy's "use backprop
  to chart dependencies"). Catches reshape/transpose errors that mix batch and
  feature axes. Run in `.eval()` — BatchNorm legitimately mixes in train mode
  (measured cross-row grad 1.10 with BN, 0.0 without).
- **Causal-leak probe**: `d out[t] / d x[t+1:] == 0`. Caught a symmetric-padded conv
  posing as causal (future grad 1.07 vs 0.0 for true causal). The cheapest test for
  broken attention masks and off-by-one target shifts.
- **Permutation invariance** for set models: measured 6e-8 (float noise) for a
  correct DeepSets vs 3e-1 for a broken one.

For sklearn estimators, `sklearn.utils.estimator_checks.check_estimator` runs a
machine-readable battery of these
(https://scikit-learn.org/stable/modules/generated/sklearn.utils.estimator_checks.check_estimator.html).
Its tolerances — read from the implementation, `sklearn/utils/estimator_checks.py`
at 1.9.0; the docs page does not state them: subset invariance atol=1e-7,
sample-order invariance atol=1e-9, fit-idempotence compares **outputs, not fitted
parameters** — copy that principle.

## 8. Reference-implementation comparison and tolerance policy

Compare against an established implementation (scipy/sklearn/framework) on the same
inputs, or against known-value anchors that need no library at all:
`log_loss([0,1],[0.5,0.5]) == ln 2`; softmax of a constant vector is uniform;
`logsumexp(zeros(n)) == log n`; AUC of a perfect ranker 1.0 / reversed 0.0 /
constant 0.5; probability rows sum to 1; covariance PSD.

Two measured false-failure modes:
1. **Sign/permutation ambiguity**: PCA components vs SVD Vt differed by 1.71 raw but
   5e-15 comparing |A| vs |B|. Compare invariants (abs values, reconstruction,
   principal angles; adjusted_rand_score for cluster labels), never raw
   eigenvectors or label integers.
2. **ddof conventions**: StandardScaler matches `np.std(ddof=0)` exactly and differs
   from ddof=1 by 2.7e-3 — enough to look like a bug at rtol=1e-7. Identify the
   convention before comparing (that is a Channel A claim; here, probe both).

Tolerance policy (defaults people confuse: `np.allclose` rtol=1e-5/atol=1e-8;
`np.testing.assert_allclose` rtol=1e-7/atol=0; `torch.testing.assert_close`
per-dtype — float64 1e-7, float32 1.3e-6/1e-5, float16 1e-3, bfloat16 1.6e-2):

| Situation | rtol | atol |
|---|---|---|
| float64 vs float64, same algorithm | 1e-12 | 1e-12 |
| float64, different algorithm (SVD vs normal eqns, iterative) | 1e-7 | 1e-10 |
| float32 vs float64 reference | 1.3e-6 | 1e-5 |
| float16 / bfloat16 | 1e-3 / 1.6e-2 | 1e-5 |
| integers, booleans, labels | 0 | 0 |

Traps: `np.allclose` is not symmetric (rtol multiplies |b| — pass the reference
second) and its default atol=1e-8 lets a 100% relative error pass near zero
(measured: `allclose(float32(1e-8), float32(2e-8))` is True). Near zero, set atol=0
and use relative error. Conversely `assert_allclose`'s atol=0 false-fails when both
values should be zero — set a small explicit atol then.

## 9. Data leakage checks

Rule (scikit-learn, verbatim): "never call `fit` on the test data"
(https://scikit-learn.org/stable/common_pitfalls.html).

The convincing demo (measured, <1 s): on pure noise (100×5000, random labels, true
accuracy 0.50), `SelectKBest` fit before the split → test accuracy **0.84**; the
same selector inside a `Pipeline` → **0.48**. Leakage is the failure mode that makes
broken code look GOOD, so these probes are mandatory for any train/eval code:

- **Pipeline structure**: any `fit`/`fit_transform` on pre-split data, or on
  variables named `*test*`/`*val*` (AST/grep — static, high precision).
- **Fitted-statistics check**: compare `scaler.mean_` etc. against train-only
  statistics; mismatch means it saw more than train. No retraining needed.
- **Row overlap**: hash rows (`r.tobytes()`); intersect train/test sets. Also count
  exact duplicates in the full dataset before splitting.
- **Group leakage**: no group ID on both sides of a split (GroupKFold semantics).
- **Temporal leakage**: `max(train_time) < min(test_time)`.
- **permutation_test_score** on a clean pipeline (measured: leaky setup p=0.0099 —
  note it CANNOT detect upstream leakage since it shuffles y outside the estimator;
  clean pipeline on noise p=0.83). Use only on a full pipeline with no pre-split
  processing.

Taxonomy for reporting: Kapoor & Narayanan (arXiv:2207.07048) — L1 no clean
train/test separation (incl. preprocessing/feature-selection on all data,
duplicates), L2 illegitimate features, L3 test set from the wrong distribution
(temporal, grouped, sampling bias). Leakage affected 329 published papers across
17 fields.

## 10. Commonly hallucinated / silently-wrong ML API patterns

LOUD (a construct-and-fit smoke probe catches these — TypeError/ValueError):
Keras-style kwargs in torch (`use_bias`, `from_logits`, `learning_rate` on Adam),
singular/plural kwarg typos (`n_estimator`), `fit(..., epochs=)` on sklearn,
`torch.softmax(t)` missing `dim`.

SILENT (no exception — needs semantic tripwires from sections 3–8):

| Pattern | Measured symptom | Tripwire |
|---|---|---|
| softmax fed to `CrossEntropyLoss` | init loss UNCHANGED (≈ log C — softmax is shift-invariant, the section-3 tripwire is blind to this bug); training plateaus at a high loss floor (measured ≈1.46 vs 4e-5 correct on an 8-row batch) | logit-scale check: tensor fed to CE must be unnormalised (rows not summing to 1, negative entries); overfit-tiny-batch loss floor |
| softmax fed to `NLLLoss` (wants log-softmax) | loss −0.7285 (negative!) | assert CE/NLL loss ≥ 0 |
| `BCELoss(logits)` where `BCEWithLogitsLoss` meant | instability/NaN at large |z| | isfinite tripwire |
| missing `optimizer.zero_grad()` | grads exactly 2×, 3×, ... | grad-ratio probe |
| missing `model.eval()` at inference | dropout active, outputs vary per call | two identical calls differ |
| `(n,1)` vs `(n,)` in a loss | broadcast to (n,n), wrong loss, UserWarning only | shape-equality assert |
| `np.argmax` without `axis` | flat index returned | shape assert on result |
| `roc_auc_score(y, hard_labels)` | silently a different metric | require float scores |
| deprecated spellings for the installed version (`penalty='l2'`, `np.trapz`, `multi_class=`) | FutureWarning or AttributeError | warnings-as-errors run + version pin (Channel A cross-checks) |

Package-level hallucination remains the base-rate threat (≥5.2% commercial models,
21.7% open-source, and self-consistent across resamples — arXiv:2406.10279): the
import probe from runtime-audit.md runs first, always.
