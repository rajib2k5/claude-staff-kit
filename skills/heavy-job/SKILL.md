---
name: heavy-job
description: Run one memory-heavy command under a guard that caps memory, kills only its own process group, logs, and holds a single-job lock. Use when you start a training run, a big pandas or dataframe job, or parallel backtests on a machine where an out-of-memory event would reboot or freeze it. Triggers - training run, big pandas job, run backtests in parallel, out of memory, OOM, machine rebooted, memory guard, one heavy job at a time.
---

# Heavy job guard (`memguard.sh`)

Run one heavy command at a time, under a guard. A heavy job can use all memory in seconds.
On a shared box this freezes or reboots the machine and kills every other job.

## Procedure

1. Decide the ceiling. Pick `--max-rss-gb` from a small trial run, plus 25 percent. Pick
   `--min-avail-gb` as the memory the rest of the box needs (default 4).
2. Start the job through the wrapper:

   ```bash
   skills/heavy-job/memguard.sh --max-rss-gb 40 --min-avail-gb 8 --log logs/job.memguard.log \
     -- python3 train.py --config cfg.yaml
   ```

3. Read the exit code. It is the child's own code, except:

   | Code | Meaning |
   |---|---|
   | 97 | Refused to start. Available memory was already below the floor. |
   | 98 | Refused to start. Another heavy job holds the lock. |
   | 99 | The guard killed the job (cap or floor). See the log. |
   | 64 | Bad usage. |

4. On 98, wait. Do not start a second job in parallel. Queue it after the first.
5. Read the log (`START`, `avail_mb=... rss_mb=...` every interval, `KILLED`, `END`).

Settings can also come from env vars: `MEMGUARD_MAX_RSS_GB`, `MEMGUARD_MIN_AVAIL_GB`,
`MEMGUARD_INTERVAL_S`, `MEMGUARD_LOG`, `MEMGUARD_LOCK`. Options win over env vars.

## Rules

- One heavy job at a time. The lock (`flock` on `--lock`, default `$TMPDIR/memguard.lock`)
  enforces it. Use `--no-lock` only for a job you know is light.
- Parallel backtests: run them as one job that spawns its workers (the guard sums RSS over the
  whole process group), not as many wrapped jobs.
- Stage jobs of different kinds (TabM, LightGBM, XGBoost) one after another. Three at once caused
  a real out-of-memory reboot of a 121 GB machine.

## Traps

- **Do not use `pkill -f` or `pgrep -f` to stop a job.** They match the command line of the shell
  that calls them, so they kill that shell (exit 144). The wrapper kills by process group id
  (`kill -- -PGID`) instead. To stop a job by hand, send TERM to the wrapper. It stops its group.
- The guard samples every `--interval-s` seconds (default 2). A job that allocates more than the
  headroom in one interval can still pass the cap. Keep a floor large enough for that.
- RSS is resident memory. A job that maps files, or uses GPU unified memory, can be larger than RSS shows.
  Watch `MemAvailable` through `--min-avail-gb` as well.
- The guard stops after TERM plus 5 s with KILL. A job that needs a clean shutdown must handle TERM.
- Killing the job does not remove its partial output. Check files before you re-run.

## Report

State the command, the ceiling and floor, the exit code, and the peak `rss_mb` from the log.
If the guard killed the job, say which limit it hit and the next ceiling you propose.

## Test

`bash skills/heavy-job/test_memguard.sh` (about 8 s, allocates at most 120 MB).
