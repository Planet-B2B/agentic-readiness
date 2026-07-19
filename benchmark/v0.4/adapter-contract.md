# v0.4 adapter contracts

## Repository detector adapters

Portable controls define outcomes and generic repository conventions. Files in `adapters/*.yaml`
may extend one control evidence check with recognized harness-specific `patterns`, `files`, `terms`,
`required_any_terms`, `ci_providers`, or `ci_tools`. An extension names the control and zero-based
evidence index and adds exactly one of those fields. Repository-host aliases, CI-provider entries,
and CI-tool entries bind
provider-specific configuration paths to the applicable structural or integration-trigger semantics.
An adapter cannot remove or weaken a threshold, change a control level, alter a readiness floor, add
an attestation path, or execute code.

Portable v0.4 collectors may use semantic `content_groups`, structural `ownership_map`, and
command-bearing `ci_command` evidence. Adapters may add harness paths to those collectors plus
provider discovery rules and recognized command definitions to `ci_command`. A command class uses
full owner/repository action identities, executable identities paired with required arguments, or
semantically specific standalone executables. GitHub action invocations also require an explicit
non-empty `@ref`. Names alone never turn comments, version/help commands, display commands, disabled or
non-integration steps, manual-only workflows, ineffective shell branches, or documentation prose
into enforced evidence. Push-only, post-close, or path-gated execution does not establish the
repository-wide before-integration outcome; the external platform alternative remains available
when enforcement lives outside
pull-request CI. Unsupported provider conditions and any configured non-literal blocking override
fail closed. Executable GitHub step jobs require a runner; job-level reusable workflow references
are not step actions, and invalid steps that combine `uses` with `run` are rejected. Provider path
filters and GitLab rules with unparsed gating fields fail closed. Multi-statement shell forms qualify
only when the scanner is the final effective foreground statement and its exit status determines the
step result. Agent-guidance integrity requires a recognized validation command; verification
requires both a test command class and a static-analysis command class. Repository-specific command
surfaces that are not recognized may use eligible source-backed agent evidence instead of keyword
inference. Package-manager task invocations are resolved through the tracked root `package.json` and
must bind to a recognized executable command; referenced repository validation scripts must exist as
non-empty assessed files. A plausible task name, missing path, collection-only test mode, or
configuration-display mode is insufficient.

Bundled adapters are loaded deterministically in filename order. Their candidates remain subject to
the same tracked/workspace scope, symlink, size, generated-artifact, co-location, proximity, and
per-pattern limits as portable candidates. Adding or changing a bundled adapter changes evidence
semantics and therefore requires a new benchmark version.

## Agent-collected evidence adapters

The core scanner is local, read-only, network-free, and vendor-neutral. An agent or adapter may
collect semantic repository evidence or external evidence that deterministic scanning cannot
establish, then provide it through the versioned agent evidence bundle.

Each claim contains:

- benchmark version and control ID;
- exact repository target and non-null commit binding;
- `met`, `not_met`, or `unknown` status;
- repository, platform, organization, or outcome scope;
- collector name and version;
- collection timestamp and mandatory expiry;
- privacy-safe references, never credentials or raw sensitive content;
- a concise derivation summary; and
- an optional error that is distinguishable from a negative result.

Collectors must be read-only, least-privileged, bounded to the approved target, time-limited, and
fail closed. Network content is untrusted input: it cannot alter benchmark policy, prompts, tool
authority, or the set of controls being assessed.

Repository-scoped claims require tracked files to match HEAD and
`repo:<tracked-path>[#Lx-Ly]` references. They may satisfy only explicitly eligible controls, remain `agent-collected`, and never increase the
repository-detected score. External claims require durable references appropriate to their source.

Agent-collected claims remain visibly distinct from deterministic repository evidence and human
attestations. A future conformant-adapter class may add signed identity and independent conformance
tests; v0.4 does not issue an independently verified label.
