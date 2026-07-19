# Changelog

## 0.4.0 - Unreleased

- Add semantic component evidence for `ADRB-RES-002`, including matched and missing containment
  components and partial references without partial scoring.
- Report required-check progress and exact blocking checks separately from control confidence.
- Recognize conventional ownership files and structurally explicit ownership mappings for
  `ADRB-GOV-002` without allowing placeholders, vague ownership prose, or authority-free mappings;
  require approval and merge authority independently.
- Require an enabled integration-triggered CI scanner invocation for secret scanning, and split
  untrusted-input enforcement into the separate Level 3 `ADRB-SEC-007` control.
- Keep CI-provider discovery in versioned adapters and reject event-excluding, disabled,
  failure-swallowing, display-only, or identity-spoofing scanner invocations.
- Reject negated authority, punctuation-only ownership targets, Azure conditions that exclude pull
  requests, and GitLab rule- or job-level allow-failure configuration; keep host-specific ownership
  paths in adapters and v0.4-only report sections out of historical rendering.
- Require pre-integration GitHub activity types, supported event-admitting conditions, literal
  blocking configuration, scan-bearing command arguments, and adapter-declared full action
  identities; validate Markdown ownership scope cells structurally.
- Require runnable GitHub step jobs, reject job-level reusable workflows as scanner actions, parse
  complete supported GitLab predicates, preserve scanner exit-status propagation, and detect
  authority negation across its containing clause.
- Permit target-bound platform evidence for host-native secret scanning while keeping it distinct
  from untrusted-input safeguards.
- Preserve immutable v0.1–v0.3 catalogs and migrate the CLI, schemas, templates, and prompts to ADRB
  v0.4.0.

## 0.3.1 - 2026-07-18

- Make the complete agent-assisted workflow the recommended copy-and-paste path while retaining a
  clearly labelled fast repository-only baseline.
- Warn when a tracked assessment includes uncommitted tracked-file contents or establishes no
  agent-collected or human-attested evidence.
- Lead Markdown reports with assessment mode and repository-detected progress before the normative
  readiness score, without changing controls, scoring, or readiness floors.
- Require coding-agent prompts to confirm a clean, current target before collecting commit-bound
  evidence or comparing results.

## 0.3.0 - 2026-07-18

- Recognize portable generic `.ai` harnesses, common agent-guidance case variants, and Cursor-native
  rules, skills, agents, and plans where control-specific.
- Add proximity-bounded content matching and prioritized per-pattern candidate limits to reduce
  large-corpus and distant-keyword false positives.
- Allow clean, commit-bound, tracked-path-backed semantic repository claims for explicitly eligible
  controls while preserving their `agent-collected` label.
- Report explanatory repository-detected progress against the offline collector's attainable
  ceiling without changing the normative 40-point score or readiness floors.
- Separate level-1 secret/sensitive-data boundaries from level-2 security reporting and response.
- Add Open Mercato- and Dialer-shaped accuracy regressions while retaining v0.1 and v0.2 behavior.
- Ignore version-mismatched artifacts only when they are discovered at default paths, with prominent
  report warnings; explicit evidence paths continue to fail closed.
- Validate repository citation line ranges and disclose when a passing target profile depends on
  agent-collected or human-attested evidence.
- Recognize conventional `docs/spec*.md` work artifacts and Python/uv verification vocabulary
  through portable paths and a language-tooling detector adapter.
- Align the published repository-reference grammar with runtime path and line-anchor validation.

## 0.2.0 - 2026-07-17

- Assess Git-tracked paths by default and expose provisional workspace scanning explicitly.
- Exclude generated reports, attestations, and evidence bundles from repository evidence.
- Require non-empty artifacts and co-located multi-term content evidence with precise references.
- Separate repository, platform, organization, and outcome evidence scopes in controls and reports.
- Add target-bound, expiring agent-collected evidence bundles for external controls.
- Split repository configuration from platform enforcement in specification, security, and testing.
- Add idempotence, untracked-file, evidence-locality, provenance, and target-binding tests.

## 0.1.0 - 2026-07-17

- Add the ten-dimension, four-level benchmark catalog.
- Add five non-compensating autonomy profiles.
- Add local evidence collectors and explicit manual attestations.
- Add JSON and Markdown reports, fixtures, tests, and a GitHub Actions example.
- Add copy-and-paste prompts for coding-agent-led assessments.
