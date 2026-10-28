---
name: learn-as-you-build
description: Teach the user the code while you build it, so they can explain the architecture and the code in an interview. Builds one milestone at a time, writes a walkthrough doc, then runs a checkpoint of short lessons, each followed by its own quiz question. Has four modes (full, lite, deferred, off), so a user on a deadline can bypass it. Use on any software project where the user wants to learn the implementation. Triggers - learn as you build, teach me as we build, quiz me on this milestone, interview prep for this project, learning mode, skip the quiz, quiz me later.
---

# Learn as you build

Help the user learn the implementation while you build it. The goal: the user can explain the architecture and the code in an interview.

Quoted rules in this file are words of the kit author. Keep their wording. Write lessons and docs in the style of the `simple-english` skill: short sentences, active voice, one idea per sentence.

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

| The user says | Mode | Confirm in one line |
|---|---|---|
| "learning: full", "full checkpoints" | `full` | "Mode is now full: pause at each milestone, lessons, quizzes, docs. Say 'learning: deferred' to skip the quizzes." |
| "learning: lite", "keep it light" | `lite` | "Mode is now lite: no pause, a short recap and up to 3 pairs, docs still written. Say 'learning: deferred' to skip the quizzes." |
| "I'm on a deadline", "quiz me later", "no learning checkpoints", "learning: deferred" | `deferred` | "Mode is now deferred: no quizzes, docs still written. Say 'learning: off' to skip the docs too." |
| "learning: off", "stop the lessons" | `off` | "Mode is now off: no quizzes, no docs. Say 'learning: deferred' to get the docs back." |
| "skip the quiz" | No quiz for this milestone. The mode does not change. | "Skipped the quiz for milestone N. Say 'learning: deferred' to skip all of them." |

Switch at once. Every confirmation states the scope and what still happens. Record a lasting switch in `LEARNING_LOG.md`. A one-milestone skip is not lasting: add that milestone to the owed list. In `off` mode, a skip writes nothing.

### Set a default

Put one line in the project: `Learning mode: deferred`. It can live in the CLAUDE.md of the project or in `LEARNING_LOG.md`. If the sources disagree, the latest message from the user wins. If no message decides, the less intrusive mode wins (`off`, then `deferred`, then `lite`, then `full`). Say which mode you use in one line. When you write the mode line to CLAUDE.md, write the same line to `LEARNING_LOG.md`. If CLAUDE.md holds a less intrusive line than the user's switch, say in one line that CLAUDE.md wins next session, and offer to change it.

In a shared repo, add `LEARNING_LOG.md` to `.git/info/exclude` before you create it. That file stays on this machine. Say so in one line. One developer's mode must not change the mode for others. When you ask the mode question in a shared repo, also ask whether the milestone docs belong in the repo. If not, write them under `.learning/` and add that path to `.git/info/exclude` too.

### Rules for every mode

- **Ask once.** When the skill starts on a project with no mode set, ask which mode to use. Recommend `full` for a learning project. Record the answer as the `Learning mode:` line. Respect it and do not ask again. If the user does not answer, write `Learning mode: deferred` to `LEARNING_LOG.md` and say so in one line. Then keep working.
- **Ask only before a build.** Ask the mode question only before you build. A request to explain existing code is not a build. Answer it, and do not ask.
- **When unsure, use `deferred`.** If no mode is set and the user is in a hurry, use `deferred`. Say so in one line.
- **Never block urgent work.** A hotfix, an incident, or "just ship it" never waits for a checkpoint. If a checkpoint is open, mark it owed in the log and do the work. Doc writing never delays urgent work. Log "docs owed" and continue.
- **Catch up on request.** "Quiz me on milestone 2" runs that checkpoint, in any mode. In `off` mode, ask which files or feature that milestone covers, then build the checkpoint from the code. In `off` mode, the catch-up writes nothing. Do not log misses. End each lesson with its `file:line`, not a doc link. In the other modes, build it from the milestone docs. If the walkthrough doc does not exist, say so and offer to write it from the code.
- **A one-off skip is one milestone.** After "skip the quiz", the next milestone follows the mode again.
- **A skipped question.** A skipped question gets no grade. Its topic goes to the missed-topics list.

## The loop

1. Build one milestone. Do not start the next one.
2. Write `docs/milestones/NN-<topic>.md`. The doc covers what you built and why you chose this design over the alternatives. It has a walkthrough by `file:line`, the data flow, and the pitfalls with their guards.
3. Write a note in `docs/concepts/` for each new idea that needs first principles: the maths, the assumptions, and where it breaks.
4. Update `LEARNING_LOG.md`. It indexes milestones, concepts, quiz scores, and missed topics.
5. In `full` mode, run the checkpoint, then stop and wait. When the user says "continue" or steers, resume.
6. In `lite` mode, give the recap and pairs, then keep working. If the user does not answer the pairs, mark the checkpoint owed. In `deferred` mode, add the milestone to the owed list, then keep working.

In `off` mode, skip steps 2 to 6.

Templates for the three docs: `references/doc-templates.md`.

## The checkpoint

The kit author set this rule: "Each lesson must be followed immediately by a quiz question and with explanation on why each answer is right or wrong."

Build the lessons from the docs you wrote in steps 2 and 3. Write one pair for each idea the user must keep. Three to six pairs is typical.

**Order.** When topics are missed, start with their re-asks. Each re-ask has a two-line lesson, then its new question. Then lesson 1, its question, lesson 2, its question, and so on. Then the explain-it-back questions. Never put a quiz before the material it tests.

**Each pair:**

1. The lesson is short. It ends with the doc to read for the full version (path and section).
2. The question tests the use of the idea in a new case. It does not ask the user to repeat the lesson. Ask "what does the customer get after this crash?", not "does the worker save the key first?".
3. After each pick, explain why every option is right or wrong. Do not explain only the correct one.
4. After a miss, show the lesson link. Do not ask the same question again now. The topic goes to the missed-topics list and gets a new question at the next checkpoint. The kit author set this rule: "link missed questions back to the lesson".
5. Log the miss.

**After the last pair,** ask 5 to 8 explain-it-back questions, in the style of an interviewer ("Walk me through what happens when..."). Do not grade yet. Wait until the user sends their results. Then grade each answer against the code and cite `file:line`. Link every miss back to its lesson. Do not show model answers before the results arrive.

Pair format and the options checklist: `references/quiz-item-template.md`.

### Worked example

Illustration only. The files and lines below do not exist.

```
LESSON 2 of 4. The worker saves the key before it sends
`jobs/worker.py:38` returns early if the job key exists. `jobs/worker.py:41`
saves the key with an insert that fails if the key exists. A failed insert
ends the job. `jobs/worker.py:44` sends the email. This order gives
at-most-once delivery. A crash between lines 41 and 44 loses the email.
Full version: docs/milestones/02-job-queue.md, section "Retries".

QUESTION 2. A teammate swaps the two steps. The worker now sends the email
at line 41, then saves the key at line 44. The worker crashes between them.
The queue retries the job. What does the customer get?
A. One email. The email service drops the second send as a duplicate.
B. No email, the same as before the swap.
C. Two emails. The retry sends the email again.
D. One email. The check at line 38 stops the retry.

AFTER THE PICK, every option:
A. Wrong. The worker passes no idempotency key to the email service at line 41, so the service sends again.
B. Wrong. That was the result of the old order. Now the first run already sent one email.
C. Right. The first run sent an email, then crashed before it saved the key. The retry passes line 38 and sends again. This order gives at-least-once delivery.
D. Wrong. Line 38 stops a retry only if the key exists. The crash came before the worker saved the key.

IF THE USER PICKED A, B OR D: show the link "Review lesson 2". Do not ask
question 2 again now. Add the topic to the missed-topics list.
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

Write each missed topic to `LEARNING_LOG.md`: the topic, the lesson, and the date. At the next checkpoint, re-ask up to two missed topics before the new pairs. Before each re-ask, repeat the lesson in two lines. Then ask the new question. The new question tests the same idea in a new case. A right answer clears the topic. A wrong answer keeps it and links the lesson again. In `lite` mode, re-asks count toward the limit of three pairs.

## Token economy

Build every lesson from the docs that already exist for the milestone. Do not research, search the web, or start a research agent to make a quiz. If a lesson needs a fact the docs lack, read the cited code lines, or drop the lesson. If you delegate the drafting, pass an explicit model (see `~/.claude/rules/agent-models.md`). Grade explain-it-back answers on the strongest model you have, because grading is judgement.

## References

- `references/doc-templates.md`: the walkthrough doc, the concept note, and `LEARNING_LOG.md`.
- `references/quiz-item-template.md`: one lesson-and-question pair, the re-ask, the options checklist, the explain-it-back items, and the grading format.
- `references/delivery.md`: the widget specification, the markdown fallback, and the results message.
