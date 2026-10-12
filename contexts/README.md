# Contexts — tiered loading

Context is the scarcest resource in a session. These files exist so a session loads **the tier it needs**
rather than everything, and so the same layering works in any project.

## The tiers

| Tier | File | Loaded | Size target |
|---|---|---|---|
| **0 — Always** | `tier0-always.md` | every session, via `~/.claude/CLAUDE.md` | < 100 lines |
| **1 — Role** | `tier1-role-*.md` | when the session's work matches the role | < 150 lines |
| **2 — Domain** | `tier2-domain-*.md` | when the work touches that domain | < 200 lines |
| **3 — Reference** | `~/.claude/rules/*.md` | on demand, one file at a time | any |

## Rules of use

- **Never load a whole tier "just in case".** An unread 200-line file costs the same as a read one.
- Tier 0 contains only what is true in **every** project. Anything project-specific belongs in the
  project's own `CLAUDE.md` (see the `staff-bootstrap` skill).
- A rule file is read when the work reaches it, not preloaded. `rules/README.md` is the index.
- If a tier file starts repeating a rule file, delete the repetition and link instead. Duplicated
  standards diverge, and the divergence is discovered at the worst time.
