# Benchmark lessons

Append new entries newest-first after a scoring correction, false positive, missed risk, or pilot
feedback. Each entry contains a context and a rule.

## 2026-07-18 — Static proof must exclude inert text and unresolved context

**Context.** Automated review found that comments could fake validation structure, package context
flags could bind the wrong manifest, nested `exec` tools were missed, and explicit scanner exit-code
variables could hide a non-blocking result.

**Rule.** Exclude inert language comments from source evidence, fail closed when execution context
changes cannot be resolved, inspect every supported executable position, and reject configuration
overrides whose blocking semantics are unknown.

## 2026-07-18 — Compose provider gates and preserve semantic context

**Context.** Automated review found that a job gate could override a denied GitLab workflow, package
wrappers could bypass script binding, owner headings changed contact meaning, and mixed-scope reports
displayed an unresolved alternative instead of the evidence that passed.

**Rule.** Require every provider gate in the execution chain, re-bind wrapped commands at the actual
executable, retain document-section context during structural parsing, and derive presentation scope
from the evidence that resolved the control.

## 2026-07-18 — Portable outcomes and executable behavior are separate contracts

**Context.** Automated review found host/tool aliases in portable controls, no-op validation scripts
earning structural evidence, list-only test modes counting as execution, and a combined budget/retry
group hiding one required containment component.

**Rule.** Keep portable controls convention-neutral, put aliases in versioned adapters, require
executed custom scripts to expose their validation and failure structure, and model every
independently required outcome as its own evidence group.

## 2026-07-18 — Keep evidence parsers structurally reviewable

**Context.** Sonar review found that ownership regexes and monolithic provider/command parsers made
the fail-closed evidence logic harder to audit even though the quality gate still passed.

**Rule.** Prefer bounded string validation and small disposition helpers over complex regexes or
branch-heavy collectors so each structural guarantee can be reviewed and tested independently.

## 2026-07-18 — Aggregate outcomes without inheriting uncertainty

**Context.** Automated review found that split CI files could undercount a complete verification
outcome, while unresolved GitLab inheritance, non-blocking scanner modes, suffix negation, and
inactive owner contacts could overclaim enforcement or accountability.

**Rule.** Aggregate independent command classes at the control boundary, but fail closed on
unresolved provider inheritance; encode required and prohibited execution modes explicitly; and
reject negative clauses or inactive identities wherever they appear in structural evidence.

## 2026-07-18 — Structural evidence starts at an executable entry point

**Context.** Automated re-review found that unreferenced CI fragments, command-shaped Azure root
fields, nonexistent bare guidance commands, Cartesian command aliases, and punctuation-only scopes
could still look structural without being executable or accountable.

**Rule.** Start deterministic collection only from provider-loaded entry points; validate commands
at executable step nodes against explicit executable/argument signatures and existing referenced
paths; and require ownership targets to contain a substantive scope.

## 2026-07-18 — Mechanical outcomes need executed evidence

**Context.** Automated re-review found that two Level 3 controls still inferred executed guidance
validation and verification from CI comments, while impossible conditions, display-mode commands,
absence phrasing, and first-match rule ordering could distort structural results.

**Rule.** Mechanically checked outcomes must bind to enabled recognized commands; condition parsers
must preserve satisfiability and first-match semantics; and semantic matching must reject explicit
absence as well as direct negation.

## 2026-07-18 — Executable-looking configuration still needs a binding guarantee

**Context.** Automated re-review found that an unversioned action, a backgrounded scanner, a
path-gated GitLab rule, or an explicit `no owner` assignment could still look like enforceable or
accountable evidence despite lacking that guarantee.

**Rule.** Require executable action references, prove the scanner's foreground status controls the
step, fail closed on unparsed CI gating fields, and classify negative ownership assignments as
placeholders.

## 2026-07-18 — Prove the check can execute and block

**Context.** Automated re-review found that a GitHub job without a runner, a job-level reusable
workflow reference, a partially parsed GitLab predicate, or a scanner followed by `exit 0` could
still appear to be an executable blocking scan; short negation lookback also missed modifiers.

**Rule.** Require an executable provider job shape, validate complete supported conditions, accept
only a final exit-status-bearing scanner statement, distinguish step actions from reusable jobs, and
evaluate semantic negation across the containing clause.

## 2026-07-18 — A scanner name is not a scan

**Context.** Automated re-review found that post-close triggers, unsupported conditions, quoted
allow-failure settings, version/help commands, and arbitrary actions containing a scanner-shaped
path segment could still look like enforced secret scanning.

**Rule.** CI enforcement must cover pre-integration activity, admit the integration event under any
condition, propagate failure, and invoke either a versioned adapter's full action identity or one of
its executable plus scan-bearing argument forms; names and substrings alone are not evidence.

## 2026-07-18 — Fail closed on negation, punctuation, and conditional enforcement

**Context.** A later PR review found that negated human authority could satisfy a positive semantic
group, a hyphen in collaboration prose could masquerade as an ownership target, and Azure or GitLab
conditions could make a scanner non-blocking while the collector still called it enforced.

**Rule.** Positive semantic evidence must reject direct negation; structural mappings must validate
the target grammar rather than punctuation; and provider collectors must prove the relevant event
can execute a blocking check, failing closed on unsupported conditions or allow-failure paths.

## 2026-07-18 — Model every independent authority and enforcement condition

**Context.** PR review found that a combined approval-or-merge group could pass without declared
merge authority, while CI collectors could mistake provider paths, event-excluding conditions,
failure-swallowing shell commands, or action-version text for enforced secret scanning.

**Rule.** Give independently required governance outcomes separate semantic groups; keep provider
discovery in versioned adapters; and recognize CI enforcement only when trigger, condition, action
identity, executable path, and failure propagation all support the claimed integration gate.

## 2026-07-18 — Command-shaped text is not CI enforcement

**Context.** PR review found that a manual-only workflow, disabled step, or `echo gitleaks` command
could satisfy the initial v0.4 secret-scanning collector even though no scanner guarded integration.

**Rule.** Enforcement collectors must bind executable or action identity to an enabled relevant
trigger and reject display commands, disabled conditions, manual-only paths, and allow-failure
configuration.

## 2026-07-18 — Structural ownership needs an accountable value and separate authority

**Context.** PR review found that OWNERS.md lists were missed while placeholder table cells and
generic role words could pass, and that ownership/reviewer prose could satisfy GOV-002 without any
approval or merge authority.

**Rule.** Parse conventional owner contacts and explicit mappings structurally, reject placeholder
or descriptive values, and require authority as its own semantic outcome rather than inferring it
from ownership.

## 2026-07-18 — Model alternative evidence sources explicitly

**Context.** Platform-native secret scanning was invisible to the offline collector, but treating
its absence as a repository failure would be as misleading as allowing secret-scan keywords to
stand in for enforcement.

**Rule.** When repository and external checks are legitimate alternatives for the same outcome,
encode that relationship explicitly, leave unavailable alternatives UNKNOWN, and never let one
security outcome satisfy a distinct safeguard.

## 2026-07-18 — Match semantic components, not benchmark phrases

**Context.** Pilot feedback showed mature containment guidance expressing scope stops, escalation,
and human gates in natural language while a literal required-phrase list reported no useful
evidence.

**Rule.** Define the required outcome as named semantic components with bounded synonym groups;
show partial component coverage for diagnosis, but award the control only when every required
component is co-located.

## 2026-07-18 — Separate target selection from checkout isolation

**Context.** PR review found that the recommended workflow sent any dirty or behind checkout to the
upstream commit, which could silently replace a user's selected local HEAD, and kept reports inside
an ephemeral worktree that might be removed before comparison.

**Rule.** Select and state the assessed commit before isolating it, never let dirty state substitute
upstream for that commit, and write every report and evidence artifact to a durable location outside
temporary worktrees; distinguish package and benchmark versions wherever both appear.

## 2026-07-18 — Label offline repository scans as baselines, not complete assessments

**Context.** A mature project appeared substantially less ready when the recommended agent prompt
ran only the offline repository collector and supplied no platform, organization, or outcome
evidence; the report was accurate but the workflow label invited an overbroad interpretation.

**Rule.** Make the evidence-assisted workflow the recommended assessment, label zero-supplemental-
evidence results as repository-only baselines, and require a clean current target before comparing
scores or binding collected evidence.

## 2026-07-18 — Keep published evidence schemas aligned with runtime validation

**Context.** PR review found that the published repository-reference regex accepted backslashes and
`.` path segments that the runtime validator correctly rejected.

**Rule.** Treat published schemas and programmatic validators as one trust boundary; test the same
valid and invalid input classes against both whenever either side changes.

## 2026-07-18 — Bound subprocess tests for cold-run overhead

**Context.** A CLI regression test passed on warm runs but could exceed Vitest's five-second default
when `tsx` compiled cold under coverage alongside parallel workers.

**Rule.** Give subprocess integration tests explicit runner and process timeouts sized for cold CI,
so startup variance does not create flakes and a genuinely hung child still terminates.

## 2026-07-18 — Calibrate ecosystem aliases without weakening portable controls

**Context.** A Python/uv pilot had exact setup, substantial specs, a canonical quality script, and
CI verification, but generic terms missed `pytest`, `mypy`, `flake8`, and `docs/spec-*.md`.

**Rule.** Add conventional portable layouts to controls, keep language/tool vocabulary in adapters,
and preserve known structural gaps rather than converting any ecosystem config file into a pass.

## 2026-07-18 — Enforce evidence boundaries at every public entry point

**Context.** PR review found that the JSON schema rejected ambiguous repository citations while the
programmatic validator did not, and that a shared scope enum unintentionally allowed manual
repository evidence.

**Rule.** Keep trust-boundary schemas narrow and repeat critical validation in programmatic paths;
shared enums must not silently widen the authority or provenance of a specialized evidence type.

## 2026-07-17 — Reviewable evidence includes valid citation bounds

**Context.** ADRB v0.3 initially accepted repository claim line ranges without checking their order
or whether the cited lines existed, weakening the claim's human-review path.

**Rule.** Validate both the tracked path and any source-location bounds before accepting semantic
evidence, and disclose when a readiness decision depends on non-deterministic provenance.

## 2026-07-17 — Auto-discovery and explicit evidence need different migration behavior

**Context.** Switching the default benchmark from v0.2 to v0.3 caused old artifacts at default paths
to abort the first assessment, even though users had not explicitly selected those files.

**Rule.** Ignore incompatible auto-discovered artifacts with prominent regeneration warnings, while
explicit evidence inputs continue to fail closed with a clear version-specific error.

## 2026-07-17 — Measure the harness, not the model label

**Context.** Constellation's cross-model review results changed materially with checkout fidelity,
repository grounding, sandbox policy, deduplication, and bounded tool use even when the underlying
model family stayed constant.

**Rule.** Portable controls assess the development harness and its outcomes. Model/provider names
belong in evidence metadata and adapters, never as maturity criteria.
