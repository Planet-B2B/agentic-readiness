# Ask an AI coding agent to run the benchmark

These prompts are deliberately vendor-neutral. The agent needs terminal access to the repository and
permission to download the published npm package. The benchmark itself runs locally, invokes no
model, uploads no source, and makes no network calls after package installation.

## Recommended: first assessment

Copy and paste:

```text
Assess this repository's readiness for AI-agent pull-request work.

From the repository root, run:
npx --yes agentic-scorecard@0.1.0 assess . --profile pr-creation --format markdown --output .agentic/reports/agentic-readiness-v0.1.0.md

Do not change product source code, configuration, policies, or tests. Do not create or mark manual
attestations as met. Read the generated report and tell me:
1. the score and highest passed readiness profile;
2. whether the pr-creation target passes;
3. each target-profile blocker and the evidence that was or was not found;
4. the five highest-value improvements in dependency order; and
5. any likely false positive, false negative, or organizational control that repository inspection
   cannot prove.

Keep tool-verified and self-attested evidence clearly separated. Leave the generated report
uncommitted unless I explicitly ask you to commit it. If the command cannot run, explain the exact
blocker without changing the repository to work around it.
```

## Choose a different authority level

Replace `pr-creation` with exactly one of:

- `read-only-analysis` — inspect approved source and return advice;
- `planning` — draft plans and specifications;
- `local-implementation` — edit an isolated checkout and run local checks;
- `pr-creation` — create a branch and pull request while a human retains merge authority;
- `limited-autonomous-maintenance` — perform pre-approved low-risk maintenance within strict limits.

No benchmark profile grants production deployment authority.

## Guided remediation

Use this only after reviewing the first report:

```text
Read .agentic/reports/agentic-readiness-v0.1.0.md and create a remediation proposal for the failed
target-profile controls. Do not implement changes yet. Group recommendations into quick wins,
foundational engineering, and organizational evidence. For each recommendation include the ADRB
control ID, risk reduced, files or systems likely affected, accountable role, verification method,
dependencies, and an effort estimate. Identify claims requiring a human owner or access to external
systems; never invent an attestation. End by asking which recommendations I authorize you to
implement.
```

## Reassessment after approved improvements

```text
Re-run the pinned Agentic Development Readiness Benchmark v0.1.0 for the same readiness profile.
Compare the new report to the previous report control by control. Explain score changes using evidence,
not assumptions, and identify any regression or expired attestation. Do not overwrite the previous
report; add the current date to the new report filename.
```
