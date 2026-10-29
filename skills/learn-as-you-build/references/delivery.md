# Delivery

Choose the format from the tools you have. Never require a specific tool. The lessons, the questions, and the explanations are the same in both formats. Both formats show the items from the checkpoint file, and both record each answer in it as it arrives (see "The answer record" in `SKILL.md`). In `off` mode there is no file. Wherever this page says the checkpoint file, use the conversation instead.

## Format 1: inline widget

When the host offers an inline interactive widget tool, and a widget can send a line to the chat, use it. An example is a `show_widget` tool in the Claude desktop app, whose widgets call `sendPrompt`. If a widget cannot send to the chat, use Format 2. A widget that cannot send records nothing.

1. If the tool has a setup guide, read it, and follow all of it.
2. Write all content into the widget up front, from the checkpoint file: the milestone, the attempt number, every lesson, every question, the explanation of every option, and every answer that the file records. Leave out retired items. The widget answers the user without a round trip to you.
3. Build these parts:
   - A header with the review-status line, the milestone name, the progress ("Lesson 2 of 4"), and the count from the Answers table ("3 of 8 answered"). The header also has this fixed line: `Answers save as you go. If this quiz looks reset, say "resume the quiz".` In `off` mode, the fixed line reads: `Answers are kept in this conversation only. If this quiz looks reset, say "resume the quiz".`
   - **Previous** and **Next** buttons. Order the screens like this:
     1. One re-ask screen for each missed topic, up to two. Each one shows the lesson in two lines, then a new question on the same idea. When no topic is missed, leave these screens out.
     2. Lesson 1, question 1, lesson 2, question 2, and so on.
     3. The explain-it-back screen.
   - Open on the first unanswered item, at its lesson if it has one. If every item is answered, open on the last screen.
   - Instant feedback. After the user picks an option, lock the pick and show the explanation of every option. Mark the right one and the chosen one. Then send the answer line (format below).
   - A **Skip** button on each re-ask and pair question. A skip locks the question and shows the explanation of every option, like a pick. Then it sends the answer line, and it records `Q2: skipped` in the results.
   - An item that the file records as answered shows the same way: the pick or the skip locked, and every explanation visible.
   - A **Review lesson** button after a miss. It opens that lesson. A **Back** button there returns to the same screen with the pick still locked. The widget does not ask the question again now.
   - The path of the full doc at the end of every lesson.
   - One text box and one **Save** button for each explain-it-back question. Save sends the answer line with the text. A saved answer shows its text in the box. No feedback shows here. Grading waits.
   - A **Send results** button. It posts one message to the chat (format below).
4. If the widget fails to render, fall back to Format 2. Do not retry in a loop.

### The answer line

Each pick, skip, and save sends one line to the chat at once. In `show_widget`, the widget calls `sendPrompt`. Before the widget sends a text, it replaces each newline in the text with ` / `. Keep this shape:

```
ANSWER milestone 02 attempt 1 Q2: B wrong
ANSWER milestone 02 attempt 1 Q3: skipped
ANSWER milestone 02 attempt 1 E3: <the user's text>
```

When an answer line arrives, take the first step below that fits.

1. Its attempt differs from the attempt in the checkpoint file. Ignore the line. Say so in one line, such as `Ignored: that answer is from attempt 1, and the quiz is now on attempt 2.`
2. The `Graded:` line in the checkpoint file has a date, so this attempt is already graded. Change nothing. Say so in one line, such as `Milestone 02 attempt 1 is already graded. Say "restart the quiz" to try again.`
3. The item is retired. Change nothing. Say so in one line, such as `Q2 is retired, because the code changed.`
4. The item already has a recorded pick or skip. Leave the row as it is. Say so in one line, such as `Q2 is already recorded as B (wrong). Use the newest quiz widget, or say "resume the quiz" for a fresh one.` This holds for a second Skip too.
5. Otherwise, write the row. For a pick, the answer key in the file decides right or wrong. For an explain-it-back item, write the text and the Result `saved`. A second Save replaces the text. Reply in one line, such as `Recorded Q2. 3 of 8 answered.` If the key disagrees with the word in the line, the key wins, and the reply says so, such as `Recorded Q2 as wrong: the answer key says C. 3 of 8 answered.`

Never send a new widget in reply to an answer line. After the reply, if you are paused at a checkpoint, do nothing else in that turn. You are paused in `full` mode at a checkpoint, and in any catch-up, in every mode. Otherwise, go back to the work you were doing. That covers `lite` mode, and `full` mode after "continue" or during urgent work.

### The results message

The button posts plain text so that you can parse it. Keep this shape:

```
RESULTS milestone 02 attempt 1
R1: C right
Q1: B right
Q2: A wrong
Q3: C right
Q4: skipped
EXPLAIN-IT-BACK
<<<E1
<the user's text, with each newline as " / ">
>>>
<<<E2
<the user's text>
>>>
```

Lines that start with R are re-asks of missed topics. When no topic was re-asked, leave them out. Leave out every item that has no answer. The message covers every other item, including the answers that the widget loaded from the file.

The results message still starts the grading. It is the user's full submission. If it arrives during urgent work, say in one line that you will grade it when the urgent work is done, and go back to the urgent work. When the urgent work is done, take the steps below. At any other time, take them at once, in order.

1. If its attempt differs from the attempt in the checkpoint file, ignore it, and say so in one line. Stop here.
2. If the `Graded:` line in the checkpoint file has a date, change nothing, and say so in one line, as for an answer line. Stop here.
3. Check the message against the Answers table. Where the table has no answer for an item, fill the row from the message. The answer key decides right or wrong. Where the table already has a pick or a skip, keep it, because the first recorded pick stands. A text in the message replaces the saved text only when it is not empty and differs from it. A line for a retired item changes nothing. In one line, name every filled row, every replaced text, and every kept pick that the message disagrees with, such as `From the results: filled Q4, replaced E2. Kept Q2 as B; the results say C.` When the message matches the record, send no such line. A line that the message lacks does not clear a recorded row.
4. If the record still has unanswered items that are not retired, list them in one line, and ask whether to grade now, such as `Not answered yet: Q3, E2. Grade now?` This happens when a stale widget sends its results early. Grade only on a yes, and then go on with step 5. Until a yes, stop here. The checkpoint stays open.
5. Grade the explain-it-back texts in the record (see `quiz-item-template.md`). Write the date and the totals on the `Graded:` line.
6. Bring the log up to date, with the totals.

When the steps end or stop, and you are paused at this checkpoint, wait for "continue" or for the user's answer. Otherwise, go back to the work you were doing. "Paused" means the same as for an answer line.

## Format 2: plain markdown in chat

When no widget tool exists, when a widget cannot send to the chat, or when the widget fails, use plain markdown. Send one lesson, then its question. Wait for a letter. When the letter arrives, record it in the Answers table first. Then send the explanation of every option.

**Resume message: the checkpoint file already records answers** (send it as the first message when you resume. One line sums up the answered items. Then the first unanswered item follows.)

```markdown
Lesson text: not adversarially reviewed.

Resumed from .learning/milestones/02-checkpoint.md. Answered: R1 C right, Q1 B right, Q2 skipped. 3 of 8 answered.

<The first unanswered item, in the shape of the messages below.>
```

**Re-ask message: a missed topic comes back** (send one per missed topic, up to two, before lesson 1. When no topic is missed, send none.)

```markdown
Lesson text: not adversarially reviewed.

### Re-ask 1 of 2: <idea>

<The lesson again, in two lines.>

Read the full version: [<doc title>](<path>#<section>)

### Question

<A new question on the same idea, in a new case.>

A. <option>
B. <option>
C. <option>
D. <option>

Reply with a letter. Reply "skip question" to skip this one question. A skipped question gets no grade. Its topic goes to the missed-topics list.
```

After the pick, send the explanation of every option, as in message 2 below.

**Message 1: the lesson and its question** (the review-status line appears in the first message of the checkpoint only. When re-asks come first, put it in the first re-ask and leave it out here.)

```markdown
Lesson text: not adversarially reviewed.

### Lesson 1 of 4: <idea>

<The lesson.>

Read the full version: [<doc title>](<path>#<section>)

### Question 1

<The question.>

A. <option>
B. <option>
C. <option>
D. <option>

Reply with a letter. Reply "skip question" to skip this one question. A skipped question gets no grade. Its topic goes to the missed-topics list. Say "skip the quiz" to skip the rest of the quiz for this milestone.
```

**Message 2: the user replies "B". You record B, then send the explanation of every option**

```markdown
**B is right.** <the reason>

- **A. Wrong.** <the reason>
- **B. Right.** <the reason>
- **C. Wrong.** <the reason>
- **D. Wrong.** <the reason>

Next: lesson 2 of 4. Reply "next".
```

**Message 2, after a miss: the user replies "A"**

```markdown
**A is wrong.** <the reason>

- **A. Wrong.** <the reason>
- **B. Right.** <the reason>
- **C. Wrong.** <the reason>
- **D. Wrong.** <the reason>

Review lesson 1: [<doc title>](<path>#<section>). This topic goes to the missed-topics list. I ask a new question on it at the next checkpoint.

Next: lesson 2 of 4. Reply "next".
```

After a miss, show the lesson link. Do not ask the same question again now. The topic goes to the missed-topics list and gets a new question at the next checkpoint.

**Last message: the explain-it-back questions**

Send the 5 to 8 questions in one message, numbered. Tell the user to answer in their own words and to reply with all the answers at once. Then wait. In this format, that reply is the results. When it arrives, record each answer as a saved E row. Then take steps 4 to 6 of "The results message" above.

## In `lite` mode

Never block on an answer in `lite` mode. Send the recap (3 to 5 lines), then at most three pairs in the same two formats. Re-asks count toward the three. Do not wait for answers. In markdown, all the pairs are open at once. So end each one with "Reply with the item id and a letter, such as `Q2 B`." in place of "Reply with a letter." If the user answers, record the answer first. In markdown, then respond with the full per-option explanation. After a miss, show the lesson link, and keep working. When every item that is not retired has an answer, the checkpoint closes, with no results message. Write the date and the totals on the `Graded:` line, and bring the log up to date with the totals, so the cell reads `done <date>`. If the user ignores the pairs, list the milestone under owed checkpoints in `LEARNING_LOG.md` and keep working.
