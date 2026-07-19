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
provider discovery rules and recognized command definitions to `ci_command`. Ownership evidence
uses structural mappings outside former, inactive, past, or retired sections; descendant headings
remain inactive until a same-or-higher-level section resumes current ownership. A command class uses
full owner/repository action identities, explicit executable signatures with independently required
argument groups and prohibited non-blocking modes, or semantically specific standalone executables.
Signatures may cap accepted arguments when any explicit target would leave the assessed checkout.
Executables and arguments from different signatures never combine. GitHub action invocations also
require an explicit non-empty `@ref`. Names alone never turn comments, version/help commands,
display commands, disabled or non-integration steps, manual-only workflows, ineffective shell branches, or documentation prose
into enforced evidence. Push-only, post-close, or path-gated execution does not establish the
repository-wide before-integration outcome; the external platform alternative remains available
when enforcement lives outside pull-request CI. Unsupported provider conditions and any configured
non-literal blocking override fail closed. Executable GitHub step jobs require a runner; job-level reusable workflow references
are not step actions, and invalid steps that combine `uses` with `run` are rejected. Provider path
filters and GitLab rules with unparsed gating fields fail closed. GitLab jobs with unresolved
inheritance, `except` conditions, non-blocking defaults, disabled source checkout, or failure-only
job disposition also fail closed. Repository-bound commands qualify only after the provider has
made the assessed repository available: GitHub requires a preceding `actions/checkout` step,
GitLab must retain its clone/fetch checkout, and Azure must retain its default checkout or execute
`checkout: self` before the command. GitHub checkout inputs that select another repository, ref,
path, sparse subset, or object filter cannot establish this state, and a later non-target checkout
clears earlier target proof for the affected event. A checkout with an unsupported condition also
clears prior proof because its effect cannot be excluded. GitHub run working directories and explicit
directory-changing shell commands must remain at the assessed checkout root. Multi-statement shell forms qualify
only when the scanner is the final effective foreground statement and its exit status determines the
step result. Agent-guidance integrity requires a recognized validation command bound to a tracked
source file with adapter-declared executable patterns that bind guidance inspection to a blocking
failure path; comments, inert string literals, and non-empty no-op scripts are insufficient.
Constant-false branches and validation functions without a call path rooted in top-level execution
also fail closed; a call from another unreachable function is not evidence of execution.
Scanner modes that require a source target must bind that target to the assessed checkout rather
than an arbitrary path; explicit source overrides fail closed unless the adapter can prove that
binding. Repository-relative executables do not inherit a trusted tool identity from their basename.
Verification requires both a test command class
and a static-analysis command class, aggregated across fail-fast multiline steps and auto-loaded CI
entry points. Adapters may declare tool-specific listing/discovery arguments that cannot establish
execution. Scanner tools may require the final effective command to carry the step exit status
without imposing that restriction on ordinary fail-fast verification steps. Repository-specific command
surfaces that are not recognized may use eligible source-backed agent evidence instead of keyword
inference. Package-manager task invocations are resolved through the tracked root `package.json` and
must bind to a recognized executable command even through supported wrappers and global options;
context-changing package/workspace flags fail closed unless their selected manifest is resolved,
while recognized nested package-exec targets are evaluated at their executable position. Package
manager built-ins are not treated as same-named scripts, and path-qualified local executables never
inherit package-manager identity: npm resolves arbitrary task names only
through explicit `run` or `run-script`, while its documented lifecycle aliases remain eligible.
Wrapper and package-manager options with separate values are consumed before executable or task
identity is evaluated; option values never inherit tool identity.
Arguments forwarded to a package task fail closed unless their effect is structurally resolved.
Package task lookup preserves the manifest's case-sensitive script identity. Backslash/backtick
continuations and heredocs fail closed rather than treating their physical lines as commands. Source
validation excludes language comments before checking bounded structural groups, and referenced
repository validation scripts must exist as non-empty assessed files. A plausible task name,
missing path, collection-only test mode, or
configuration-display mode is insufficient.
Repository wrapper executables qualify only when an adapter declares the exact root path and that
non-empty path exists in the assessed tree; arbitrary path-qualified basenames remain untrusted.
Deterministic provider discovery is limited to auto-loaded entry points: direct GitHub workflow
YAML files, the root GitLab CI file, and conventional root Azure pipeline files. Include graphs and
custom pipeline paths require eligible source-backed evidence until they are structurally resolved.
Azure commands qualify only inside valid step collections, never from command-shaped root, stage, or
job fields.
Present GitLab `workflow` and job `rules` nodes must have supported object/array shapes; malformed
nodes fail closed instead of being treated as absent.

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
