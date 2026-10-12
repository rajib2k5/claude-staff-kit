# evidence-gated-validation

An Agent Skill that validates AI-generated code — any programming language, with a
dedicated probe library for ML/AI algorithms — using **evidence-gated validation
with orthogonal dual-channel auditing**.

**The technique in one paragraph.** The code under validation is decomposed into
atomic, falsifiable claims (this API exists at the installed version; this call does
what the code assumes; this loop implements the named algorithm; this tolerance is
achievable; this runs on this platform). Every material claim starts REJECTED. Two
independent audit channels then attack the ledger: **Channel A** verifies claims
against primary documentation only (versioned official docs, library source,
changelogs, original papers) and never executes anything; **Channel B** verifies
claims empirically only (import probes, signature introspection, minimal execution
probes, property-based and metamorphic tests, ML probes like gradient checks and
overfit-tiny-batch) and never reads documentation. Neither channel sees the other's
findings until both have committed written verdicts. A claim is accepted only when
both channels confirm it; when they diverge, the claim is split into sub-claims and
both channels re-audit each, recursively, until convergence or an UNRESOLVED leaf
that blocks acceptance and escalates to the human with both channels' evidence.

## Why two channels instead of one adversarial reviewer

A single LLM reviewer — even a different model — is a weak channel. The evidence:

- LLM errors are correlated across providers and get MORE correlated as models
  improve: models agree ~60% of the time when both are wrong
  ([Kim et al., ICML 2025](https://arxiv.org/abs/2506.07962)); a 9-judge panel
  across 7 model families yields only ~2.2–2.5 effective independent votes
  (per-dataset n_eff 2.18/2.35/2.48)
  ([arXiv:2605.29800](https://arxiv.org/html/2605.29800v1)).
- The 1986 Knight & Leveson refutation of N-version independence (IEEE TSE
  SE-12(1):96–109, DOI
  [10.1109/TSE.1986.6312924](https://doi.org/10.1109/TSE.1986.6312924) — paywalled;
  citation verified via Crossref) was replicated with 2026 coding agents: 3.7× more coincident failures than
  independence predicts, across 5 harnesses, 23 models, and 3 languages
  ([arXiv:2606.20158](https://arxiv.org/html/2606.20158v1)).
- What actually decorrelates is the *evidence source*, not the model: a
  deterministic documentation-derived oracle scored precision 1.00 where an LLM
  judge on the same task scored 0.50–0.67
  ([Hallucination Inspector, 2026 preprint](https://arxiv.org/html/2604.20202)).
- Verifiers must not see the generator's framing: telling a reviewer the code is
  bug-free collapses defect detection by up to 93.5 percentage points, and hiding
  that framing largely restores it — 12/12 in the paper's interactive study, 16/17
  in its autonomous-agent study
  ([arXiv:2603.18740](https://arxiv.org/abs/2603.18740)).
  Verification questions answered in a separate context outperform ones that can
  see the draft ([CoVe, ACL Findings 2024](https://arxiv.org/abs/2309.11495)).
- Tests must be derived from the spec, never from the candidate code: LLMs adhere
  to whatever solution they were shown even when told not to
  ([arXiv:2502.13820](https://arxiv.org/html/2502.13820v3),
  [arXiv:2507.06920](https://arxiv.org/html/2507.06920v2)), and existing suites are
  weak — an 80× test expansion cut HumanEval pass rates by up to 19.3–28.9%
  ([EvalPlus, NeurIPS 2023](https://arxiv.org/abs/2305.01210)).

Honest caveat: the two channels are *better* decorrelated than two models, but they
are not probabilistically independent — both can inherit the same misreading of a
shared spec — so the skill reports "dual-confirmed", never a multiplicative
reliability guarantee. And no published study yet measures the pairwise error
correlation between a doc-grounded and an execution-grounded checker directly; the
design rests on the adjacent evidence above. It also cuts both ways: the same
N-version replication ([arXiv:2606.20158](https://arxiv.org/html/2606.20158v1))
found that model diversity still helps substantially despite the correlation —
majority-voting triples cut mean failure counts roughly 3× versus single versions —
so this skill's claim is that evidence-source diversity is *complementary* to model
diversity, not a replacement for a second-model review.

## Is this the most efficient way to validate code?

No — it is the most *reliable* well-supported way, and it is deliberately not the
cheapest. Honest framing: full dual-channel EGV costs two complete audit passes,
and ~4 in 10 divergences are false alarms that take investigation time
([arXiv:2510.09907](https://arxiv.org/html/2510.09907v1)). What the evidence
supports is a **tiered** practice — deterministic gates (build/types/tests) always
and for free, a single execution channel with the falsifiability check for routine
changes, and the full dual-channel protocol reserved for where model priors are
least trustworthy: unfamiliar libraries, version-sensitive code, ML/numerics,
security/money/irreversible operations, and no-test-oracle situations. SKILL.md's
"When to run this protocol" section encodes exactly that triage. What you get for
the Tier-2 cost is coverage of the failure class nothing cheaper catches: code that
runs, looks right, and is wrong.

## What's in the box

```
evidence-gated-validation/
├── SKILL.md                          # the operational protocol
├── references/
│   ├── claim-extraction.md           # building the claims ledger, worked ML example
│   ├── docs-audit.md                 # Channel A field manual
│   ├── runtime-audit.md              # Channel B field manual (per-language probes)
│   ├── ml-validation.md              # ML probe library (gradient check, leakage, …)
│   └── divergence-and-verdict.md     # split protocol, escalation, report template
├── validation/
│   ├── self-validation-report.md     # this skill, validated by its own protocol
│   ├── self-validation-ledger.md     # pre-registered ledger for that audit
│   ├── self-validation-channel-a.md  # documentation channel's verbatim evidence
│   ├── self-validation-channel-b.md  # runtime channel's verbatim evidence
│   ├── research-audit-report.md      # the research corpus, audited the same way
│   ├── research-audit-ledger.md      # pre-registered ledger (15 lit + 2 empirical)
│   ├── research-audit-channel-a.md   # full-text verification of every finding
│   └── research-audit-channel-b.md   # arithmetic + local-replication evidence
├── README.md
└── LICENSE                           # MIT
```

**This skill has been validated with itself — twice.** Before first release, its
own dual-channel protocol was run against its own content: 18 pre-registered
claims, two independent audit agents (one fetching every cited source live, one
executing every probe recipe). The gate caught two real version-drift errors and
four citation defects — see
[validation/self-validation-report.md](validation/self-validation-report.md).
The **research corpus** behind the design was then audited the same way: all 15
load-bearing findings verified against full texts, derived arithmetic recomputed,
and one small local replication run — 1 refutation repaired, 1 failed empirical
prediction reported rather than buried — see
[validation/research-audit-report.md](validation/research-audit-report.md).

## Install

The skill follows the Agent Skills open standard
([agentskills.io/specification](https://agentskills.io/specification)): a directory
named `evidence-gated-validation` containing `SKILL.md` with only the six portable
frontmatter fields. **The directory name must stay `evidence-gated-validation`** —
the spec requires the name field to match it.

### Claude Code

```bash
# personal (all projects)
git clone <this-repo> ~/.claude/skills/evidence-gated-validation
# or project-only
git clone <this-repo> .claude/skills/evidence-gated-validation
# or keep one canonical copy and symlink (documented and deduplicated by Claude Code)
ln -s /path/to/repo/evidence-gated-validation ~/.claude/skills/evidence-gated-validation
```

Invoke with `/evidence-gated-validation`, or just ask: "validate this code",
"check this for hallucinated APIs", "audit this ML implementation". Validate the
install with `claude plugin validate ~/.claude/skills` (recent CLI versions).

### cortex (Snowflake Cortex Code CLI)

The `cortex` CLI reads skills from `.cortex/skills/` **or `.claude/skills/`**
(project) and `~/.snowflake/cortex/skills/` **or `~/.claude/skills/`** (user), per
[Snowflake's extensibility docs](https://docs.snowflake.com/en/user-guide/cortex-code/extensibility#extensibility-skills)
— so an install into `~/.claude/skills/` serves Claude Code and cortex at once.
Manage with `/skill list` / `/skill add <path>`; invoke as
`$evidence-gated-validation`. Honest caveat: Snowflake documents only the
`name`/`description`/`tools` frontmatter fields; this skill uses the standard's
portable field set (`name`, `description`, `license`), which its docs do not
explicitly enumerate — expected to load cleanly, but not verified by us on a live
cortex install. If your `cortex` is a different tool entirely, use the generic
instruction below.

### Other Agent-Skills-compatible CLIs (Codex, Gemini CLI, Cursor, Amp, opencode, …)

Generic instruction: point the CLI's skills directory at this folder. The
widely-adopted cross-client convention is `~/.agents/skills/` (project:
`.agents/skills/`) — note the spec itself does not mandate a location. Coverage
split as of 2026: `~/.claude/skills/` reaches Claude Code, cortex, opencode, Cursor,
and Amp; `~/.agents/skills/` reaches Codex CLI, Gemini CLI, Cursor, and Amp. For
maximum reach, symlink the same checkout into both:

```bash
ln -s /path/to/repo/evidence-gated-validation ~/.claude/skills/evidence-gated-validation
ln -s /path/to/repo/evidence-gated-validation ~/.agents/skills/evidence-gated-validation
```

Validate against the standard with `skills-ref validate ./evidence-gated-validation`
([github.com/agentskills/agentskills](https://github.com/agentskills/agentskills)).

## Usage examples

- "Validate `train.py` — it was generated by an AI assistant. I want the full
  evidence table."
- "Check this diff for hallucinated APIs against the versions in this venv."
- "Audit this Adam implementation against the paper — did the AI skip the bias
  correction?"
- "Verify this ML pipeline for data leakage and gradient correctness before I
  trust the eval numbers."
- "Did the AI skip a step in this migration script? Decompose it into claims and
  audit both channels."

The output is a verdict (pass / fail with required fixes / blocked-escalated) plus
an evidence table where every accepted claim carries a documentation quote AND a
probe transcript.

## Theory and further reading

Key sources the protocol is built on (full citations inline in the reference files):

- Hallucination base rates and persistence:
  [Spracklen et al., USENIX Security 2025](https://arxiv.org/abs/2406.10279) ·
  [Twist et al., arXiv:2509.22202](https://arxiv.org/abs/2509.22202) ·
  [CodeHalu, AAAI 2025](https://arxiv.org/abs/2405.00253) ·
  [Liu et al. 2024](https://arxiv.org/abs/2404.00971)
- Why self-review fails:
  [Huang et al., ICLR 2024](https://arxiv.org/abs/2310.01798) ·
  [Olausson et al., ICLR 2024](https://proceedings.iclr.cc/paper_files/paper/2024/file/9ddc141bdbf9d1db510cefff56c586ad-Paper-Conference.pdf) ·
  [sycophancy, Sharma et al., ICLR 2024](https://arxiv.org/abs/2310.13548) ·
  [self-preference, Wataoka et al.](https://arxiv.org/abs/2410.21819)
- Independence and its limits:
  [Knight & Leveson 1986](https://doi.org/10.1109/TSE.1986.6312924) (paywalled) ·
  [N-version with coding agents](https://arxiv.org/html/2606.20158v1) ·
  [Nine Judges, Two Effective Votes](https://arxiv.org/html/2605.29800v1) ·
  [Kim et al., ICML 2025](https://arxiv.org/abs/2506.07962)
- Grounded verification:
  [CRITIC, ICLR 2024](https://arxiv.org/abs/2305.11738) ·
  [CoVe](https://arxiv.org/abs/2309.11495) ·
  [Hallucination Inspector](https://arxiv.org/html/2604.20202) ·
  [Agentic Property-Based Testing](https://arxiv.org/html/2510.09907v1) ·
  [CodeT](https://arxiv.org/abs/2207.10397)
- Execution-channel integrity:
  [EvalPlus](https://arxiv.org/abs/2305.01210) ·
  [SWE-Bench+](https://arxiv.org/abs/2410.06992) ·
  [METR on reward hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking/) ·
  [EvilGenie](https://arxiv.org/html/2511.21654v2) ·
  [differential fuzzing of refactorings](https://arxiv.org/abs/2602.15761)
- Decomposition and divergence:
  [CORE (triviality gaming)](https://arxiv.org/abs/2407.03572) ·
  [Prover-Verifier Deliberation](https://arxiv.org/abs/2605.25133) ·
  [When and Why Multi-Agent Debate Fails](https://arxiv.org/html/2510.20963v2) ·
  [Should we be going MAD?](https://arxiv.org/abs/2311.17371) ·
  [Recchia et al. on oversight](https://arxiv.org/abs/2507.19486)
- Industrial evidence — evidence gating in production systems:
  [Meta TestGen-LLM, FSE 2024](https://arxiv.org/abs/2402.09171) (generated tests
  accepted only through a build → repeated-pass → coverage-gain filter cascade,
  "eliminating problems due to LLM hallucination") ·
  [Assured LLM-Based Software Engineering](https://arxiv.org/abs/2402.04380) ·
  [Google's LLM code migrations, ICSE-SEIP 2025](https://arxiv.org/abs/2501.06972)
  (every change gated on build + unit tests + migration-specific validators;
  failing changes can route to an ML repair loop, and only passing changes reach
  human review) ·
  [FunSearch, Nature 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10794145/)
  (programs that fail the evaluator are structurally unable to enter the population) ·
  [OpenAI CriticGPT](https://arxiv.org/abs/2407.00215) (LLM critics themselves
  hallucinate bugs; human+critic teams hallucinate less than critics alone) ·
  [GitHub Copilot Autofix docs](https://docs.github.com/en/code-security/concepts/code-scanning/copilot-autofix-for-code-scanning)
  (generator = Copilot, checker = CodeQL re-scan — with a documented gap where the
  checker covers less than the generator) ·
  [AWS static evaluation of code completion, ACL 2023 Industry](https://arxiv.org/abs/2306.03203)
  (static AST analysis and execution catch *different* failure sets — the
  orthogonality claim from a corporate lab) ·
  [AWS Automated Reasoning checks](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-automated-reasoning-checks.html)
  (a formal-logic channel with first-class "channels cannot resolve this" verdicts) ·
  [Lasso Security on package hallucination](https://www.lasso.security/blog/ai-package-hallucinations)
  (an empty hallucinated package drew 30k+ downloads in three months) ·
  [Anthropic, Claude Code best practices](https://code.claude.com/docs/en/best-practices)
  ("Have Claude show evidence rather than asserting success"; if you can't verify
  it, don't ship it)
- Why divergence is not resolved by debate or vote:
  [Kenton et al., NeurIPS 2024](https://arxiv.org/abs/2407.04622) (debate beats
  direct judging only under information asymmetry — an auditor that can read the
  code has none) ·
  [Valmeekam et al.](https://arxiv.org/abs/2310.08118) (a sound external verifier
  scored 88/100 where an LLM verifier scored 55/100 and approved 84% of invalid
  plans) ·
  [Panickssery et al., NeurIPS 2024](https://arxiv.org/abs/2404.13076)
  (self-preference is authorship-driven and causal)
- Where each channel is weak — apply both, trust neither alone:
  [CodeRAG-Bench, NAACL 2025 Findings](https://arxiv.org/abs/2406.14497)
  (gold documentation lifted SWE-bench-Lite 2.3→30.7 but *hurt* DS-1000 and ODEX —
  doc grounding pays off exactly where the model is weak) ·
  [RAGTruth, ACL 2024](https://arxiv.org/abs/2401.00396) (hallucination persists
  even with the correct context supplied)
- Testing foundations:
  [metamorphic testing survey, IEEE TSE 2016](https://eprints.whiterose.ac.uk/id/eprint/110335/1/segura16-tse.pdf) ·
  [Xie et al. 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3082144/) ·
  [Just et al., FSE 2014](https://homes.cs.washington.edu/~mernst/pubs/mutation-effectiveness-fse2014.pdf) ·
  [Chen et al., ASE 2020](https://homes.cs.washington.edu/~rjust/publ/mutants_faults_revisited_ase_2020.pdf) ·
  [ML Test Score](https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/) ·
  [Kapoor & Narayanan on leakage](https://arxiv.org/abs/2207.07048) ·
  [HumanEval](https://arxiv.org/abs/2107.03374)

Note: several of the 2025–2026 sources above are preprints, not peer-reviewed.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Rajib Bahar.
