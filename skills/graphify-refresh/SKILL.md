---
name: graphify-refresh
description: Install an optional git post-commit hook that refreshes the graphify code graph in the background after each commit, with no model call and no API billing. Use when a repo already has a graphify-out/ folder and you want the graph to follow the code. Triggers - keep graphify graph fresh, graphify post-commit hook, auto refresh knowledge graph, graph is stale after commit.
---

# graphify refresh hook (`post-commit`)

This hook runs `graphify update .` after each commit. The update re-extracts code files only.
It needs no LLM. The hook is optional. Nothing in the kit installs it for you.

## What it does

1. Finds the repo root with `git rev-parse --show-toplevel`.
2. Stops (exit 0) unless `graphify` is on `PATH` and `graphify-out/` exists.
3. Removes provider keys from the environment of the child: `ANTHROPIC_API_KEY`,
   `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`,
   `OPENROUTER_API_KEY`, and more, plus any variable named `*_API_KEY`. It uses `env -u`.
4. Exports `GRAPHIFY_NO_AUTO_REFRESH=1` for the child.
5. Runs the update in the background. The commit does not wait.
6. Appends to `graphify-out/.refresh.log`. The hook always exits 0, so it never fails a commit.

## Procedure

1. Check the graph exists: `ls graphify-out/graph.json`. If not, build it first with `/graphify`.
2. Install the hook in the target repo:

   ```bash
   cp skills/graphify-refresh/post-commit .git/hooks/post-commit
   chmod +x .git/hooks/post-commit
   ```

   If `.git/hooks/post-commit` already exists, do not overwrite it. Add a line to it that runs
   this file, for example `sh path/to/graphify-refresh/post-commit || true`.
   If the repo uses `core.hooksPath`, copy the file into that folder instead.
3. Make a commit. Wait a few seconds. Read `graphify-out/.refresh.log`. It must end with `done, exit 0`.
4. To remove it, delete `.git/hooks/post-commit` (or the line you added).

## Traps

- The hook updates code structure only. Docs, papers and images need a semantic pass
  (`/graphify --update`), which costs model calls and does not run here.
- Add `graphify-out/.refresh.log` to `.gitignore`, or the log shows as an untracked file.
- Two quick commits start two updates. The second can overlap the first. The graph still ends up
  correct on the next commit, but read the log if the graph looks odd.
- Hooks are local. A fresh clone has no hook until someone copies it in.
- It is not a replacement for `graphify hook install`. Use one or the other, not both.

## Report

State where the hook is installed, and paste the last lines of `graphify-out/.refresh.log` after a test commit.

## Test

`bash skills/graphify-refresh/test_post_commit.sh` (about 4 s, uses a fake `graphify`, never calls the real one).
