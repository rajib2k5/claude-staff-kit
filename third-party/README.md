# Third-party plugins and skills

Vendored copies of packages written by other people. They are **not** part of the `staff-kit` plugin
and `scripts/install.sh` does not install them. Each keeps its original author in its own manifest.

| Path | Author | Licence | Version | Source archive (2026-10-12) |
|---|---|---|---|---|
| `plugins/threejs` | Tony Turner | none stated | 1.0.0 | `threejs-1.0.0.plugin` |
| `plugins/cert-safari-quiz` | Tony Turner (evolv) | none stated | 0.1.0 | `cert-safari-quiz.plugin` |
| `plugins/evolv-taste-pilot` | evolv Consulting | MIT | 0.1.0 | `evolv-taste-pilot-0.1.0.plugin` |
| `skills/code-mods-essentials` | unknown | none stated | — | `code-mods-essentials.skill` |

The only change from the archives: `evolv-taste-pilot/.claude-plugin/marketplace.json` (its own nested
marketplace, `evolv-skills`) was removed so this repo's marketplace is the single entry point.

## Install

```bash
claude plugin marketplace add rajib2k5/claude-staff-kit
claude plugin install threejs@claude-staff-kit
```

The standalone skill has no manifest. Copy it: `cp -R third-party/skills/code-mods-essentials ~/.claude/skills/`.

## Before this repo goes public

Three of the four have no licence that permits redistribution. Get the authors' permission or remove
them first.
