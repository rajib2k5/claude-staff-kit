---
name: real-run-screenshots
description: Make README and doc screenshots from a REAL run - a real command rendered to an SVG or PNG terminal image, or a live app page captured with Playwright - with a privacy scan before anything is saved. Use when you add images to a README, docs, or a PR. Triggers - README screenshots, terminal screenshot, capture the app page, docs images, how-to-use images.
---

# Real-run screenshots (`screenshots.py`)

**Rule: a screenshot comes from a real run. Never type, mock, edit or paste output into an image.**
The command shown is the string that ran. The output is what it printed. If the command fails,
the shot fails. A reader who copies the command must get the same thing.

## Procedure

1. Pick a neutral demo directory (for example `/tmp/demo-<project>`). The script makes it, and
   deletes it later only if it has its own marker file. It never deletes a directory it did not make.
2. Prepare the demo with `setup` commands (install the tool, `git init`, write fixture files).
   Use synthetic fixtures. Do not read the real home directory.
3. List the shots in a spec (JSON), or give one shot as arguments:

   ```bash
   python3 skills/real-run-screenshots/screenshots.py run shots.json
   python3 skills/real-run-screenshots/screenshots.py term --cmd "mytool --help" --name 01-help
   python3 skills/real-run-screenshots/screenshots.py page --url http://127.0.0.1:8000 --name 02-home --selector main
   ```

   The spec format is in the docstring at the top of `screenshots.py`.
4. For a page shot, start the app first. The script does not start it. Use `expect_text` so the
   shot fails if the page is the wrong one.
5. Look at every image. Check it is readable and holds no private data.
6. Commit the images that the README links to. Keep each under the size limit (default 500 KB).

## What the script does

- Runs each command with `bash` in the demo directory, with a small clean environment
  (`HOME` is the demo directory, no user `PATH`, no API keys, `NO_COLOR=1`).
- Fails if a command exits with a code other than `expect_exit` (default 0). Use `show_exit` or
  `expect_exit` to show a failure on purpose.
- Renders terminal output to SVG with `rich`, and to PNG through headless Chromium when asked.
- Scans the command text, output, title, SVG text and page text for a home path, this machine's
  user name, an email address, and common token shapes. A hit stops the run with exit code 3 and
  writes no image. Add your own patterns with `forbidden`, and public URLs with `allow`.

## Requirements

- Terminal shots: `rich`.
- PNG and page shots: `playwright` and a Chromium build (`python3 -m playwright install chromium`).
- Both load only when used. Without them the script still imports, parses specs and scans text.
  A missing package gives a one-line install hint.
- With `uv`: `uv run --with rich --with playwright python skills/real-run-screenshots/screenshots.py run shots.json`.

## Traps

- A mocked or offline mode of your tool is fine only if a user can run the same command. Say so in the README.
- Do not crop a failure out of a shot. Do not trim output without `max_lines` showing the `...` marker.
- Output with a timestamp, a temp path or a random id changes on each run. Pin it in the command
  (a seed, a fixed clock) or the images churn in every commit.
- A page can show data from your real account. Use a demo account or fixture data. The page text
  is scanned, but pixels (an avatar, a chart) are not.
- The privacy scan is a net, not a proof. Open each image.

## Report

List each image (path, size, the exact command or URL it came from) and the privacy scan result.

## Test

`python3 -B skills/real-run-screenshots/test_screenshots.py` (no network, no browser needed;
the browser test skips when `playwright` is missing).
