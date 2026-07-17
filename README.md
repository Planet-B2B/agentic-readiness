# Agentic Development Readiness Benchmark

A vendor-neutral, evidence-backed benchmark for the engineering harness around AI coding agents.
It helps an organization answer a practical question:

> What work may our agents safely perform today, what evidence supports that decision, and what
> should we improve next?

The benchmark measures the harness, not the model brand. It assesses ten dimensions across four
maturity levels and applies non-compensating floors to five autonomy profiles. A high total score
cannot hide a critical security, testing, governance, or recovery gap.

This repository is a **v0.2 reference implementation** intended for public review and piloting. It
is not a certification standard. The immutable v0.1 benchmark remains available for historical
reproduction; v0.1 and v0.2 scores are not directly comparable.

## Ask your coding agent

You do not need to install or learn the CLI yourself. Paste this prompt into Codex, Claude Code,
GitHub Copilot, Cursor, or another coding agent that has terminal access to your repository:

> Assess this repository's readiness for AI-agent pull-request work. From the repository root, run
> `npx --yes agentic-scorecard@0.2.0 assess . --profile pr-creation --scope tracked --format markdown --output .agentic/reports/agentic-readiness-v0.2.0.md`.
> Do not change product source code or invent attestations. Read the resulting report and summarize
> the score, highest passed profile, whether `pr-creation` passes, target-profile blockers, and the
> five highest-value improvements. Separate repository gaps from external and outcome evidence, and
> keep repository-detected, agent-collected, and human-attested evidence distinct. Flag likely false
> positives or negatives. Leave generated artifacts uncommitted unless I ask you to commit them.

That is the recommended first assessment. The agent downloads the pinned benchmark package, runs the
read-only local collector, and explains the results. For alternate authority levels or a guided
remediation session, use the prompts in [AGENT_PROMPT.md](AGENT_PROMPT.md).

## Quick start

### Installation and prerequisites

A supported Node.js LTS release (20.19+, 22.13+, or 24+) is required. Assessment is local,
read-only, and offline by default.

```bash
npx agentic-scorecard@0.2.0 assess /path/to/repository \
  --profile pr-creation \
  --scope tracked \
  --format markdown \
  --output agentic-readiness.md
```

To record controls that repository inspection cannot prove:

```bash
npx agentic-scorecard@0.2.0 init /path/to/repository
```

Complete `.agentic/attestations.yaml` with owners and durable evidence links, then assess again.
Human-attested evidence remains visibly distinct in every report.

To let an authorized coding agent collect evidence from Git hosting, CI, dashboards, or other
external systems, first generate a target-bound template:

```bash
npx agentic-scorecard@0.2.0 init-evidence /path/to/repository
```

Ask the agent to review `.agentic/evidence-request.md`, obtain approval before using
least-privileged read-only connectors, add attempted claims to `.agentic/agent-evidence.yaml`, and
rerun with `--agent-evidence`. The default bundle path is loaded automatically. See
[AGENT_PROMPT.md](AGENT_PROMPT.md) for the complete copy-and-paste workflow.

### Migrating from v0.1

Run a new tracked-scope baseline and retain the old report as historical evidence. Do not present the
score change as improvement or regression because v0.2 changes evidence semantics. Re-review v0.1
attestations before recreating them for v0.2; v0.2 repository-artifact controls cannot be overridden
by declaration, and every human or agent-collected external claim must expire.

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
[`benchmark/v0.2/benchmark.yaml`](benchmark/v0.2/benchmark.yaml) and their rationale in
[`benchmark/v0.2/scoring-policy.md`](benchmark/v0.2/scoring-policy.md).

## Evidence scopes and trust labels

- **Repository-detected:** the local collector found qualifying evidence in the selected path scope.
  This proves an artifact match, not consistent practice or external enforcement.
- **Agent-collected:** an authorized agent supplied a target-bound, expiring, source-backed external
  claim. It is not independently verified.
- **Human-attested:** an accountable owner supplied a dated evidence link or explanation.
- **Unknown:** evidence is unavailable, expired, unauthorized, mismatched, or inconclusive.

Controls also identify whether their evidence belongs in the repository, hosting platform,
organization, or outcome systems. This prevents expected external unknowns from masquerading as
missing files. Future independently conformant adapters require a separate protocol; v0.2 does not
issue certification or independent-verification claims.

## Reports and CI

The CLI emits Markdown for people and stable JSON for automation:

```bash
agentic-scorecard assess . --scope tracked --format json --output .agentic/report.json
agentic-scorecard assess . --profile pr-creation --agent-evidence .agentic/agent-evidence.yaml
agentic-scorecard assess . --profile pr-creation --enforce
agentic-scorecard init-evidence .
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
- reads only Git-tracked paths and records commit and dirty-worktree metadata;
- ignores `.git`, dependencies, build output, coverage, generated reports, attestations, and imported
  evidence bundles;
- caps content-scanned files at 512 KB;
- reports file paths and match counts, never matching source snippets;
- writes nothing unless `--output`, `init`, or `init-evidence` is explicitly requested.

Do not place credentials, private prompts, source excerpts, or personal data in attestations. Link to
access-controlled evidence instead. Report suspected vulnerabilities through [SECURITY.md](SECURITY.md).

## Repository structure

```text
benchmark/v0.1/       immutable historical v0.1 definition
benchmark/v0.2/       current normative benchmark, schemas, and controls
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
3. Use an authorized agent to collect source-backed external evidence where appropriate.
4. Supply owned human attestations only where deterministic collection is unavailable.
5. Publish the report internally with explicit limitations, scope, commit, and benchmark version.
6. Fund the smallest improvements that close target-profile blockers.
7. Reassess on material harness changes and at least quarterly.
8. Add a non-blocking CI report; enforce only the agreed target profile after a pilot.

Never optimize to the number alone. Use the control evidence and outcome metrics to improve the
system, and keep exceptions narrow, owned, expiring, and visible.

## Status and roadmap

v0.2 adds integrity-safe tracked-path collection, evidence scopes, precise co-located content
matching, agent-collected external evidence, and transparent report grouping. Candidate next steps
include conformant signed adapters, SARIF/HTML reports, organization-level aggregation,
statistically designed benchmark tasks, and an independent-review protocol. These require public
design review before becoming normative.

Apache-2.0 licensed. The benchmark is a community engineering tool, not legal, compliance, or
security advice.
