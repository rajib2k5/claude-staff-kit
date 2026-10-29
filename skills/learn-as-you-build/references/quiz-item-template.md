# Quiz item template

One checkpoint is up to two re-asks of missed topics, then a list of pairs, then the explain-it-back questions. Each pair is one lesson and its question. Each re-ask is a two-line lesson and a new question.

## One pair

```markdown
### Lesson N of M: <the idea in five words or fewer>

<Three to six sentences, taken from the walkthrough or concept doc. Cite `file:line` for every claim about the code.>

Read the full version: [<doc title>](<path>#<section>)

### Question N

<A new case that needs the idea. Name the file or the input. Do not repeat the lesson's words.>

A. <option>
B. <option>
C. <option>
D. <option>

### Why each option is right or wrong (shown after the pick)

- **A. <right | wrong>.** <The reason. In a wrong option, name the mistake and the `file:line` that disproves it.>
- **B. <right | wrong>.** <The reason.>
- **C. <right | wrong>.** <The reason.>
- **D. <right | wrong>.** <The reason.>

### If the user missed (shown after a wrong pick)

Review lesson N: [<doc title>](<path>#<section>). This topic goes to the missed-topics list. It gets a new question at the next checkpoint.
```

After a miss, show the lesson link. Do not ask the same question again now.

The checkpoint file stores the whole pair before the checkpoint starts. The right option and the explanations go in its answer key, at the end of the file. In the chat or the widget, the user sees them only after the pick or the skip.

## The options checklist

Make sure that each question passes these checks before you send it.

- The question needs the idea. A user who skipped the lesson can only guess.
- Exactly one option is right.
- Each wrong option is a mistake that a real reader makes. Do not write a silly option to fill the list.
- The right option is not always the longest, and not always in the same position.
- No "all of the above" and no "none of the above".
- Every option has an explanation, and every explanation names a cause. "Wrong" alone is not an explanation.
- A wrong option is wrong for a stated reason that the user can check in the code or the doc.

Write the options in a new case, not in the case from the lesson. A lesson about a retry after a crash can ask about a crash at a different line.

## Re-ask of a missed topic

A re-ask comes first in the checkpoint, before lesson 1. Ask up to two. Before each re-ask, repeat the lesson in two lines. Then ask the new question.

```markdown
### Re-ask N of M: <the missed idea>

<The lesson again, in two lines. Cite the same `file:line` as the first lesson.>

Read the full version: [<doc title>](<path>#<section>)

### Question

<A new case that needs the same idea.>

A. <option>
B. <option>
C. <option>
D. <option>
```

Use the same idea with a new case. Do not reuse the old question. A user who remembers the old answer proves nothing. Show the explanation of every option after the pick. After a miss, show the lesson link and keep the topic on the missed-topics list.

## Explain-it-back questions

Ask 5 to 8, after the last pair. Each one is a question that an interviewer asks about the design or the code.

```markdown
### Explain it back N

<A "walk me through" or "why" question. Name the part of the system. Example: "Walk me through what happens when a worker crashes after it saves the key.">

Grader's notes (keep them out of the message to the user and out of the checkpoint file, because model answers must not show before the results): Lesson: <the lesson this question maps to>. Points: <two or three points a good answer covers, each with the `file:line` that backs it>
```

Mix the types. Ask for one data-flow walk, one trade-off ("why this over that"), one failure case, and one "what breaks first if the load grows" question. Make one lesson from the "Why this design" table. Map the load question to that lesson. Every explain-it-back question maps to a lesson.

## Grading format

Grade only after the user sends their results. A Save in the widget is not a result. Grade against the code. Do not grade against your memory of the lesson.

```markdown
### Explain it back N: <pass | partial | miss>

**Your answer, in one line:** <what the user said>
**What the code does:** `path/to/file.py:41` <what happens there>
**What was right:** <the points that match>
**What was missing or wrong:** <the points that do not match, with `file:line`>
**Review:** [Lesson K](<path>#<section>)
```

Add the "Review" line to every partial and every miss. End with the totals, such as `pairs: 3 of 4 right, re-asks: 1 of 1 cleared, explain-it-back: 5 of 7 passed`.

- Pairs: the Q items right, out of the Q items asked.
- Re-asks: the R items that cleared their topic, out of the R items asked. When a re-ask clears its topic: "Missed topics" in `SKILL.md`.
- Explain-it-back: the passes, out of the E items asked.
- A skipped or unanswered R or Q item counts as asked and not right. An unanswered E item counts as asked and not passed.
- Leave retired items out of every count.

Write the totals on the `Graded:` line of the checkpoint file. The log takes its totals from the first graded attempt: the first whose results were sent, or, in `lite` mode, the first that closed. A later graded attempt keeps its totals only in the checkpoint file. Write the missed topics to `LEARNING_LOG.md`.
