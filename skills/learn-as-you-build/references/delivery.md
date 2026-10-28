# Delivery

Choose the format from the tools you have. Never require a specific tool. The lessons, the questions, and the explanations are the same in both formats.

## Format 1: inline widget

Use it when the host offers an inline interactive widget tool. An example is a `show_widget` tool in the Claude desktop app.

1. Read the setup guide of that tool if it has one. Follow its rules for colours, size, and scripts.
2. Write all content into the widget up front: every lesson, every question, and the explanation of every option. The widget answers the user without a round trip to you.
3. Build these parts:
   - A header with the review-status line, the milestone name, and the progress ("Lesson 2 of 4").
   - **Previous** and **Next** buttons. Order the screens lesson 1, question 1, lesson 2, question 2, and so on, then the explain-it-back screen.
   - Instant feedback. After the user picks an option, show the explanation of every option. Mark the right one and the chosen one.
   - A **Review lesson** button after a miss. It opens that lesson. A **Back to the question** button there returns to the same question.
   - The path of the full doc at the end of every lesson.
   - One text box for each explain-it-back question. No feedback shows here. Grading waits.
   - A **Send results** button. It posts one message to the chat (format below).
4. If the widget fails to render, fall back to Format 2. Do not retry in a loop.

### The results message

The button posts plain text so that you can parse it. Keep this shape:

```
RESULTS milestone 02
Q1: B right
Q2: A wrong, reviewed lesson 2
Q3: C right
EXPLAIN-IT-BACK
1. <the user's text>
2. <the user's text>
```

When this message arrives, grade the explain-it-back answers (see `quiz-item-template.md`). Then write the scores and missed topics to `LEARNING_LOG.md`. Then wait for "continue".

## Format 2: plain markdown in chat

Use it when no widget tool exists, or when the widget fails. One lesson, then its question. Wait for a letter.

**Message 1: the lesson and its question** (the review-status line appears in the first message only)

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

Reply with a letter. Reply "skip" to move on without answering.
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

Review lesson 1: [<doc title>](<path>#<section>). Reply "review" and I show the lesson again here. Then I ask question 1 again.
```

After "review", repeat the lesson text, then repeat the question with the same letters. Do not move on until the user answers again or says "skip".

**Last message: the explain-it-back questions**

Send the 5 to 8 questions in one message, numbered. Tell the user to answer in their own words and to reply with all the answers at once. Then wait. When the answers arrive, grade them with the format in `quiz-item-template.md`.

Log each miss in the missed-topics list when it happens. Write the pair totals to `LEARNING_LOG.md` after the last pair.

## In `lite` mode

Send the recap (3 to 5 lines), then at most three pairs in the same two formats. Do not wait for answers. If the user answers, respond with the full per-option explanation. If the user ignores the pairs, list the milestone under owed checkpoints in `LEARNING_LOG.md` and keep working.
