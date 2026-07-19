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
groups, structurally identifiable non-placeholder ownership mappings, enabled integration-triggered
CI invocations with adapter-declared full action identities plus explicit refs or executable plus
required argument-group signatures and prohibited non-blocking modes, executable step/job structure,
auto-loaded provider entry points, supported complete conditions and inheritance, no unparsed path
or exclusion gates, and blocking foreground exit-status
propagation, bounded line windows, and per-pattern candidate limits. Partial evidence remains
visible but does not pass a control. An ownership artifact, explicit accountable-human approval
authority, and explicit accountable-human merge authority are independently required for
`ADRB-GOV-002`; a generic owner/reviewer mention or declared agent authority cannot establish either
human authority. Directly negated authority statements do not count as positive evidence whether
negation appears before or after the matched phrase, including a colon-delimited policy label, and
explicit mappings require a recognized repository-wide target or path/component target rather than
arbitrary or punctuation-only syntax.
Typed ownership-table scope columns may use substantive component names, while conventional
plain-text former-owner sections remain inactive. Restrictive phrases such as `must not exceed`
establish an upper bound and are not treated as absence of the control.
`ADRB-RES-002` requires resource budgets and retry bounds as independent co-located components;
neither substitutes for the other.
Mechanical Level 3 context, environment, specification, testing, and learning controls require
structurally recognized CI commands; comments, documentation, and command-name keywords do not
establish execution. `ADRB-ENV-003` requires a locked installation plus independent test and
static-analysis command classes. `ADRB-TST-003`
requires independent test and static-analysis command classes aggregated across the assessed CI
entry points. Root package-manager tasks must
resolve to tracked script definitions whose command bodies establish the applicable command class,
including when supported wrappers or global package-manager options precede the invocation.
Context-changing package/workspace options require resolution of the selected manifest or fail
closed; nested package-exec tools may qualify only at a supported executable position.
Custom guidance validators additionally require adapter-declared validation structures in the
executed tracked source after language comments are excluded; file presence or comment text alone
does not establish behavior. Specification-traceability and knowledge-curation checks use the same
source-bound standard. A recognized specification validator binds an approved work-item reference
to both implementation and verification artifacts; checking only for a heading is insufficient.
Constant-false branches and validation functions without a top-level reachable call path fail closed.
Required structural groups cannot combine across unreachable function bodies.
Tool-specific discovery or
listing modes do not count as execution. Fail-fast multiline verification steps may contribute each
command, while scanners configured to require final exit-status propagation contribute only from the
final effective command.
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
Supplemental evidence resolves only alternatives with the same scope. A negative claim makes the
control `not_met` only when every alternative is established negatively; any uncollected alternative
keeps the control `unknown`.
The report shows every alternative and its provenance.
Established-control tables display the scope of the evidence that resolved the control rather than
an unresolved alternative scope.

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

`ADRB-SEC-007` deliberately accepts source-backed agent claims at repository, platform, or
organization scope because enforced untrusted-input safeguards may be implemented as tracked
adversarial harness tests, platform sandbox or tool policy, or organization-wide controls. The
claim's scope must identify where enforcement actually resides. Repository-scoped claims remain
commit-bound and line-referenced; no scope may pass from prose alone, and deterministic repository
keyword scanning is not an evidence path for this non-compensating security floor.

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
