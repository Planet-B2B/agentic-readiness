# Informative mapping: OWASP agentic security work

This mapping is non-normative and does not imply OWASP endorsement. Agentic threat catalogs evolve;
review the current [OWASP GenAI Security Project](https://genai.owasp.org/) material before use.

| ADRB area     | Threat themes addressed                                              | Important residual work                                                         |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Context       | Instruction provenance, conflicting guidance, poisoned knowledge     | Content trust and provenance need system-specific analysis.                     |
| Tooling       | Excessive agency, unsafe tool use, confused-deputy behavior          | Every tool and downstream system needs threat modeling and authorization tests. |
| Security      | Prompt injection, data leakage, credential abuse, supply chain       | ADRB presence checks are not penetration tests or secure-design review.         |
| Governance    | Unapproved actions, unclear accountability, policy bypass            | Organization-specific approval and legal obligations remain.                    |
| Observability | Repudiation, hidden behavior, undetected misuse                      | Logs require integrity, access, retention, privacy, and alerting design.        |
| Resilience    | Cascading failures, loops, resource exhaustion, irreversible actions | Runtime circuit breakers and recovery must be tested in the real harness.       |

Use ADRB to identify whether controls are present and improving, then use threat modeling to evaluate
whether those controls address the actual agents, tools, identities, data, and impact paths.
