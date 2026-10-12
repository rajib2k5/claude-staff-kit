# Phase 2 — rendered measurement

Triggers: hero wraps, headline too long, overflow, grid gap, nav height, above the fold

Nine checks that cannot exist in source, measured in a real browser.

```bash
node scripts/render_probe.mjs page.html [--viewport 1440x1000] [--json]
```

## Why this layer is not optional

Upstream's rule is *"a 4-line hero headline is always a font-size error, never a copy-length
error."* Rendered lines are not visible to a source reader. The worked example bundled with
this skill passed all 27 source checks while rendering its hero in four lines — the defect
was found here, not there.

## What it measures

| Check | Fails when |
|---|---|
| `headlineLines` | the hero `h1` renders in more than 2 lines |
| `subLines` | `.hero-sub` renders in more than 4 lines |
| `navHeight` | nav exceeds 80px |
| `navSingleLine` | nav children sit on more than one row (centre spread over 6px) |
| `ctaWrapped` | the primary CTA label wraps |
| `ctaVisible` | the CTA sits below the fold at the tested viewport |
| `horizontalOverflow` | the document scrolls sideways |
| `jsErrors` | anything throws on load |
| `gridHoles` | a dense grid has empty cells |

`gridHoles` walks the real track geometry from `gridTemplateColumns` and
`gridTemplateRows` and tests each cell centre for coverage. An earlier version compared
area ratios and could not discriminate, because auto-sized rows reflow to hide the gap —
geometry works, percentages did not.

## The fix for a line-count failure is the font size

When `headlineLines` fails, the instinct is to shorten the copy. Upstream is explicit that
this is the wrong move: reduce the scale or constrain the measure. Shortening good copy to
fit a font size that was chosen carelessly is how heroes end up saying nothing.

## Browser resolution and graceful degradation

Playwright is an **optional** dependency, imported dynamically. With it absent the probe
prints a SKIP and exits 0 — an advisory gate that breaks a commit over a missing
devDependency has failed at its job.

It prefers a system browser, checking `CHROME_PATH` then the standard macOS and Linux
locations for Chrome, Chromium, and Edge, before falling back to Playwright's managed
Chromium. So `npm i -D playwright` alone is usually enough; the separate browser download is
only needed when no system browser exists.

**Install Playwright in the repo being checked.** The probe resolves it in two steps: a
plain `import` (works when the script sits next to a `node_modules`), then a CommonJS
`require` rooted at the **invoking project's** `package.json`, which is what makes a
globally-installed skill work at all. A bare ESM `import` alone resolves against the
*script's* directory, so a global skill install would never find it. If both fail the layer
skips and exits 0 — it never breaks the caller.

Two interop traps live in that fallback, both found by running it. Resolving the path and
`import()`ing it as ESM fails silently, because Playwright's CommonJS entry does not expose
`chromium` as a statically detectable named export — the namespace comes back without it.
And CommonJS `require` consults global paths that ESM does not, so a globally-installed
Playwright is found by the fallback and invisible to the first attempt.

## Test more than one viewport

`--viewport` defaults to 1440x1000. A hero that fits two lines there can wrap at 1280 or
1024. Three widths costs three seconds.
