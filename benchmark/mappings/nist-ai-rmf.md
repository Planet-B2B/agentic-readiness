# Informative mapping: NIST AI RMF

This non-normative mapping helps organizations reuse governance evidence. It does not imply NIST
endorsement or AI RMF conformity. Review against the current official publications before use:
[NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) and
[NIST AI 600-1, Generative AI Profile](https://doi.org/10.6028/NIST.AI.600-1).

| ADRB dimension | Closest AI RMF functions     | Relationship                                                                   |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| Context        | Map, Govern                  | Local context establishes intended use, constraints, ownership, and knowledge. |
| Environment    | Map, Measure                 | Reproducibility supports faithful evaluation and lifecycle control.            |
| Specification  | Map, Govern                  | Objectives, affected actors, requirements, and non-goals define the use case.  |
| Tooling        | Govern, Measure, Manage      | Tool authority and validation are risk controls around the AI system.          |
| Security       | Govern, Map, Measure, Manage | Data, access, misuse, third-party, and adversarial risks span all functions.   |
| Testing        | Measure, Manage              | Verification produces evidence and drives response to identified risk.         |
| Governance     | Govern, Manage               | Accountability, review, policy, and exception handling govern change.          |
| Learning       | Govern, Manage               | Corrections and incidents update organizational knowledge and controls.        |
| Observability  | Measure, Govern              | Outcome records support monitoring, transparency, and accountable decisions.   |
| Resilience     | Manage, Measure              | Containment, recovery, and exercises reduce and evaluate impact.               |

ADRB is repository- and harness-focused. It does not replace broader organizational, human-rights,
legal, societal, or model-risk work required by the AI RMF.
