# v0.2 scoring policy

This document is normative for benchmark version 0.2.0.

## Unit and assessment scope

The unit is one repository plus explicitly supplied external and organizational evidence bound to
that repository. The default `tracked` mode considers only Git-tracked paths, using their current
working-tree contents. Reports record the commit, remote, and dirty state. `workspace` mode is
available for provisional assessment and is not directly comparable with tracked-mode reports.

Generated reports, attestations, evidence requests, and imported evidence bundles never qualify as
repository evidence. An assessment must be idempotent: adding its own generated artifacts cannot
change its score.

## Dimension scores

Each dimension earns level `n` only when every applicable control at that level and every lower
level is met. More than one control may exist at a level when separate observable outcomes are
required. Controls met above the first gap are reported but do not increase the dimension score.

The overall score is the sum of ten dimension scores, with a maximum of 40. The percentage is
display-only and does not determine readiness.

## Readiness decisions

Each autonomy profile defines a floor for every dimension. A profile passes only if every floor is
met. Strength in one dimension cannot compensate for a security, testing, governance, or recovery
gap elsewhere. No profile grants deployment or production authority.

## Evidence scopes and provenance

- `repository-detected`: a deterministic collector found qualifying evidence in the selected path
  scope. It proves the reported artifact match, not consistent human behavior or external
  enforcement.
- `agent-collected`: an authorized agent supplied a structured, source-backed external claim. It may
  satisfy controls explicitly eligible for external evidence but is never independently verified.
- `attested`: an accountable person supplied a dated, expiring claim and durable reference.
- `unknown`: evidence is unavailable, expired, mismatched, unauthorized, or inconclusive.

Repository controls use non-empty files and control-specific, co-located term thresholds. External
platform, organization, and outcome controls cannot be inferred from repository keywords.
Human attestations and agent evidence may satisfy only controls explicitly eligible for those
classes; v0.2 repository-artifact controls are not overridable by declaration.

Level 4 requires time-series or outcome evidence and an improvement decision influenced by it. The
existence of a dashboard is insufficient.

## Agent evidence bundles

An agent evidence bundle is version-bound and target-bound. Claims record scope, status, collector,
collection and expiry times, a privacy-safe derivation summary, and durable references. The core
scanner makes no network calls; the agent obtains explicit authorization and uses read-only tools to
create the bundle. An error is distinct from a negative result and cannot pass a control.

Agent evidence can satisfy only controls with `allow_agent_evidence: true`. It cannot override a
failed repository artifact control.

## Changes and comparability

v0.1 remains immutable. v0.1 and v0.2 scores are not directly comparable because evidence and
control semantics changed. Reports are comparable only when benchmark version, target profile,
repository scope, evidence policy, and assessment mode match.

## Claims

Allowed: “We self-assessed repository X against ADRB v0.2.0 on DATE; N controls were
repository-detected, M agent-collected, and P human-attested.”

Not allowed: “Certified,” “compliant,” “safe,” “secure,” or “independently verified” based only on
this self-assessment.
