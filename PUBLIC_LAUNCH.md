# Public launch checklist

The public v0.1.0 launch is complete. Checked items are finished; unchecked items are owned follow-up
work for the pilot and first 90 days.

## Launch decisions

- [x] Confirm `Planet-B2B/agentic-readiness` as the GitHub repository.
- [x] Publish `agentic-scorecard@0.1.0` from the 2FA-protected `planetb2b` npm account.
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

- [x] Enable private vulnerability reporting and assign the CODEOWNER as initial response owner.
- [x] Protect `main`; require independent review, CODEOWNERS, the `verify` status check, and
      conversation resolution; prohibit force-push and deletion.
- [x] Keep workflow permissions read-only by default and pin third-party actions to reviewed commits.
- [ ] Decide whether organization policy additionally requires signed commits; tag `v0.1.0` is
      annotated but not cryptographically signed.
- [x] Enable issue templates and discussions; publish governance and launch expectations.
- [x] Add the repository description, topics, license detection, and canonical npm homepage.
- [ ] Add a social preview after the project establishes a visual identity.

## Pilot and release

- [ ] Pilot against at least five repositories: minimal, conventional non-agentic, documented agentic,
      mature agentic, and one non-GitHub workflow.
- [ ] Have independent reviewers classify false positives, false negatives, ambiguous controls,
      remediation effort, and assessment time.
- [ ] Publish anonymized fixture-based conformance results, not private repository scores.
- [ ] Resolve scoring-semantic feedback through an RFC and rerun all conformance fixtures.
- [x] Create annotated tag `v0.1.0`, publish the GitHub release, and publish the initial npm package
      with 2FA. Initial direct publication cannot carry GitHub build provenance.
- [x] Configure future npm publishing through the exact GitHub OIDC workflow with automatic
      provenance and no stored write token.
- [x] Pin the consumer example to the actual owner and released tag.
- [x] Announce the benchmark as a self-assessment and improvement guide, never certification.

## First 90 days

- [ ] Triage reports weekly and publish errata without silently changing v0.1 scoring.
- [ ] Track adoption, assessment completion, evidence quality, false-positive rate, and remediation
      completion—not repository rankings.
- [ ] Recruit maintainers from multiple organizations before positioning the benchmark as a neutral
      industry standard.
- [ ] Decide through RFCs whether SARIF/HTML, signed reports, adapter conformance, organization-level
      aggregation, and an independent-review protocol belong in v0.2.
