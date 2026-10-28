# plugin: 0.12.1

Installed plugin. Skills it provides:

- **build** — Build Snowflake demos with Next.js deployed to Cloud Run. Use when: creating new demo, building demo app, deploying dashboard. Triggers: new demo, build demo, create demo app, deploy to Cloud Run.
- **deploy** — Provision a new evolv-demo as a Cloud Run service and run the initial deploy
- **destroy** — Tear down a demo (terraform destroy — removes Cloud Run service, mapping, DNS, runtime SA, bindings)
- **list** — List all demos with status, URL, and creator
- **revive** — Revive a demo killed by the budget killswitch (re-grants allUsers invoker, restores max-instances)
- **secret-grant** — Bind an existing demo's runtime SA to an additional shared secret without redeploying app code
- **secret-list** — List shared secrets in evolv-platform-ops and which demos consume each
- **secret-set** — Add or rotate a shared secret in evolv-platform-ops Secret Manager
- **setup** — One-time prereq + auth setup for new consultants. Verifies gh and gcloud, walks through gh and federated gcloud login, sanity-checks tf-runner access.
- **update** — Re-deploy an existing demo from the local repo (no Terraform changes)
