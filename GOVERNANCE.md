# Governance

The project is maintained in the open under a lightweight, evidence-first process.

## Roles

- Maintainers merge changes, cut releases, and enforce the constitution.
- Control owners steward one or more dimensions and review evidence semantics.
- Contributors propose issues, benchmark fixtures, mappings, tooling, and RFCs.

No single vendor should control a majority of active maintainers. A future foundation or neutral
governance home should be considered if adoption grows beyond the founding maintainers.

## Decisions

Implementation fixes use normal pull-request review. Normative changes to control outcomes, scoring,
readiness floors, evidence meanings, or claims require an RFC in `rfcs/`, public review, approval by
two maintainers without the same employer when available, and a new benchmark version.

Published benchmark directories are immutable. Security fixes may temporarily disable unsafe
functionality, but cannot silently reinterpret a released score.

## Conflicts and appeals

Reviewers disclose relevant commercial interests. Assessment disputes should identify the benchmark
version, control, evidence, expected result, and privacy-safe reproduction. Maintainers record the
decision and whether it is an erratum, implementation bug, or future-version proposal.
