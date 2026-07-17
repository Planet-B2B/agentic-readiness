# Public launch checklist

The implementation is ready for a private pilot. Do not make the repository public until every
blocking item below has an accountable owner.

## Blocking decisions

- [x] Confirm `Planet-B2B/agentic-readiness` as the GitHub repository.
- [ ] Authenticate the initial npm publisher; `agentic-scorecard` is the confirmed package name.
- [x] Record Planet B2B Inc. as the Apache-2.0 copyright holder in `NOTICE` under the publication
      authorization received on 2026-07-17.
- [x] Replace maintainer, security, conduct, and organization placeholders.
- [ ] Review the control language with security, legal/privacy, platform engineering, and at least two
      delivery teams outside the originating project.
- [x] Confirm that no internal URLs, credentials, customer data, or proprietary implementation
      details appear in history, fixtures, package contents, or generated reports.
- [x] Publish v0.1.0 as the first frozen public benchmark while retaining the explicit early-reference
      and non-certification language.

## Repository settings

- [ ] Enable private vulnerability reporting and assign a response team.
- [ ] Protect `main`; require independent review, CODEOWNERS, signed or verified commits if policy
      requires them, the CI check, and conversation resolution.
- [ ] Give workflows read-only permissions by default and pin third-party actions to reviewed commits
      for the release branch.
- [ ] Enable issue templates and discussions; publish a roadmap and maintainer expectations.
- [ ] Add repository description, topics, license detection, social preview, and an archived project
      website only after the canonical repository URL is known.

## Pilot and release

- [ ] Pilot against at least five repositories: minimal, conventional non-agentic, documented agentic,
      mature agentic, and one non-GitHub workflow.
- [ ] Have independent reviewers classify false positives, false negatives, ambiguous controls,
      remediation effort, and assessment time.
- [ ] Publish anonymized fixture-based conformance results, not private repository scores.
- [ ] Resolve scoring-semantic feedback through an RFC and rerun all conformance fixtures.
- [ ] Create a clean signed tag and GitHub release; publish the npm package with provenance and 2FA.
- [ ] Pin the consumer example to the actual owner and released tag or commit SHA.
- [ ] Announce the benchmark as a self-assessment and improvement guide, never certification.

## First 90 days

- [ ] Triage reports weekly and publish errata without silently changing v0.1 scoring.
- [ ] Track adoption, assessment completion, evidence quality, false-positive rate, and remediation
      completion—not repository rankings.
- [ ] Recruit maintainers from multiple organizations before positioning the benchmark as a neutral
      industry standard.
- [ ] Decide through RFCs whether SARIF/HTML, signed reports, adapter conformance, organization-level
      aggregation, and an independent-review protocol belong in v0.2.
