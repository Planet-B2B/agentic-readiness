# Feedback guide

Feedback from real assessments is essential to improving the Agentic Development Readiness
Benchmark without weakening its evidence standards or vendor neutrality.

## Choose the right channel

| Feedback                                                                                  | Channel                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| False positive, false negative, unclear result, usability problem, or adoption experience | [Assessment feedback issue](https://github.com/Planet-B2B/agentic-readiness/issues/new?template=assessment-feedback.yml) |
| Proposed control, scoring, evidence, or readiness-profile change                          | [Benchmark change issue](https://github.com/Planet-B2B/agentic-readiness/issues/new?template=benchmark-change.yml)       |
| Private adoption question or feedback that cannot be public                               | [benchmark@planetb2b.com](mailto:benchmark@planetb2b.com)                                                                |
| Suspected security vulnerability                                                          | Follow [SECURITY.md](SECURITY.md); do not open a public issue or email the benchmark contact                             |

Public issues are preferred when the information can be safely shared because they let other users
compare experiences and participate in the design review.

## What useful feedback includes

- benchmark and package version;
- requested readiness profile and assessment scope;
- relevant control IDs;
- the observed result and the expected result;
- whether the concern is scanner behavior, control wording, evidence semantics, scoring policy, or
  documentation;
- a minimal sanitized reproduction or description; and
- the material impact on adoption or decision-making.

Do not attach complete private reports. Never include credentials, proprietary source, private
URLs, personal data, customer data, or confidential dashboard content. A path name or summarized
evidence characteristic is usually enough to begin triage.

## Ask a coding agent to prepare feedback

Paste this prompt into an agent that can read your assessment report:

> Review my Agentic Development Readiness report and draft feedback for the
> `Planet-B2B/agentic-readiness` repository. Include the benchmark version, target profile,
> assessment scope, relevant control IDs, observed result, expected result, and a minimal sanitized
> explanation. Classify the feedback as a likely scanner defect, documentation problem, adoption
> experience, or proposed normative benchmark change. Do not include credentials, proprietary
> source, private URLs, personal data, customer data, or full report contents. Show me the complete
> draft and ask for my approval before opening a GitHub issue. If I approve and you have GitHub
> access, use the assessment feedback issue form; otherwise give me the final text to submit.

Agents must treat opening an issue as an external write and obtain accountable human approval first.
Security concerns must follow `SECURITY.md` rather than this workflow.

## Help others discover the benchmark

If this project helps your team, [star the repository](https://github.com/Planet-B2B/agentic-readiness).
Stars make the public benchmark easier for other engineering teams to discover; substantive feedback
and reproducible examples are even more valuable.
