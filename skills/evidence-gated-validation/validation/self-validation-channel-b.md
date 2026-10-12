# Channel B — runtime audit records

Evidence basis: empirical probes ONLY, executed on this machine. No documentation,
web, or changelog consulted. Expected values taken from the frozen ledger
(`self-validation-ledger.md`), never from running the code under test to generate its own
oracle. Probe scripts preserved under
`<session-scratchpad>/channel-b-work/`.

Toolchain in effect (measured this session):
```
python3 3.12.3 (main, Jun 19 2026) [GCC 13.3.0]      /usr/bin/python3
gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0
bash /usr/bin/bash
numpy 2.4.6          ~/.local/lib/python3.12/site-packages (pip --user)
torch 2.5.1          ~/.local (pip --user)
scikit-learn 1.9.0   ~/.local (pip --user)
scipy 1.18.0         ~/.local (pip --user)
PyYAML 6.0.1         /usr/lib/python3/dist-packages
pytest 9.1.1         <project-venv>/bin/pytest
                     (pytest not installed for system python3; venv binary used)
```
Every command run with `timeout`. Scope: all ledger claims marked B or AB
(D1–D12, D15–D18). D13, D14 are A-only → N/A-by-construction for this channel.

Note on ml-validation.md's stated measurement baseline ("numpy 2.4 / torch 2.5 /
scikit-learn 1.9"): the installed stack matches it, so these probes re-measure on
the same major/minor versions the skill claims to have measured on.

---

```
claim_id:      D1
probe_cmd:     timeout 30 python3 d1_probe.py   # yaml.safe_load of SKILL.md frontmatter; key-set, name equality, re.fullmatch(r"^[a-z0-9][a-z0-9-]{0,63}$"), len(description)
rc:            0
stdout:        |
  parsed type: dict
  keys: ['description', 'license', 'name']
  name: 'evidence-gated-validation'
  name==evidence-gated-validation: True
  regex fullmatch: True
  name len: 25
  description len (chars): 521
  description <=1024: True
toolchain:     python3 3.12.3, PyYAML 6.0.1
falsifier_cmd: structural (assertions abort with rc=1 on any mismatch; asserts exercised: key-set equality, regex fullmatch, length gate)
falsifier_rc:  n/a (pure-measurement probe; every branch is a hard assert)
verdict:       CONFIRMED
note:          The clause "these satisfy the Agent Skills spec's required-field
               rules" is docs-decidable and outside Channel B's evidence basis;
               everything measurable (parses as YAML dict, exactly the three keys,
               name value + regex, description 521 <= 1024 chars) is confirmed.
```

```
claim_id:      D2
probe_cmd:     timeout 60 python3 d2_d10_probe.py   (D2 portion; math.log in float64)
rc:            0
stdout:        |
  -log(1/10) = 2.302585092994045
   log(10)   = 2.302585092994046
  -log(1/2)  = 0.693147180559945
   log(2)    = 0.693147180559945
  d10 = 9.299404535312306e-08 d2 = 1.8055994532861774e-07
  D2 ok: True
toolchain:     python3 3.12.3
falsifier_cmd: n/a (direct float64 measurement against claimed constants, 1e-6 gate)
verdict:       CONFIRMED
note:          -log(1/10) and log(10) differ by 1 ulp (4.4e-16); both within 1e-6
               of the claimed 2.302585 / 0.693147.
```

```
claim_id:      D3
probe_cmd:     timeout 300 python3 d3_probe.py
               # 10-class net Linear(20,64)-ReLU-Linear(64,10), final layer zero-init,
               # 8 examples, Adam lr=1e-2, 3000 steps; variant A: CE(logits);
               # variant B: CE(softmax(logits)). Expected values from ledger only.
rc:            0
stdout:        |
  log C            = 2.3025850930
  init  raw        = 2.3025853633880615
  init  softmax    = 2.3025853633880615
  init bit-identical: True
  final raw        = 1.6093239310066565e-06
  final softmax    = 1.4611506462097168
  claim holds (init≈logC both, raw<1e-2, softmax plateau 1.3–1.6): True
toolchain:     python3 3.12.3, torch 2.5.1 (CPU)
falsifier_cmd: timeout 300 python3 d3_falsifier.py   # raw variant in BOTH slots ("both overfit to same floor" scenario)
falsifier_rc:  1
falsifier_out: |
  final raw        = 1.6093239310066565e-06
  final softmax    = 1.6093239310066565e-06
  claim holds (init≈logC both, raw<1e-2, softmax plateau 1.3–1.6): False
verdict:       CONFIRMED
note:          Init losses bit-identical (2.3025853633880615 — the exact value
               ml-validation.md §3 reports) confirming shift-invariance blindness;
               softmax variant plateaus at 1.4612, inside the claimed 1.4–1.5 band;
               raw variant reaches 1.6e-6 < 1e-2.
```

```
claim_id:      D4
probe_cmd:     timeout 300 python3 d4_probe.py   # identical seeded Linear(4,3)+MSE; grad after 1 backward vs after 2 backwards, no zero_grad
rc:            0
stdout:        |
  zero_grad between calls: False
  grad after 1 backward, [0,:2] = [-0.2496861219406128, -0.291363388299942]
  grad after 2 backwards, [0,:2] = [-0.4993722438812256, -0.582726776599884]
  ratio min = 2.0  ratio max = 2.0
  g2 == 2*g1 exactly: True
toolchain:     torch 2.5.1
falsifier_cmd: timeout 300 python3 d4_probe.py zero   # zero_grad() between the two backward calls
falsifier_rc:  1
falsifier_out: |
  ratio min = 1.0  ratio max = 1.0
  g2 == 2*g1 exactly: False
verdict:       CONFIRMED
note:          Ratio is exactly 2.0 elementwise (torch.equal(g2, 2*g1) True), not
               merely approximately.
```

```
claim_id:      D5
probe_cmd:     timeout 200 bash d5_probe.sh
               # find_spec('torch') three ways: normal env; env -i PATH=/usr/bin:/bin HOME=$WORK;
               # same env -i plus PYTHONPATH=$SITEPATH (SITEPATH from site.getsitepackages()+getusersitepackages())
rc:            0
stdout:        |
  == baseline (normal env, outside wrapper) ==
  torch spec: /home/<user>/.local/lib/python3.12/site-packages/torch/__init__.py
  baseline rc=0
  SITEPATH=/usr/local/lib/python3.12/dist-packages:/usr/lib/python3/dist-packages:/usr/lib/python3.12/dist-packages:/home/<user>/.local/lib/python3.12/site-packages
  == bare env -i (no PYTHONPATH) ==
  torch spec: None
  bare rc=1
  == env -i with PYTHONPATH=SITEPATH ==
  torch spec: /home/<user>/.local/lib/python3.12/site-packages/torch/__init__.py
  sitepath rc=0
toolchain:     python3 3.12.3; torch 2.5.1 genuinely pip --user installed under ~/.local (precondition of the claim, verified in baseline)
falsifier_cmd: the bare env -i leg IS the discriminating contrast (rc=1) against the SITEPATH leg (rc=0); baseline outside wrapper rc=0 is the wrapper self-test
falsifier_rc:  1 (bare leg)
verdict:       CONFIRMED
```

```
claim_id:      D6
probe_cmd:     for i in 1 2 3; do env -u PYTHONHASHSEED timeout 30 python3 d6_inner.py; done
               # d6_inner.py: 7-string set; print("".join(s), hash(join))
rc:            0 (each)
stdout:        |
  bananadatefigcherrygrapeappleelderberry -5970852628001091465
  cherrygrapeapplebananadateelderberryfig -1182317903881340355
  elderberrybananacherrydatefiggrapeapple -8463320411196054770
falsifier_cmd: for i in 1 2 3; do PYTHONHASHSEED=0 timeout 30 python3 d6_inner.py; done
falsifier_rc:  0 (each) — opposite MEASUREMENT, per claim structure:
falsifier_out: |
  bananafigcherryapplegrapedateelderberry 475316801870131133
  bananafigcherryapplegrapedateelderberry 475316801870131133
  bananafigcherryapplegrapedateelderberry 475316801870131133
toolchain:     python3 3.12.3
verdict:       CONFIRMED
note:          Unset: 3 distinct join orders AND 3 distinct hashes across fresh
               processes. Pinned to 0: bit-identical string and hash across all 3.
               Also directly evidences the ml-validation §5 warning that the
               wrapper's PYTHONHASHSEED=0 pin would mask this nondeterminism.
```

```
claim_id:      D7
probe_cmd:     timeout 60 gcc -fsyntax-only probe.c
               # probe.c: int main calls definitely_nonexistent_function_xyz(42)
rc:            0
stderr:        |
  probe.c:2:5: warning: implicit declaration of function 'definitely_nonexistent_function_xyz' [-Wimplicit-function-declaration]
falsifier_cmd: timeout 60 gcc -fsyntax-only -Werror=implicit-function-declaration probe.c
falsifier_rc:  1
falsifier_out: |
  probe.c:2:5: error: implicit declaration of function 'definitely_nonexistent_function_xyz' [-Werror=implicit-function-declaration]
  cc1: some warnings being treated as errors
toolchain:     gcc 13.3.0 (Ubuntu 13.3.0-6ubuntu2~24.04.1)
verdict:       CONFIRMED (main clause) — with a measured caveat on the parenthetical
caveat:        |
  The claim's "(or -std=c23)" alternative:
    gcc -fsyntax-only -std=c23 probe.c -> rc=1, BUT for
      "gcc: error: unrecognized command-line option '-std=c23'; did you mean '-std=c2x'?"
      (option does not exist on gcc 13; non-zero rc here does not test the claimed mechanism)
    gcc -fsyntax-only -std=c2x probe.c -> rc=0, still only the warning.
  So on gcc 13.3.0 the C23-mode branch is not realizable as described: the flag is
  unrecognized and its c2x equivalent does NOT error on implicit declarations.
  The parenthetical is version-dependent and UNVERIFIABLE on this toolchain; the
  core behavior (bare -fsyntax-only rc=0; -Werror=implicit-function-declaration
  rc=1) is exactly as claimed. Practical consequence measured here: on gcc 13,
  -Werror=implicit-function-declaration is the ONLY working spelling, which
  strengthens runtime-audit.md §8.1's "MANDATORY flag" advice.
```

```
claim_id:      D8
probe_cmd:     EMPTY=$(mktemp -d); cd $EMPTY; timeout 120 <project-venv>/bin/pytest $EMPTY
rc:            5
stdout:        |
  platform linux -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
  rootdir: /tmp/tmp.YhDqM4Mxc4
  collected 0 items
  ============================ no tests ran in 0.06s =============================
falsifier_cmd: same dir + test_f.py containing "def test_x(): assert 1 == 2"; pytest $EMPTY -q
falsifier_rc:  1
falsifier_out: |
  FAILED test_f.py::test_x - assert 1 == 2
  1 failed in 0.05s
toolchain:     pytest 9.1.1 (venv binary; system python3 has no pytest)
verdict:       CONFIRMED
note:          rc=5 on zero collected, rc=1 on failures — matches both the claim
               and the runtime-audit.md §7 exit-code table.
```

```
claim_id:      D9
probe_cmd:     timeout 60 python3 d9_probe.py
rc:            0
stdout:        |
  numpy version: 2.4.6
  hasattr(np, 'trapz'): False
  AttributeError: module 'numpy' has no attribute 'trapz'
  hasattr(np, 'trapezoid'): True
  np.trapezoid([1,2,3]) = 4.0
toolchain:     numpy 2.4.6
falsifier_cmd: structural — probe exits 1 if np.trapz call SUCCEEDS (that branch is the ledger's falsifier condition)
verdict:       CONFIRMED
note:          Channel B can attest only the installed-numpy half (access fails on
               2.4.6, replacement np.trapezoid works); "removed in numpy 2.0" as a
               historical/changelog fact is Channel A's half.
```

```
claim_id:      D10
probe_cmd:     timeout 60 python3 d2_d10_probe.py   (D10 portion)
rc:            0
stdout:        |
  np.allclose signature: (a, b, rtol=1e-05, atol=1e-08, equal_nan=False)
  defaults: rtol = 1e-05  atol = 1e-08
  np.allclose(float32(1e-8), float32(2e-8)) = True
  relative error between the two values = 1.0
  D10 ok: True
toolchain:     numpy 2.4.6
falsifier_cmd: structural (rc=1 on any default mismatch or expression False)
verdict:       CONFIRMED
note:          Measured relative error between the two compared values is 1.0
               (100%), and allclose still returns True — exactly the trap claimed.
```

```
claim_id:      D11
probe_cmd:     timeout 300 python3 d11_probe.py   # F.mse_loss((50,1),(50,)) vs matched, warnings recorded
rc:            0
stdout:        |
  mismatched shapes (n,1)vs(n,): loss = 2.073237419128418
  warnings raised: 1
    category: UserWarning
    message : Using a target size (torch.Size([50])) that is different to the input size (torch.Size([50, 1])). This will likely lead to incorrect results due to broadcasting. Please ensure they have the same size.
  matched shapes  (n,)vs(n,):  loss = 1.9581704139709473
  warnings on matched call: 0
  loss difference: 0.1150670051574707
  hand-computed (n,n)-broadcast mean: 2.073237419128418
  mismatched loss equals (n,n) broadcast value: True
toolchain:     torch 2.5.1
falsifier_cmd: matched-shape leg is the contrast (no warning, different loss); broadcast mechanism pinned by exact equality with hand-computed ((pred-target)**2 over (n,n)).mean()
verdict:       CONFIRMED
note:          Only a UserWarning (no exception); mismatched loss equals the (n,n)
               broadcast mean bit-for-bit, proving the broadcast-to-(n,n) mechanism,
               and differs from the matched loss by 0.115.
```

```
claim_id:      D12
probe_cmd:     timeout 300 python3 d12_probe.py
               # 5 seeds; X=randn(100,5000), y=randint(0,2,100); leaky: SelectKBest(k=10).fit(X,y)
               # BEFORE 50/50 split then LogisticRegression; clean: same selector inside Pipeline fit on train only
rc:            0
stdout:        |
  seed 0: fit-before-split acc = 0.88   pipeline acc = 0.58
  seed 1: fit-before-split acc = 0.80   pipeline acc = 0.52
  seed 2: fit-before-split acc = 0.86   pipeline acc = 0.46
  seed 3: fit-before-split acc = 0.78   pipeline acc = 0.40
  seed 4: fit-before-split acc = 0.88   pipeline acc = 0.46
  mean fit-before-split = 0.840   mean pipeline = 0.484
  claim (leaky ~0.8+, pipeline ~0.5) holds: True
toolchain:     scikit-learn 1.9.0, numpy 2.4.6
falsifier_cmd: timeout 300 python3 d12_probe.py falsify   # clean pipeline in BOTH slots ("both configurations score ~0.5")
falsifier_rc:  1
falsifier_out: |
  mean fit-before-split = 0.484   mean pipeline = 0.484
  claim (leaky ~0.8+, pipeline ~0.5) holds: False
verdict:       CONFIRMED
note:          Mean leaky accuracy 0.840 and mean pipeline 0.484 — numerically
               matching ml-validation §9's reported 0.84 / 0.48 on pure noise.
```

```
claim_id:      D15
probe_cmd:     (in d15/) cp clamp_orig.py clamp.py && python3 -B suite.py, then per mutant
               # suite: clamp(5,0,10)==5, clamp(-1,0,10)==0, clamp(99,0,10)==10
               # python3 -B used per runtime-audit §5's pycache-collision warning
rc:            original 0; mutant '<'→'<=' 0 (SURVIVES); mutant 'return x'→'return lo' 1 (KILLED)
stdout:        |
  == original ==  sha256 17af4a0dd5380ec90e2cf97da6dcc654b08ff500277b55b65fbe8b349bdfffb2
  suite: all 3 tests passed              rc=0
  == mutant 1: 'if x < lo' -> 'if x <= lo' ==
  suite: all 3 tests passed              rc=0     <- survivor, as claimed
  == mutant 2: 'return x' -> 'return lo' ==
  AssertionError at "assert clamp(5, 0, 10) == 5"  rc=1     <- killed, as claimed
  == restored ==  sha256 17af4a0dd5380ec90e2cf97da6dcc654b08ff500277b55b65fbe8b349bdfffb2 (matches)
toolchain:     python3 3.12.3, -B (no bytecode cache)
falsifier_cmd: mutant 2 run IS the required kill demonstration (rc=1); ledger falsifier
               ("boundary mutant killed, or return mutant survives") observed in neither direction
falsifier_rc:  1 (mutant 2)
verdict:       CONFIRMED
```

```
claim_id:      D16
probe_cmd:     timeout 30 bash -n bad.sh   # bad.sh: if/then with missing fi
rc:            2
stderr:        |
  bad.sh: line 4: syntax error: unexpected end of file
falsifier_cmd: timeout 30 bash -n good.sh   # same script with fi
falsifier_rc:  0
toolchain:     bash (system /usr/bin/bash, Ubuntu 24.04)
verdict:       CONFIRMED
```

```
claim_id:      D17
probe_cmd:     timeout 120 python3 d17_probe.py
               # f=exp at x=1 (f'=e known analytically); errors over h=logspace(-1,-12,45);
               # log-log slopes fit in truncation-dominated band; argmin of centered error
rc:            0
stdout:        |
           h      fwd_err      cen_err
     1.0e-01    1.406e-01    4.533e-03
     1.0e-02    1.364e-02    4.530e-05
     1.0e-03    1.360e-03    4.530e-07
     1.0e-04    1.359e-04    4.531e-09
     1.0e-05    1.359e-05    5.859e-11
     1.0e-06    1.359e-06    1.635e-10
     1.0e-07    1.399e-07    5.859e-11
     1.0e-08    6.603e-09    6.603e-09
     1.0e-09    2.154e-07    6.603e-09
     1.0e-10    1.548e-06    6.727e-07
     1.0e-11    3.263e-05    1.043e-05
     1.0e-12    4.323e-04    2.103e-04
  forward-difference  log-log slope (h in 1e-4..1e-1): 1.0035  (claim: order 1)
  centered-difference log-log slope (h in 1e-3..1e-1): 2.0001  (claim: order 2)
  machine eps = 2.220e-16; cbrt(eps) = 6.055e-06
  measured optimal h for centered diff: 3.162e-06  min err = 3.292e-11
  centered err at h=6e-6: 1.543e-11
  centered err at h=1e-9 (below optimum, cancellation): 6.603e-09
  claim (O(h) fwd, O(h^2) cen, optimum near cbrt(eps)~6e-6) holds: True
toolchain:     numpy 2.4.6, float64
verdict:       CONFIRMED
note:          Slopes 1.0035 (forward) and 2.0001 (centered) match O(h)/O(h^2).
               Empirical optimum on the sampled grid 3.2e-6, same decade as
               cbrt(eps)=6.06e-6; error at h=6e-6 is 1.5e-11, near the global
               minimum; below ~1e-7 the centered error curve turns back up
               (cancellation), also matching ml-validation §1's warning that
               smaller is not better.
```

```
claim_id:      D18
probe_cmd:     timeout 120 python3 d18_probe.py
               # A) f=sum(x^2), grad deliberately off by [3,4] (abs 2-norm error EXACTLY 5;
               #    ||true grad||=100 so a relative metric would read 0.05)
               # B) f=exp, CORRECT grad, epsilon=1e-5: check_grad output compared against
               #    hand-computed forward (1.36e-5) vs centered (5.9e-11) errors
rc:            0
stdout:        |
  scipy version: 1.18.0
  check_grad with grad off by [3,4] (||err||2 = 5, ||grad|| = 100): 5.0
  matches ABSOLUTE 5.0: True   matches RELATIVE 0.05: False
  hand forward-diff error  at h=1e-5: 1.359150e-05
  hand centered-diff error at h=1e-5: 5.858691e-11
  check_grad(correct grad, epsilon=1e-5) = 1.359148e-05
  matches forward: True   matches centered: False
  check_grad, per-component errors [3,4] at small x: 5.0 (2-norm=5, sum=7, max=4)
  claim (absolute 2-norm, forward differences) holds: True
toolchain:     scipy 1.18.0
falsifier_cmd: structural — the RELATIVE (0.05) and CENTERED (5.9e-11) alternative
               hypotheses were computed and both measurably rejected
verdict:       CONFIRMED
note:          Output exactly 5.0 = the absolute 2-norm of the injected error
               (sum-norm would be 7, max-norm 4, relative 0.05). With a correct
               gradient, check_grad reproduces the hand-computed FORWARD-difference
               error to 6 significant figures; centered would be ~5 orders smaller.
```

---

## Verdict summary (Channel B)

| Claim | Verdict | One-line evidence |
|---|---|---|
| D1 | CONFIRMED | YAML dict, keys exactly {name,description,license}, name matches regex, description 521 chars |
| D2 | CONFIRMED | 2.302585092994045 / 0.693147180559945, within 1e-6 of claim |
| D3 | CONFIRMED | init both 2.3025853633880615 (bit-identical); final raw 1.6e-6 vs softmax 1.4612; falsifier rc=1 |
| D4 | CONFIRMED | grad ratio exactly 2.0 elementwise; with zero_grad ratio 1.0, falsifier rc=1 |
| D5 | CONFIRMED | bare env -i: find_spec(torch)=None rc=1; +PYTHONPATH=SITEPATH rc=0 |
| D6 | CONFIRMED | unset: 3 distinct hashes/orders; PYTHONHASHSEED=0: identical x3 |
| D7 | CONFIRMED* | bare rc=0 (warning only); -Werror flag rc=1. *Caveat: -std=c23 unrecognized on gcc 13; -std=c2x still rc=0 |
| D8 | CONFIRMED | pytest 9.1.1 empty dir rc=5; failing test rc=1 |
| D9 | CONFIRMED | numpy 2.4.6: AttributeError on np.trapz; np.trapezoid works |
| D10 | CONFIRMED | defaults rtol=1e-05 atol=1e-08; allclose(f32 1e-8, f32 2e-8)=True at 100% rel err |
| D11 | CONFIRMED | UserWarning only; loss 2.0732 (== hand (n,n) broadcast mean) vs 1.9582 matched |
| D12 | CONFIRMED | mean leaky 0.840 vs pipeline 0.484 over 5 seeds; falsifier rc=1 |
| D13 | N/A | A-only by ledger scoping |
| D14 | N/A | A-only by ledger scoping |
| D15 | CONFIRMED | boundary mutant survives rc=0; return mutant killed rc=1; checksums match |
| D16 | CONFIRMED | bash -n syntax error rc=2; valid file rc=0 |
| D17 | CONFIRMED | slopes 1.0035 / 2.0001; centered optimum ~3e-6–6e-6 vs cbrt(eps)=6.06e-6 |
| D18 | CONFIRMED | check_grad = 5.0 exactly (absolute 2-norm); matches forward-diff error to 6 sig figs |

REFUTED: none. PROBE_INVALID: none. UNVERIFIABLE: none (pytest located via venv
binary; gcc present; scipy present). Mandatory falsifiers for D3, D4, D12, D15 all
ran and all produced the opposite result (rc=1 / opposite measurement).

Single caveat worth carrying to the convergence gate: D7's parenthetical
"(or -std=c23)" is not realizable on the installed gcc 13.3.0 — the option is
unrecognized, and the gcc-13 equivalent `-std=c2x` still exits 0 on an implicit
declaration. The claim's main clause is fully confirmed; the parenthetical is a
version-dependent side remark that this toolchain cannot exhibit.
