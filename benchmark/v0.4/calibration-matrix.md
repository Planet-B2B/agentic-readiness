# v0.4 calibration matrix

This matrix records the versioned expected outcomes exercised by the v0.4 conformance fixtures.
PR #11 review is the independent acceptance gate for these expectations. The executable assertions
live in `tests/v04-calibration.test.ts`; this document is the public, human-readable index.

| Case                                                                                                                                 | Surface                                          | Expected outcome                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------- |
| Mature harness                                                                                                                       | Node, GitHub Actions                             | 30/40, repository 23/23, limited-autonomous-maintenance passes |
| Guidance and verification comments only                                                                                              | GitHub Actions plus Jenkins comments             | CTX-003 and TST-003 do not pass                                |
| Missing or display-only package tasks                                                                                                | Node package scripts                             | CTX-003 and TST-003 do not pass                                |
| Executed guidance validation, tests, and typecheck                                                                                   | Node, GitHub Actions                             | CTX-003 and TST-003 pass                                       |
| Python tests and static analysis                                                                                                     | `uv run pytest` and `uv run mypy`, GitLab CI     | TST-003 passes                                                 |
| Rust tests and static analysis                                                                                                       | `cargo test` and `cargo clippy`, Azure Pipelines | TST-003 passes                                                 |
| Tests and static analysis split across CI files                                                                                      | Separate GitHub workflows                        | TST-003 passes                                                 |
| Monorepo tests and static analysis                                                                                                   | Root package tasks bound to Turbo commands       | TST-003 passes                                                 |
| Invalid cross-tool command aliases                                                                                                   | GitHub Actions                                   | TST-003 command classes remain unmatched                       |
| Executed secret scanner                                                                                                              | GitHub Actions, GitLab CI, Azure Pipelines       | SEC-003 repository alternative passes                          |
| Scanner comments, display modes, disabled/non-blocking jobs, neutralized scanner exits, invalid actions, or non-integration triggers | Multiple providers                               | SEC-003 repository alternative does not pass                   |
| Unresolved GitLab inheritance, exclusions, or non-blocking defaults                                                                  | GitLab CI                                        | SEC-003 repository alternative does not pass                   |
| Nested CI fragments or Azure root command fields                                                                                     | Multiple providers                               | SEC-003 repository alternative does not pass                   |
| Host-native secret scanning claim                                                                                                    | Target-bound platform evidence                   | SEC-003 may pass; SEC-007 remains unresolved                   |
| Keyword-stuffed or distant guidance                                                                                                  | Repository documents and generated run output    | Mechanical Level 3 controls do not pass                        |
| Explicit ownership map plus human approval and merge authority                                                                       | Conventional ownership formats                   | GOV-002 passes                                                 |
| Placeholder/inactive owner, vague prose, negated authority, or missing authority                                                     | Conventional ownership formats                   | GOV-002 does not pass                                          |
| Complete co-located containment components                                                                                           | Agent guidance                                   | RES-002 passes                                                 |
| Partial, negated, or absent containment components                                                                                   | Agent guidance                                   | RES-002 does not pass and reports matched/missing groups       |

Jenkins is intentionally a negative calibration in v0.4: the offline collector does not claim that
a Jenkinsfile is integration-triggered without a supported structural provider parser. Such evidence
remains unresolved or may be supplied as eligible, source-backed agent evidence. Scores from v0.3
and v0.4 are not directly comparable.
