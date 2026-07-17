# Security policy

Do not report vulnerabilities in a public issue. Use GitHub's private vulnerability-reporting
feature on [Planet-B2B/agentic-readiness](https://github.com/Planet-B2B/agentic-readiness/security/advisories/new).
The maintainer named in `CODEOWNERS` owns initial triage.

Include the affected version, impact, minimal reproduction, and suggested mitigation. Do not include
working credentials, private source, personal data, or customer data. Maintainers should acknowledge
a report within three business days and coordinate disclosure after a fix is available.

The CLI is designed to run locally without network or model access. Its target repository and any
attestation file are untrusted input. Security review should pay particular attention to glob
expansion, symlinks, resource exhaustion, report injection, dependency integrity, and future
networked adapters.
