---
name: learn-as-you-build
description: Teach the user the code while you build it, so they can explain the architecture and the code in an interview. Builds one milestone at a time, writes a walkthrough doc, then runs a checkpoint of short lessons, each followed by its own quiz question. Has four modes (full, lite, deferred, off), so a user on a deadline can bypass it. Use on any software project where the user wants to learn the implementation. Triggers - learn as you build, teach me as we build, quiz me on this milestone, walk me through the code, interview prep for this project, learning mode, skip the quiz, no checkpoints, quiz me later.
---

# Learn as you build

Help the user learn the implementation while you build it. The goal: the user can explain the architecture and the code in an interview.

Quoted rules in this file are words of the skill author. Keep their wording. Write lessons and docs in the style of the `simple-english` skill: short sentences, active voice, one idea per sentence.

## Modes

| Mode | Pause at the milestone | Quiz | Docs |
|---|---|---|---|
| `full` | Yes. Wait for "continue". | Lessons with questions, then 5 to 8 explain-it-back questions. | Walkthrough, concept notes, log. |
| `lite` | No. | A 3 to 5 line recap, then at most 3 lesson-and-question pairs. The user can ignore them. | Walkthrough, concept notes, log. |
| `deferred` | No. | None now. Owed checkpoints go in the log. | Walkthrough, concept notes, log. |
| `off` | No. | None. | None. Only the `Learning mode:` line. |

Use `full` for a project that exists to teach the user. Use `lite` when the user wants a taste and wants to keep moving. Use `deferred` on a deadline. Use `off` when the user wants nothing.

Each step down drops one more thing. `lite` drops the pause. `deferred` drops the quiz. `off` drops the docs. `deferred` keeps the docs because the context is fresh now, and the user can catch up later.

### Switch modes

The user can switch at any time with a short phrase. Match the intent, not the exact words.

| The user says | Mode |
|---|---|
| "learning: full", "full checkpoints" | `full` |
| "learning: lite", "keep it light" | `lite` |
| "skip the quiz", "no checkpoints", "I'm on a deadline", "quiz me later", "learning: deferred" | `deferred` |
| "learning: off", "stop the lessons" | `off` |
| "skip this one" | `deferred` for the current milestone only |

Switch at once. Confirm in one line, for example "Mode is now deferred. Say 'learning: full' to switch back." Record a lasting switch in `LEARNING_LOG.md`.

### Set a default

Put one line in the project: `Learning mode: deferred`. It can live in the CLAUDE.md of the project or in `LEARNING_LOG.md`. If the sources disagree, the latest message from the user wins. Then `LEARNING_LOG.md` wins, then CLAUDE.md. You write switches only to `LEARNING_LOG.md`, so it is the newer source. Edit CLAUDE.md only if the user asks.

### Rules for every mode

- **Ask once.** When the skill starts on a project with no mode set, ask which mode to use. Recommend `full` for a learning project. Record the answer as the `Learning mode:` line. Respect it and do not ask again. If the user does not answer, use `deferred` and keep working.
- **When unsure, use `deferred`.** If no mode is set and the user is in a hurry, use `deferred`. Say so in one line.
- **Never block urgent work.** A hotfix, an incident, or "just ship it" never waits for a checkpoint. If a checkpoint is open, mark it owed in the log and do the work.
- **Catch up on request.** "Quiz me on milestone 2" runs that checkpoint from its docs, in any mode. If the walkthrough doc does not exist, say so and offer to write it from the code.
- **A one-off skip is one milestone.** After "skip this one", the next milestone follows the mode again.

## The loop

1. Build one milestone. Do not start the next one.
2. Write `docs/milestones/NN-<topic>.md`. The doc covers what you built and why you chose this design over the alternatives. It has a walkthrough by `file:line`, the data flow, and the pitfalls with their guards.
3. Write a note in `docs/concepts/` for each new idea that needs first principles: the maths, the assumptions, and where it breaks.
4. Update `LEARNING_LOG.md`. It indexes milestones, concepts, quiz scores, and missed topics.
5. In `full` mode, run the checkpoint, then stop. Resume only when the user says "continue" or steers.
6. In `lite` mode, give the recap and pairs, then keep working. If the user does not answer the pairs, mark the checkpoint owed. In `deferred` mode, add the milestone to the owed list, then keep working.

Templates for the three docs: `references/doc-templates.md`.

## The checkpoint

The user set this rule: "Each lesson must be followed immediately by a quiz question and with explanation on why each answer is right or wrong."

Build the lessons from the docs you wrote in steps 2 and 3. Write one pair for each idea the user must keep. Three to six pairs is typical.

**Order.** Lesson 1, its question, lesson 2, its question, and so on. Never put a quiz before the material it tests.

**Each pair:**

1. The lesson is short. It ends with the doc to read for the full version (path and section).
2. The question tests the use of the idea in a new case. It does not ask the user to repeat the lesson. Ask "what does the user get after this crash?", not "does the worker save the key first?".
3. After each pick, explain why every option is right or wrong. Do not explain only the correct one.
4. After a miss, offer a link or button back to that lesson, then return to the same question. The user said: "link missed questions back to the lesson".
5. Log the miss.

**After the last pair,** ask 5 to 8 explain-it-back questions, in the style of an interviewer ("Walk me through what happens when..."). Do not grade yet. Wait until the user sends their results. Then grade each answer against the code and cite `file:line`. Link every miss back to its lesson. Do not show model answers before the results arrive.

**Predict before you look.** You can ask for a guess before a lesson. It is ungraded and never scored. Never put it in the graded quiz.

Pair format and the options checklist: `references/quiz-item-template.md`.

### Worked example

Illustration only. The files and lines below do not exist.

```
LESSON 2 of 4. The worker saves the key before it sends
`jobs/worker.py:38` returns early if the job key exists. `jobs/worker.py:41`
saves the key. `jobs/worker.py:44` sends the email. This order gives
at-most-once delivery. A crash between lines 41 and 44 loses the email.
Full version: docs/milestones/02-job-queue.md, section "Retries".

QUESTION 2. A teammate swaps the two steps. The worker now sends the email
first, then saves the key. The worker crashes between them. The queue
retries the job. What does the user get?
A. Nothing changes. The retry skips the job.
B. No email, the same as before the swap.
C. Two emails. The retry sends the email again.
D. One email. The check at line 38 stops the retry.

AFTER THE PICK, every option:
A. Wrong. The key is now saved after the send. The crash came before the save, so line 38 finds no key.
B. Wrong. That was the result of the old order. Now the first run already sent one email.
C. Right. The first run sent an email, then crashed before it saved the key. The retry passes line 38 and sends again. This order gives at-least-once delivery.
D. Wrong. Line 38 stops a retry only if the key exists. The crash came before the key was saved.

IF THE USER PICKED A, B OR D: show "Review lesson 2", then ask the question again.
```

## Delivery

Choose the format from the tools you have. Never require one tool.

1. If the host offers an inline interactive widget tool, build the checkpoint there. An example is a `show_widget` tool in the Claude desktop app. Follow the setup guide of that tool first. Put every lesson, question, and per-option explanation in the widget up front, so that feedback is instant. The widget needs these parts:
   - **Previous** and **Next** buttons.
   - Instant feedback on every option after a pick.
   - A **Review lesson** button after a miss.
   - A text box for each explain-it-back question.
   - A **Send results** button that posts the picks and the written answers to the chat.
2. If there is no widget tool, or the widget fails, use plain markdown in chat. Send one lesson, then its question with lettered options. The user replies with a letter. Then send the explanation of every option. Repeat for the next pair.

Both formats in detail: `references/delivery.md`.

## Honesty rules

- Take lesson facts from the reviewed docs and from measured results. Never invent a number. Quote a measured number with its command and date. If nobody measured a value, write "not measured".
- Make sure that every `file:line` you cite matches the current file. Line numbers go stale after an edit.
- Start every checkpoint with one line on review status: "Lesson text: not adversarially reviewed." or "Lesson text: reviewed by <reviewer>, <date>." Write it even when the docs were reviewed, because the lesson text is new text. If the source docs were not reviewed either, say that as well. Do not claim a review that did not happen.

## Missed topics

Write each missed topic to `LEARNING_LOG.md`: the topic, the lesson, and the date. At the next checkpoint, re-ask up to two missed topics before the new pairs. Use a new question on the same idea. A right answer clears the topic. A wrong answer keeps it and links the lesson again. In `lite` mode, re-asks count toward the limit of three pairs.

## Token economy

Build every lesson from the docs that already exist for the milestone. Do not research, search the web, or start a research agent to make a quiz. If a lesson needs a fact the docs lack, read the cited code lines, or drop the lesson. If you delegate the drafting, pass an explicit model (see `~/.claude/rules/agent-models.md`). Grade explain-it-back answers on the strongest model you have, because grading is judgement.

## References

- `references/doc-templates.md`: the walkthrough doc, the concept note, and `LEARNING_LOG.md`.
- `references/quiz-item-template.md`: one lesson-and-question pair, the options checklist, the explain-it-back items, and the grading format.
- `references/delivery.md`: the widget specification, the markdown fallback, and the results message.
