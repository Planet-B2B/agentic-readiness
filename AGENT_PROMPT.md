# Ask an AI coding agent to run ADRB v0.2

These prompts are vendor-neutral. The agent needs terminal access to the repository and permission
to download the published npm package. The default benchmark runs locally, reads only tracked paths,
invokes no model, uploads no source, and makes no network calls after installation.

## Recommended: repository baseline

Copy and paste:

```text
Assess this repository's readiness for AI-agent pull-request work.

From the repository root, run:
npx --yes agentic-scorecard@0.2.0 assess . --profile pr-creation --scope tracked --format markdown --output .agentic/reports/agentic-readiness-v0.2.0.md

Do not change product source, configuration, policies, or tests. Do not invent evidence or mark an
attestation as met. Read the report and tell me:
1. the score and highest passed readiness profile;
2. whether the pr-creation target passes;
3. each target-profile blocker and its evidence scope;
4. the five highest-value improvements in dependency order;
5. which findings are repository gaps versus external or outcome evidence not yet established; and
6. any likely false positive or false negative.

Keep repository-detected, agent-collected, and human-attested evidence separate. Leave generated
artifacts uncommitted unless I explicitly ask otherwise. If the command cannot run, explain the
exact blocker without modifying the repository to work around it.
```

## Agent-assisted external evidence

Use this only after reviewing the repository baseline:

```text
Collect the external evidence that ADRB v0.2 could not establish from tracked repository files.

First run:
npx --yes agentic-scorecard@0.2.0 init-evidence .

Read `.agentic/evidence-request.md` and the empty target-bound
`.agentic/agent-evidence.yaml` bundle. Before accessing any connected system, tell me which
read-only tools, accounts, repositories, branches, dashboards, and time ranges you need. Wait for
my authorization.

After authorization, use only least-privileged read-only operations. For each eligible control,
record the source-backed status, scope, concise derivation, collection time, 30-day-or-shorter
expiry, and durable privacy-safe references. Add only claims you actually attempted. Do not paste
credentials, prompts, source excerpts, raw logs, personal data, or sensitive dashboard contents. A
permission error or inconclusive result must remain unknown and include the error; never infer a
pass.

Then run:
npx --yes agentic-scorecard@0.2.0 assess . --profile pr-creation --scope tracked --agent-evidence .agentic/agent-evidence.yaml --format markdown --output .agentic/reports/agentic-readiness-v0.2.0-assisted.md

Summarize every score change and keep agent-collected evidence distinct from repository evidence and
human attestations. Do not describe the result as certified, compliant, safe, secure, or
independently verified.
```

The agent is an evidence investigator. The scorecard remains the scoring authority.

## Choose a different authority level

Replace `pr-creation` with one of:

- `read-only-analysis` — inspect approved source and return advice;
- `planning` — draft plans and specifications;
- `local-implementation` — edit an isolated checkout and run local checks;
- `pr-creation` — create a branch and pull request while a human retains merge authority;
- `limited-autonomous-maintenance` — perform pre-approved low-risk maintenance within strict limits.

No benchmark profile grants production deployment authority.

## Guided remediation

```text
Read the latest ADRB v0.2 report and create a remediation proposal for the failed target-profile
controls. Do not implement changes yet. Group recommendations into repository changes, platform or
organizational controls, and outcome measurement. For each include the control ID, risk reduced,
systems affected, accountable role, verification method, dependencies, and effort estimate. Never
invent an attestation or convert unavailable evidence into a failure. End by asking which changes I
authorize.
```

## Reassessment

```text
Re-run the pinned ADRB v0.2.0 benchmark for the same profile and tracked scope. Compare reports
control by control. Explain changes using evidence and identify changed commit state, expired claims,
scope differences, regressions, or newly established controls. Write a new dated report; do not
overwrite the previous one.
```
