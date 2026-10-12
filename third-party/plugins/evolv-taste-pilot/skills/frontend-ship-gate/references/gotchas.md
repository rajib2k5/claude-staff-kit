# Gotchas

Failure modes found by running this on real pages, including this skill's own worked example.

## The gate found four defects in its own reference page

The bundled `references/worked-example.html` now passes 27/27 and 9/9. Its first draft did
not, and every failure was found by tooling rather than by reading:

1. **7 eyebrows across 8 sections** against an allowance of 3. Upstream calls this its
   most-violated rule; a page written with the rule in hand still violated it 2.3×.
2. **Hero stack over budget** — the slot count included a pull-quote aside because the
   `data-hero-stack` marker was missing.
3. **A headline rendering in 4 lines despite 2 hard breaks.** Passed every source check.
   This is the case that justifies the rendered layer existing.
4. **A dead cell in the bento.** Six items in a 4-column grid with mixed spans do not tile
   a rectangle unless you do the arithmetic: 4+2+1+1+2+2 = 12 = 4×3.

## Font metrics make copy-length seeds non-deterministic

A test that breaks `headlineLines` by lengthening copy will pass or fail depending on which
fonts are installed. To force a rendered line-count violation reliably, override the font
size — that is font-independent. This bit the self-test: it failed on Linux and passed on
macOS with the identical page.

## An assertion that matches a rule name proves nothing

Grepping gate output for `headlineLines` matches on **pass** as well as fail, so an assertion
written that way can never fail. Match the failure marker (`FAIL] headlineLines`), and add
the converse check that a known-good page does not fail the same rule. Mutation-test it: if
removing the violation does not flip the assertion, the assertion is decorative.

## CJS `require.resolve` does not predict ESM `import`

Detecting Playwright with `node -e "require.resolve('playwright')"` and concluding that
`await import('playwright')` will work is wrong — CommonJS resolution consults global paths
that ESM does not, so a globally-installed package gives a false positive. Run the probe and
read whether it skipped. Ground truth beats prediction.

## Install Playwright in the repo, not next door

Node resolves from the file's own directory. Installing it where the tooling lives but not
in the project being checked means the rendered layer silently contributes nothing, and every
rendered rule ends up looking like it never fired.

## Do not retire a rule on thin evidence

One finding plus one override reads as a 100% override rate. That is not evidence a rule is
wrong. Require at least three findings before acting on an override rate, and read the
recorded reasons rather than the percentage.

## bash 3.2 is still the default on macOS

A one-line `case` statement inside `$( )` command substitution misparses on bash 3.2 (2007)
and works fine on bash 5. If tooling around this skill is shell, keep it POSIX-clean and
verify under `dash`, which is stricter than bash 3.2 — anything dash accepts, bash 3.2
accepts.

## The gate is not a substitute for looking at the page

Everything green and the page still mediocre is a real and common outcome. It means the rule
set is measuring the wrong things for that surface. That is information, not a bug — record
what is wrong with the page, because that list is the only honest justification for adding
new rules.
