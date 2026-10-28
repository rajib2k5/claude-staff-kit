# Rule: Subagent Model Selection

> Global rule, loaded via `~/.claude/CLAUDE.md`. Promoted 2026-08-10 from
> `ndp_jira_ops/.claude/rules/agent-models.md`, with the model ids corrected — the project copy
> still named `claude-sonnet-4-5` as latest Sonnet, which is now a generation behind.

Every delegated subagent MUST be launched with an explicit model. Do not let a subagent silently
inherit whatever the session happens to be running — the cost/quality tradeoff is different for
mechanical work than for reasoning-heavy work, and adversarial validation must never be downgraded.

## The rule

| Work type | Model | Why |
|-----------|-------|-----|
| **Simple / mechanical** subagent tasks | latest **Sonnet** | Fast and cheap; the answer is a lookup, not a judgement |
| **Complex** subagent tasks | latest **Opus** | Needs synthesis, tradeoff reasoning, or whole-system context |
| **Adversarial validation** (any change) | latest **Opus** — never Sonnet | A weaker validator produces false confidence, which is worse than no validation |

## Model ids

The `Agent` tool accepts short aliases, and these are the safest thing to pass because they track
the current generation without being edited:

```
opus | sonnet | haiku | fable
```

Canonical ids in this environment as of 2026-10-28 (models overview page; checked in the skill-gap
study's evidence gate, see `docs/skill-gap-2026-10/validation/` in claude-staff-kit):

- latest Opus: `claude-opus-5-5`
- latest Sonnet: `claude-sonnet-5-5`
- latest Fable: `claude-fable-5-1`
- latest Haiku: `claude-haiku-5-5`. Claude Code needs v2.1.293 or later for it; older builds resolve the
  `haiku` alias to `claude-haiku-4-5-20251001`.

The previous generation (`claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`) is listed as legacy.

**Model ids are not guessable and they roll forward.** Prefer the alias. If you must pin an exact id,
confirm the current set from the `/model` picker or the session banner first, and update this table
when it changes. If the intended model is genuinely unavailable, say so rather than silently falling
back to a weaker one for validation.

## Classifying the task

**Simple → Sonnet.** Locate files or symbols; list which tests touch a function; read a doc and
report what it says; map a call site; mechanical multi-file find/replace reporting; summarize a known
file; transcribe values from one place to another; inventory objects and count them.

**Complex → Opus.** Design or plan a change spanning modules; root-cause a failure with an unknown
cause; reason about concurrency, transactions, or data correctness; schema/API migrations; cost or
capacity modelling; anything where a wrong-but-plausible answer would be acted on and is expensive
to catch later.

When it is ambiguous, use Opus. A mis-routed simple task costs tokens; a mis-routed complex task
costs a bad change.

## How to pass it

```
Agent(
  subagent_type="Explore",
  model="sonnet",            # simple: find the affected tests
  prompt="...",
)

Agent(
  subagent_type="general-purpose",
  model="opus",              # adversarial validation: ALWAYS Opus
  prompt="You are an adversarial validator. Break this...",
)
```

`~/.claude/agents/adversarial-validator.md` declares `model: opus` in its frontmatter so the
validator defaults to Opus even when the caller forgets. Do not override that downward.

Running several subagents concurrently is fine and encouraged — mixing models across concurrent
subagents (Sonnet for the lookups, Opus for the analysis) is the intended pattern. Launch them in a
single message so they run in parallel.

## Two failure modes worth naming

**Delegating verification to a model that cannot verify.** A Sonnet validator will confirm plausible
arithmetic. Cost models, timezone arithmetic, billing mechanics and concurrency reasoning all need
Opus, because the wrong answer looks exactly like the right one.

**Trusting the validator.** Validators produce false positives. In one engagement a validator twice
flagged valid `PARSE_JSON()` usage as a blocker, and another inferred a 25-hour data-pipeline lag
from `MAX(START_TIME)` when the real cause was a service that had been deliberately shut down.
Confirm every flagged blocker empirically — a throwaway round-trip, a real build — before acting.
