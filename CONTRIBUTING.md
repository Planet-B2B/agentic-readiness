# Contributing

Thank you for helping make agentic development more measurable and safer across tools and vendors.

Before contributing, read `.ai/constitution.md`, `AGENTS.md`, and
`.agents/skills/benchmark-authoring/SKILL.md`. Open an issue before a large or normative change.
For assessment results, false positives, false negatives, and adoption experience, follow
[FEEDBACK.md](FEEDBACK.md).

## Development

```bash
npm ci
npm run check
```

Add or update transparent fixtures when collector or scoring behavior changes. A control must state
one observable outcome, one risk, concrete vendor-neutral remediation, and evidence appropriate to
its maturity level. Level 4 always needs outcome evidence over time.

Pull requests should explain the user problem, benchmark impact, test evidence, privacy/security
impact, compatibility impact, and whether an RFC or new benchmark version is required. Generated
reports and fixtures must contain no proprietary source, credentials, personal data, or customer data.

By contributing, you agree that your contribution is licensed under Apache-2.0 and to follow
`CODE_OF_CONDUCT.md`.
