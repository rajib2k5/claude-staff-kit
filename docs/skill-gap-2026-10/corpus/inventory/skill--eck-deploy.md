# skill: eck-deploy

Location: live. Lines: 542. Model ids named: none.

Purpose: Deployment orchestrator: promote dev to main, release tagging, changelog generation, and production verification. Consumes validated code on dev branch.

Sections:
- Deploy
- Context Budget — Agent Dispatch Required
- Sub-skill Dispatch Table
- Visual Framework
- Task Registration
- Usage
- Flags
- Stage 0: Gate Check
- Inputs
- Activities
- Outputs
- Exit Criteria
- Stage 1: Calibrate
- Inputs
- Activities
- 1.1: Check for Existing State
- 1.2: Resolve Development Mode
- 1.3: Parse Flags
- 1.4: Handle --status Flag
- 1.5: Verify Dev Branch
- 1.6: Display Deployment Plan
- Outputs
- Exit Criteria
- Stage 2: Promote
- Inputs
