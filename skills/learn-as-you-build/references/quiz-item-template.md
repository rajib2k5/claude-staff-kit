# Quiz item template

One checkpoint is a list of pairs, then the explain-it-back questions. Each pair is one lesson and its question.

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

Review lesson N: [<doc title>](<path>#<section>). Then answer question N again.
```

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

Use the same idea with a new case. Do not reuse the old question. A user who remembers the old answer proves nothing.

## Explain-it-back questions

Ask 5 to 8, after the last pair. Each one is a question that an interviewer asks about the design or the code.

```markdown
### Explain it back N

<A "walk me through" or "why" question. Name the part of the system. Example: "Walk me through what happens when a worker crashes after it saves the key.">

Grader's notes (keep them out of the message to the user): <two or three points a good answer covers, each with the `file:line` that backs it>
```

Mix the types. Ask for one data-flow walk, one trade-off ("why this over that"), one failure case, and one "what would you change at ten times the load".

## Grading format

Grade only after the user sends their results. Grade against the code. Do not grade against your memory of the lesson.

```markdown
### Explain it back N: <pass | partial | miss>

**Your answer, in one line:** <what the user said>
**What the code does:** `path/to/file.py:41` <what happens there>
**What was right:** <the points that match>
**What was missing or wrong:** <the points that do not match, with `file:line`>
**Review:** [Lesson K](<path>#<section>)
```

Add the "Review" line to every partial and every miss. End with the totals: pairs right of pairs asked, and explain-it-back passes of questions asked. Write the totals and the missed topics to `LEARNING_LOG.md`.
