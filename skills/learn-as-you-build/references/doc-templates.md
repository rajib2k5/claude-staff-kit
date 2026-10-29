# Doc templates

Three docs and the checkpoint file. Fill every section. If a section does not apply, write "None" and the reason. Do not delete it.

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

## Checkpoint file: `.learning/milestones/NN-checkpoint.md`

The path is the same in every repo. In a git repo, `.learning/` is in the exclude file (see "The answer record" in `SKILL.md`). The widget and the chat show its items. Its Answers table records every answer. The item formats come from `quiz-item-template.md`.

```markdown
# Milestone NN checkpoint

Lesson text: <not adversarially reviewed | reviewed by <reviewer>, <date>>.
Walkthrough: [NN-<topic>](<the path from this file to the walkthrough doc>). Written: <YYYY-MM-DD>.
Attempt: <1, then one more for each restart>.

## Items

### R1. Re-ask 1 of 2: <the missed idea>

<The lesson again, in two lines.>

Read the full version: [<doc title>](<path>#<section>)

<A new question on the same idea.>

A. <option>
B. <option>
C. <option>
D. <option>

### Q1. Lesson 1 of 4: <the idea>

<The lesson.>

Read the full version: [<doc title>](<path>#<section>)

<The question.>

A. <option>
B. <option>
C. <option>
D. <option>

### E1. Explain it back 1

<The question.>

## Answers

| Item | Topic | Pick | Result | Answered on |
|---|---|---|---|---|
| R1 | <idea> | C | right | 2026-01-02 |
| Q1 | <idea> | B | right | 2026-01-02 |
| Q2 | <idea> | A | wrong | 2026-01-02 |
| Q3 | <idea> | | skipped | 2026-01-02 |
| Q4 | <idea> | | | |
| E1 | <idea> | see below | saved | 2026-01-02 |
| E2 | <idea> | | | |

### Explain-it-back answers

#### E1

<The user's text, as saved.>

#### E2

<"Not answered yet." until the user saves an answer.>

## Earlier attempts

<"None. No restart yet." until the first restart. Each restart adds "### Attempt N, moved YYYY-MM-DD", with the old Answers rows and the old explain-it-back texts.>

## Answer key

This section holds the right option and the explanation of every option. Answer the items before you read it.

### R1

Right option: C.

- **A. Wrong.** <the reason>
- **B. Wrong.** <the reason>
- **C. Right.** <the reason>
- **D. Wrong.** <the reason>

### Q1

Right option: B.

- **A. Wrong.** <the reason>
- **B. Right.** <the reason>
- **C. Wrong.** <the reason>
- **D. Wrong.** <the reason>
```

Result is one of `right`, `wrong`, `skipped`, `saved`, or `retired`. Only E rows use `saved`, and only R and Q rows use `skipped`. A row with an empty Result is unanswered. A `retired` row is not asked and not counted. In "N of M answered", M counts the items that are not retired, and N counts those of them that have a Result. An explain-it-back text holds ` / ` where the user wrote a newline. The file holds no grader's notes (see `quiz-item-template.md`).

## Learning log: `LEARNING_LOG.md`

```markdown
# Learning log

Learning mode: full

## Milestones

| # | Topic | Walkthrough | Concepts | Checkpoint | Pairs | Re-asks | Explain-it-back |
|---|---|---|---|---|---|---|---|
| 01 | <topic> | [01-topic](docs/milestones/01-topic.md) | [name](docs/concepts/name.md) | done 2026-01-01 | 3 of 4 right | 1 of 1 cleared | 5 of 7 passed |
| 02 | <topic> | [02-topic](docs/milestones/02-topic.md) | none | in progress, 3 of 8 answered | | | |
| 03 | <topic> | [03-topic](docs/milestones/03-topic.md) | none | owed | | | |

## Missed topics

| Topic | Lesson | Missed on | Re-asked | Cleared |
|---|---|---|---|---|
| <idea> | M01 lesson 3 | 2026-01-01 | | |

## Owed checkpoints

- Milestone 02 (in progress). Say "resume the quiz" to catch up.
- Milestone 03 (deferred). Say "quiz me on milestone 3" to catch up.
- Milestone 04 (docs owed). Say "write the docs for milestone 4" to catch up.
```

The `Learning mode:` line is the only line that `off` mode writes. When the user switches modes, update it. While a checkpoint is open, its Checkpoint cell reads `in progress, N of M answered`. The cell does not link the checkpoint file. That file is git-excluded, so a link would break in every other clone and on GitHub. The path is always `.learning/milestones/NN-checkpoint.md`. From attempt 2 on, the cell also names the attempt. Right after a restart, it reads `in progress, attempt 2, 0 of M answered`. When to update the cell: "Bring the log up to date" in `SKILL.md`. If an open checkpoint becomes owed, keep its cell and add the milestone to the owed list. When you grade the results, set the cell to `done <date>` and fill the Pairs, Re-asks, and Explain-it-back columns with the totals from `quiz-item-template.md`. Keep a topic on the missed-topics list. When the user answers a new question on it correctly, fill in Cleared. Do not re-ask a topic that has a Cleared date.
