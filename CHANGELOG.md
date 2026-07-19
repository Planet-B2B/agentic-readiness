# Changelog

## 0.4.0 - Unreleased

- Add semantic component evidence for `ADRB-RES-002`, including matched and missing containment
  components and partial references without partial scoring.
- Recognize conventional ownership files and structurally explicit ownership mappings for
  `ADRB-GOV-002` without allowing placeholders, vague ownership prose, or authority-free mappings;
  require approval and merge authority independently.
- Require an enabled integration-triggered CI scanner invocation for secret scanning, and split
  untrusted-input enforcement into the separate Level 3 `ADRB-SEC-007` control.
- Replace keyword inference for `ADRB-CTX-003` and `ADRB-TST-003` with enabled
  integration-triggered command classes, requiring both tests and static analysis for verification.
- Replace keyword inference for `ADRB-ENV-003`, `ADRB-SPC-003`, and `ADRB-LRN-003` with
  repository-bound locked-install, verification, traceability, and curation commands.
- Move repository-host, CI-provider, and environment-tool aliases out of portable controls and into
  versioned adapters.
- Resolve package-manager tasks, wrappers, and polyglot verification commands to tracked runnable
  implementations while rejecting display-only, discovery-only, dry-run, spoofed, or unresolved
  commands.
- Model GitHub, GitLab, and Azure integration gates conservatively, including checkout state,
  inherited working directories, supported fail-fast multiline scripts, failure propagation, and
  path, condition, or allow-failure exclusions.
- Require `ADRB-ENV-003` install, test, and static-analysis classes in one CI execution group, while
  preserving effective GitHub event partitions and aggregate verification where the benchmark
  outcome permits independent workflows.
- Validate ownership tables, mappings, contacts, CODEOWNERS targets and inline comments, while
  excluding retired, placeholder, bot-qualified, negated, or structurally ambiguous assignments.
- Validate guidance, specification, and knowledge-maintenance scripts by reachable executable
  behavior instead of filenames or inert source strings; make this repository's guidance check part
  of `npm run check`.
- Permit dated platform attestation for host-native secret scanning; bind v0.4 attestation files to
  one repository, reject unknown fields and malformed or unknown IDs, and keep platform scanning
  distinct from untrusted-input safeguards; reject future review dates and unresolved placeholders
  on active claims.
- Report required-check progress, stable blocker labels, actual mixed-evidence scope, and unresolved
  alternative controls separately from control-level confidence; attribute mixed-alternative
  results to the source that supplies the decisive status, and bind partial semantic summaries to
  the selected reference.
- Keep repository reads canonical, bounded, generated-output-safe, and linear for long source lines;
  constrain agent-document links to the checkout and align the published evidence schemas with
  runtime validation.
- Preserve immutable v0.1–v0.3 catalogs and migrate the CLI, schemas, templates, and prompts to ADRB
  v0.4.0 with independently runnable historical and mature conformance fixtures.

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
