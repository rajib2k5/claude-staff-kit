# evolv-taste-pilot

An **executable** frontend ship gate, plus the precedence overlay that arbitrates the
conflicting upstream taste skills and locks colour and typography to the brand.

The upstream skills describe their pre-flight checks as "mechanical" and then perform them by
re-reading their own output. This plugin runs them.

- **27 source checks** — `ship_gate.py`, each finding citing the upstream section it came from
- **9 rendered checks** — `render_probe.mjs`, the ones that only exist after layout
- **7 attestations** printed rather than silently ticked, because they cannot be mechanised
- **A worked example** that passes 27/27 and 9/9, for diffing against

## Install

```bash
bash install.sh                          # install the skill, verify, smoke-test it
bash install.sh --check                  # prerequisites only
bash install.sh --repo ~/projects/site   # also wire the advisory pilot harness into a repo
```

The installer asserts the install gate (kebab-case name, description under the 500-char cap,
every bundled file resolving) and smoke-tests the gate against the worked example on your
Python before declaring success. Restart Claude Code afterwards so it picks up the skill.

As a Claude Code plugin marketplace instead:

```
/plugin marketplace add /path/to/evolv-taste-pilot
/plugin install evolv-taste-pilot@evolv-skills
```

## Contents

```
skills/frontend-ship-gate/
  SKILL.md                        thin, phased; four references loaded on demand
  references/
    phase-01-countable-checks.md  the 27 source checks and their thresholds
    phase-02-rendered-checks.md   the 9 rendered checks, and why they are separate
    phase-03-layout-taxonomy.md   the ten layout families upstream never defines
    phase-04-precedence.md        EV-1..EV-9 - which rule wins, and the brand lock
    gotchas.md                    failure modes found by running this for real
    worked-example.html           passes 27/27 and 9/9
  scripts/
    ship_gate.py                  source layer
    render_probe.mjs              rendered layer (Playwright optional)
    _record.py                    findings-log writer for the pilot harness
pilot/                            advisory pre-commit harness + override log + rollup
docs/                             the overlay, the pilot plan, the CLAUDE.md snippet
```

## The overlay is not optional

The three upstream skills contradict each other in at least six places and none of them
knows about your brand. `docs/evolv-taste-overlay.md` is the arbitration document they lack.
Copy it somewhere global and point your agent config at it:

```bash
mkdir -p ~/.claude/docs && cp docs/evolv-taste-overlay.md ~/.claude/docs/
cat docs/CLAUDE.md.snippet >> ~/.claude/CLAUDE.md
```

Without that, an agent applies upstream's rules with no precedence — and will happily reach
for a banned palette because four of the upstream files disagree about colour.

## Scope, honestly

This plugin ships **one** skill. The scouting pass that produced it identified four more
candidates from the same surface; all four are deliberately unbuilt, pending a pilot that
tells us whether their rules earn their place. `docs/taste-pilot-plan.md` has that plan. The
plugin structure exists so those four can be added later without re-installing anything.

The rules encoded here come from a real, MIT-licensed body of production experience
(`github.com/Leonxlnx/taste-skill`), but their provenance is **asserted, not measured** —
upstream ships no test artifacts. Treat the ban corpus as a strong prior from someone who has
shipped a lot of AI-generated pages, and let the override log tell you which rules are real.
