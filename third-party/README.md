# Third-party plugins and skills

Vendored copies of packages written by other people. They are **not** part of the `staff-kit` plugin
and `scripts/install.sh` does not install them. Each keeps its original author in its own manifest.

| Path | Author | Licence | Version | Source archive (2026-10-12) |
|---|---|---|---|---|
| `plugins/threejs` | Tony Turner | none stated | 1.0.0 | `threejs-1.0.0.plugin` |
| `plugins/cert-safari-quiz` | Tony Turner (evolv) | none stated | 0.1.0 | `cert-safari-quiz.plugin` |
| `plugins/evolv-taste-pilot` | evolv Consulting | MIT | 0.1.0 | `evolv-taste-pilot-0.1.0.plugin` |
| `skills/code-mods-essentials` | unknown | none stated | — | `code-mods-essentials.skill` |
| `skills/graphify` | Graphify Labs ([github.com/Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)) | Apache-2.0 (licence and NOTICE files included) | 0.9.93 | `~/.claude/skills/graphify`, written by `graphify install` from PyPI `graphifyy` 0.9.93 (2026-10-28) |

The only change from the archives: `evolv-taste-pilot/.claude-plugin/marketplace.json` (its own nested
marketplace, `evolv-skills`) was removed so this repo's marketplace is the single entry point.

## Install

```bash
claude plugin marketplace add rajib2k5/claude-staff-kit
claude plugin install threejs@claude-staff-kit
```

The standalone skills have no manifest. Copy `code-mods-essentials`: `cp -R third-party/skills/code-mods-essentials ~/.claude/skills/`.
Prefer the upstream installer for `graphify`, because it also installs the Python package the skill runs: `pip install graphifyy==0.9.93 && graphify install`. The vendored copy is a pinned reference.

## Before this repo goes public

Three of the five have no licence that permits redistribution. Get the authors' permission or remove
them first.
