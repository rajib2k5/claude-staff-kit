---
name: staff-incident
description: Drive a live incident and write the postmortem — mitigate before diagnosing, keep a timeline, then produce a blameless writeup with detection-time analysis and owned actions. Use during an outage or immediately after. Triggers - incident, outage, production is down, postmortem, we have an incident.
---

# Incident response

Read `~/.claude/rules/reliability-observability.md`.

## Order of operations — do not invert this

**Mitigate → stabilise → diagnose → fix → postmortem.**

Mitigation, in order of preference: **roll back · flag off · shift traffic · scale out · shed load.**
Do not debug in production while users are down if a rollback is available. A 30-minute investigation
that could have been a 2-minute revert is a decision you will defend badly.

## During the incident

1. **Scope first**: who is affected, how many, since when, is it getting worse. Everything else waits on
   this — you cannot choose a mitigation without it.
2. **Mitigate.** Announce what you are doing before you do it.
3. **Keep a timestamped timeline as you go.** Memory reconstructs incidents wrongly and the timeline is
   the raw material for the postmortem.
4. **Check what changed** — deploys, flags, config, credential rotations, upstream vendor status, traffic
   volume. Most incidents are a change, and often not in the system showing the symptom.
5. One hypothesis at a time, announced, tested, result reported. Parallel uncoordinated fixes make the
   system unanalysable.
6. Dispatch `incident-responder` (Opus) to drive, or `pipeline-debugger` (Opus) if it is a data pipeline.

## Distinguish

**Absence vs stoppage** (no data may mean upstream stopped deliberately, a credential expired, or a view
lagged — identical symptom, different fixes) · **cause vs coincidence** (a correlated deploy is a lead) ·
**symptom vs cause** (a restart that worked is not a diagnosis — say so plainly).

## Postmortem — blameless, written

About the **system**. "Human error" is never a root cause; it is the start of the question *why did the
system permit it and why was it not caught*.

Required sections: user-visible impact with duration and scope · timeline · contributing factors (plural)
· **how it was detected and how long detection took** — often the real finding · what made it worse ·
what made it better · action items with **named owners and dates**.

Close with: what would make this **class** of failure impossible, not just this instance. Action items
without an owner do not exist.

## Communication

Status updates state: what is broken, who is affected, what we are doing, and when the next update comes.
No speculation about cause in an external update — a wrong public cause has to be retracted.
