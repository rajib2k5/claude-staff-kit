---
name: "code-mods-essentials"
description: "Build custom hooks and extensions for Claude Code. Use when writing mods that monitor context/tokens, validate operations, or create review interfaces. Covers hook patterns, state management, UI rendering, testing, and marketplace distribution."
---

# Claude Code Mods Essentials

Build custom hooks and extensions that modify Claude Code behavior without touching core code. Mods intercept system events, observe and rewrite operations, and create custom UI surfaces — all inside a plugin architecture.

## When to Use This

You're building a mod when you need to:
- **Monitor state**: Track context window usage, token depletion, performance metrics (Token Weather pattern)
- **Validate operations**: Gate destructive commands, confirm risky actions (Blast Radius pattern)
- **Review changes**: Inspect file modifications, provide post-execution feedback (Replay Theater pattern)
- **Extend Claude Code UI**: Add custom panes, status indicators, or interactive overlays

## Core Concepts

**Mods are JavaScript/TypeScript hook modules** that run inside Claude Code as part of a plugin. They use a middleware pattern: hooks respond to system events and can observe, rewrite, or block behavior.

**Event interception** is how mods react. Common events:
- `tool.call` — a tool is about to execute
- `tool.result` — a tool has returned a result
- `ui.render` — the UI is about to render something
- `turn.complete` — a turn has finished
- `session.start` — a session begins

**State persistence** via `$.state` survives hot reloads during development. Store config, history, or counters here.

**Custom UI** can render at multiple layers:
- Panes (panels in the sidebar)
- Status lines (inline, persistent)
- Overlays (above the prompt or above output)
- Toast notifications

## Quick Start: Token Weather Example

The blog post's Token Weather mod tracks remaining context window in real time:

```typescript
export const hooks = {
  'turn.complete': async (turn, { $ }) => {
    const tokens = turn.usage?.total || 0;
    const remaining = 200000 - tokens;
    $.ui.status(`Tokens: ${tokens} | Remaining: ${remaining}`);
    $.state.lastTokenCount = tokens;
  }
};
```

This attaches a hook to `turn.complete`, reads the token count from the turn metadata, and displays it in Claude Code's status line. The `$.state` persists across reloads.

## Key Patterns

Read the phase references for depth on each:

- **Phase 1: Hook Architecture** — how hooks chain, what events exist, when they fire
- **Phase 2: State & Persistence** — using `$.state`, hot reload safety, storing mutable data
- **Phase 3: UI Rendering** — drawing in panes, status lines, overlays, and above-prompt zones
- **Phase 4: Real-World Patterns** — Token Weather, Blast Radius, Replay Theater in detail
- **Phase 5: Testing & Validation** — testing hook behavior, CI integration
- **Phase 6: Packaging & Distribution** — shipping mods as plugin artifacts via marketplace

Start with Phase 1 to understand hook mechanics. Jump to Phase 4 if you already know hooks and want pattern recipes.

## Open Questions

These remain unexplored in the current sources:

- **Full Hook API surface** — beyond the examples shown, what other hooks exist? Are there lifecycle hooks for mods themselves?
- **Performance and limits** — how many hooks can a mod safely intercept? Are there render performance considerations for frequent UI updates?
- **Testing infrastructure** — how do mods fit into Claude Code's own CI? Is there a testing harness or sandbox?
- **Hot reload edge cases** — when state persists across hot reloads, what data types are safe? Are there footguns?

These questions point you to official Claude Code docs or deeper dives as you move into production mods.