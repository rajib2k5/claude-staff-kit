# Global instructions

These apply in every project. Project-level `CLAUDE.md` / `AGENTS.md` files add to this and win
where they conflict.

## Subagent model selection — MANDATORY

Every delegated subagent is launched with an **explicit** model. Never let one silently inherit the
session model: the cost/quality tradeoff differs sharply between mechanical and reasoning-heavy work,
and **adversarial validation must never be downgraded**.

| Work type | Model | Why |
|---|---|---|
| Simple / mechanical | latest **Sonnet** | It is a lookup, not a judgement |
| Complex | latest **Opus** | Needs synthesis, tradeoff reasoning, whole-system context |
| **Adversarial validation** | latest **Opus** — never Sonnet | A weak validator produces false confidence, which is worse than no validation |

When it is ambiguous, use Opus. A mis-routed simple task costs tokens; a mis-routed complex task
costs a bad change.

Full rule, including how to classify a task and how to pass the model: **`~/.claude/rules/agent-models.md`**.

## Validation — mandatory, method routed

Every substantive change is validated; which method is decided by
`~/.claude/skills/evidence-gated-validation/references/validation-router.md` (consequence, oracle,
novelty, claim shape), and the route line goes at the top of the report. Trivial edits, routine code
under tests and prose (rows 1, 2, 10) stop at the gates — row 2 adds one hand mutant per new or changed test — or a Sonnet `verifier`, unless another row also applies; API-existence and unfamiliar-library
claims go to dual-channel EGV; a quant research claim goes to a pre-registered holdout test.

When the router routes the adversarial method (rows 6–9, 12, 13; row-5 procedure claims) the change
is validated by a subagent whose explicit job is to **break the work** — find bugs, wrong numbers,
edge cases, runtime failures. The validator must **execute** checks (compile the SQL, run the build,
round-trip a throwaway row), not read code and opine.

Validators produce false positives too. Confirm every flagged blocker empirically before acting on it.

Agent definition: **`~/.claude/agents/adversarial-validator.md`** (declares `model: opus`).

## Reporting

State measured numbers, not estimates dressed as measurements. If a figure is modelled,
extrapolated, or a sample of one, label it. Quote the window it came from. When a check fails, say so
with the output.

Verification language is reserved: never "tests pass", "the build is green", "verified", "confirmed",
or "faster" without a command **executed in this session**, with its output.

## The standards library

Read on demand — do not preload. Index and conflict-priority order: **`~/.claude/rules/README.md`**.

| Layer | Location | What it is |
|---|---|---|
| **Rules** | `~/.claude/rules/` | 18 standards files. `adversarial-validation.md` is the contract for the adversarial method; the router picks when it runs. |
| **Agents** | `~/.claude/agents/` | 19 subagents, each declaring an explicit `model:`. |
| **Skills** | `~/.claude/skills/staff-*`, `data-*` | 21 workflows. Also discovered by the Cortex CLI. |
| **Commands** | `~/.claude/commands/` | `/bootstrap` `/ship` `/validate` `/deep-review` `/design` `/rca` `/adr` `/dbt-audit` `/sf-audit` `/sf-tune` `/dq` `/standards` |
| **Contexts** | `~/.claude/contexts/` | Tier 0 always · tier 1 per role · tier 2 per domain. |
| **Memory** | `~/.claude/memory/` | Global facts, indexed by `MEMORY.md`. |

Start of session: `~/.claude/contexts/tier0-always.md` is the operating floor — the four questions,
the irreversibility ladder (T0–T4), altitude matching, and when validation is compulsory.

Entering an unfamiliar repo: `/standards` for the map, `/bootstrap` to wire the project up.
Before claiming anything is complete: `/ship`.

**Never copy rule files into a project.** A project's `CLAUDE.md` references this library and records
only what is specific to it — commands, stack, domain invariants.
