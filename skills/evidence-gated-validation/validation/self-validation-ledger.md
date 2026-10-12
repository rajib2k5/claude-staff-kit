# Pre-registered claims ledger — reflexive self-validation — evidence-gated-validation skill applied to itself
Frozen before either channel runs. Target: all files under
<session-scratchpad>/egv-staging/
Both channels audit these claims. Neither channel may add, drop, or reword claims.
Channel scoping: "A" = docs-decidable, "B" = probe-decidable, "AB" = both. A claim
scoped to one channel is N/A-by-construction on the other.

| ID | Cat | Mat | Scope | Claim | Falsifier |
|----|-----|-----|-------|-------|-----------|
| D1 | env | material | AB | SKILL.md frontmatter parses as YAML with exactly keys name/description/license; name equals `evidence-gated-validation` and matches `^[a-z0-9][a-z0-9-]{0,63}$`; description is ≤1024 chars; these satisfy the Agent Skills spec's required-field rules | parse failure, regex mismatch, >1024 chars, or spec requires a field that is absent |
| D2 | num | material | AB | -log(1/10) = log(10) ≈ 2.302585 and -log(1/2) = log 2 ≈ 0.693147 as stated in ml-validation.md §3 | computed value differs beyond 1e-6 |
| D3 | sem | material | B | Feeding softmax output to nn.CrossEntropyLoss leaves init loss ≈ log C (shift invariance) but an 8-example overfit run plateaus at a high loss floor (≈1.4–1.5) where the raw-logits variant reaches <1e-2, as claimed in ml-validation.md §3/§10 | init losses differ materially between variants, or both variants overfit to the same floor |
| D4 | sem | material | AB | PyTorch accumulates gradients across backward() calls without zero_grad(): measured grad ratio after 2 calls vs 1 call = 2.0 (claim-extraction.md C4, ml-validation.md §10) | ratio ≠ 2.0; docs state grads are reset automatically |
| D5 | api | material | AB | Under `env -i ... HOME=$WORK` without PYTHONPATH, pip --user packages (e.g. torch installed under ~/.local) become invisible to find_spec; carrying SITEPATH via PYTHONPATH restores them (runtime-audit.md §4) | torch resolves inside bare env -i sandbox, or fails to resolve with SITEPATH carried |
| D6 | sem | material | AB | With PYTHONHASHSEED unset, hash("".join(<set of strings>)) varies across fresh processes; with PYTHONHASHSEED=0 it is identical across processes (runtime-audit.md §4, ml-validation.md §5) | no variation when unset, or variation when pinned |
| D7 | api | material | AB | `gcc -fsyntax-only` on C code calling a nonexistent function exits 0 unless `-Werror=implicit-function-declaration` (or -std=c23) is added (runtime-audit.md §8.1) | bare -fsyntax-only exits non-zero on implicit declaration |
| D8 | api | material | AB | pytest exits with code 5 when no tests are collected (runtime-audit.md §7) | different exit code observed/documented |
| D9 | env | material | AB | `np.trapz` was removed in numpy 2.0 (docs-audit.md §6); on the installed numpy (2.x) accessing it fails | np.trapz exists and works on installed numpy 2.x; migration guide does not list it |
| D10 | num | material | AB | np.allclose defaults are rtol=1e-5, atol=1e-8, and allclose(float32(1e-8), float32(2e-8)) is True — a 100% relative error passing near zero (ml-validation.md §8) | different documented defaults; expression evaluates False |
| D11 | sem | material | AB | torch mse_loss with pred shape (n,1) and target (n,) broadcasts to (n,n) emitting only a UserWarning, yielding a different loss than matched shapes (ml-validation.md §6) | error raised instead, or identical loss |
| D12 | sem | material | B | On pure noise (100×5000, random binary labels), SelectKBest fit before the split yields test accuracy ≈0.8+, while the same selector inside a Pipeline yields ≈0.5 (ml-validation.md §9) | both configurations score ≈0.5, or both score high |
| D13 | env | material | A | Snowflake's cortex CLI documentation states skills are read from `.cortex/skills/` or `.claude/skills/` (project) and `~/.snowflake/cortex/skills/` or `~/.claude/skills/` (user), as claimed in README.md | Snowflake docs state different directories or no .claude fallback |
| D14 | ref | material | A | Every http/https URL cited in SKILL.md, README.md, and references/*.md resolves (or has a stated access caveat) and the source supports the specific sentence citing it | any URL 404s with no caveat, or a fetched source contradicts the citing sentence |
| D15 | alg | material | B | The clamp mutation demo (runtime-audit.md §5): the 3-test suite passes the original; mutant `<`→`<=` SURVIVES the suite; mutant `return x`→`return lo` is KILLED | boundary mutant is killed, or return mutant survives |
| D16 | api | material | AB | `bash -n` on a file with a syntax error exits 2 (runtime-audit.md §7) | different exit code observed/documented |
| D17 | num | material | AB | Centered difference error is O(h²) vs O(h) for forward difference; optimal h for centered differences in float64 ≈ cbrt(machine eps) ≈ 6e-6 (ml-validation.md §1) | derivation/docs contradict; measured error curve inconsistent with claim |
| D18 | sem | material | AB | scipy.optimize.check_grad returns an absolute 2-norm and uses forward differences (ml-validation.md §1) | scipy docs/measurement show relative error or centered differences |
