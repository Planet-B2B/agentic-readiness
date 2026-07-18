# Benchmark lessons

Append new entries newest-first after a scoring correction, false positive, missed risk, or pilot
feedback. Each entry contains a context and a rule.

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
