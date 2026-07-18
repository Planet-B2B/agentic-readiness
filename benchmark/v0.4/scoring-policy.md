# v0.4 scoring policy

This document is normative for benchmark version 0.4.0.

## Unit and assessment scope

The unit is one repository plus explicitly supplied repository-semantic, external, and
organizational evidence bound to that repository. The default `tracked` mode considers only
Git-tracked paths, using their current working-tree contents. Reports record the commit, remote, and
dirty state. `workspace` mode is available for provisional assessment and is not directly
comparable with tracked-mode reports.

Generated reports, attestations, evidence requests, and imported evidence bundles never qualify as
repository evidence. An assessment must be idempotent: adding its own generated artifacts cannot
change its score.

## Dimension scores

Each dimension earns level `n` only when every applicable control at that level and every lower
level is met. More than one control may exist at a level when separate observable outcomes are
required. Controls met above the first gap are reported but do not increase the dimension score.

The normative score is the sum of ten dimension scores, with a maximum of 40. Its percentage is
display-only and does not determine readiness.

### Repository-detected progress

v0.4 also reports an explanatory repository score and ceiling. For each dimension, the ceiling is
the highest consecutive level for which every control has a deterministic, non-manual repository
collector. The achieved value is the highest consecutive level established only with
`repository-detected` evidence. The two values are summed across dimensions.

Agent-collected and human-attested evidence never increases repository-detected progress. The
repository percentage is `achieved / ceiling`; it does not replace the normative score, remove
UNKNOWN controls, or affect readiness-profile decisions.

## Readiness decisions

Each autonomy profile defines a floor for every dimension. A profile passes only if every floor is
met. Strength in one dimension cannot compensate for a security, testing, governance, or recovery
gap elsewhere. No profile grants deployment or production authority.

When a passed target profile depends on agent-collected or human-attested controls, the report's
target-profile headline discloses the number of required controls from each provenance class.

## Evidence scopes and provenance

- `repository-detected`: a deterministic collector found qualifying evidence in the selected path
  scope. It proves the reported artifact match, not consistent human behavior or external
  enforcement.
- `agent-collected`: an authorized agent supplied a structured, source-backed repository-semantic
  or external claim. It may satisfy only explicitly eligible controls and is never independently
  verified.
- `attested`: an accountable person supplied a dated, expiring claim and durable reference.
- `unknown`: evidence is unavailable, expired, mismatched, unauthorized, or inconclusive.

Repository controls use non-empty files, control-specific term thresholds, semantic component
groups, structurally identifiable ownership mappings, executable CI commands, bounded line windows,
and per-pattern candidate limits. Partial evidence remains visible but does not pass a control.
Catalog pattern order is significant when a candidate limit is present: authoritative entry points
precede large run, skill, or documentation corpora. External platform, organization, and outcome
controls cannot be inferred from repository keywords.

Human attestations and agent evidence may satisfy only controls explicitly eligible for those
classes. A v0.4 control may permit an `agent-collected` repository claim when a legitimate tracked
artifact uses an unrecognized convention. This is a semantic alternative, not a deterministic
pass: it remains separately labelled and does not increase repository-detected progress. Human
attestations cannot override repository-artifact controls.

Controls require every evidence check by default. A v0.4 control may explicitly declare
`evidence_mode: any` only when the checks are alternative ways to establish the same outcome. A
repository-only run remains `unknown` when the repository alternative is absent and an external
alternative has not been collected; it does not infer either a platform pass or a platform failure.
The report shows every alternative and its provenance.

Level 4 requires time-series or outcome evidence and an improvement decision influenced by it. The
existence of a dashboard is insufficient.

## Agent evidence bundles

An agent evidence bundle is version-bound and target-bound. Claims record scope, status, collector,
collection and expiry times, a privacy-safe derivation summary, and durable references. The core
scanner makes no network calls; the agent obtains explicit authorization and uses read-only tools to
create the bundle. An error is distinct from a negative result and cannot pass a control.

Agent evidence can satisfy only controls with `allow_agent_evidence: true` and an allowed scope.
Deterministic passes take precedence. Repository-scoped claims additionally require tracked files
to match HEAD and references of the form `repo:<tracked-path>[#Lx-Ly]`; every referenced path must
exist in the tracked assessment scope at the exact bound commit. Untracked generated artifacts do
not affect tracked-scope evidence. An agent may use such a claim only to
establish the control outcome from a nonstandard artifact the deterministic catalog did not
recognize.

## Changes and comparability

v0.1, v0.2, and v0.3 remain immutable. Scores from v0.1, v0.2, v0.3, and v0.4 are not directly
comparable because evidence and control semantics changed. Reports are comparable only when
benchmark version, target profile, repository scope, evidence policy, and assessment mode match.

## Claims

Allowed: “We self-assessed repository X against ADRB v0.4.0 on DATE; N controls were
repository-detected, M agent-collected, and P human-attested. Repository-detected progress was A of
an offline ceiling C.”

Not allowed: “Certified,” “compliant,” “safe,” “secure,” or “independently verified” based only on
this self-assessment.
