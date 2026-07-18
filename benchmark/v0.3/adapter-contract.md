# v0.3 adapter contracts

## Repository detector adapters

Portable controls define outcomes and generic repository conventions. Files in `adapters/*.yaml`
may extend one control evidence check with recognized harness-specific `patterns`, `files`, `terms`,
or `required_any_terms`. An extension names the control and zero-based evidence index and adds
exactly one of those fields. It cannot remove or weaken a threshold, change a control level, alter a
readiness floor, add an attestation path, or execute code.

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
tests; v0.3 does not issue an independently verified label.
