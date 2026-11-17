---
name: diagram-kit
description: Build deterministic diagrams from one YAML spec - Mermaid, SVG, PNG, draw.io and Lucid-importable XML - with the vendored diagram_kit package (flow, ERD and sequence specs). Use when a README or design doc needs an architecture, data-flow, ERD or sequence diagram that stays in sync with text, or when a hand-drawn diagram keeps going stale. Triggers - draw a diagram, architecture diagram, ERD, sequence diagram, diagram as code, mermaid from yaml, drawio export.
---

# Diagram kit (`diagram_kit`)

One YAML spec gives every format from the same computed layout, so the outputs do not drift.
The build is deterministic: the same spec gives the same bytes.

| Spec kind | Use for | Outputs |
|---|---|---|
| `flow` | architecture, data flow, process | `.mmd` `.svg` `.png` `.drawio` `.lucid.xml` |
| `erd` | tables and relations | `.mmd` `.svg` `.png` `.drawio` `.lucid.xml` |
| `sequence` | message order between actors | `.mmd` `.svg` `.png` |

The spec format is in `SCHEMA.md`. The full guide, with the format caveats, is in `README.md`.
Three working specs are in `examples/specs/`.

## Procedure

1. Copy the package into the target project. No install step is needed to run it:

   ```bash
   mkdir -p tools/diagrams
   rsync -a --exclude __pycache__ skills/diagram-kit/diagram_kit skills/diagram-kit/build.py tools/diagrams/
   ```

2. Install the two runtime dependencies (`pyyaml`, `resvg-py`) with `uv`, or `pip install pyyaml resvg-py`.
   The pinned versions are in `pyproject.toml`.
3. Write a spec in `docs/diagrams/<name>.yaml`. Start from a file in `examples/specs/`.
4. Build:

   ```bash
   python3 tools/diagrams/build.py docs/diagrams --out docs/diagrams/out
   python3 tools/diagrams/build.py docs/diagrams --out docs/diagrams/out --check   # exit 1 if stale
   ```

5. Look at the PNG or SVG. Embed the `.svg` or `.png` in the README. Paste the `.mmd` in a
   `mermaid` fence if the page should render it natively on GitHub.
6. Commit the spec and the outputs together. Run `--check` in CI so they cannot drift.

## Traps

- The Figma, FigJam and Lucid imports are **not** tested. The `README.md` section "Format honesty" says exactly what was and was not checked.
- Mermaid shows a word broken with a `-` when it does not fit a block. Use `--verify-mermaid`
  (needs a browser setup, see the README) before you trust the `.mmd`.
- The build writes a manifest and refuses to overwrite a file it did not write. Use `--overwrite` only on purpose.
- Fonts are bundled (`diagram_kit/fonts`, Liberation Sans, OFL licence in `OFL.txt`). Text width
  uses their metrics. Do not swap the font without regenerating the metrics (`scripts/gen_font_metrics.py`).
- `examples/out/` is not shipped in this copy. Two tests that compare against it skip.
  The package keeps the name `vol-diagram-kit` in `pyproject.toml` and in the draw.io `host`
  attribute, so the lockfile and the output bytes stay identical to the source.

## Report

List each spec, the files built, and the `--check` result. Say which formats you opened and which you did not.

## Test

From `skills/diagram-kit/`: `uv run --frozen python -m pytest -q`. Last measured here: 209 passed, 53 skipped
(the skips need Chromium or `examples/out`).
