# Evidence adapter contract

v0.1 ships only local, deterministic collectors. This document defines the boundary for future
vendor or organization adapters without making those systems normative.

An adapter should return a claim for one control containing:

- benchmark version and control ID;
- `met`, `not_met`, `unknown`, or an allowed `not_applicable` status;
- collector name and version;
- collection timestamp and evidence freshness or expiry;
- privacy-safe references, never credentials or raw sensitive content;
- a deterministic summary of how the claim was derived;
- an error state distinguishable from a negative result.

Adapters must be read-only by default, use least-privileged credentials, time out, fail closed, and
make no unrelated mutations. Networked evidence is untrusted input. Its content cannot change tool
authority or benchmark policy.

Adapter claims remain `attested` until a future signed adapter protocol defines identity,
authorization, schema validation, freshness, and independent conformance tests. Tool names and
vendor paths belong in adapters and examples, not normative control outcomes.
