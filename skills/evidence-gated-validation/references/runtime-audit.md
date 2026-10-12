# Channel B field manual: the runtime auditor

Contents:
1. Charter and the probe contract
2. Claim-to-probe mapping
3. Per-language probe recipes
4. Sandbox hygiene
5. The falsifiability / mutation check (mandatory)
6. Probe output recording format
7. Exit-code reference
8. Known probe traps (false-verdict generators)

## 1. Charter and the probe contract

Channel B verifies each ledger claim **empirically only**: it executes probes and
records what actually happened. It never consults documentation, changelogs, or
papers, and (in dual-subagent mode) never sees Channel A's findings before
committing its own in writing. In the single-context fallback the executing context
has already seen Channel A's verdicts; independence there rests on the probes having
been pre-registered before any docs were read and being executed exactly as written
— any deviation from a pre-registered command is PROBE_INVALID (see SKILL.md,
Mode 2 caveat).

Every probe is a *refutation attempt* with a three-part contract:

1. **Claim** — one atomic sentence from the ledger.
2. **Probe** — a command whose **exit status encodes the verdict** (0 = claim
   survived, non-zero = refuted). Prefer exit codes over parsing prose.
3. **Falsifier** — a deliberately broken variant the probe MUST reject (section 5).

Probe verdicts: CONFIRMED / REFUTED / UNVERIFIABLE — plus an internal
**PROBE_INVALID** state for probes that malfunctioned (timeout, nothing collected,
bad sandbox). PROBE_INVALID is never reported as REFUTED; rewrite the probe.

## 2. Claim-to-probe mapping

| Claim category | Probe type |
|---|---|
| API: package/module exists | import/require probe in a subprocess |
| API: symbol exists | attribute/export probe, then a **call** on tiny inputs (see trap 8.3) |
| API: kwarg/signature | signature introspection AND a binding/call probe; agreement required |
| API (static languages) | compile probe: `tsc --noEmit`, `go build ./...`, `rustc --emit=metadata`, `javac`, `gcc -fsyntax-only -Werror=implicit-function-declaration` |
| Semantic | minimal execution probe with a known-value assertion, or a metamorphic relation (two runs whose outputs must relate in a known way) |
| Algorithmic | reference-implementation comparison, property-based test derived from the claim (never from the code), gradient check for ML (see ml-validation.md) |
| Numeric | direct measurement against the claimed value/tolerance in float64 |
| Environmental | version probe + warnings-as-errors run |

Semantic probes must be derived from the **claim**, not from reading the
implementation for inspiration — LLM-written tests are biased toward whatever code
they were shown, even when told not to be (arXiv:2502.13820), and directly generated
test cases achieve detection rates often below 60% (arXiv:2507.06920). The
pre-registered ledger is the spec; probe it.

## 3. Per-language probe recipes

All commands below run under the sandbox wrapper of section 4. `rc` = exit code.

### Python

```bash
# module importable (no side effects)
python3 -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('pkg') else 1)"
# symbol exists
python3 -c "import pkg,sys; sys.exit(0 if hasattr(pkg,'sym') else 1)"
# signature + kwarg
python3 -c "import inspect,pkg; print(inspect.signature(pkg.fn))"
python3 -c "import inspect,pkg,sys; p=inspect.signature(pkg.fn).parameters; sys.exit(0 if 'kw' in p else 1)"
# will this exact call bind?
python3 -c "import inspect,pkg; inspect.signature(pkg.fn).bind(1, 2, kw=3)"
# installed version (authoritative)
python3 -c "import importlib.metadata as m; print(m.version('dist-name'))"
# which file actually loaded
python3 -c "import pkg; print(pkg.__file__)"
# deprecations surface as failures
python3 -W error::DeprecationWarning -W error::FutureWarning -W error::UserWarning -c "..."
# doctest / unit probes
python3 -m doctest file.py && python3 -m unittest -q test_module
```

Include `UserWarning` in warnings-as-errors: PyTorch emitted its
softmax-without-dim deprecation as a `UserWarning`, which
`-W error::DeprecationWarning` alone misses (measured).

### JavaScript / TypeScript

There is no `inspect.signature` equivalent — `Function.length` stops at the first
default/rest parameter and native functions stringify to `[native code]`. Sound
probes are limited to:

```bash
# CJS member exists
node -e "const m=require('mod'); process.exit(typeof m.member==='function'?0:1)"
# ESM named export — checked at link time, before execution; best JS existence probe
node --input-type=module -e "import {name} from 'mod'; console.log(typeof name)"
# installed version / resolution
node -e "console.log(require('pkg/package.json').version)"
node -e "console.log(require.resolve('pkg'))"
npm ls --json --depth=0        # missing dep -> rc=1, code ELSPROBLEMS
node --test t.test.js          # zero-dependency test runner
# parameter names/types: the ONLY way is the shipped .d.ts
tsc --noEmit --strict probe.ts # write a throwaway .ts importing the exact symbol
```

### Go

```bash
go build ./...     # non-main packages: compile check only, objects discarded
go vet ./...       # heuristic diagnostics; guidance, not proof
go list -m all     # resolved module versions
```

Prefer the compile probe over `go doc` for existence — `go doc`'s error messages are
known to misattribute a wrong symbol name to a missing package.

### Rust

```bash
rustc --edition 2021 --emit=metadata --out-dir "$TMP" probe.rs   # ~22 ms type check
cargo check --offline --message-format=json                       # rc=101 on failure
cargo metadata --offline --format-version 1 --no-deps             # resolved versions
```

Never `-o /dev/null` with `--emit=metadata` — it fails trying to create
`/dev/rmeta*`; use `--out-dir`.

### Java

```bash
javap -p -s -cp "$CP" com.foo.Bar          # members + exact erased descriptors
javac -d "$TMP" -cp "$CP" Probe.java       # stronger: compile a call to the exact overload
```

`javac` on a throwaway probe file resolves overloads and generics that
`javap | grep` gets wrong.

### C / C++

```bash
# C: MANDATORY flag, or the probe is unsound (see trap 8.1)
gcc -fsyntax-only -Werror=implicit-function-declaration probe.c
g++ -fsyntax-only probe.cpp                # C++ has no implicit-decl hole
# header present / macro defined — preprocessor only
echo '#include <openssl/ssl.h>' | gcc -E -x c - >/dev/null
# layout/ABI claims for free at compile time
#   static_assert(offsetof(struct s, field) > 0, "...");
# bisect -std= to find the true minimum language standard
```

### SQL

`EXPLAIN` prepares (full syntax + schema resolution) without executing:

```bash
sqlite3 file.db "EXPLAIN SELECT col FROM t WHERE x=1;"     # rc=1: no such column/table/function
sqlite3 :memory: "SELECT name FROM pragma_function_list;"  # what THIS build supports
sqlite3 file.db "SELECT name,type FROM pragma_table_info('t');"
# dry-run a write: BEGIN; <stmt>; SELECT check; ROLLBACK;
```

PostgreSQL analogues: `EXPLAIN` (never `EXPLAIN ANALYZE` — it executes), `PREPARE`,
`\d table`, `BEGIN ... ROLLBACK` (untested here; verify locally first).

### Shell

```bash
bash -n script.sh          # parse-only; rc=2 on syntax error; provably does not execute
bash -c 'type -t builtin_name'
```

`bash -n` is NOT a portability check — bashisms parse clean under both `bash -n` and
`dash -n` yet fail at dash runtime. Use ShellCheck for portability if available.

## 4. Sandbox hygiene

Every probe runs with: **timeouts, no network, a throwaway temp dir, a clean
environment**. Verified unprivileged Linux recipe:

```bash
WORK=$(mktemp -d)
# Capture the target interpreter's real library paths BEFORE entering the sandbox.
# env -i with HOME=$WORK relocates the per-user site-packages lookup, hiding every
# `pip install --user` package — which turns genuinely installed packages into
# false REFUTED import probes (measured: torch installed under ~/.local imports
# fine outside the wrapper, find_spec returns None inside it). PYTHONPATH carries
# the real paths through:
SITEPATH=$(python3 -c 'import site,os;print(os.pathsep.join(site.getsitepackages()+[site.getusersitepackages()]))')
env -i PATH=/usr/bin:/bin HOME="$WORK" TMPDIR="$WORK" PYTHONPATH="$SITEPATH" \
    PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=0 LC_ALL=C TZ=UTC \
  timeout --kill-after=5 30 \
  unshare --user --map-root-user --net -- \
  bash -c 'ulimit -t 10 -v 2097152 -f 204800 -u 256 -c 0; cd "$TMPDIR"; exec "$@"' _ "$@"
```

If the target environment is a venv, capture `SITEPATH` with — and run probes
through — the venv's own interpreter (`"$VIRTUAL_ENV/bin/python"`), not the system
`python3`.

**Wrapper self-test (mandatory, before the first real probe):** run the import
probe inside the wrapper against one package you have verified is installed
*outside* the wrapper. If it returns rc=1, the sandbox is eating the environment —
abort; every probe result from that wrapper is PROBE_INVALID until the wrapper is
fixed. This class of sandbox failure must never be readable as a refutation.

- `PYTHONHASHSEED=0` exists to make probe runs reproducible. Probes whose *purpose*
  is to detect hash-order nondeterminism — the cross-process determinism probe in
  `ml-validation.md` section 5 — must run with `PYTHONHASHSEED` **unset** (this is
  the one sanctioned deviation from the wrapper env; with the pin in place that
  probe always reports determinism, even on genuinely order-dependent code).
- `timeout -k`: rc=124 on wall-clock breach, 137 if the child ignores SIGTERM.
- `unshare --net`: network unreachable (errno 101) without root. Note it does NOT
  hide the filesystem; use bubblewrap for that tier (`--clearenv` must come FIRST —
  bwrap applies args in order and a later `--clearenv` wipes your `--setenv`s).
- `env -i`: parent secrets invisible to the probe (verified).
- In-process guards are not sandboxes: OpenAI's HumanEval harness ships a
  `reliability_guard` and still states it "is NOT a security sandbox"
  (https://github.com/openai/human-eval).

## 5. The falsifiability / mutation check (mandatory for every load-bearing probe)

A probe that cannot fail is decoration. For every probe supporting a verdict on a
material claim, a falsifier run is required — the record format in section 6 has no
optional fields, and a record without a non-zero `falsifier_rc` is PROBE_INVALID,
never CONFIRMED. For each such probe:

1. Run probe on the original code → expect pass. Record checksum of the original.
2. Apply ONE targeted mutation: boundary flip (`<` → `<=`), return-value swap,
   operator swap, negated condition, dropped branch.
3. Run the probe on the mutant → it MUST fail. If it passes, discard the probe and
   write one that discriminates.
4. Restore the original and verify the checksum matches.

Measured demonstration of why this is not optional — code and suite:

```python
def clamp(x, lo, hi):
    if x < lo: return lo
    if x > hi: return hi
    return x
# tests: clamp(5,0,10)==5, clamp(-1,0,10)==0, clamp(99,0,10)==10  -> all pass
```

Mutant `if x < lo` → `if x <= lo`: **survives** (suite still passes, rc=0). Mutant
`return x` → `return lo`: killed. One of the two hand mutants survived a suite that
looks complete — the boundary was never tested. Published corroboration: expanding
HumanEval's tests 80× cut measured pass@k by 19.3–28.9% (EvalPlus, arXiv:2305.01210).

**Python-specific trap that corrupts mutation runs (measured):** CPython's
`__pycache__` invalidation key is (mtime in whole seconds, file size). Two mutants of
identical byte length applied within the same second collide, and the second run
executes the FIRST mutant's stale bytecode — a false pass. Mitigations that work:
`python3 -B`, `PYTHONDONTWRITEBYTECODE=1`, `rm -rf __pycache__` per run, or a fresh
`PYTHONPYCACHEPREFIX` per run. `--check-hash-based-pycs always` does NOT fix it.

Full mutation-testing tools (mutmut, cosmic-ray, StrykerJS, cargo-mutants, PIT) are
the scaled-up version of this idea; for an audit session, one hand-written mutant per
load-bearing probe is the O(1) adaptation.

## 6. Probe output recording format

One record per probe, appended to `channel-b.md`:

```
claim_id:      C4
probe_cmd:     <exact argv, exactly as executed>
sandbox:       probe-run.sh defaults        # wrapper + limits used
rc:            0
stdout:        |
  <verbatim, untrimmed unless huge; then head+tail with a note>
stderr:        |
  <verbatim>
wall_time:     0.41s
toolchain:     python3 3.12.3, torch 2.5.1  # versions in effect
falsifier_cmd: <the mutated variant run>
falsifier_rc:  1                             # MUST be non-zero
verdict:       CONFIRMED                     # CONFIRMED | REFUTED | UNVERIFIABLE | PROBE_INVALID
```

Record the output, not your summary of it. Agents have been measured gaming visible
graders — reading reference answers from the grader's stack, monkeypatching timing,
replacing scoring functions (METR,
https://metr.org/blog/2025-06-05-recent-reward-hacking/) — and detection required
reading raw transcripts. The verbatim block is what makes the audit auditable.

## 7. Exit-code reference (measured unless noted)

| Command | Success | Failure / special |
|---|---|---|
| `python3 -c` probe | 0 | 1 uncaught exception |
| `pytest` | 0 | 1 failures; **5 = no tests collected → PROBE_INVALID, never a pass** (doc) |
| `node -e` | 0 | 1; **9 = bad node option** |
| `npm ls --json` | 0 | 1 + `ELSPROBLEMS`; **rc=0 on an empty project — assert the package is listed** |
| `tsc --noEmit` | 0 | 1 (doc; unverified) |
| `cargo check` | 0 | **101**, not 1 |
| `rustc --emit=metadata --out-dir D` | 0 | 1 |
| `gcc/g++ -fsyntax-only` | 0 | 1 (C needs the implicit-decl flag) |
| `sqlite3 "EXPLAIN ..."` | 0 | 1 |
| `bash -n` | 0 | **2** (measured; the bash manual guarantees only "non-zero") |
| `timeout N` | passthrough | **124** timed out; **137** SIGKILL via `-k` or CPU ulimit |

## 8. Known probe traps (each one is a false-verdict generator)

1. **C implicit declarations — version-dependent trap.** On GCC ≤ 13,
   `gcc -fsyntax-only` returns rc=0 for a call to a *nonexistent* function —
   implicit declaration is only a warning (measured on 13.3.0; GCC 13 docs:
   "made into an error by -pedantic-errors"). On GCC ≥ 14 it is an error by
   default (GCC 14 porting guide: "In GCC 14, these issues are now reported as
   errors"). Do not rely on either default: always pass
   `-Werror=implicit-function-declaration` explicitly — it is correct on every
   version. `-std=c23` also errors, but only where recognized (GCC ≥ 14; on 13.x
   the option is rejected outright and its `-std=c2x` spelling still only warns —
   measured).
2. **Python `**kwargs` swallows anything.** A call probe on a `**kwargs` function
   "confirms" fabricated kwargs. Sound rule: kwarg ∈ `signature.parameters` AND no
   VAR_KEYWORD parameter; otherwise UNVERIFIABLE. But signatures lie too:
   `json.dumps` ends in `**kw` yet rejects unknown kwargs at a strict callee. Run
   BOTH the signature probe and the call probe; disagreement is itself a finding.
3. **`hasattr` is not existence.** PyTorch keeps removed functions as attributes
   that raise "deprecated ... and is now removed" only when CALLED (`torch.solve`,
   `torch.symeig`, ...). Call on tiny inputs inside try/except; never trust getattr.
4. **`inspect.signature` on C builtins** raises `ValueError` — that means *unknown*,
   never *absent*. Fall back to a call probe; verdict UNVERIFIABLE if both fail to
   decide.
5. **Value validation may be deferred.** scikit-learn validates parameter values at
   `fit()` time, not `__init__`: `LogisticRegression(C='big')` constructs silently.
   Instantiation probes must also call `.fit()` on a few random rows.
6. **`npm ls` on an empty project exits 0** (`(empty)`), indistinguishable from
   healthy. Assert the expected package appears in the output.
7. **Warnings filters.** Deprecations hide unless promoted to errors — and the
   category varies (UserWarning vs DeprecationWarning vs FutureWarning). Promote all
   three.
8. **One flaky failure is not refutation.** Async/concurrency flakiness is common;
   re-run a failing probe up to 3× in a fresh sandbox. Persistent failure = REFUTED;
   intermittent = record as flaky and treat the probe as PROBE_INVALID unless the
   claim itself is about determinism.
9. **The probe must not read the implementation for its expected values.** An
   expected value computed by calling the code under test is a tautology. Expected
   values come from the claim (known constants, reference implementations,
   metamorphic relations).
