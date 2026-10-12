# Cert Safari Quiz (Cowork)

CCA-F practice in Claude chat and Cowork, from the same verified 100-question bank as the Cert Safari mod for Claude Code.

Say **"quiz me"**, **"cert safari"**, **"drill D3"** or **"how ready am I for CCA-F"**.

- Scenario questions with a confidence tap (Sure / Unsure / Guess), then every option explained, the takeaway and the official doc links.
- Spaced repetition: questions you miss while sure come back first; correct and sure ones come back after 1, 3, 7 and 21 days.
- Readiness by domain, weakest domain, streak.
- Progress is saved to `cert-safari-progress.json` in your connected folder. With no folder connected, a session still works but nothing carries over.
- "Flag that" records a question as wrong or outdated for the next bank update.

The answer key stays inside the quiz engine until you answer, so Claude can't give it away early.

Not included (these need Claude Code, see the `/safari` mod): the study pane, idle drills while Claude works, sightings tied to what you're doing, and the status line. Progress is separate from the mod's.

Built by the evolv cohort. Questions are original and grounded in Anthropic's official docs; domain weights come from third-party study guides.
