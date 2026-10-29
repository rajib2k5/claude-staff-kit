---
name: learn-as-you-build
description: Teach the user the code while you build it, so they can explain the architecture and the code in an interview. Builds one milestone at a time, writes a walkthrough doc, then runs a checkpoint of short lessons, each followed by its own quiz question. Has five modes (full, queued, lite, deferred, off), so a user on a deadline can bypass it, and a user with several projects can keep building while the quizzes queue up. Use on any software project where the user wants to learn the implementation. Triggers - learn as you build, teach me as we build, quiz me on this milestone, interview prep for this project, learning mode, skip the quiz, quiz me later, queue the quizzes, keep building and quiz me in parallel.
---

# Learn as you build

Help the user learn the implementation while you build it. The goal: the user can explain the architecture and the code in an interview.

Quoted rules in this file are words of the kit author. Keep their wording. Write lessons and docs in the style of the `simple-english` skill: short sentences, active voice, one idea per sentence.

## Modes

| Mode | Pause at the milestone | Quiz | Docs |
|---|---|---|---|
| `full` | Yes. Wait for "continue". | Lessons with questions, then 5 to 8 explain-it-back questions. | Walkthrough, concept notes, log. |
| `queued` | No. Start the next milestone at once. | The full checkpoint: re-asks, lessons with questions, then 5 to 8 explain-it-back questions. Written and delivered at each milestone. The user answers at any time. | Walkthrough, concept notes, log. |
| `lite` | No. | A 3 to 5 line recap, then at most 3 lesson-and-question pairs. The user can ignore them. | Walkthrough, concept notes, log. |
| `deferred` | No. | None now. Owed checkpoints go in the log. | Walkthrough, concept notes, log. |
| `off` | No. | None. | None. Only the `Learning mode:` line. |

Use `full` for a project that exists to teach the user. Use `queued` when the user runs several projects or sessions at once, or wants the full quiz without blocking the build. Use `lite` when the user wants a taste and wants to keep moving. Use `deferred` on a deadline. Use `off` when the user wants nothing.

Each step down drops one more thing. `queued` drops the pause. `lite` cuts the quiz to at most three pairs. `deferred` drops the quiz. `off` drops the docs. `deferred` keeps the docs because the context is fresh now, and the user can catch up later.

### Switch modes

The user can switch at any time with a short phrase. Match the intent, not the exact words.

| The user says | Mode | Confirm in one line |
|---|---|---|
| "learning: full", "full checkpoints" | `full` | "Mode is now full: pause at each milestone, lessons, quizzes, docs. Say 'learning: deferred' to skip the quizzes." |
| "learning: queued", "queue the quizzes", "keep building and quiz me in parallel" | `queued` | "Mode is now queued: no pause, the full quiz at each milestone to answer any time, docs still written. Say 'learning: deferred' to skip the quizzes." |
| "learning: lite", "keep it light" | `lite` | "Mode is now lite: no pause, a short recap and up to 3 pairs, docs still written. Say 'learning: deferred' to skip the quizzes." |
| "I'm on a deadline", "quiz me later", "no learning checkpoints", "learning: deferred" | `deferred` | "Mode is now deferred: no quizzes, docs still written. Say 'learning: off' to skip the docs too." |
| "learning: off", "stop the lessons" | `off` | "Mode is now off: no quizzes, no docs. Say 'learning: deferred' to get the docs back." |
| "skip the quiz" | No quiz for this milestone. The mode does not change. | "Skipped the quiz for milestone N. Say 'learning: deferred' to skip all of them." |

Switch at once. Every confirmation states the scope and what still happens. Record a lasting switch in `LEARNING_LOG.md`. A one-milestone skip is not lasting: add that milestone to the owed list. In `off` mode, a skip writes nothing.

### Set a default

Put one line in the project: `Learning mode: deferred`. It can live in the CLAUDE.md of the project or in `LEARNING_LOG.md`. If the sources disagree, the latest message from the user wins. If no message decides, the less intrusive mode wins (`off`, then `deferred`, then `lite`, then `queued`, then `full`). Say which mode you use in one line. When you write the mode line to CLAUDE.md, write the same line to `LEARNING_LOG.md`. If CLAUDE.md holds a less intrusive line than the user's switch, say in one line that CLAUDE.md wins next session, and offer to change it.

A shared repo is a repo that other people also push to. In a shared repo, add `LEARNING_LOG.md` to the exclude file before you create it. The exclude file is the path that `git rev-parse --git-path info/exclude` prints. Never hardcode the path: in a git worktree, `.git` is a file. If the folder of that path is missing, create it before you append. The log stays on this machine. Say so in one line. One developer's mode must not change the mode for others. When you ask the mode question in a shared repo, also ask whether the milestone docs belong in the repo. If not, write them under `.learning/`, which stays out of git (see "The answer record").

### Rules for every mode

- **Ask once.** When the skill starts on a project with no mode set, ask which mode to use. Recommend `full` for a learning project. Record the answer as the `Learning mode:` line. Respect it and do not ask again. If the user does not answer, write `Learning mode: deferred` to `LEARNING_LOG.md` and say so in one line. Then keep working.
- **Ask only before a build.** Ask the mode question only before you build. A request to explain existing code is not a build. Answer it, and do not ask.
- **When unsure, use `deferred`.** If no mode is set and the user is in a hurry, use `deferred`. Say so in one line.
- **Never block urgent work.** A hotfix, an incident, or "just ship it" never waits for a checkpoint. If a checkpoint is open, mark it owed in the log and do the work. A queued checkpoint stays queued, because it does not block. Doc writing never delays urgent work. Log "docs owed" and continue.
- **Catch up on request.** "Quiz me on milestone 2" runs that checkpoint, in any mode. In `off` mode, ask which files or feature that milestone covers, then build the checkpoint from the code. In `off` mode, the catch-up writes nothing. Do not log misses. End each lesson with its `file:line`, not a doc link. In the other modes, resume it from its checkpoint file if one exists (see "The answer record"). If not, build it from the milestone docs. If the walkthrough doc does not exist, say so and offer to write it from the code.
- **A one-off skip is one milestone.** After "skip the quiz", the next milestone follows the mode again.
- **A skipped question.** A skipped question gets no grade. Its topic goes to the missed-topics list.

## The loop

1. Build one milestone. Do not start the next one.
2. Write `docs/milestones/NN-<topic>.md`. The doc covers what you built and why you chose this design over the alternatives. It has a walkthrough by `file:line`, the data flow, and the pitfalls with their guards.
3. Write a note in `docs/concepts/` for each new idea that needs first principles: the maths, the assumptions, and where it breaks.
4. Update `LEARNING_LOG.md`. It indexes milestones, concepts, checkpoint progress, quiz scores, and missed topics.
5. In `full` mode, write the checkpoint file, run the checkpoint, then stop and wait. When the user says "continue" or steers, go on with the build. If the results have not arrived by then, do not block. The checkpoint becomes owed. Say in one line that "resume the quiz" picks it up.
6. In `queued` mode, write the checkpoint file after the commit that finishes the milestone. Deliver the checkpoint, and bring the log up to date. Then start the next milestone at once, in the same turn. Do not wait for answers. Several checkpoints can be open at once. An open queued checkpoint is not owed. The log lists it as queued, with its N of M answered, and says how to resume it.
7. In `lite` mode, write the checkpoint file, give the recap and pairs, then keep working. If the user does not answer the pairs, mark the checkpoint owed. In `deferred` mode, add the milestone to the owed list, then keep working.

In `off` mode, skip steps 2 to 7.

Templates for the three docs and the checkpoint file: `references/doc-templates.md`.

## The checkpoint

The kit author set this rule: "Each lesson must be followed immediately by a quiz question and with explanation on why each answer is right or wrong."

Build the lessons from the docs you wrote in steps 2 and 3. Write one pair for each idea the user must keep. Three to six pairs is typical.

**Order.** When topics are missed, start with their re-asks. Each re-ask has a two-line lesson, then its new question. Then lesson 1, its question, lesson 2, its question, and so on. Then the explain-it-back questions. Never put a quiz before the material it tests.

**Each pair:**

1. The lesson is short. It ends with the doc to read for the full version (path and section). That doc is the walkthrough or a concept note, never the checkpoint file.
2. The question tests the use of the idea in a new case. It does not ask the user to repeat the lesson. Ask "what does the customer get after this crash?", not "does the worker save the key first?".
3. After each pick, explain why every option is right or wrong. Do not explain only the correct one.
4. After a miss, show the lesson link. Do not ask the same question again now. The topic goes to the missed-topics list and gets a new question at the next checkpoint. The kit author set this rule: "link missed questions back to the lesson".
5. Record the answer in the checkpoint file. A miss reaches the missed-topics list when you bring the log up to date. See "The answer record" below.

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

## The answer record

The widget's memory is lost when the widget renders again, and the host guarantees no storage. So the checkpoint file is the record, and the widget is only a view of it.

**The checkpoint file.** Before you deliver a checkpoint, write every item to `.learning/milestones/NN-checkpoint.md`. This path holds in every folder, because the file holds one developer's answers and the answer key. When you create `.learning/`, write `.learning/.gitignore` with the single line `*`. If `.learning/` already exists without that file, write it then. That one file keeps the folder out of git in every case: before or after `git init`, in a git worktree, and with no git command. Each item has a stable id: R1 and R2 for re-asks, Q1, Q2 and so on for pairs, and E1, E2 and so on for explain-it-back questions. The file also holds the `Attempt:` and `Graded:` lines at the top, and the Answers table. The `Graded:` line under `Attempt:` at the top of the file reads `not yet` until the current attempt is graded. Then it holds the date and the totals. A dated `Graded:` line under `Earlier attempts` is history. Template: `references/doc-templates.md`.

**Record each answer when it arrives.** Do not wait for the end of the checkpoint. Write the row in the Answers table at once. Judge right or wrong from the answer key in the file, not from the word in the answer line. The first recorded pick or skip stands, because a quiz measures the first attempt, and a later pick comes after the explanations. Within one attempt, never change a recorded pick or skip. There are two exceptions. A Save of an explain-it-back answer replaces the saved text. A retired item keeps its pick, and its Result becomes `retired`. How each format sends the answer, and what to reply: `references/delivery.md`.

**Bring the log up to date.** An answer writes only to the checkpoint file, unless it closes the checkpoint. Copy the state of the file to `LEARNING_LOG.md` at these points: when you write the checkpoint file, when the user says "continue" or steers, when urgent work or a mode switch makes it owed, before and after a restart, and when the checkpoint is graded. On a resume, and before you choose the re-asks for the next checkpoint, copy the state of every open checkpoint file, queued ones too. Each update sets the Checkpoint cell. It adds the topic of each miss or skip that is not on the missed-topics list yet. It fills Re-asked for each answered re-ask, and Cleared for each re-ask that clears its topic (see "Missed topics").

**Resume from the record.** When a checkpoint starts or starts again, read its checkpoint file first. This covers a new session, a lost widget, "resume the quiz", and "quiz me on milestone N". A checkpoint is open until the `Graded:` line under `Attempt:` at the top of its file has a date. If the user does not name a milestone and more than one checkpoint is open, ask which one. In `queued` mode, list every open checkpoint with its N of M answered, so the user can pick. If the file exists, reuse its items. Never write new questions for a checkpoint that already has a file. You may refresh any `file:line` citation in an item: in its lesson, its question, or its explanations. If a code change makes an item's right option wrong, or removes the code that an item asks about, tell the user, and mark the item `retired`. This holds for every item, E items too. Do not write a new question for it. Also mark as `retired` an unanswered R item whose topic now has a Cleared date, and do not ask it. A retired item is not asked and not counted. Retire items first, then make the log update that a resume calls for. Show the answered items as answered, then go on from the first unanswered item.

**Start over.** When the user says "restart the quiz" or "start the quiz over", move the current Answers rows, the saved texts, and the `Graded:` line under `Attempt:` to the `Earlier attempts` section of the same file, with the date. Then start a blank Answers table with the same items, and raise the attempt number by one. Copy each `retired` item into the new table as `retired`, with no pick. Set the `Graded:` line under `Attempt:` to `not yet`. Misses already in `LEARNING_LOG.md` stay logged. The restart is the one exception to "Do not ask the same question again now", because the user asked for it. Which attempt the totals come from: `references/quiz-item-template.md`.

**By mode:** a checkpoint follows the rules of the current mode. A lite checkpoint resumed in full mode follows full-mode rules from then on.

- `full`: write the file, record each answer, and resume from the file, as above.
- `queued`: write the file and deliver the checkpoint at each milestone, then go on with the build. Never block. Record each answer when it arrives, in the file of the milestone that the line names. Reply as `references/delivery.md` says, then go back to the build in the same turn. An answer never stops, restarts, or reorders the build. Grade a results message at once, then go back to the build. Only urgent work delays the grading.
- `lite`: record answers when they arrive. Never block. Only a checkpoint with no explain-it-back items closes without a results message. One with explain-it-back items stays open until a results message arrives (see `references/delivery.md`).
- `deferred`: write no checkpoint file until a catch-up runs.
- `off`: the catch-up still writes nothing. The conversation is the record: the items, the answer key, and every answer line stay in it. The attempt starts at 1, and each restart raises it by one. During the catch-up, end every reply with a running line, such as `Answered: Q1 B right, Q2 skipped, E1 saved. 3 of 5.` The running line lists the saved E ids too. In reply to an answer line, the running line takes the place of the `Recorded` line. Any other one-line note from `references/delivery.md`, such as the already-recorded line, comes first. On a resume, rebuild the picks from the last running line, and read the E texts from their answer lines in the conversation. When the catch-up starts, say in one line that a lost or compacted conversation loses the answers.

**Pin a queued checkpoint to its commit.** The build goes on before the user answers, so the code moves. Write the checkpoint file after the commit that finishes the milestone, and put its short sha on the `Code at:` line. If the milestone has no commit, write `Code at: not committed, <date>`, and treat the code on that date as the commit. The items test the milestone as built at that commit. The widget header and each lesson say so. This replaces two resume rules above: do not refresh a `file:line` citation, and do not retire an item because the code changed later. Retire an item only when it is wrong about the code at that commit. Grade its explain-it-back answers against the code at that commit. The pin is part of the items, so it holds in every mode.

**Open queued checkpoints on a mode switch.** They stay open. On a switch to `full`, the next milestone pauses at its checkpoint, and the open queued ones stay queued. On a switch to `lite`, `deferred`, or `off`, they become owed. A switch to `queued` leaves owed checkpoints owed.

## Delivery

Choose the format from the tools you have. Never require one tool.

1. If the host offers an inline interactive widget tool, and a widget can send a line to the chat, build the checkpoint there. An example is a `show_widget` tool in the Claude desktop app. Read the setup guide of that tool first, and follow all of it. Build the widget from the checkpoint file (in `off` mode, from the conversation). Put every lesson, question, per-option explanation, and recorded answer in the widget up front, so that feedback is instant. The widget needs these parts:
   - **Previous** and **Next** buttons.
   - Instant feedback on every option after a pick.
   - One answer line to the chat after each pick or skip.
   - A **Review lesson** button after a miss.
   - A text box and a **Save** button for each explain-it-back question.
   - A **Send results** button that posts the picks and the written answers to the chat.
2. If there is no widget tool, a widget cannot send to the chat, or the widget fails, use plain markdown in chat. A widget that cannot send records nothing. Send one lesson, then its question with lettered options. The user replies with a letter. Record it, then send the explanation of every option. Repeat for the next pair.

Both formats in detail: `references/delivery.md`.

## Honesty rules

- Take lesson facts from the reviewed docs and from measured results. Never invent a number. Quote a measured number with its command and date. If nobody measured a value, write "not measured".
- Make sure that every `file:line` you cite matches the current file. Line numbers go stale after an edit. In a checkpoint with a `Code at:` line, match the file at that commit.
- Start every checkpoint with one line on review status: "Lesson text: not adversarially reviewed." or "Lesson text: reviewed by <reviewer>, <date>." Write it even when the docs were reviewed, because the lesson text is new text. If the source docs were not reviewed either, say that as well. Do not claim a review that did not happen.

## Missed topics

Write each missed topic to `LEARNING_LOG.md`: the topic, the lesson, and the date. At the next checkpoint, re-ask up to two missed topics before the new pairs. Before each re-ask, repeat the lesson in two lines. Then ask the new question. The new question tests the same idea in a new case. A right answer clears the topic, but only when that re-ask had no recorded pick or skip in an earlier attempt, because a user who has seen the explanation proves nothing. A wrong answer keeps it and links the lesson again. In `lite` mode, re-asks count toward the limit of three pairs.

In `queued` mode, choose the re-asks when you write the checkpoint file, from the topics in the log by then. So a miss in a checkpoint that the user answers later gets its re-ask in a later checkpoint. Do not choose a topic that an open checkpoint already re-asks, while that re-ask has no answer.

## Token economy

Build every lesson from the docs that already exist for the milestone. Do not research, search the web, or start a research agent to make a quiz. If a lesson needs a fact the docs lack, read the cited code lines, or drop the lesson. If you delegate the drafting, pass an explicit model (see `~/.claude/rules/agent-models.md`). Grade explain-it-back answers on the strongest model you have, because grading is judgement. Recording an answer makes edits to the checkpoint file only, and sends the reply the format requires. In the widget format, that reply is one line, plus the running line in `off` mode. In markdown, it is the explanation of every option. A Save may touch two places in the file: the row and the text. The one exception is an answer that closes the checkpoint: it may also read and update the log. Read the checkpoint file first only when its current text is not in your context, for example after compaction. Use no other reads or tools to record it. Then go back to the work you were doing, as `references/delivery.md` says. In `queued` mode, the build resumes as it was.

## References

- `references/doc-templates.md`: the walkthrough doc, the concept note, the checkpoint file, and `LEARNING_LOG.md`.
- `references/quiz-item-template.md`: one lesson-and-question pair, the re-ask, the options checklist, the explain-it-back items, and the grading format.
- `references/delivery.md`: the widget specification, the answer line, the results message, and the markdown fallback.
