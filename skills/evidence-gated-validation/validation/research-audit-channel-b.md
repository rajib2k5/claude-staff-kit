# Channel B record — runtime audit (research-corpus ledger)

Channel: B (runtime auditor, empirical only — no web, no documentation, no
channel-A files read). Ledger:
/home/<user>/dev/evidence-gated-validation/validation/research-audit-ledger.md
(frozen before this channel ran). Work dir:
<session-scratchpad>/research-audit-b/
Date: 2026-08-30. Environment: DGX Spark (arm64), python3 with torch 2.5.1,
ollama local. All commands run under timeout.

Scope note: R1–R15 are literature claims scoped A — N/A-by-construction for this
channel and not touched here. This record covers RB1 and RB2 only.

---

## RB2 — derived arithmetic recomputation

Method: recomputed each derived figure in python3 (single command, output copied
verbatim below) and compared against the stated rounding in the ledger row.

Command output (verbatim):

```
429/115.36 = 3.7187933425797506
387.44/130.99 = 2.9577830368730433
1 - 2.18/9 = 0.7577777777777778
61/65 = 0.9384615384615385
61/65 as % = 93.84615384615384
```

Comparison against stated roundings:

| Stated | Recomputed | Consistent? |
|---|---|---|
| 429/115.36 ≈ 3.7× | 3.7187933425797506 | yes (rounds to 3.7) |
| 387.44/130.99 ≈ 3× ("roughly 3×") | 2.9577830368730433 | yes (≈2.96, fairly described as roughly 3×) |
| 1 − 2.18/9 ≈ 0.758 ("~three-quarters of nominal independence lost") | 0.7577777777777778 | yes (rounds to 0.758; ~76% ≈ three-quarters) |
| 61/65 ≈ 93.8% | 93.84615384615384% | yes (rounds to 93.8%) |

**Verdict RB2: CONFIRMED.** Every recomputed value matches the stated rounding;
no contradiction with the falsifier ("any recomputed value contradicts the
stated rounding").

---

## RB1 — local replication probe (self-review-fails, directional)

### Setup

`timeout 30 ollama list` output (verbatim):

```
NAME                                                         ID              SIZE      MODIFIED
qwen3.8:27b                                                  603ce507f0fd    18 GB     2 weeks ago
hf.co/unsloth/Qwen3.8-27B-GGUF:Q4_K_M                        603ce507f0fd    18 GB     2 weeks ago
qwen3-vl:30b                                                 eda0be100877    19 GB     2 weeks ago
qwen3.6:35b                                                  07d35212591f    23 GB     2 weeks ago
qwen3-vl:8b                                                  901cae732162    6.1 GB    2 weeks ago
qwen3:8b                                                     500a1f067a9f    5.2 GB    2 weeks ago
nemotron-3-nano:latest                                       b725f1117407    24 GB     7 weeks ago
hf.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF:Q4_K_M    7c3d0c28e4db    6.8 GB    2 months ago
qwen3.6:latest                                               07d35212591f    23 GB     2 months ago
```

Strongest available instruct model selected for fresh runs: **qwen3.6:35b**,
invoked fresh each run as `timeout 300 ollama run qwen3.6:35b --think=false
"$(cat prompt.txt)"` (the `--think=false` flag was accepted; exit 0 every run).

Prompt (verbatim, `prompt.txt`): the exact instruction "Review this PyTorch
training code carefully. Is it correct? If anything is wrong, name the bug(s).
Be decisive." followed by the exact buggy snippet from
/home/<user>/dev/evidence-gated-validation/references/claim-extraction.md
section 6 (softmax fed into CrossEntropyLoss; no zero_grad).

Evidence base: 5 verbatim transcripts from a prior interrupted attempt already
present in the work dir (run1–run5.txt, produced with the identical prompt.txt;
originating model not recorded in those files — scored as permitted by the
channel instructions) plus 5 fresh provenance-documented runs with qwen3.6:35b
(fresh_run1–fresh_run5.txt). Total N = 10 independent invocations.

### Scoring rule

A run counts as a HIT only if it identifies that softmax output is fed to
CrossEntropyLoss (which applies log-softmax internally). Mentioning zero_grad
alone does not count.

### Results

| Run | Source | Softmax bug identified? |
|---|---|---|
| run1 | prior transcript | HIT ("Redundant torch.softmax before CrossEntropyLoss ... expects logits ... internally applies log-softmax") |
| run2 | prior transcript | HIT ("expects raw, unnormalized scores (logits) ... internally applies log_softmax and NLLLoss") |
| run3 | prior transcript | HIT ("Double Application of Softmax ... internally applies LogSoftmax") |
| run4 | prior transcript | HIT ("Double Softmax ... CrossEntropyLoss internally applies log_softmax") |
| run5 | prior transcript | HIT ("Double Softmax ... internally applies log_softmax") |
| fresh_run1 | qwen3.6:35b | HIT ("expects raw, unnormalized logits ... already applies the log-softmax internally") |
| fresh_run2 | qwen3.6:35b | HIT ("expects the raw logits ... applies log-softmax internally") |
| fresh_run3 | qwen3.6:35b | HIT ("expects raw logits, not probabilities ... internally applies log-softmax") |
| fresh_run4 | qwen3.6:35b | HIT ("expects raw logits (unnormalized scores) ... mathematically incorrect") |
| fresh_run5 | qwen3.6:35b | HIT ("expects raw logits ... internally applies log-softmax") |

**LLM hit-rate: 10/10.** The LLM caught the softmax bug in every run; the
"misses the bug in at least one run" half of the compound claim was NOT
observed.

### Mechanical probe (overfit-8, both variants, 2 independent runs)

Script: overfit8_probe.py in the work dir — 8 fixed examples, identical init
and data between variants within a run, Adam lr=3e-4, 5000 steps, no
regularization. Output (verbatim):

```
seed=0 variant=buggy loss_floor=1.4612 train_acc=1.00
seed=0 variant=correct loss_floor=0.000180943 train_acc=1.00
seed=1 variant=buggy loss_floor=1.46122 train_acc=1.00
seed=1 variant=correct loss_floor=0.000228393 train_acc=1.00
```

Probe flagged the bug 2/2 runs: buggy floors 1.4612 and 1.46122 (inside the
claimed ~1.4–1.5 band, matching the ledger's ≈1.46), correct floors 1.81e-4 and
2.28e-4 (both < 1e-2). Deterministic in the sense required: same qualitative
flag both runs, floors agreeing to 4 significant figures.

### Verdict

**RB1: REFUTED** under the channel's pre-registered scoring rule ("REFUTED if
the LLM caught it in every run"). Recorded honestly: this is small-n and
directional only. The compound claim's two halves split — the mechanical-probe
half held exactly as stated (2/2 deterministic flags, floor ≈1.46 vs <1e-2),
but the LLM-miss half failed at n=10 with the strongest local model. Note the
ledger's own falsifier column is stricter (it requires the probe to also be
nondeterministic for refutation); by that stricter reading the claim would be
"not confirmed" rather than refuted — flagged for the adjudicator. Either way
the claim as written ("misses the bug in at least one run") was not reproduced
locally. Caveat: a 35B-class local model in 2026 is plausibly stronger at this
canonical bug than the models the literature measured; this does not overturn
the cited literature (out of scope for this channel), it only reports that the
local directional replication did not reproduce the miss.

---

## Verbatim transcripts (evidence for RB1)

Cleaned of terminal control sequences only (raw files with escape codes are
preserved alongside in the work dir). Streaming line-rewrite artifacts (a word
duplicated across a wrapped line boundary) are an artifact of `ollama run`'s
TTY output, not of the model.

### run1
```
Yes, there are bugs. Here are the decisive issues:

1.  **`opt.zero_grad()` is missing:** PyTorch accumulates gradients by defa
default. Without calling `opt.zero_grad()` before `loss.backward()` (or at 
the start of the iteration), gradients from the previous batch will be adde
added to the new gradients, leading to incorrect updates.
2.  **Redundant `torch.softmax` before `CrossEntropyLoss`:** `nn.CrossEntro
`nn.CrossEntropyLoss` expects **logits** (raw, unnormalized scores) as inpu
input, not probabilities. It internally applies `log-softmax` and the cross
cross-entropy loss. Passing probabilities (output of `torch.softmax`) cause
causes the loss to be computed on already-normalized values, which is mathe
mathematically incorrect and can lead to poor training dynamics or instabil
instability.

**Corrected code snippet:**
```python
for epoch in range(50):
    for X, y in loader:
        opt.zero_grad()  # Fix 1: Reset gradients
        logits = model(X) # Fix 2: Use raw logits
        loss = loss_fn(logits, y) # Pass logits, not probs
        loss.backward()
        opt.step()
```

```

### run2
```
The code contains **two bugs**.

### Bug 1: Missing `opt.zero_grad()`
The optimizer's gradients are not zeroed out before computing the backward 
pass. In PyTorch, gradients accumulate by default. Without calling `opt.zer
`opt.zero_grad()` at the beginning of each training step, the gradients fro
from previous batches (and previous epochs) will sum up, leading to incorre
incorrect weight updates and likely divergence or slow convergence.

### Bug 2: Incorrect use of `CrossEntropyLoss`
`nn.CrossEntropyLoss` expects **raw, unnormalized scores** (logits) as inpu
input, not probabilities. It internally applies `log_softmax` and `NLLLoss`
`NLLLoss`. By applying `torch.softmax` manually before passing to `loss_fn`
`loss_fn`, you are feeding already-normalized probabilities into a function
function that expects logits. This results in an incorrect loss calculation
calculation.

---

### Corrected Code:
```python
import torch, torch.nn as nn

model = nn.Sequential(nn.Linear(20, 64), nn.ReLU(), nn.Linear(64, 10))
opt = torch.optim.Adam(model.parameters(), lr=3e-4)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(50):
    for X, y in loader:
        opt.zero_grad()          # Fix 1: Zero gradients
        logits = model(X)        # Fix 2: Use raw logits
        loss = loss_fn(logits, y)
        loss.backward()
        opt.step()
```

```

### run3
```
The code is **incorrect**. There are two distinct bugs.

### 1. Double Application of Softmax (Logic Error)
**The Bug:** You apply `torch.softmax` to the model output and then pass th
those probabilities into `nn.CrossEntropyLoss`.
**Why it's wrong:** `nn.CrossEntropyLoss` internally applies `LogSoftmax` t
to the raw model outputs (logits) before computing the loss. By applying `s
`softmax` first, you are passing probabilities to a function expecting logi
logits. This results in computing the log of a probability (double normaliz
normalization), which is mathematically incorrect and distorts the gradient
gradient signal.
**Fix:** Pass the raw model output (logits) directly to `loss_fn`:
```python
logits = model(X)
loss = loss_fn(logits, y) # Remove torch.softmax
```

### 2. Missing Optimizer State Reset (Optimization Bug)
**The Bug:** You call `opt.step()` inside the data loader loop but never ca
call `opt.zero_grad()`.
**Why it's wrong:** PyTorch accumulates gradients in `param.grad` by defaul
default. Without `opt.zero_grad()` at the start of each iteration (or befor
before `loss.backward()`), gradients from the previous batch will accumulat
accumulate and be added to the current batch's gradients. This leads to inc
incorrect weight updates and unstable or failed training.
**Fix:** Add `opt.zero_grad()` at the beginning of the loop body:
```python
for epoch in range(50):
    for X, y in loader:
        opt.zero_grad()  # <-- Add this
        logits = model(X)
        loss = loss_fn(logits, y)
        loss.backward()
        opt.step()
```

### Corrected Code
```python
import torch, torch.nn as nn

model = nn.Sequential(nn.Linear(20, 64), nn.ReLU(), nn.Linear(64, 10))
opt = torch.optim.Adam(model.parameters(), lr=3e-4)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(50):
    for X, y in loader:
        opt.zero_grad()          # Bug 2 Fix: Reset gradients
        logits = model(X)        # Bug 1 Fix: Use raw logits
        loss = loss_fn(logits, y) # Bug 1 Fix: No explicit softmax
        loss.backward()
        opt.step()
```

```

### run4
```
The code contains **two bugs**.

### 1. Double Softmax (Logical Error)
You are passing `probs` (which has already had `torch.softmax` applied) int
into `nn.CrossEntropyLoss`. `CrossEntropyLoss` internally applies `log_soft
`log_softmax` to its input. Applying softmax and then log-softmax is mathem
mathematically incorrect and will produce wrong gradients and loss values.
**Fix:** Pass the raw logits directly: `loss = loss_fn(model(X), y)`.

### 2. Missing Optimizer Reset (Stateful Error)
You call `opt.step()` after `loss.backward()`, but you never call `opt.zero
`opt.zero_grad()`. By default, PyTorch accumulates gradients into the `.gra
`.grad` attribute of parameters. Without zeroing them, gradients from previ
previous iterations (and epochs) will accumulate, causing the optimizer to 
step based on the sum of all past gradients rather than the current batch's
batch's gradient. This typically leads to exploding gradients and divergenc
divergence.
**Fix:** Add `opt.zero_grad()` before `loss.backward()`.

### Corrected Code
```python
for epoch in range(50):
    for X, y in loader:
        opt.zero_grad()                # <-- Added
        logits = model(X)              # <-- Removed softmax
        loss = loss_fn(logits, y)      # <-- Pass logits
        loss.backward()
        opt.step()
```

```

### run5
```
The code contains **three distinct bugs**. Here is the decisive breakdown:

### 1. Double Softmax (Mathematical Error)
**Bug:** You manually apply `torch.softmax` and then pass the result to `nn
`nn.CrossEntropyLoss`.
**Why it's wrong:** `nn.CrossEntropyLoss` internally applies `log_softmax` 
to the input. By pre-applying softmax, you are effectively computing `Cross
`CrossEntropy(softmax(logits))`, which distorts the loss landscape and grad
gradients.
**Fix:** Pass raw logits directly: `loss = loss_fn(model(X), y)`.

### 2. Missing Optimizer State Reset
**Bug:** `opt.zero_grad()` is never called.
**Why it's wrong:** PyTorch accumulates gradients in `.grad` attributes acr
across backward passes. Without zeroing them out, gradients from previous b
batches will accumulate and corrupt the weight updates.
**Fix:** Add `opt.zero_grad()` at the beginning of each iteration (before `
`loss.backward()`).

### 3. No Gradient Clipping or Learning Rate Warmup (Minor but Critical for
for Stability)
**Bug:** While not a syntax error, `lr=3e-4` with Adam is reasonable, but t
the combination of the above bugs will cause divergence. However, the prima
primary "bugs" are the first two.

---

### Corrected Code
```python
import torch, torch.nn as nn

model = nn.Sequential(nn.Linear(20, 64), nn.ReLU(), nn.Linear(64, 10))
opt = torch.optim.Adam(model.parameters(), lr=3e-4)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(50):
    for X, y in loader:
        opt.zero_grad()          # FIX 1: Reset gradients
        logits = model(X)        # FIX 2: Use raw logits
        loss = loss_fn(logits, y) # FIX 3: CrossEntropyLoss handles softmax
softmax internally
        loss.backward()
        opt.step()
```

### Summary of Bugs
1. **Double Softmax**: `torch.softmax` + `CrossEntropyLoss` is incorrect.
2. **Missing `opt.zero_grad()`**: Gradients accumulate across batches.

```

### fresh_run1
```
There are two critical bugs in this code:

1. **Missing `opt.zero_grad()`**: The gradients accumulate across iteration
iterations because `zero_grad()` is never called before `loss.backward()`. 
This causes incorrect gradient updates and memory leaks.

2. **Passing probabilities instead of logits to `CrossEntropyLoss`**: `nn.C
`nn.CrossEntropyLoss` expects raw, unnormalized logits (the direct output o
of the model), not softmax-normalized probabilities. Using `torch.softmax(m
`torch.softmax(model(X))` before passing to `CrossEntropyLoss` is mathemati
mathematically incorrect because `CrossEntropyLoss` already applies the log
log-softmax internally. This leads to wrong loss values and gradients.

**Fix**: Remove the `torch.softmax` call and pass `model(X)` directly to `l
`loss_fn`, and add `opt.zero_grad()` before `loss.backward()`.

```

### fresh_run2
```
There are **two critical bugs** and one logical error.

### Bug 1: Missing `opt.zero_grad()`
**Critical Error:** The gradients accumulate across iterations because `opt
`optimizer.zero_grad()` is never called before `loss.backward()`. This caus
causes the training to fail catastrophically (gradients explode or behave u
unpredictably) after the first few batches.

### Bug 2: Feeding Softmax Probes into CrossEntropyLoss
**Logical/Implementation Error:** You compute `probs = torch.softmax(model(
torch.softmax(model(X), dim=1)` and pass `probs` to `CrossEntropyLoss`. **T
**This is incorrect.**  
`nn.CrossEntropyLoss` expects the **raw logits** from the model, not probab
probabilities. It applies log-softmax internally for numerical stability. F
Feeding softmax outputs into CrossEntropyLoss causes:
- Incorrect gradients due to double non-linearity.
- Potential numerical instability (log of values close to 0).
- Model will likely fail to converge or learn poorly.

### Additional Issue: No `opt.zero_grad()` in the loop
As stated above, without resetting gradients, backpropagation accumulates t
them indefinitely.

---

### Corrected Code

```python
import torch
import torch.nn as nn

model = nn.Sequential(nn.Linear(20, 64), nn.ReLU(), nn.Linear(64, 10))
opt = torch.optim.Adam(model.parameters(), lr=3e-4)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(50):
    for X, y in loader:
        opt.zero_grad()  # Bug fix 1: Zero gradients before backward pass
        logits = model(X)               # Bug fix 2: Pass raw logits, not s
softmax probabilities
        loss = loss_fn(logits, y)       # CrossEntropyLoss expects logits
        loss.backward()
        opt.step()
```

### Summary of Fixes
1. **Added `opt.zero_grad()`** before `loss.backward()`.
2. **Removed `torch.softmax`** and passed raw `logits` directly to `CrossEn
`CrossEntropyLoss`.

```

### fresh_run3
```
Yes. The code is **incorrect**. There are two critical bugs:

1. **Missing `opt.zero_grad()`**: Gradients accumulate across iterations if
if not cleared. This leads to exploding gradients and incorrect updates.
2. **Double probability computation**: `model(X)` already outputs logits fo
for `nn.CrossEntropyLoss`, which expects raw logits, not probabilities. App
Applying `torch.softmax` before the loss function is wrong (and numerically
numerically less stable). `CrossEntropyLoss` internally applies log-softmax
log-softmax.

```

### fresh_run4
```
Yes, the code is **incorrect**. There are two critical bugs:

1.  **Missing `opt.zero_grad()`**: Gradients accumulate across iterations b
because `optimizer.zero_grad()` is never called before `loss.backward()`. T
This causes the loss to be minimized on summed gradients from all previous 
steps in the epoch, leading to numerical overflow or meaningless updates.
2.  **Incorrect Input to `CrossEntropyLoss`**: The code passes `probs` (sof
(soft probabilities) to `nn.CrossEntropyLoss`, but `CrossEntropyLoss` expec
expects **raw logits** (unnormalized scores). Using softmax output with `Cr
`CrossEntropyLoss` is mathematically incorrect and unstable (and the functi
function explicitly warns against this or treats inputs as logits, yielding
yielding wrong results).

**Fix:**
```python
for epoch in range(50):
    for X, y in loader:
        opt.zero_grad()  # <-- Fix 1: Zero gradients
        logits = model(X)     # <-- Get logits directly from model
        loss = loss_fn(logits, y)  # <-- Feed logits to CrossEntropyLoss
        loss.backward()
        opt.step()
```

```

### fresh_run5
```
Yes, there are critical bugs in this code.

### Bugs Identified:

1. **Missing Gradient Zeroing**: `opt.zero_grad()` is called before `loss.b
`loss.backward()`. Without it, gradients accumulate across iterations, lead
leading to exploding gradients or incorrect updates. This is a common and s
severe mistake in PyTorch training loops.

2. **Using Probabilities as Input to CrossEntropyLoss**: `nn.CrossEntropyLo
`nn.CrossEntropyLoss` expects **raw logits** (unnormalized scores), not sof
softmax probabilities. Passing `torch.softmax(model(X), dim=1)` into `Cross
`CrossEntropyLoss` is mathematically incorrect because `CrossEntropyLoss` i
internally applies log-softmax. Feeding pre-softmaxed values leads to gradi
gradient instability and poor convergence.

### Corrected Code:
```python
import torch, torch.nn as nn

model = nn.Sequential(nn.Linear(20, 64), nn.ReLU(), nn.Linear(64, 10))
opt = torch.optim.Adam(model.parameters(), lr=3e-4)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(50):
    for X, y in loader:
        logits = model(X)  # Get raw logits
        loss = loss_fn(logits, y)  # CrossEntropyLoss handles softmax inter
internally
        opt.zero_grad()  # Zero gradients before backward pass
        loss.backward()
        opt.step()
```

### Summary of Fixes:
- Add `opt.zero_grad()` before `loss.backward()`.
- Remove `torch.softmax`; pass raw logits directly to `CrossEntropyLoss`.

```

