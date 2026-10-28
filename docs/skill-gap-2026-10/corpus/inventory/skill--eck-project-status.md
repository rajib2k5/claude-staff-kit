# skill: eck-project-status

Location: live. Lines: 650. Model ids named: none.

Purpose: Read-only dashboard showing project health, status, pull candidates, and upstream submission history from the evolv-coder-kit registry.

Sections:
- Project Status Dashboard
- Visual Framework
- Task Registration
- Usage
- Mode Routing
- Stage 1: Pre-Flight
- Inputs
- Activities
- Outputs
- Exit Criteria
- Stage 2: Project Summary (default view)
- Inputs
- Activities
- For each project:
- For each candidate, use status-based symbols:
- PENDING = [*], SUBMITTED = [>], PULLED = [x]
- For each submission, use status symbols:
- Open = [>], Merged = [x], Closed = [-]
- Outputs
- Exit Criteria
- Stage 3: Project Detail (`--project {KEY}`)
- Inputs
- Activities
- For each category, show counts with color coding:
- Pull candidates shown with [*], non-candidates with [-]
