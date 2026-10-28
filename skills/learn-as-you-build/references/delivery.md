# Delivery

Choose the format from the tools you have. Never require a specific tool. The lessons, the questions, and the explanations are the same in both formats.

## Format 1: inline widget

When the host offers an inline interactive widget tool, use it. An example is a `show_widget` tool in the Claude desktop app.

1. If the tool has a setup guide, read it. Follow its rules for colours, size, and scripts.
2. Write all content into the widget up front: every lesson, every question, and the explanation of every option. The widget answers the user without a round trip to you.
3. Build these parts:
   - A header with the review-status line, the milestone name, and the progress ("Lesson 2 of 4").
   - **Previous** and **Next** buttons. Order the screens like this:
     1. One re-ask screen for each missed topic, up to two. Each one shows the lesson in two lines, then a new question on the same idea. When no topic is missed, leave these screens out.
     2. Lesson 1, question 1, lesson 2, question 2, and so on.
     3. The explain-it-back screen.
   - Instant feedback. After the user picks an option, lock the pick and show the explanation of every option. Mark the right one and the chosen one.
   - A **Skip** button on each question. It records `Q2: skipped` in the results.
   - A **Review lesson** button after a miss. It opens that lesson. A **Back** button there returns to the same screen with the pick still locked. The widget does not ask the question again now.
   - The path of the full doc at the end of every lesson.
   - One text box for each explain-it-back question. No feedback shows here. Grading waits.
   - A **Send results** button. It posts one message to the chat (format below).
4. If the widget fails to render, fall back to Format 2. Do not retry in a loop.

### The results message

The button posts plain text so that you can parse it. Keep this shape:

```
RESULTS milestone 02
R1: C right
Q1: B right
Q2: A wrong, reviewed lesson 2
Q3: C right
Q4: skipped
EXPLAIN-IT-BACK
1. <the user's text>
2. <the user's text>
```

Lines that start with R are re-asks of missed topics. When no topic was re-asked, leave them out.

When this message arrives, grade the explain-it-back answers (see `quiz-item-template.md`). Then write the scores and missed topics to `LEARNING_LOG.md`. A right R line clears its topic. A skipped line adds its topic to the missed-topics list. In `full` mode, then wait for "continue". In `lite` mode, keep working.

## Format 2: plain markdown in chat

When no widget tool exists, or when the widget fails, use plain markdown. Send one lesson, then its question. Wait for a letter.

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

**Message 2: the user replies "B". You send the explanation of every option**

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

Send the 5 to 8 questions in one message, numbered. Tell the user to answer in their own words and to reply with all the answers at once. Then wait. When the answers arrive, grade them with the format in `quiz-item-template.md`.

When the user misses a question, log the topic in the missed-topics list at once. After the last pair, write the pair totals to `LEARNING_LOG.md`.

## In `lite` mode

Never block on an answer in `lite` mode. Send the recap (3 to 5 lines), then at most three pairs in the same two formats. Re-asks count toward the three. Do not wait for answers. If the user answers, respond with the full per-option explanation. After a miss, show the lesson link, log the topic, and keep working. If the user ignores the pairs, list the milestone under owed checkpoints in `LEARNING_LOG.md` and keep working.
