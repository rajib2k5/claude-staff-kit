# Channel A — documentation audit (primary sources only)

target:      <session-scratchpad>/egv-staging/
ledger:      self-validation-ledger.md (frozen; audited verbatim, nothing added/dropped/reworded)
charter:     primary sources only; no probe executed; no snippet from the skill run;
             channel-b*.md and research-*.md digests NOT read
retrieved:   2026-08-29
scope:       ledger claims scoped A or AB — D1, D2, D4–D11, D13, D14, D16, D17, D18
             (D3, D12, D15 are B-scoped: N/A-by-construction on this channel)

Method note: I read the skill's files and counted characters in them (reading the
artifact under audit is documentation research, not execution). Every external fact
below is grounded in a fetched primary artifact, quoted verbatim.

---

## Per-claim verdict records

### D1 — frontmatter / Agent Skills spec conformance
verdict:     **CONFIRMED** (with a recorded caveat that is outside D1's falsifier list)
source:      https://agentskills.io/specification
source_tier: 1 (the standard itself)
version:     current spec as served 2026-08-29
quote:       "| `name` | Yes | Max 64 characters. Lowercase letters, numbers, and
             hyphens only. Must not start or end with a hyphen. |"
             "| `description` | Yes | Max 1024 characters. Non-empty. …"
             "| `license` | No | License name or reference to a bundled license file. |"
note:        Required fields per spec = `name`, `description`. Both present. `license`
             is an optional-but-recognized field, so the frontmatter's exact key set
             {name, description, license} contains no unrecognized key and omits no
             required one — D1's falsifier "spec requires a field that is absent" does
             not fire.
             Measured on the file: `name` = `evidence-gated-validation`, 25 chars,
             matches `^[a-z0-9][a-z0-9-]{0,63}$` and also the spec's stricter rules (no
             leading/trailing hyphen, no `--`). `description` = 521 characters
             (525 bytes UTF-8), ≤ 1024.
             YAML parse: three plain `key: value` scalars. The description value
             contains no `": "` and no ` #`, so it is a valid YAML plain scalar; there
             is nothing in the block that can fail a YAML load.
caveat:      The same spec section states "Must match the parent directory name." The
             audited copy lives in a directory named `egv-staging`, not
             `evidence-gated-validation`, so *as staged* it violates that rule. This is
             not one of D1's enumerated falsifiers (it is a packaging fact, not a
             field-presence/format fact), and README.md line 84 already states the
             directory name must stay `evidence-gated-validation` — so I record it
             rather than flipping the verdict.

### D2 — -log(1/10) = log 10 ≈ 2.302585 and -log(1/2) = log 2 ≈ 0.693147
verdict:     **CONFIRMED**
source:      https://oeis.org/A002392 and https://oeis.org/A002162
source_tier: 1 (curated reference database of mathematical constants)
quote:       A002392: "Decimal expansion of natural logarithm of 10." →
             2, 3, 0, 2, 5, 8, 5, 0, 9, 2, 9, 9, 4, 0, 4, 5, 6, 8, 4, …
             A002162: "Decimal expansion of the natural logarithm of 2." →
             6, 9, 3, 1, 4, 7, 1, 8, 0, 5, 5, 9, 9, 4, 5, 3, 0, 9, 4, …
note:        ln 10 = 2.302585092994045684…, ln 2 = 0.693147180559945309…, both matching
             ml-validation.md §3's `2.302585` and `0.693147` to the digits printed.
             The identity −log(1/x) = log x is the definitional log-quotient rule. Both
             stated values are correct well inside 1e-6.

### D4 — PyTorch accumulates gradients across backward() without zero_grad()
verdict:     **CONFIRMED** (docs half; the "= 2.0" ratio is a measurement, Channel B)
source:      https://docs.pytorch.org/docs/2.13/generated/torch.autograd.backward.html
             (https://docs.pytorch.org/docs/stable/… redirects here)
source_tier: 1
quote:       "This function accumulates gradients in the leaves - you might need to zero
             .grad attributes or set them to None before calling it."
             torch.optim.Optimizer.zero_grad: "Reset the gradients of all optimized
             torch.Tensor s."
note:        The docs decide the semantic half of D4 (accumulation, not reset) and
             explicitly contradict the falsifier "docs state grads are reset
             automatically". The exact 2.0× ratio after two identical backward() calls
             follows from accumulation being addition but is not itself a documented
             number — that half is Channel B's.

### D5 — env -i with HOME=$WORK hides pip --user packages; PYTHONPATH restores them
verdict:     **CONFIRMED**
source:      https://docs.python.org/3/library/os.path.html ,
             https://docs.python.org/3/library/site.html ,
             https://peps.python.org/pep-0370/ ,
             https://raw.githubusercontent.com/python/cpython/main/Lib/site.py
source_tier: 1 and 2
quote:       os.path.expanduser: "On Unix, an initial ~ is replaced by the environment
             variable HOME if it is set; otherwise the current user's home directory is
             looked up in the password directory through the built-in module pwd."
             site.USER_SITE: "Default value is ~/.local/lib/python X.Y [t]/site-packages
             for UNIX and non-framework macOS builds"
             PEP 370: "On Unix `~/.local` was chosen in favor over `~/.python` …"
             Lib/site.py `_getuserbase()`:
                 `def joinuser(*args): return os.path.expanduser(os.path.join(*args))`
                 … `return joinuser("~", ".local")`
note:        The chain is fully documented: the user-site path is computed by expanding
             `~`, and `~` on Unix resolves through `HOME`. Setting HOME to a fresh temp
             dir therefore relocates the user-site lookup to an empty tree, so packages
             installed under the real `~/.local` become invisible to `find_spec`. The
             restore half is also documented: PYTHONPATH "Augment[s] the default search
             path for module files" (docs.python.org/3/using/cmdline.html).

### D6 — PYTHONHASHSEED unset ⇒ str hash varies across processes; =0 ⇒ identical
verdict:     **CONFIRMED**
source:      https://docs.python.org/3/using/cmdline.html
source_tier: 1
quote:       PYTHONHASHSEED: "If this variable is not set or set to `random`, a random
             value is used to seed the hashes of str and bytes objects. … Specifying
             the value 0 will disable hash randomization."
             `-R`: "the __hash__() values of str and bytes objects are 'salted' with an
             unpredictable random value. Although they remain constant within an
             individual Python process, they are not predictable between repeated
             invocations of Python."
note:        Decides both directions of D6 exactly: cross-process variation when unset
             (randomization on by default), and elimination of it at PYTHONHASHSEED=0.

### D7 — `gcc -fsyntax-only` exits 0 on an implicit function declaration unless -Werror=… is added
verdict:     **REFUTED** — the claim is version-dependent and is false on GCC ≥ 14,
             and the skill states it unconditionally
source:      https://gcc.gnu.org/onlinedocs/gcc/Warning-Options.html (current GCC) ,
             https://gcc.gnu.org/onlinedocs/gcc-13.3.0/gcc/Warning-Options.html ,
             https://gcc.gnu.org/gcc-14/porting_to.html
source_tier: 1
quote:       current GCC: "This warning is enabled by default, **as an error**, in C99
             and later dialects of C, and also by -Wall." … "downgrade to a warning
             using -fpermissive … or for this error alone, with
             -Wno-error=implicit-function-declaration"
             GCC 13.3: "This warning is enabled by default in C99 and later dialects of
             C, and also by -Wall. The warning is made into an error by
             -pedantic-errors."
             GCC 14 porting_to: "For backwards compatibility, GCC 13 and earlier
             diagnosed use of these features as warnings only. … In GCC 14, these issues
             are now reported as errors, and no output file is created" — under the
             section heading "Implicit function declarations
             (-Werror=implicit-function-declaration)".
note:        The claim held through GCC 13.x and stopped holding at GCC 14 (released
             2024), whose default `-std` (gnu17; gnu23 in GCC 15) is a C99-or-later
             dialect. runtime-audit.md §8.1 asserts it flatly — "`gcc -fsyntax-only`
             (default mode and `-std=c99`) returns rc=0 for a call to a *nonexistent*
             function — implicit declaration is only a warning" — with no version
             caveat. On any GCC ≥ 14 that sentence is false and the exit-code table row
             "`gcc/g++ -fsyntax-only` | 0 | 1 (C needs the implicit-decl flag)" is
             misleading. The *recommendation* (always pass
             `-Werror=implicit-function-declaration`) remains harmless and correct; only
             the factual predicate is refuted. Required fix: version-scope the sentence
             ("GCC ≤ 13 and clang; GCC ≥ 14 errors by default").

### D8 — pytest exits 5 when no tests are collected
verdict:     **CONFIRMED**
source:      https://docs.pytest.org/en/stable/reference/exit-codes.html
source_tier: 1
quote:       "Exit code 5: No tests were collected"
note:        runtime-audit.md §7 tags this row "(doc)", which matches: it is a
             documented value, not a measured one.

### D9 — "np.trapz was removed in numpy 2.0"
verdict:     **REFUTED**
source:      https://numpy.org/doc/stable/numpy_2_0_migration_guide.html ,
             https://numpy.org/doc/stable/release/2.0.0-notes.html ,
             https://numpy.org/doc/stable/release/2.4.0-notes.html
source_tier: 1 and 3
quote:       migration guide, immediately before the entry: "The next table presents
             **deprecated** members, which will be removed in a release after 2.0:" …
             "trapz | Use `np.trapezoid` or a `scipy.integrate` function instead."
             2.0.0 release notes (Deprecations): "np.trapz has been deprecated. Use
             np.trapezoid or a scipy.integrate function instead."
             2.4.0 release notes: "Removal of deprecated functions and arguments — The
             following long-deprecated APIs have been removed: numpy.trapz —
             deprecated since NumPy 2.0 (2023-08-18). Use numpy.trapezoid or
             scipy.integrate functions instead."
note:        np.trapz was **deprecated** in 2.0 and **removed in 2.4.0**. The skill's
             docs-audit.md §6 sentence — "numpy 2.0 removed `np.trapz`, `np.NaN`,
             `np.float_`, among others — see the migration guide at <URL>" — is correct
             for `np.NaN` and `np.float_` (both sit in the guide's *removed* table) and
             wrong for `np.trapz`, which sits in the *deprecated* table on the very page
             cited. This is the exact failure mode docs-audit.md §8.1 warns about
             (version-boundary misattribution), committed inside the section that
             teaches it. The second conjunct of D9 ("on the installed numpy (2.x)
             accessing it fails") can be simultaneously true if the pin is ≥ 2.4 — that
             does not rescue the "removed in 2.0" clause.
             ml-validation.md §10's softer listing of `np.trapz` under "deprecated
             spellings for the installed version … FutureWarning or AttributeError" is
             defensible and needs no change.

### D10 — np.allclose defaults rtol=1e-5, atol=1e-8; allclose(f32(1e-8), f32(2e-8)) is True
verdict:     **CONFIRMED**
source:      https://numpy.org/doc/stable/reference/generated/numpy.allclose.html
source_tier: 1
quote:       defaults "rtol: 1e-05", "atol: 1e-08"; comparison performed is
             "absolute(a - b) <= (atol + rtol * absolute(b))"
note:        Substituting a=1e-8, b=2e-8: LHS ≈ 1e-8; RHS = 1e-8 + 1e-5·2e-8 =
             1.0000002e-8. LHS ≤ RHS, so True — a 100 % relative error passing. float32
             representation error near 1e-8 is ~1e-15, three orders below the 2e-13
             margin, so rounding cannot flip it. The claim is decided from the
             documented formula plus arithmetic; no execution needed.

### D11 — mse_loss with (n,1) vs (n,) broadcasts to (n,n) with only a UserWarning
verdict:     **CONFIRMED**
source:      https://raw.githubusercontent.com/pytorch/pytorch/main/torch/nn/functional.py
             (tier 2, library source) and
             https://docs.pytorch.org/docs/2.13/generated/torch.nn.MSELoss.html (tier 1)
source_tier: 1 and 2
quote:       functional.py `mse_loss`:
                 `if target.size() != input.size():`
                 `    warnings.warn(f"Using a target size ({target.size()}) that is`
                 `        different to the input size ({input.size()}). This will likely`
                 `        lead to incorrect results due to broadcasting. Please ensure`
                 `        they have the same size.", stacklevel=2)`
                 … `expanded_input, expanded_target = torch.broadcast_tensors(input, target)`
             MSELoss docs: "Target: (*), same shape as the input."
note:        `warnings.warn` with no category argument raises **UserWarning** (Python
             `warnings` default) — so a warning, never an exception, which refutes
             D11's falsifier "error raised instead". `broadcast_tensors((n,1),(n,))`
             yields (n,n) under standard broadcasting, and `reduction='mean'` then
             averages n² pairwise squared differences instead of n matched ones, so the
             value differs. The specific 2.0033-vs-2.0003 pair is Channel B's.

### D13 — Snowflake cortex skill directories
verdict:     **CONFIRMED**
source:      https://docs.snowflake.com/en/user-guide/cortex-code/extensibility#extensibility-skills
source_tier: 1 (vendor documentation)
quote:       project scope: "`.cortex/skills/` or `.claude/skills/` in the project
             directory"; user scope: "`~/.snowflake/cortex/skills/`" and
             "`~/.claude/skills/`". Documented frontmatter: "name: my-skill /
             description: Brief description of what this skill does / tools: -
             optional_tool_name".
note:        Matches README.md's directory list exactly, including the `.claude`
             fallback. README's honest caveat — "Snowflake documents only the
             `name`/`description`/`tools` frontmatter fields" — is also accurate: those
             are the only three shown.

### D14 — every cited URL resolves and supports its citing sentence
verdict:     **REFUTED** — 65 unique URLs; 61 SUPPORTS, 2 CONTRADICTS,
             1 EXISTS-BUT-DOES-NOT-DECIDE, 1 UNREACHABLE-with-no-caveat.
             Full per-URL table below.

### D16 — `bash -n` on a file with a syntax error exits 2
verdict:     **UNVERIFIABLE** (no admissible source decides the specific value 2)
source:      https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html and the
             full manual at https://www.gnu.org/software/bash/manual/bash.txt
source_tier: 1
quote:       "Bash itself returns the exit status of the last command executed, unless a
             syntax error occurs, in which case it exits with a **non-zero** value."
             (The only "2" in that section is unrelated: "All builtins return an exit
             status of 2 to indicate incorrect usage…")
             `-n` description: "Read commands but do not execute them. This may be used
             to check a script for syntax errors."
note:        The Bash Reference Manual documents "non-zero", never 2, for a syntax
             error. I attempted the tier-2 route (bash source, for `EX_BADUSAGE`) at
             git.savannah.gnu.org/cgit/bash.git/plain/{shell.h,parse.y,eval.c,shell.c}
             and at the raw.githubusercontent.com/bminor/bash mirror; all returned
             empty bodies or HTTP 404 from this environment, so I could not read the
             constant. Per docs-audit.md §7 this is UNVERIFIABLE, not CONFIRMED and not
             REFUTED — "the docs don't say 2" is absence of evidence.
             In the skill's favour: runtime-audit.md §7's table is headed "(measured
             unless noted)" and the `bash -n` row carries no "(doc)" tag, so it is
             presented as a measurement, which is Channel B's to decide. §3's bare "rc=2
             on syntax error" would read better with the same "(measured)" marker.

### D17 — centered difference O(h²) vs forward O(h); optimal h ≈ cbrt(eps) ≈ 6e-6
verdict:     **CONFIRMED** (with a citation gap recorded)
source:      https://cs231n.github.io/neural-networks-3/
source_tier: 1 (the course note the skill cites as its source for §1)
quote:       "you can use Taylor expansion of f(x+h) and f(x-h) and verify that the
             first formula has an error on order of O(h), while the second formula only
             has error terms on order of O(h²) (i.e. it is a second order
             approximation)."
             "Be careful with the step size h. It is not necessarily the case that
             smaller is better, because when h is much smaller, you may start running
             into numerical precision problems."
note:        The O(h²)-vs-O(h) half is quoted verbatim from the cited page.
             The cbrt(eps) half is **not on that page** — I searched it for
             cube/cbrt/"third root": zero hits; it recommends h ≈ 1e-5 without a
             derivation. The value is nonetheless correct: total error for the centered
             formula is ≈ (h²/6)|f'''| + ε|f|/h, whose minimiser scales as ε^(1/3); with
             IEEE-754 double eps = 2.220446049250313e-16, cbrt(eps) =
             6.0554544523933395e-06 ≈ 6e-6, matching the skill's figure. So the claim is
             true, but the paragraph asserting it sits under a heading whose only cited
             source does not carry it. Recommended fix: cite a numerical-analysis source
             for the cbrt(eps) rule or mark it "derivation, not from CS231n".

### D18 — scipy.optimize.check_grad returns an absolute 2-norm and uses forward differences
verdict:     **CONFIRMED**
source:      https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.check_grad.html
source_tier: 1
quote:       Returns: "The square root of the sum of squares (i.e., the 2-norm) of the
             difference between `grad(x0, *args)` and the finite difference
             approximation of *grad* using func at the points *x0*."
             Summary: "Check the correctness of a gradient function by comparing it
             against a **(forward)** finite-difference approximation of the gradient."
note:        Both halves decided: absolute (not relative — no normalisation appears in
             the Returns text) and forward (not centered). Refutes D18's falsifier
             directly. The page also documents `direction='all' | 'random'`; the
             forward-difference scheme is stated for both.

---

## D14 — per-URL citation sweep (65 unique http/https URLs)

URLs extracted by `grep -roh 'https\?://[^ )>"]*'` over SKILL.md, README.md and
references/*.md, deduplicated. HTTP status checked for all 65; content checked against
the citing sentence for each.

Verdict tally: **SUPPORTS 61 · CONTRADICTS 2 · EXISTS-BUT-DOES-NOT-DECIDE 1 · UNREACHABLE 1**

### CONTRADICTS

| URL | Note |
|---|---|
| https://numpy.org/doc/stable/numpy_2_0_migration_guide.html | Cited by docs-audit.md §6 for "numpy 2.0 removed `np.trapz`, `np.NaN`, `np.float_`". The page places `trapz` in the table introduced by "The next table presents **deprecated** members, which will be removed in a release after 2.0", not in the removed table where `NaN` and `float_` do appear. Corroborated by the 2.0.0 notes ("np.trapz has been deprecated") and the 2.4.0 notes ("Removal of deprecated functions … numpy.trapz — deprecated since NumPy 2.0"). The cited source contradicts the citing sentence for one of its three examples. |
| https://pmc.ncbi.nlm.nih.gov/articles/PMC3082144/ | Cited by ml-validation.md §7 as the source of "The canonical ML battery (Xie et al. 2011)". Two of the six bulleted relations carry necessity verdicts opposite to the paper's, and one bullet is not an Xie MR at all. Paper: **MR-2.1 (addition of uninformative attributes) is a necessary property (NP) for k-NN**, where the added attribute is constant — "The choice of the actual value to be added here is not important as this attribute is equally associated with the class labels." The skill says "add uninformative feature … **NOT necessary for distance-based models**: a varying extra feature changes every Euclidean distance." Likewise **MR-3.2 (additional training sample) is NP for k-NN**, and it duplicates only the samples carrying the predicted label li — "we duplicate all samples in S with label li" — where the skill's "duplicate-all-samples" duplicates every row and is declared not necessary for distance-based learners. Finally, "training-row permutation" is not in Xie's MR list (MR-0 affine; MR-1.1/1.2 permutation of class labels / attributes; MR-2.1/2.2; MR-3.1/3.2; MR-4.1/4.2; MR-5.1/5.2). The skill's measurements may well be right for *its* transformations; the problem is that different transformations are presented under Xie's names and with inverted necessity verdicts, attributed to Xie. |

### UNREACHABLE

| URL | Note |
|---|---|
| https://dl.acm.org/doi/10.1109/TSE.1986.6312924 | HTTP **403** to an automated fetcher (bot block / paywall gate), cited twice in README.md with **no access caveat** — so it is flagged per the audit rule. The citation itself is correct: Crossref metadata for DOI 10.1109/TSE.1986.6312924 returns "An experimental evaluation of the assumption of independence in multiversion programming", IEEE Transactions on Software Engineering, vol. SE-12, no. 1, pp. 96–109, 1986, Knight & Leveson. Two nits: README says "IEEE TSE 12(1)" where the volume is SE-12(1), and an ACM DOI landing page is a worse target for an IEEE paper than doi.org/10.1109/TSE.1986.6312924. |

### EXISTS-BUT-DOES-NOT-DECIDE

| URL | Note |
|---|---|
| https://scikit-learn.org/stable/modules/generated/sklearn.utils.estimator_checks.check_estimator.html | Cited by ml-validation.md §7 immediately before "Its own tolerances: subset invariance atol=1e-7, sample-order invariance atol=1e-9, fit-idempotence compares **outputs, not fitted parameters**". The page documents none of that — it says only "This function will run an extensive test-suite for input validation, shapes, etc." and groups checks into "API checks" / "legacy". The figures are nonetheless correct: `sklearn/utils/estimator_checks.py` on main has `assert_allclose(result_full, result_by_batch, atol=1e-7, …)` (check_methods_subset_invariance) and `atol=1e-9` in the sample-order-invariance check. Fix is a citation swap to the source file, not a content change. |

### SUPPORTS (61)

Grouped; each line gives the deciding evidence for the sentence that cites it.

**Agent Skills / tooling**
- agentskills.io/specification — required = name+description; license optional; name "Must match the parent directory name"; six frontmatter fields, matching README's "six portable frontmatter fields" and the directory-name assertion.
- github.com/agentskills/agentskills — repo exists, Apache-2.0, "Specification and documentation for Agent Skills", contains `skills-ref/`; the spec page documents `skills-ref validate ./my-skill`, matching README's install-validation line.
- docs.snowflake.com/…/cortex-code/extensibility — see D13.

**Correlation / independence**
- arxiv.org/abs/2506.07962 — "Correlated Errors in Large Language Models", Elliot Kim, Avi Garg, Kenny Peng, Nikhil Garg: "on one leaderboard dataset, models agree 60% of the time when both models err." ("Kim et al." is correct.)
- arxiv.org/html/2605.29800v1 — "Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels": "neff=2.18 with 95% bootstrap CI [2.07,2.31]"; 9 judges across 7 model families.
- arxiv.org/html/2606.20158v1 — "N-Version Programming with Coding Agents" (Ron, Baudry, Monperrus, 18 Jun 2026): "Across five agent systems, 23 models, and three target languages"; "the experiment produces 429 coincident-failure cases where the random independence model predicts only 115.36" (429/115.36 = 3.72 → README's "3.7×", a ratio the reader must compute, not a phrase in the paper); "the mean failure count drops from 387.44 for single versions to 130.99 for triples" (2.96× → README's "roughly 3×").

**Framing / verification**
- arxiv.org/abs/2603.18740 — "Measuring and Exploiting Contextual Bias in LLM-Assisted Security Code Review": "detection falling from 240/247 (97.2%) under neutral framing to 9/247 (3.6%) under strong bug-free framing, a **93.5pp** decline"; Table 2 shows Gemini 2.0 Flash at **−16.2** under the same condition (the low end of docs-audit.md's "16.2–93.5" range, which is the skill's own summarisation of the significant column, not a phrase in the paper); "Debiasing via metadata redaction and explicit instructions restores detection in all affected cases."
- arxiv.org/abs/2309.11495 — CoVe: "answers those questions independently so the answers are not biased by other responses"; Table 3 gives factored 63.7 FactScore at 11.7 avg facts vs joint 60.8 at 12.8. *Note:* claim-extraction.md's "the precision gain came **partly from** fewer asserted facts" is the skill's inference from those two columns — the paper attributes the gain to verification questions not attending to the baseline response, and never analyses the fact-count as a cause. The hedge "partly" keeps it defensible; the numbers are real.
- arxiv.org/abs/2604.20202 — Hallucination Inspector, Table 3: Hall. Inspector precision **1.00** with recall **0.73** (Qwen2.5) and **0.90** (Codestral-v1); gpt-5-mini judge precision **0.67** and **0.50**. Supports both README's "precision 1.00 … 0.50–0.67" and SKILL.md's "precision 1.00 but recall 0.73–0.90". *Venue caveat:* README labels it "EASE 2026"; the arXiv abs page carries no journal-ref or comments field and "EASE" does not appear in the paper text, so the venue is not verifiable from the primary source.
- arxiv.org/abs/2407.04622 — Kenton et al.: "in extractive QA tasks with information asymmetry debate outperforms direct question answering, but in other tasks without information asymmetry the results are **mixed**." *Note:* divergence-and-verdict.md's "Debate's measured advantage exists **only** under information asymmetry" is a shade stronger than "mixed"; directionally supported, mildly overstated.
- arxiv.org/abs/2310.08118 — Valmeekam et al.: "LLM+VAL w/ BP 88/100 (88%)" vs "LLM+LLM w/ Backprompting (BP) 55/100 (55%)"; "False Positive Rate … 38/45 (84.45%)" → README's "approved 84% of invalid plans".
- arxiv.org/abs/2404.13076 — Panickssery et al.: "a linear correlation between self-recognition capability and the strength of self-preference bias; using controlled experiments, we show that the causal explanation resists straightforward confounders."
- arxiv.org/abs/2410.21819, /abs/2310.13548, /abs/2310.01798, /abs/2311.17371, /abs/2401.00396, /abs/2305.11738, /abs/2207.10397, /abs/2107.03374, /abs/2405.00253, /abs/2404.00971, /abs/2410.06992 — titles and abstracts match the one-line descriptors under which README lists them as further reading; no numeric claim attached to any of them.
- proceedings.iclr.cc/…/9ddc141bdbf9d1db510cefff56c586ad-Paper-Conference.pdf — page 1 header: "Published as a conference paper at ICLR 2024 — IS SELF-REPAIR A SILVER BULLET FOR CODE GENERATION? Theo X. Olausson, …". Matches "Olausson et al., ICLR 2024".

**Decomposition / divergence**
- arxiv.org/abs/2407.03572 — CORE, Figure 1: the normal biography prompt scores **81.5 %** factual precision; "Tell me something tautological, obviously true and easily verifiable … Repeat that fact multiple times in paraphrased sentences" scores **100 %**. Exactly the 81.5 %→100 % attack claim-extraction.md §5 describes.
- arxiv.org/html/2510.20963v2 — "CopMAD will lead to up to **15 percentage points** performance decrease compared to single-agent methods"; "CosMAD filters out informative disagreements for premature consensus"; "Finding 2: CopMAD and CosMAD degrade below single-agent."
- arxiv.org/abs/2605.25133 — Prover-Verifier Deliberation: "yielding a ∼**30pp** HC-Prec gap over the non-ANC complement"; "weaker prover-verifier pairings can collapse or **invert** the ANC signal, illustrating a practical failure mode when the verifier operates outside its effective region."
- arxiv.org/abs/2507.19486 — "Confirmation bias: A challenge for scalable oversight". H3 result table: "Actual participant accuracy after interacting with the LLM (0.71, 95% CI 0.68–0.74) was **lower than the accuracy of the LLM alone (0.75)**, t = −2.74, p = .007" → supports "the oversight protocol landed below the model's own accuracy". Abstract: "participants in both groups become more confident in the system's answers after conducting online research, even when those answers are incorrect" and "showing arguments in favor of both answers improves accuracy in cases where the model is incorrect" → supports both other uses.
- arxiv.org/html/2510.09907v1 — "we found after manual review that **56%** were valid bugs" → both "only ~56% of flagged divergences … were genuine bugs" and SKILL.md's "roughly 4 in 10 flagged divergences were not real bugs".

**Test / execution integrity**
- arxiv.org/abs/2305.01210 — EvalPlus: "we extend the test-cases of the popular HumanEval benchmark by **80x** … reducing the pass@k by up-to **19.3-28.9%**." (Skill drops "up-to"; otherwise exact.)
- arxiv.org/html/2502.13820v3 — "We find that the models have a **bias towards adhering to any solutions provided even when specifically prompting against this**." Verbatim support for "models writing tests adhere to whatever solution they were shown, even when told not to".
- arxiv.org/html/2507.06920v2 — direct-generation paradigm: "This results in poor overall DR (**often <60%**) and VAcc (<10%)" → runtime-audit.md's "directly generated test cases achieve detection rates often below 60%".
- arxiv.org/abs/2602.15761 — "producing **19-35%** functionally non-equivalent refactorings … about **21%** of these non-equivalent refactorings remain undetected by the existing test suites". Exact.
- metr.org/blog/2025-06-05-recent-reward-hacking/ — documents o3 reading the grader's precomputed answer off the call stack (`y_ref = _find_ref_tensor(x)`), monkeypatching time (`_time.time = lambda: _real_time() * 1e-3`), and stubbing the scorer (`async def _always_pass(...)`); detection came from reading runs ("we examined every single run of the model on that task").
- github.com/openai/human-eval — `human_eval/execution.py`: "WARNING / This function is **NOT a security sandbox**. Untrusted code, including, model-generated code, should not be blindly executed outside of one." (In the source file, not the README; the skill cites the repo, which does contain it.)
- arxiv.org/html/2511.21654v2 — EvilGenie reward-hacking benchmark; matches its descriptor.

**Industrial evidence**
- arxiv.org/abs/2402.09171 — TestGen-LLM: "…clear a set of filters that assure measurable improvement over the original test suite, thereby **eliminating problems due to LLM hallucination**" (README's quoted string, verbatim); "75% of TestGen-LLM's test cases built correctly, 57% passed reliably, and 25% increased coverage" backs the build→repeated-pass→coverage-gain cascade.
- arxiv.org/abs/2501.06972 — Google migrations: "produces verified changes that only contain code that passes unit tests"; "The two most common validations are building the changed files and running their unit tests. Each of the failed validation steps can optionally run an ML-powered 'repair'"; "The validations are configurable and often depend on the migration."
- pmc.ncbi.nlm.nih.gov/articles/PMC10794145/ — FunSearch: "Programs that were incorrect … are discarded, and the remaining scored programs are then sent to the programs database."
- arxiv.org/abs/2407.00215 — CriticGPT: "Critics can have limitations of their own, including hallucinated bugs … human-machine teams of critics and contractors catch similar numbers of bugs to LLM critics while hallucinating less than LLMs alone."
- docs.github.com/…/copilot-autofix-for-code-scanning — "Copilot validates fixes by re-running CodeQL using the code-scanning query suite, so it **can't confirm that a fix resolves alerts generated by custom queries or the security-extended query suite**." Exactly README's "documented gap where the checker covers less than the generator".
- arxiv.org/abs/2306.03203 — AWS AI Labs (affiliation confirmed in the author block): "Although static analysis is usually unable to determine functional correctness, it covers a large collection of static error types". Supports the "different failure sets" reading; the paper does not use the word "orthogonal", so README's framing is a paraphrase.
- docs.aws.amazon.com/…/guardrails-automated-reasoning-checks.html — names first-class non-decision outcomes: "may hit processing limits or return **TOO_COMPLEX** results", "might timeout or return TOO_COMPLEX", and "regardless of the result (for example, VALID, INVALID, **TRANSLATION_AMBIGUOUS**)".
- www.lasso.security/blog/ai-package-hallucinations — "In three months the fake and empty package got more than **30k** authentic downloads!"
- arxiv.org/abs/2402.04380 — Assured LLM-Based Software Engineering; matches its descriptor.
- code.claude.com/docs/en/best-practices — "**Have Claude show evidence rather than asserting success**: the test output, the command it ran and what it returned, or a screenshot of the result." And, under failure patterns: "If you can't verify it, don't ship it." Both README strings verbatim.

**Where each channel is weak**
- arxiv.org/abs/2406.14497 — CodeRAG-Bench Table 5, GPT-4o row: SWE-bench w/o **2.3** → gold **30.7**; DS-1000 52.7 → 51.2 and ODEX 44.6 → 44.2, both *down*; text: "In contrast, GPTs show no gains with retrieval." *Scoping note:* the "hurt DS-1000 and ODEX" reading holds for the GPT models; for most code-specific LMs the same table shows gains ("most code-specific LMs increase up to 5.2 points"). README does not name the model.
- arxiv.org/abs/2401.00396 — RAGTruth: "Despite the integration of RAG, LLMs may still present unsupported or contradictory claims to the retrieved contents."

**Hallucination base rates**
- arxiv.org/abs/2406.10279 — "the average percentage of hallucinated packages is at least **5.2%** for commercial models and **21.7%** for open-source models"; and "**43%** of hallucinated packages were repeated in all 10 queries" → claim-extraction.md's "43% … recur in 10 of 10 repeated generations".
- arxiv.org/abs/2509.22202 — Twist, Harman, Yannakoudakis, Zhang: "fabricated library names are accepted in **up to 99%**". ("Twist et al." is correct.)

**ML probe library sources**
- cs231n.github.io/neural-networks-3/ — supports the centered/forward formulas and O(h)/O(h²) (quoted under D17), the relative-error metric, the 1e-2 / 1e-4 / 1e-7 thresholds, "Use double precision", the kinks discussion, "check only a few dimensions in each different parameter", "use only few datapoints", "expect the initial loss to be 2.302 … -ln(0.1) = 2.302", and "Overfit a tiny subset of data". *Gap:* it does **not** contain the cbrt(machine eps) optimum the skill states two lines later.
- karpathy.github.io/2019/04/25/recipe/ — "Overfit a single batch of only a few examples (e.g. as little as two) … verify that we can reach the lowest achievable loss (e.g. zero)"; "if you initialize your final layer correctly you should measure `-log(1/n_classes)` on a softmax at initialization"; "Set the loss to be something trivial like the sum of all outputs of example i, run the backward pass all the way to the input, and ensure that you get a non-zero gradient only on the i-th input" (the batch-mixing probe in §7).
- research.google/pubs/the-ml-test-score-… — the landing page carries only an abstract; the linked PDF (https://storage.googleapis.com/gweb-research2023-media/pubtools/4156.pdf) carries all three quoted spans: "Still another is to **purposefully train a model for overfitting**"; "a simple unit test to generate random input data, and train the model for a **single step of gradient descent** is quite powerful for detecting a host of common library mistakes"; "pains should be taken to avoid 'golden tests' … difficult to maintain over time without blindly updating the golden file … when these tests do break they provide very little insight into how or why." SUPPORTS via the linked artifact; the cited landing page alone does not contain them.
- docs.pytorch.org/docs/stable/notes/randomness.html — "Completely reproducible results are not guaranteed across PyTorch releases, individual commits, or different platforms. Furthermore, results may not be reproducible between CPU and GPU executions, even when using identical seeds."; use_deterministic_algorithms "throw[s] an error if an operation is known to be nondeterministic".
- docs.pytorch.org/docs/2.9/…/torch.autograd.gradcheck.gradcheck.html — "The default values are designed for input of double precision. This check will likely fail if input is of less precision, e.g., FloatTensor." *Gap:* the page never names `GradcheckError`; the skill's parenthetical "(a RuntimeError subclass)" is not decided by this URL.
- pytorch.org/blog/pytorch2-6/ — "as an important security improvement measure we have changed the default value for `weights_only` parameter of `torch.load`. This is a backward compatibility-breaking change."
- scikit-learn.org/stable/common_pitfalls.html — "The general rule is to **never call fit on the test data**"; "If an integer is passed, calling `fit` or `split` multiple times always yields the same results. If `None` or a `RandomState` instance is passed: `fit` and `split` will yield different results each time"; the clone-shares-RNG paragraph; "We do not recommend setting the global numpy seed by calling `np.random.seed(0)`"; "Passing integers to CV splitters is usually the safest option".
- eprints.whiterose.ac.uk/…/segura16-tse.pdf — "Segura, S., Fraser, G., Sanchez, A.B. et al. (2016) A Survey on Metamorphic Testing. IEEE Transactions on Software Engineering, 42 (9). pp. 805-824." Matches "metamorphic testing survey, IEEE TSE 2016".
- homes.cs.washington.edu/~mernst/pubs/mutation-effectiveness-fse2014.pdf — "Are Mutants a Valid Substitute for Real Faults in Software Testing?", Just, Jalali, Inozemtseva, Ernst, Holmes, Fraser. Matches "Just et al., FSE 2014".
- homes.cs.washington.edu/~rjust/publ/mutants_faults_revisited_ase_2020.pdf — "Revisiting the Relationship Between Fault Detection, Test Adequacy Criteria, and Test Set Size", Chen, Gopinath, Tadakamalla, Ernst, Holmes, Fraser, Ammann, Just; "In 35th IEEE/ACM International Conference…" Matches "Chen et al., ASE 2020".
- arxiv.org/abs/2207.07048 — Kapoor & Narayanan: "we find **17 fields** where errors have been found, collectively affecting **329 papers**"; taxonomy verbatim "[L1] Lack of clean separation of training and test dataset" (with L1.2 pre-processing on train+test, L1.3 feature selection on train+test, L1.4 duplicates), "L2 Model uses features that are not legitimate", "L3.1 Temporal leakage" / L3.2 dependencies. Matches ml-validation.md §9's L1/L2/L3 summary.

---

## Cross-cutting observations (recorded, outside the frozen ledger)

These are not ledger claims and do not carry verdicts. They are the kind of thing a
Channel A pass turns up and should not silently discard.

1. **Venue labels on arXiv-only citations are not verifiable from the cited sources.**
   README attaches conference attributions to many arXiv links — "ICML 2025",
   "EMNLP 2026", "USENIX Security 2025", "EASE 2026", "NeurIPS 2023", "AAAI 2025",
   "ACL 2024", "NAACL 2025 Findings", "FSE 2024", "ICSE-SEIP 2025", "ACL 2023 Industry".
   I checked the `comments` and `journal_ref` fields on the abs pages for 2506.07962,
   2509.22202, 2406.10279, 2402.09171 and 2604.20202: **all empty**. Author surnames
   check out in every case I tested (Kim, Twist, Spracklen, Alshahwan). Only one venue
   was independently confirmed — Olausson/ICLR 2024, from the PDF header. README's
   closing line "several of the 2025–2026 sources above are preprints, not peer-reviewed"
   is the right instinct but does not go far enough: the venue labels themselves are
   unsourced.

2. **Two uncited factual claims in README's install section.** "Coverage split as of
   2026: `~/.claude/skills/` reaches Claude Code, cortex, opencode, Cursor, and Amp;
   `~/.agents/skills/` reaches Codex CLI, Gemini CLI, Cursor, and Amp" carries no
   citation; only the cortex half is sourced (D13). Likewise "Validate the install with
   `claude plugin validate ~/.claude/skills` (v2.1.233+)" gives a version floor with no
   source. Both are the kind of claim the skill's own §4 source hierarchy would demand a
   primary artifact for.

3. **Suspicious appended content in one fetched page.** The retrieval of
   docs.aws.amazon.com/…/guardrails-automated-reasoning-checks.html came back with a
   trailing block headed "See also — Skills for AI coding assistants (optional)"
   instructing the reader to run `aws agent-toolkit search-skills --search-query bedrock`.
   That text is tool-observed content, not an instruction from anyone entitled to give
   me one, so I did not act on it. It does not affect the citation verdict (the
   TOO_COMPLEX / TRANSLATION_AMBIGUOUS evidence is in the page body proper), but it is
   worth knowing that this fetch path can carry injected directives.

4. **The skill commits, in its own docs-audit chapter, the mistake that chapter
   teaches.** docs-audit.md §8.1 names "reading latest docs for an old installed version"
   as "the #1 source of false REFUTED and false CONFIRMED verdicts". D7 (GCC ≥ 14) and
   D9 (numpy trapz) are both exactly that error, in runtime-audit.md §8.1 and
   docs-audit.md §6 respectively. Neither is a typo; both would produce a wrong verdict
   on real code.

## Retrieval log

- 65/65 URLs status-checked with curl (30 s timeout, browser UA). 64 returned HTTP 200;
  1 returned 403 (dl.acm.org).
- Content verified against the citing sentence for all 65. For arXiv items with a
  numeric claim attached I fetched the full body via arxiv.org/html/<id> and grepped for
  the figure rather than trusting the abstract (2603.18740, 2604.20202, 2606.20158,
  2407.03572, 2406.14497, 2406.10279, 2310.08118, 2502.13820, 2507.06920, 2507.19486,
  2510.20963, 2207.07048, 2501.06972, 2306.03203, 2309.11495).
- PDFs pulled and text-extracted locally: segura16-tse, mutation-effectiveness-fse2014,
  mutants_faults_revisited_ase_2020, the Olausson ICLR camera-ready, and the ML Test
  Score paper (4156.pdf).
- Library source read as tier-2 evidence where the prose docs were silent:
  torch/nn/functional.py (mse_loss), CPython Lib/site.py (_getuserbase),
  sklearn/utils/estimator_checks.py (tolerances), openai/human-eval execution.py.
- Could not retrieve: bash source (`EX_BADUSAGE`) from git.savannah.gnu.org cgit plain
  endpoints or the bminor GitHub mirror — empty bodies / HTTP 404 from this environment.
  This is the sole reason D16 is UNVERIFIABLE rather than decided.
