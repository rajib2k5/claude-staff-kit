# skill: evidence-gated-validation

Location: live+repo. Lines: 298. Model ids named: none.

Purpose: Validates AI-generated code in any programming language, plus ML/AI algorithm implementations, using evidence-gated validation with two independent audit channels — one researches official documentation, one probes runtime behavior empirically — and accepts a claim only when both converge. Use when asked to validate this code, check AI-generated code for hallucinations, audit this implementation, verify this ML algorithm is correct, confirm an API or kwarg actually exists, or determine whether the AI skipped a step.

Sections:
- Evidence-Gated Validation
- When to run this protocol — cost and tiering
- The protocol, in order
- Step 1 — Freeze the environment
- Step 2 — Claims ledger
- Step 3 — Pre-registration and independence setup
- Mode 1 — dual-subagent (preferred, when the runtime supports subagents)
- Mode 2 — single-context sequential fallback
- Step 4a — Channel A: documentation auditor
- Step 4b — Channel B: runtime auditor
- Step 5 — Convergence gate (per claim)
- Step 6 — Verdict
- Anti-gaming rules (apply to every probe and test you encounter or write)
- Gotchas
