# v0.1 scoring policy

This document is normative for benchmark version 0.1.0.

## Unit of assessment

The unit is one repository plus the organizational controls explicitly attested for that repository.
The score describes the harness and operating boundaries at the assessment time. It does not score a
model, vendor, developer, team productivity, or code quality in general.

## Dimension scores

Each dimension has one or more controls at levels 1 through 4. A dimension earns level `n` only when:

1. every applicable control at level `n` is met; and
2. every lower level was earned.

This consecutive rule prevents a dashboard or advanced tool from masking missing fundamentals.
The overall score is the sum of ten dimension scores, with a maximum of 40. The percentage is
display-only and must not determine readiness.

## Readiness decisions

Each autonomy profile defines a floor for every dimension. A profile passes only if every floor is
met. Scores do not compensate across dimensions. For example, context level 4 cannot compensate for
security level 1 when a profile requires security level 2.

The highest passed profile is informative. Teams should target only the authority required for their
use case; a higher profile is not automatically better.

## Evidence classes

Deterministic collectors may award `verified` confidence when every required repository check passes.
Manual attestations may satisfy portable organizational controls or explain nonstandard evidence, but
the report labels them `attested`. Attestation never upgrades to verified confidence.

An attestation must include status, owner, review date, and a useful evidence reference. Expired
attestations are ignored. `not_applicable` is rejected unless a control explicitly permits it.
Core v0.1 controls do not permit not-applicable claims.

Collectors are intentionally evidence-presence tests. Reviewers must not infer implementation
quality, policy compliance, or branch settings merely from a file or word existing.

## Changes and comparability

Version 0.1.0 controls and floors are immutable after public release. Clarifications that do not alter
outcomes may be published as errata. Any addition, deletion, evidence-semantic change, or floor change
requires a new benchmark version through the RFC process.

Reports are comparable only when benchmark version, target profile, repository scope, attestation
policy, and assessment mode match. Longitudinal comparisons should also record material harness and
organizational changes.

## Claims

Allowed: “We self-assessed repository X against ADRB v0.1.0 and passed the PR-creation profile on
DATE; N controls were verified and M were attested.”

Not allowed: “Certified,” “compliant,” “safe,” or “secure” based only on this self-assessment.
