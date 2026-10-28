# skill: graphify

Location: live. Lines: 794. Model ids named: none.

Purpose: Use for any question about a codebase, its architecture, file relationships, or project content — especially when graphify-out/ exists, where the question should be treated as a graphify query first. Turns any input (code, docs, papers, images, videos) into a persistent knowledge graph with god nodes, community detection, and query/path/explain tools.

Sections:
- /graphify
- Usage
- What graphify is for
- What You Must Do When Invoked
- Step 0 - GitHub repos and multi-path merge (only if a URL or several paths)
- Step 1 - Ensure graphify is installed
- Detect the correct Python interpreter (handles uv tool, pipx, venv, system installs)
- 1. uv tool installs — most reliable on modern Mac/Linux
- 2. Read shebang from graphify binary (pipx and direct pip installs)
- 3. Fall back to python3
- Write interpreter path for all subsequent steps (persists across invocations)
- Save scan root so `graphify update` (no args) knows where to look next time.
- The scan path is passed through a quoted heredoc, never substituted into the
- command line itself: a bare `cd <path>` (or an unquoted heredoc, which
- still expands $()/backticks in its body) would let a malicious path execute
- as shell code the moment this line runs.
- Step 2 - Detect files
- Write the sidecar from Python, not a shell redirect, so the same block renders
- on PowerShell hosts without console-encoding drift (#2528).
- Step 2.5 - Video and audio (only if video files detected)
- Step 3 - Extract entities and relationships
- Only content files go to semantic extraction. Code is already covered structurally
- by the AST pass (Part A); flattening every category here makes subagents re-read
- every source file (#1392). Video is transcribed to a document in Step 2.5 first.
- Always (re)write the cache file: write hits, else DELETE any leftover from a prior
