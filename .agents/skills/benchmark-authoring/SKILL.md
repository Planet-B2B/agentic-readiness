---
name: benchmark-authoring
description: Author or review ADRB controls, evidence rules, maturity levels, and readiness floors. Use whenever changing benchmark YAML, scoring behavior, control remediation, or a vendor adapter.
---

# Benchmark authoring

For every control:

1. State one observable outcome.
2. Explain the risk if it is absent.
3. Assign exactly one maturity level from 1–4.
4. Prefer deterministic, read-only evidence. Use human attestation only when repository evidence
   cannot establish the fact.
5. Give concrete remediation without mandating a vendor.
6. Keep tool-specific paths and settings in `adapters` or examples.

Level meanings are fixed: 1 ad hoc, 2 documented, 3 enforced, 4 measured and improving. A control
at level 4 must require time-series or outcome evidence. Do not award it for a dashboard existing.

Security, testing, governance, and resilience floors for PR creation or autonomous maintenance may
only be relaxed through an RFC and a new benchmark version.
