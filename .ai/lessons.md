# Benchmark lessons

Append new entries newest-first after a scoring correction, false positive, missed risk, or pilot
feedback. Each entry contains a context and a rule.

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
