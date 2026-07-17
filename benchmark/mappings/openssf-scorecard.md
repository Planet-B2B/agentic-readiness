# Informative mapping: OpenSSF Scorecard

[OpenSSF Scorecard](https://scorecard.dev/) assesses open-source software supply-chain practices.
ADRB assesses readiness to delegate engineering work to agents. The projects are complementary, not
substitutable.

Scorecard evidence around branch protection, code review, dangerous workflows, pinned dependencies,
token permissions, vulnerabilities, and security policy may support ADRB environment, tooling,
security, testing, governance, and resilience controls. ADRB additionally needs agent-specific
context, authority boundaries, specifications, run outcomes, learning loops, and stop/recovery design.

Future adapters should consume Scorecard's versioned machine output rather than recreate its checks,
while preserving source version, collection time, and confidence.
