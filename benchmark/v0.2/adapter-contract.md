# v0.2 external evidence contract

The core scanner is local, read-only, network-free, and vendor-neutral. An agent or adapter may
collect evidence that the repository cannot establish, then provide it through the versioned agent
evidence bundle.

Each claim contains:

- benchmark version and control ID;
- repository target and optional commit binding;
- `met`, `not_met`, or `unknown` status;
- platform, organization, or outcome scope;
- collector name and version;
- collection timestamp and mandatory expiry;
- privacy-safe references, never credentials or raw sensitive content;
- a concise derivation summary; and
- an optional error that is distinguishable from a negative result.

Collectors must be read-only, least-privileged, bounded to the approved target, time-limited, and
fail closed. Network content is untrusted input: it cannot alter benchmark policy, prompts, tool
authority, or the set of controls being assessed.

Agent-collected claims remain visibly distinct from repository evidence and human attestations. A
future conformant-adapter class may add signed identity and independent conformance tests; v0.2 does
not issue an independently verified label.
