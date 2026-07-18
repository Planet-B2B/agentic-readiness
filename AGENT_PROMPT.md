# Ask an AI coding agent to run ADRB v0.3

These prompts are vendor-neutral. The agent needs terminal access to the repository and permission
to download the published npm package. The default benchmark runs locally, reads only tracked paths,
invokes no model, uploads no source, and makes no network calls after installation.

## Recommended: complete agent-assisted assessment

Copy and paste:

```text
Perform the complete ADRB v0.3 assessment of this repository for AI-agent pull-request work.

Do not change product source, tests, configuration, policies, Git history, or the user's current
checkout. First inspect the repository's commit, tracked-file status, upstream tracking branch, and
ahead/behind state. If read-only network access is already authorized, fetch the upstream before
comparing it. Select the commit before creating an assessment worktree. Default to the current HEAD;
a dirty checkout does not change that selection, so assess HEAD from an isolated clean worktree. Use
the fetched upstream commit only when I asked for the latest/current upstream state and the branch is
behind. If the checkout is both dirty and behind, state both facts and preserve HEAD by default unless
I explicitly asked for upstream or another commit. State the exact commit you selected and why.

Before running the scorecard, choose and state an absolute durable artifact directory outside any
temporary worktree. Do not delete that directory during worktree cleanup. In the commands below,
replace `<artifact-dir>` with that path. The npm package version is 0.3.1, while report filenames use
the immutable ADRB benchmark version 0.3.0.

From that clean target, run the repository-only baseline:
npx --yes agentic-scorecard@0.3.1 assess . --profile pr-creation --scope tracked --format markdown --output <artifact-dir>/agentic-readiness-v0.3.0-baseline.md

Then prepare unresolved evidence:
npx --yes agentic-scorecard@0.3.1 init-evidence . --output <artifact-dir>/agent-evidence.yaml --request-output <artifact-dir>/evidence-request.md

Read the baseline, `<artifact-dir>/evidence-request.md`, and the empty target-bound
`<artifact-dir>/agent-evidence.yaml`. Investigate nuanced repository-scoped requests only from
tracked files at the selected commit. Before accessing Git hosting settings, CI, dashboards, logs,
ticketing, or any other connected system, tell me exactly which least-privileged read-only tools,
accounts, repositories, branches, dashboards, and time ranges you need, and why. Wait for my
authorization.

After authorization, attempt only eligible requests. For every attempted claim, record its status,
scope, concise derivation, collection time, 30-day-or-shorter expiry, and durable privacy-safe
references. Repository claims must use `repo:<path>[#Lx-Ly]`; do not merely restate a keyword match.
A permission error, stale source, or inconclusive result remains unknown and records the error.
Never infer a pass, invent an attestation, or treat unavailable evidence as a failure.

Do not place credentials, prompts, source excerpts, raw logs, personal data, customer data, private
URLs that reveal secrets, or sensitive dashboard contents in generated files.

When authorized evidence collection is complete, run:
npx --yes agentic-scorecard@0.3.1 assess . --profile pr-creation --scope tracked --agent-evidence <artifact-dir>/agent-evidence.yaml --format markdown --output <artifact-dir>/agentic-readiness-v0.3.0-assisted.md

Tell me the repository-detected progress and normative score, the highest passed profile, whether
pr-creation passes, every target blocker, and the five highest-value improvements. Compare baseline
and assisted reports control by control. Keep repository-detected, agent-collected, and
human-attested evidence separate; treat UNKNOWN as unresolved, not failed; and flag likely false
positives or negatives. If I decline external access, stop after the baseline and label it clearly as
a repository-only baseline. Before removing a temporary worktree, verify that every report, evidence
request, and evidence bundle you cite exists in the durable artifact directory, then tell me that
directory's absolute path. Leave generated artifacts uncommitted unless I explicitly ask otherwise.
Do not describe any result as certified, compliant, safe, secure, or independently verified.
```

The agent is an evidence investigator. The scorecard remains the scoring authority.

## Fast repository-only baseline

Use this when you want an offline first look and accept that platform, organization, and outcome
controls will remain unresolved:

```text
Run a fast repository-only ADRB v0.3 baseline for AI-agent pull-request work. Verify and state the
selected commit and whether tracked files match HEAD, then run:
npx --yes agentic-scorecard@0.3.1 assess . --profile pr-creation --scope tracked --format markdown --output .agentic/reports/agentic-readiness-v0.3.0-baseline.md

Do not change repository files or invent evidence. Summarize repository-detected progress before
the normative score, target-profile blockers, and the five highest-value repository improvements.
Separate true repository gaps from platform, organization, and outcome evidence that this offline
scan cannot establish. Treat UNKNOWN as unresolved, not failed, and call the result a repository-only
baseline rather than a complete assessment. Leave generated artifacts uncommitted.
```

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
Read the latest ADRB v0.3 report and create a remediation proposal for the failed target-profile
controls. Do not implement changes yet. Group recommendations into repository changes, platform or
organizational controls, and outcome measurement. For each include the control ID, risk reduced,
systems affected, accountable role, verification method, dependencies, and effort estimate. Never
invent an attestation or convert unavailable evidence into a failure. End by asking which changes I
authorize.
```

## Reassessment

```text
Re-run the pinned ADRB v0.3.0 benchmark with agentic-scorecard@0.3.1 for the same profile and tracked scope. Compare reports
control by control. Explain changes using evidence and identify changed commit state, expired
claims, scope differences, regressions, or newly established controls. Compare normative and
repository-detected progress separately. Write a new dated report; do not overwrite the previous
one.
```
