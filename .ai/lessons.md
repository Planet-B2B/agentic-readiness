# Benchmark lessons

Append new entries newest-first after a scoring correction, false positive, missed risk, or pilot
feedback. Each entry contains a context and a rule.

## 2026-07-19 — Aggregation preserves execution partitions and decisive provenance

**Context.** Exact-head review found that commands guarded to mutually exclusive GitHub events could
combine under one job identity, while an unrelated agent claim could relabel a pass established by a
human attestation.

**Rule.** Carry effective event partitions through same-execution aggregation, and derive result
confidence only from the evidence source that establishes the decisive status.

## 2026-07-19 — Passing evidence must be executable, current, accountable, and non-overlapping

**Context.** Final release review found that dry-run install/test commands could satisfy execution
controls, generated attestation placeholders and future review dates could become active passes, and
“retry budget” could satisfy both retry and resource-bound components.

**Rule.** Reject tool-specific non-execution modes, require active supplemental claims to replace
placeholders with current accountable evidence, and keep independently required semantic groups
lexically distinct.

## 2026-07-19 — Supplemental evidence and inherited CI behavior must bind to their target

**Context.** Release review found that a human-attestation file could be reused across repositories,
runtime validation silently stripped fields forbidden by the published schema, and an omitted shell
was interpreted as fail-fast Bash even on Windows or unresolved GitHub runners.

**Rule.** Bind supplemental evidence to a normalized assessed target, keep published and runtime
schemas equally strict (including required collections and key grammar), build conformance fixtures
with deterministic repository identity, and infer provider defaults only when the execution
environment establishes them.

## 2026-07-19 — Input bounds must also bound parser complexity

**Context.** Release review found that quote-aware source validation respected byte limits but
rescanned each long line from its start for every character, turning an allowed minified file into a
multi-minute CI assessment.

**Rule.** Pair repository input limits with linear or explicitly bounded parsing, and keep a
long-line regression on every source-aware enforcement collector.

## 2026-07-19 — CI evidence binds to one effective execution context

**Context.** Release review found that workflow defaults, shell fail-fast behavior, secondary
checkouts, and commands split across jobs could change what ran without changing the detector's
result.

**Rule.** Resolve inherited provider settings and checkout state before command matching, preserve
known failure propagation, and require environment recreation evidence inside one CI execution
group.

## 2026-07-19 — Integrity gates bind scope, coverage, and control confidence

**Context.** Automated review found an implementation omitted from a positive fixture's TypeScript
project, local documentation links that could resolve outside the checkout, and partial negative
evidence displayed as control-level confidence while an alternative remained unknown.

**Rule.** Make positive fixtures compile their implementation, canonicalize and scope local link
targets, and distinguish partial evidence provenance from confidence in an unresolved control.

## 2026-07-19 — Structural boundaries and task identity cannot be inferred away

**Context.** Automated review found that blank lines and headings could be removed before Markdown
ownership parsing, while unconstrained Nox and Tox invocations could represent documentation rather
than tests.

**Rule.** Preserve section and row boundaries during structural parsing, and recognize task
orchestrators only when the selected task can be bound to the claimed outcome.

## 2026-07-19 — Alternative evidence and structured placeholders stay scoped

**Context.** Automated review found punctuation-only CODEOWNERS targets, placeholder recovery
owners, restricted-history secret scans, and repository-negative claims that incorrectly resolved
an uncollected platform alternative.

**Rule.** Validate both sides of structural mappings, reject unresolved placeholders and scan-range
restrictions, and apply supplemental evidence only to the alternative scope it establishes.

## 2026-07-19 — Reachability includes every supported function form

**Context.** Automated review found that uncalled expression-bodied JavaScript arrow functions were
left in the top-level validator projection even though uncalled block-bodied functions were
excluded.

**Rule.** Classify every supported declaration form before computing executable source, including
single-expression arrows, so inert helper bodies cannot contribute enforcement signatures.

## 2026-07-19 — Structured evidence requires wholly valid assignments and real bounds

**Context.** Automated review found that ownership prose with one embedded contact could imitate a
CODEOWNERS assignment, while explicitly unlimited budgets or unbounded retries could imitate
containment limits.

**Rule.** Validate every field in a structured ownership assignment, and treat explicit absence of
an upper bound as negative evidence in either direction around a resource or retry term.

## 2026-07-18 — Semantic negation and structural reachability are outcome-aware

**Context.** Automated review found that an explicit “do not continue outside allowed paths” rule
lost its scope meaning to generic negation handling, while pattern groups split across unreachable
functions could combine into false execution evidence.

**Rule.** Encode compound prohibitions that positively establish a boundary, and evaluate all
required structural groups over one executable source projection rooted in top-level behavior.

## 2026-07-18 — Flags and repository wrappers are executable-specific

**Context.** Automated review found that one runner's listing flag rejected another runner's valid
test mode, declared Maven/Gradle wrapper aliases were unreachable under the path-identity guard, and
malformed GitLab rule nodes were treated as absent.

**Rule.** Scope ambiguous flags to the executable that owns them, trust repository wrappers only by
exact adapter-declared tracked path, and distinguish absent provider configuration from a present
invalid shape.

## 2026-07-18 — Enforcement proof needs a reachable root and an in-scope target

**Context.** Automated review found that calls inside unused functions could fake validator
reachability, explicit scanner operands could leave the checkout, non-human qualifiers could turn
role phrases into false governance evidence, and test-listing modes could imitate execution.

**Rule.** Trace validation calls from top-level execution, constrain scanner targets and command
modes to the claimed outcome, and interpret actor qualifiers before treating authority phrases as
accountable human governance.

## 2026-07-18 — Traceability and execution identity require connected proof

**Context.** Automated review found that a path-qualified no-op could impersonate a package
manager, commands after an unconditional exit could appear reachable, and a specification heading
check could claim mechanical change-to-verification traceability.

**Rule.** Trust only recognized executable identities, preserve termination across command lines,
and require traceability validators to connect a work artifact to both implementation and
verification references before awarding enforced maturity.

## 2026-07-18 — Syntax semantics belong to the provider and runtime

**Context.** Automated review found that explicit GitHub shells and disjunctive event conditions,
Azure multiline failure behavior, multiline source strings, and direct package-manager install
commands could be interpreted using the wrong execution semantics.

**Rule.** Parse commands only through supported shell and provider guarantees, preserve lexical
state across lines, model boolean event expressions explicitly, and distinguish package-manager
built-ins from manifest task invocations before matching tools.

## 2026-07-18 — Enforced maturity requires execution, inputs, and accountable actors

**Context.** Automated re-review found Level 3 environment, specification, and learning controls
still passing from keywords; uncertain checkout transitions, early exits, missing package tasks,
wrapper option values, generic authority labels, plain-text former-owner sections, and overly strict
table or negation handling also distorted deterministic evidence.

**Rule.** Bind enforced outcomes to repository-root CI execution and source-backed behavior, carry
unknown state changes forward by failing closed, stop at statically terminating commands, and keep
typed ownership scopes and restrictive upper bounds recognizable while requiring explicit active
ownership and accountable authority.

## 2026-07-18 — Provider setup and source reachability are enforcement inputs

**Context.** Automated re-review found that inherited setup hooks or step working directories could
redirect otherwise recognized CI commands, invalid mixed provider root forms could still contribute
commands, and validation signatures inside a constant-false branch could imitate executable checks.

**Rule.** Bind evidence to effective provider setup, repository-root execution, and a single valid
execution hierarchy; fail closed on unresolved redirection and obviously unreachable validation
branches.

## 2026-07-18 — Positive fixtures must execute the behavior they prove

**Context.** Automated review found a positive conformance fixture with undeclared dependencies, an
ESM-incompatible path lookup, an incomplete canonical check chain, and a heading-only knowledge
check; unresolved GitLab includes could also override local enforcement.

**Rule.** Run positive fixture workflows with locked dependencies, require mechanical checks to
implement the claimed outcome, and fail closed whenever an unresolved provider include can change
execution or blocking semantics.

## 2026-07-18 — Execution state changes over time and across syntax layers

**Context.** Automated review found that later checkout steps could invalidate earlier repository
proof, working-directory changes and multiline shell syntax could redirect or imitate commands, and
case-folding could bind a package task that CI would not execute.

**Rule.** Track repository and directory state in execution order, fail closed on unsupported shell
structures, and preserve case-sensitive identities until the platform-specific lookup is complete.

## 2026-07-18 — Preserve target and arguments through every execution layer

**Context.** Automated review found that a checkout action could select another repository or ref,
package-task forwarding could hide prohibited scanner/test modes, and a positive fixture invoked
undeclared tasks; the normative containment outcome also omitted its required retry bound.

**Rule.** Validate repository identity and command arguments through checkout, package-manager, and
script layers; require positive fixtures to describe runnable paths; and keep outcome text exactly
aligned with every independently required evidence component.

## 2026-07-18 — Names do not establish executable or accountable identity

**Context.** Automated review found that npm built-ins could bind same-named manifest scripts,
repository-relative no-op files could impersonate known tools by basename, explicit scanner targets
could leave the assessed checkout, and nested headings could reactivate archived owners.

**Rule.** Parse package-manager invocation semantics before resolving scripts, accept tool identity
only from a trusted executable form, bind scanner targets to the assessed checkout, and preserve
heading depth while excluding inactive ownership sections.

## 2026-07-18 — Executed commands still need their assessed input

**Context.** Automated review found that a CI command could run before checkout, with provider
checkout disabled, against an unrelated scanner target, or only after another job failed; inert
source strings could also imitate validator behavior, and the published evidence schema missed a
runtime status invariant.

**Rule.** Bind structural evidence to both executable behavior and the assessed repository state;
track provider checkout and blocking dispositions in execution order, require scanner targets to
resolve to that checkout, and keep published evidence schemas identical to runtime validation.

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
