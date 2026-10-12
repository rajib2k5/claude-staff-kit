# Channel A field manual: the documentation auditor

Contents:
1. Charter and hard rules
2. Version pinning first (commands)
3. Matching documentation to the installed version
4. Source hierarchy
5. Evidence record format
6. Deprecation and removal checking
7. What UNVERIFIABLE means
8. Common doc-audit mistakes

## 1. Charter and hard rules

Channel A verifies each claim in the pre-registered ledger against **primary sources
only**. It never executes the code under validation, never runs probes, and never
reads Channel B's findings before committing its own verdicts in writing.

Channel A's value is highest when it terminates in a *mechanical, machine-readable*
artifact — a versioned API reference, type stubs, a package registry entry, the
library's own source — and lowest when it terminates in an LLM's recollection of
prose. A deterministic documentation-derived oracle measured precision 1.00 against
an LLM judge's 0.50–0.67 on the same API-hallucination task (arXiv:2604.20202).
Ground every verdict in a retrievable artifact, not in memory.

Do not show Channel A the generator's rationale, commit message, or any statement
that the code is correct. Framing an artifact as bug-free collapses detection by
16.2–93.5 percentage points; auditing only the artifact largely restores it
(12/12 interactive, 16/17 autonomous in the paper's two studies —
arXiv:2603.18740).

## 2. Version pinning first

Before verifying any claim, record the exact installed versions. The audit is
against what is installed, never against "latest".

```bash
# Python
python3 --version
python3 -c "import importlib.metadata as m; print(m.version('<dist>'))"
pip freeze                    # full pin set
# Node / JS — read the package's own manifest, not your range
node --version
node -e "console.log(require('<pkg>/package.json').version)"
npm ls --json --depth=0
# Rust
cargo metadata --offline --format-version 1 --no-deps
cargo tree --offline
# Go
go version && go list -m all
# Java
java -version
# C toolchain
gcc --version
# SQL engine
sqlite3 --version   # or: SELECT version();
```

Gotchas: `importlib.metadata.version` takes the *distribution* name, not the import
name (`yaml` → `PyYAML`); use `importlib.metadata.packages_distributions()` to map.
`node -e "require('<pkg>/package.json').version"` reads the installed artifact; the
range in your own `package.json` is not evidence of what is installed.

## 3. Matching documentation to the installed version

- Prefer version-selectable doc sites and select the EXACT installed version
  (readthedocs version switcher, `docs.python.org/3.12/`, versioned framework docs).
- If versioned docs do not exist for the installed version, use the library source
  at the matching tag: `git checkout v<X.Y.Z>` of the repo, or the installed files
  themselves (`python3 -c "import pkg; print(pkg.__file__)"` and read that source —
  reading installed source is documentation research, not execution).
- Changelogs bridge the gap: locate the installed version between release notes to
  determine whether a symbol existed / was deprecated / was removed at that point.
- Record which of these you used in the evidence record.

## 4. Source hierarchy (strict, in order)

1. **Official documentation for the exact installed version.**
2. **The library's source code at the installed version** (installed files or the
   matching git tag). Authoritative for signatures and defaults.
3. **Official changelog / release notes / migration guides** — for version-boundary
   claims (added-in, deprecated-in, removed-in, default-changed-in).
4. **The original paper** — only for algorithmic claims ("this implements the update
   rule from X"). Quote the equation and its number/section.
5. **Nothing else.** Blog posts, Stack Overflow, tutorials, forum threads, and model
   memory are not admissible evidence. If a claim can only be supported by secondary
   sources, the verdict is UNVERIFIABLE.

When two admissible sources conflict, the more specific/primary one wins (installed
source beats prose docs; versioned docs beat unversioned).

## 5. Evidence record format

One record per claim, appended to `channel-a.md`:

```
claim_id:    C3
verdict:     REFUTED            # CONFIRMED | REFUTED | UNVERIFIABLE
source:      <URL or file path>
source_tier: 1                  # 1-4 from the hierarchy above
version:     <exact version the source documents>
quote:       "<verbatim sentence(s) from the source>"
retrieved:   2026-08-29
note:        <one line connecting the quote to the claim — optional>
```

Rules:
- The quote is verbatim and short (the minimal span that decides the claim). No
  paraphrase-as-quote.
- One record per claim even when one page decides several claims — each claim's
  record carries its own quote.
- If you could not retrieve the source (paywall, 403, dead link), the claim is
  UNVERIFIABLE; do not cite from memory and do not cite a summary of the source as
  if it were the source.

## 6. Deprecation and removal checking

An API that exists can still be wrong to use. For every CONFIRMED API claim, also
check the deprecation status at the installed version:

- Search the versioned docs and changelog for "deprecated", "removed",
  "renamed", and the symbol name.
- Watch for sentinel defaults in source (e.g., a parameter default that is literally
  the string `'deprecated'` — scikit-learn uses this pattern).
- Distinguish three states in your note: current / deprecated-but-present (record
  the announced removal version and the replacement) / removed (REFUTED).
- Version-boundary traps to actively look for: symbols removed in a major release
  (numpy 2.0 removed `np.NaN` and `np.float_` and *deprecated* `np.trapz`, which
  was then removed in 2.4.0 — see the migration guide at
  https://numpy.org/doc/stable/numpy_2_0_migration_guide.html; deprecated-in vs
  removed-in is exactly the distinction this checklist exists to catch),
  defaults that flipped between versions (e.g. `torch.load`'s `weights_only`,
  https://pytorch.org/blog/pytorch2-6/), and parameters that vanished entirely
  (scikit-learn's `LogisticRegression(multi_class=...)`).

## 7. What UNVERIFIABLE means

UNVERIFIABLE = "no admissible source decides this claim", and it is a first-class
verdict that forces a SPLIT at the convergence gate. It is the honest answer when:

- the behavior is undocumented (docs silent on the exact semantics claimed);
- only secondary sources discuss it;
- docs for the installed version cannot be located and the source is unreadable
  (compiled extension, minified bundle);
- the claim is about emergent numeric behavior docs would never specify (exact
  convergence rate on this data) — that is Channel B territory by construction.

UNVERIFIABLE is not failure. Collapsing it into CONFIRMED ("docs don't say it's
wrong") or REFUTED ("docs don't mention it") is how a doc audit produces confident
nonsense. Absence of documentation is absence of evidence.

## 8. Common doc-audit mistakes

1. **Reading latest docs for an old installed version.** The default landing page of
   most doc sites is `latest`/`stable`. Always verify the version selector matches
   the pin. This is the #1 source of false REFUTED and false CONFIRMED verdicts.
2. **Confusing distribution and import names** (`PyYAML` vs `yaml`, `beautifulsoup4`
   vs `bs4`) — leads to "package does not exist" false refutations.
3. **Trusting a search-result snippet or AI overview** as if it were the doc page.
   Open the page; quote from the page.
4. **Treating README examples as the API contract.** READMEs drift; the reference
   section and the source are the contract.
5. **Missing the "Changed in version X" annotations** under a function entry — the
   signature at the top of the page may include parameters the installed version
   does not have yet, or defaults that differ.
6. **Verifying the function exists but not the claimed kwarg/overload.** The claim
   is about the exact signature element the code uses; quote the parameter list.
7. **Letting research manufacture confidence.** Human evaluators grew MORE confident
   after online research even when wrong (arXiv:2507.19486). Confidence gained while
   reading is not evidence; only the recorded quote is.
8. **Reconciling with Channel B early.** Peeking at probe results before committing
   verdicts destroys the design. Commit `channel-a.md` first.
