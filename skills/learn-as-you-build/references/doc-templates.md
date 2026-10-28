# Doc templates

Three docs. Fill every section. If a section does not apply, write "None" and the reason. Do not delete it.

## Walkthrough doc: `docs/milestones/NN-<topic>.md`

The checkpoint lessons come from this doc. Write it so that a lesson can quote it and link to a section.

```markdown
# Milestone NN: <topic>

Status: <built | built and reviewed>. Reviewed by: <reviewer and date, or "not reviewed">.

## What we built and why

<Three to six sentences. What the milestone does. What the end user of the product can now do or see.>

## Why this design

| Choice | Alternatives | Why this one | What it costs |
|---|---|---|---|
| <the choice> | <one or two real alternatives> | <the reason> | <the trade-off, with a unit if you can measure it> |

## Code walkthrough

Read in this order. Each step names one file and line.

1. `path/to/file.py:12` <what this code does and why it comes first>
2. `path/to/other.py:40` <what it does>

## Data flow

<One input, followed to the output. Name each hop and the data shape at each hop.>

## Pitfalls met and how each is guarded

| Pitfall | How it showed up | Guard (`file:line`) |
|---|---|---|
| <the problem> | <the symptom or the failing case> | `path/to/file.py:77` <the check, test, or constraint> |

## Measured results

| What | Command | Result | Date |
|---|---|---|---|
| <the quantity> | `<the command you ran>` | <the printed value> | <YYYY-MM-DD> |

If nobody measured a value, write "not measured". Never fill a cell from memory.

## Concepts used

- [<concept>](../concepts/<name>.md)
```

## Concept note: `docs/concepts/<name>.md`

```markdown
# <Concept>

## First principles

<The idea from the ground up. Define each term the first time you use it.>

## The maths

<The formula, then one worked number. Say where the number comes from.>

## Assumptions

<What must be true for the idea to hold. One per bullet.>

## Where it breaks

<The inputs or conditions that make the idea fail. Say how the failure shows up.>

## In this project

`path/to/file.py:12` <where the project uses it>
```

## Learning log: `LEARNING_LOG.md`

```markdown
# Learning log

Learning mode: full

## Milestones

| # | Topic | Walkthrough | Concepts | Checkpoint | Pairs | Explain-it-back |
|---|---|---|---|---|---|---|
| 01 | <topic> | [01-topic](docs/milestones/01-topic.md) | [name](docs/concepts/name.md) | done 2026-01-01 | 4 of 5 | 6 of 7 |
| 02 | <topic> | [02-topic](docs/milestones/02-topic.md) | none | owed | | |

## Missed topics

| Topic | Lesson | Missed on | Re-asked | Cleared |
|---|---|---|---|---|
| <idea> | M01 lesson 3 | 2026-01-01 | | |

## Owed checkpoints

- Milestone 02 (deferred). Say "quiz me on milestone 2" to catch up.
- Milestone 03 (docs owed). Say "write the docs for milestone 3" to catch up.
```

The `Learning mode:` line is the only line that `off` mode writes. When the user switches modes, update it. Update the Pairs and Explain-it-back columns from the results message. Keep a topic on the missed-topics list. When the user answers a new question on it correctly, remove it.
