---
name: subagent-model-routing
description: Every delegated subagent must be launched with an explicit model; adversarial validation is never downgraded from Opus.
metadata:
  type: feedback
---

Never let a subagent silently inherit the session model. Pass the model explicitly, every time:

| Work type | Model |
|---|---|
| Simple / mechanical — locate, inventory, transcribe, count | latest **Sonnet** |
| Complex — design, root-cause, tradeoffs, data correctness, cost | latest **Opus** |
| **Adversarial validation** | latest **Opus**, never downgraded |

Prefer the short aliases (`opus`, `sonnet`, `haiku`, `fable`) — they track the current generation without
being edited. When classification is ambiguous, use Opus.

**Why:** the cost/quality tradeoff is sharply different for mechanical versus reasoning-heavy work, and a
weak validator is actively harmful — it confirms plausible arithmetic and produces false confidence, which
is worse than no validation. A mis-routed simple task costs tokens; a mis-routed complex task costs a bad
change.

**How to apply:** set `model:` in every agent frontmatter under `~/.claude/agents/` (all 19 do), and pass
`model=` on every `Agent` call. Launch independent subagents in a single message so they run in parallel;
mixing models across concurrent agents — Sonnet for lookups, Opus for analysis — is the intended pattern.
See [[adversarial-validation-mandate]] and full rule `~/.claude/rules/agent-models.md`.
