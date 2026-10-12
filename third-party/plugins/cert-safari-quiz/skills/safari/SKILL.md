---
name: safari
description: >
  This skill should be used when the user wants to practice for Anthropic's Claude Certified
  Architect, Foundations (CCA-F) exam: "quiz me", "cert safari", "CCA-F practice", "practice
  questions for the Claude architect exam", "drill me on D3", "study tool design and MCP",
  "how ready am I for CCA-F", "show my safari stats", or "flag that question". Runs a scenario
  quiz from a verified 100-question bank with confidence ratings, an explanation for every
  option, and spaced repetition saved between sessions.
metadata:
  version: "0.1.0"
---

# Cert Safari quiz

Run a CCA-F practice session in the conversation. A bundled engine, `scripts/quiz.py` (Python 3, standard library), picks each question, holds the answer key, grades answers and keeps spaced-repetition progress. The key stays inside the engine until the learner has answered, so never open `references/bank.json` yourself and never guess at answers before grading: that keeps the quiz honest and the context small.

The exam has five weighted domains (D1 Agentic Architecture & Orchestration 27%, D2 Tool Design & MCP Integration 18%, D3 Claude Code Configuration & Workflows 20%, D4 Prompt Engineering & Structured Output 20%, D5 Context Management & Reliability 15%) and scenario-based questions, some "Select TWO".

## 1. Set up the progress file

Progress lives in one JSON file, `cert-safari-progress.json`.

- When a folder is connected, keep the file at the root of that folder. With several folders connected, ask once which one to use.
- When no folder is connected, use a file in the session's scratch space and tell the user in one line that progress will not carry over to the next session unless they connect a folder.
- Run the engine in a shell that can read and write the progress file. If the skill's files and the connected folder are on different machines (a cloud session reaching the user's computer through a bridge), copy the progress file into the workspace at the start, run the engine there, and write the file back to the folder after every 5 answers and when the session ends.

Engine path: `scripts/quiz.py` inside this skill's directory. Pass the progress path on every call: `python3 <skill-dir>/scripts/quiz.py --progress <path> <command> ...`.

## 2. Read the request

- Plain "quiz me" or "cert safari": a session of 10 questions across all domains.
- A domain ("drill D3", "tool design and MCP"): pass `--domain D1..D5` to every `next` call. Map topic words to domains with the list above.
- A count ("give me 5", "keep going until I stop"): use it.
- "Stats", "how ready am I": run `stats --text` and show it. No quiz.
- "Show my flags": run `flags` and list them.
- "Reset my progress": confirm with AskUserQuestion first, then run `reset --confirm`. Flags are kept.

## 3. Quiz loop

For each question:

1. Run `next` (with `--domain` if set). The JSON has `id`, `domain`, `domain_name`, `scenario`, `type`, `select`, `stem`, `options` (letters and text, no key), `relevance` and `status`.
2. Ask it.
   - **Single-answer items** (`select` 1, four options): one AskUserQuestion call with two questions.
     - Question 1: the stem as the question text, preceded by a short context line (for example "D3 Claude Code Configuration. Scenario: Claude Code for CI/CD."). Header `Q<n> <domain>` (12 characters max). Four options: label is the letter ("A"), description is the option text, exactly as given.
     - Question 2: "How sure are you?", header `Confidence`, options `Sure`, `Unsure`, `Guess`.
   - **Select TWO items** (five options, which AskUserQuestion cannot hold): send the context line, the stem and the lettered options as a message (SendUserMessage when available), then ask the learner to reply with two letters and how sure they are, for example `B E unsure`. Wait for the reply.
   - If the learner types "skip", run `skip <id>` and move on without recording an answer. If they type "stop", end the session (step 5).
   - Never hint at the answer, reorder options, or rephrase option text.
3. Run `answer <id> --picked <letters> --confidence <sure|unsure|guess>`. If the learner gave no confidence, ask once; if they still skip it, use `unsure`.
4. Show the reveal as a message (SendUserMessage when available), compact:
   - The `result` line, marked correct or not.
   - Every option on its own line: the letter, a check on each key option, a cross on a picked wrong option, then its `rationale`.
   - `Takeaway:` followed by `explanation`.
   - When `relevance` is `current`: "Current-docs detail: true of today's product, may postdate exam-era material."
   - When `drift` is not empty: show it.
   - The `sources` as links.
   Use only the engine's text for explanations. Do not add claims of your own about the right answer; if the learner disputes an answer, offer to flag it.
5. Continue until the session count is reached or the learner stops. Keep the pace brisk: no commentary between questions beyond the reveal.

## 4. Flags

When the learner says a question looks wrong or outdated ("flag that"), run `flag <id> --note "<their reason>"` for the question just shown, confirm in one line, and continue. Flags feed fixes to the shared bank; `flags` lists them.

## 5. End of session

1. Run `stats --text`.
2. Report in a few lines: the session score (correct out of answered, and how many were missed while sure), readiness by domain, the weakest domain, questions due, and the streak.
3. Suggest the next focus in one line, usually the weakest domain (`drill <domain>`).
4. If the progress file was copied from another machine, write it back now.

## Notes

- The readiness numbers are study feedback, not a prediction of the scaled exam score (720 of 1000 passes).
- Items marked `current` cover recent or niche product behavior and are drawn less often; core items reflect durable principles.
- If the engine prints an `error` JSON, explain it plainly and recover (for example, wrong number of letters: ask again). If the engine itself fails to run, say so and stop rather than improvising questions.
- The same bank powers the Cert Safari mod for Claude Code (`/safari`), which adds a study pane, idle drills and status line. Progress is not shared between the two.
