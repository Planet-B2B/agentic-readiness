# Agentic Development Readiness Benchmark

A vendor-neutral, evidence-backed benchmark for the engineering harness around AI coding agents.
It helps an organization answer a practical question:

> What work may our agents safely perform today, what evidence supports that decision, and what
> should we improve next?

The benchmark measures the harness, not the model brand. It assesses ten dimensions across four
maturity levels and applies non-compensating floors to five autonomy profiles. A high total score
cannot hide a critical security, testing, governance, or recovery gap.

This repository is an early **v0.1 reference implementation** intended for public review and
piloting. It is not a certification standard.

## Ask your coding agent

You do not need to install or learn the CLI yourself. Paste this prompt into Codex, Claude Code,
GitHub Copilot, Cursor, or another coding agent that has terminal access to your repository:

> Assess this repository's readiness for AI-agent pull-request work. From the repository root, run
> `npx --yes agentic-scorecard@0.1.0 assess . --profile pr-creation --format markdown --output .agentic/reports/agentic-readiness-v0.1.0.md`.
> Do not change product source code or invent attestations. Read the resulting report and summarize
> the score, highest passed profile, whether `pr-creation` passes, target-profile blockers, and the
> five highest-value improvements. Clearly separate tool-verified evidence from self-attested
> evidence and flag likely false positives or missing organizational evidence. Leave the report
> uncommitted unless I ask you to commit it.

That is the recommended first assessment. The agent downloads the pinned benchmark package, runs the
read-only local collector, and explains the results. For alternate authority levels or a guided
remediation session, use the prompts in [AGENT_PROMPT.md](AGENT_PROMPT.md).

## Quick start

### Installation and prerequisites

A supported Node.js LTS release (20.19+, 22.13+, or 24+) is required. Assessment is local,
read-only, and offline by default.

```bash
npx agentic-scorecard@0.1.0 assess /path/to/repository \
  --profile pr-creation \
  --format markdown \
  --output agentic-readiness.md
```

To record controls that repository inspection cannot prove:

```bash
npx agentic-scorecard@0.1.0 init /path/to/repository
```

Complete `.agentic/attestations.yaml` with owners and links to durable evidence, then assess again.
Attested evidence remains visibly distinct from tool-verified evidence in every report.

For development from this checkout:

```bash
npm ci
npm run check
npm run dev -- assess tests/fixtures/mature --profile pr-creation
```

## What it assesses

| Dimension                          | Core question                                                   |
| ---------------------------------- | --------------------------------------------------------------- |
| Context and knowledge              | Can an agent discover the right rules and architecture?         |
| Reproducible environment           | Can it establish a faithful, clean development environment?     |
| Specification and planning         | Is the requested outcome explicit and testable?                 |
| Tooling and interfaces             | Are tools scoped, validated, observable, and fail-safe?         |
| Security and data governance       | Are data, credentials, untrusted content, and autonomy bounded? |
| Verification and testing           | Can changes be verified with trustworthy signals?               |
| Review and change governance       | Are accountability, review, and merge authority explicit?       |
| Learning and knowledge maintenance | Do corrections become durable, maintained guidance?             |
| Outcome observability              | Can runs be evaluated by task, risk, quality, time, and cost?   |
| Failure containment and recovery   | Can work stop safely and changes be reversed?                   |

Each dimension receives the highest **consecutive** maturity level whose controls are satisfied:

0. Absent
1. Ad hoc
2. Documented
3. Enforced
4. Measured and improving

Level 4 requires outcome evidence over time. A dashboard, policy, or tool merely existing cannot
earn measured maturity.

## Readiness profiles

Profiles describe increasing authority. They are safety floors, not labels of organizational
prestige.

| Profile                          | Intended authority                                               |
| -------------------------------- | ---------------------------------------------------------------- |
| `read-only-analysis`             | Inspect approved source and return advice; no mutation.          |
| `planning`                       | Draft plans and specifications for human review.                 |
| `local-implementation`           | Edit an isolated checkout and run approved local checks.         |
| `pr-creation`                    | Create a branch and PR; a human retains merge authority.         |
| `limited-autonomous-maintenance` | Perform pre-approved, low-risk maintenance within strict limits. |

No profile grants production deployment authority. Organizations should evaluate production access
through a separate, system-specific safety case.

The exact floors live in
[`benchmark/v0.1/benchmark.yaml`](benchmark/v0.1/benchmark.yaml) and their rationale in
[`benchmark/v0.1/scoring-policy.md`](benchmark/v0.1/scoring-policy.md).

## Evidence and trust labels

- **Verified:** a deterministic local collector found the configured repository evidence.
- **Attested:** an accountable owner supplied an evidence link or explanation. This may satisfy a
  control, but it never becomes verified evidence.
- **Unmet/unknown:** evidence is absent, expired, contradictory, or still requires review.
- **Independently reviewed:** reserved for a future external review protocol; the CLI does not issue
  this label.

Repository heuristics are intentionally explainable and conservative. They prove that an artifact
or term exists—not that a team consistently follows it. Manual claims make organizational controls
portable across GitHub, GitLab, Azure DevOps, internal systems, and different agent harnesses while
preserving provenance.

## Reports and CI

The CLI emits Markdown for people and stable JSON for automation:

```bash
agentic-scorecard assess . --format json --output .agentic/report.json
agentic-scorecard assess . --profile pr-creation --enforce
agentic-scorecard explain ADRB-SEC-003
agentic-scorecard validate
```

`--enforce` exits with code 2 when the target profile fails. Start by publishing a non-blocking
baseline; gate only after owners have reviewed false positives, accepted the versioned policy, and
funded the remediation plan. See
[`examples/github-actions-consumer.yml`](examples/github-actions-consumer.yml).

## Privacy and security

The default collector:

- makes no network calls and invokes no model;
- reads only the target checkout;
- ignores `.git`, dependency, build, and coverage directories;
- caps content-scanned files at 512 KB;
- reports file paths and match counts, never matching source snippets;
- writes nothing unless `--output` or `init` is explicitly requested.

Do not place credentials, private prompts, source excerpts, or personal data in attestations. Link to
access-controlled evidence instead. Report suspected vulnerabilities through [SECURITY.md](SECURITY.md).

## Repository structure

```text
benchmark/v0.1/       immutable benchmark definition and controls
benchmark/mappings/   informative mappings to external frameworks
src/                  reference CLI and local evidence collectors
templates/            adoption, preflight, attestation, and remediation templates
tests/fixtures/       transparent benchmark fixtures
rfcs/                 proposed normative changes
```

Normative changes use an RFC and create a new benchmark version; published versions remain
immutable. See [GOVERNANCE.md](GOVERNANCE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
Maintainers should follow [NPM_PUBLISHING.md](NPM_PUBLISHING.md) for the one-time bootstrap and
OIDC-provenance release process.

## Recommended adoption sequence

1. Run a local baseline for the least-authoritative profile you actually need.
2. Review every result with security, platform, and representative delivery teams.
3. Supply owned attestations for controls that cannot be mechanically verified.
4. Publish the report internally with explicit limitations and benchmark version.
5. Fund the smallest improvements that close target-profile blockers.
6. Reassess on material harness changes and at least quarterly.
7. Add a non-blocking CI report; enforce only the agreed target profile after a pilot.

Never optimize to the number alone. Use the control evidence and outcome metrics to improve the
system, and keep exceptions narrow, owned, expiring, and visible.

## Status and roadmap

v0.1 includes the normative control catalog, local collectors, attestations, JSON/Markdown reports,
fixtures, and a CI example. Candidate next steps include SARIF/HTML reports, signed reports, a stable
adapter SDK, organization-level aggregation, statistically designed benchmark tasks, and an
independent-review protocol. These require public design review before becoming normative.

Apache-2.0 licensed. The benchmark is a community engineering tool, not legal, compliance, or
security advice.
