# Evidence-gated validation report — this skill, validated by its own protocol

target:        the evidence-gated-validation skill itself (SKILL.md, README.md,
               references/*.md — the state immediately before the fixes listed below)
environment:   Python 3.12.3, numpy 2.4.6, torch 2.5.1, scikit-learn 1.9.0,
               scipy 1.18.0, gcc 13.3.0, pytest 9.1.1, bash 5.x (Linux arm64)
mode:          dual-subagent (Mode 1) — two concurrently-launched independent agents,
               neither able to read the other's output file
ledger:        validation/self-validation-ledger.md (frozen 2026-08-29 before either channel
               ran; 18 claims, all material)
channels:      validation/self-validation-channel-a.md (documentation auditor — live fetches only,
               no execution), validation/self-validation-channel-b.md (runtime auditor — execution
               only, no documentation)

## Verdict on the pre-fix skill: FAIL — 2 material claims REJECTED (both fixed),
## plus 4 citation defects (all fixed). Post-fix state is what this repo ships.

## Gate results

| ID | Claim (abbreviated) | A | B | Gate |
|----|--------------------|---|---|------|
| D1 | frontmatter parses; keys/name/description satisfy the Agent Skills spec | CONF | CONF | ACCEPTED |
| D2 | −log(1/10) ≈ 2.302585, −log(1/2) ≈ 0.693147 | CONF | CONF | ACCEPTED |
| D3 | softmax→CE leaves init loss at log C but plateaus overfit-8 at ≈1.46 vs <1e-2 for logits | N/A (B-scoped) | CONF (falsifier ran) | ACCEPTED |
| D4 | torch accumulates grads without zero_grad (ratio exactly 2.0) | CONF | CONF (falsifier ran) | ACCEPTED |
| D5 | env -i HOME relocation hides pip --user packages; PYTHONPATH=SITEPATH restores | CONF | CONF | ACCEPTED |
| D6 | PYTHONHASHSEED unset → cross-process hash variation; =0 → identical | CONF | CONF | ACCEPTED |
| D7 | bare gcc -fsyntax-only exits 0 on implicit declaration | **REF** | CONF | **SPLIT → resolved by version** |
| D8 | pytest exits 5 on zero collected tests | CONF | CONF | ACCEPTED |
| D9 | np.trapz "removed in numpy 2.0"; fails on installed 2.4.6 | **REF** | CONF | **SPLIT → resolved by version** |
| D10 | np.allclose defaults rtol=1e-5/atol=1e-8; near-zero 100%-relative-error pass | CONF | CONF | ACCEPTED |
| D11 | mse_loss (n,1)-vs-(n,) broadcasts to (n,n) with UserWarning only | CONF | CONF | ACCEPTED |
| D12 | SelectKBest-before-split on noise ≈0.84 vs ≈0.48 in Pipeline | N/A (B-scoped) | CONF 0.840/0.484 (falsifier ran) | ACCEPTED |
| D13 | Snowflake cortex reads skills from .claude/skills too | CONF (Snowflake docs) | N/A (no cortex install) | ACCEPTED (single-channel-scoped; runtime unverified — README says so) |
| D14 | every cited URL supports its citing sentence | **REF** (61/65 SUPPORTS; 2 CONTRADICTS, 1 UNREACHABLE, 1 DOES-NOT-DECIDE) | N/A (A-scoped) | **REJECTED → fixed** |
| D15 | clamp demo: boundary mutant survives, return mutant killed | N/A (B-scoped) | CONF | ACCEPTED |
| D16 | bash -n exits 2 on syntax error | UNVER (manual says only "non-zero") | CONF (measured 2) | SPLIT → non-zero dual-confirmed; the specific "2" is measured-only (table now says so) |
| D17 | centered O(h²) vs forward O(h); optimum h ≈ cbrt(eps) | CONF (O(h)/O(h²) in CS231n; cbrt(eps) NOT in the cited source) | CONF (slopes 1.0035/2.0001; minimum ≈3e-6) | ACCEPTED (attribution fixed) |
| D18 | scipy check_grad is absolute 2-norm, forward differences | CONF | CONF (injected [3,4] error → exactly 5.0) | ACCEPTED |

All four mandatory falsifiers (D3, D4, D12, D15) produced the opposite result,
so the confirming probes demonstrably discriminate.

## Divergences and how the gate resolved them

Both divergences are the taxonomy's "A REFUTED, B CONFIRMED → version drift" case —
and both are instances of the exact mistake docs-audit.md §8 warns is the #1 source
of false verdicts. The skill's own protocol caught the skill's own errors:

1. **D7 (gcc implicit declarations).** B: true on installed gcc 13.3 (rc=0, warning
   only). A: GCC ≥ 14 makes it an error by default (GCC 14 porting guide, quoted in
   channel-a.md). Split by version → both sub-claims accepted → the unversioned
   wording was wrong. **Fix applied:** runtime-audit.md §8.1 now version-scopes the
   behavior and drops the unreliable `-std=c23` alternative (unrecognized on gcc 13;
   its `-std=c2x` spelling still only warns — measured).
2. **D9 (np.trapz).** B: AttributeError on installed numpy 2.4.6 (true). A: the
   migration guide the skill itself cites says trapz was *deprecated* in 2.0 and
   *removed in 2.4.0*; np.NaN and np.float_ were the ones removed in 2.0. **Fix
   applied:** docs-audit.md §6 and claim-extraction.md now state
   deprecated-in-2.0 / removed-in-2.4.0.

## Citation defects found by Channel A (all fixed)

- **Xie et al. 2011 misattribution** (ml-validation.md §7): the battery silently
  substituted a *varying* uninformative feature for Xie's *constant* one (opposite
  k-NN validity), duplicate-ALL for Xie's duplicate-one-class, and included a
  row-permutation relation Xie never stated. Now attributed precisely, with the
  differences and their validity classes stated.
- **Knight & Leveson link** pointed at an ACM landing page returning 403, with a
  wrong volume ("12(1)" for SE-12(1)). Now a doi.org link with a paywall caveat.
- **check_estimator tolerances** were attributed to a docs page that does not
  contain them; they live in `sklearn/utils/estimator_checks.py`. Citation swapped.
- **cbrt(machine eps) epsilon optimum** was placed next to a CS231n citation that
  does not contain it. Now labeled a standard numerical-analysis result, confirmed
  empirically (Channel B measured the error minimum ≈3e-6–6e-6).
- Unverifiable venue labels ("EASE 2026", "EMNLP 2026") downgraded to
  preprint/arXiv-ID labels; an uncited CLI version floor removed.

## Not validated

- Live loading of the skill in a real Snowflake cortex install (D13 accepted on
  Snowflake's documentation only — README carries this caveat).
- The bash -n exit code 2 as *documented* behavior (measured-only; the manual
  guarantees only non-zero).
- Behavior on toolchains other than the pinned ones above (gcc 14 error-by-default
  is documented, not locally measured — no gcc 14 on this machine).
- Venue labels on 2025–2026 arXiv citations where the arXiv record carries no
  journal_ref (labels were removed rather than asserted).

These remain open claims, not accepted ones. Dual-confirmation of the ledger above
is not a general correctness certificate for the skill.
