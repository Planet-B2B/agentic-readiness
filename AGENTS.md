# Agentic Readiness — contributor guidance

Read [`.ai/constitution.md`](.ai/constitution.md) once per session. This repository defines a
vendor-neutral benchmark and its reference scanner. Keep portable controls separate from
Claude, Codex, GitHub, GitLab, or tracker-specific adapters. The constitution has precedence over
all other guidance and records the repository-wide architecture invariants.

## Orientation

| Task                               | Read first                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Change scoring or readiness floors | `benchmark/v0.2/benchmark.yaml`, `benchmark/v0.2/scoring-policy.md`                          |
| Add or edit a control              | `.agents/skills/benchmark-authoring/SKILL.md`, the matching `benchmark/v0.2/controls/*.yaml` |
| Change evidence collection         | `src/evidence.ts`, `src/schema.ts`                                                           |
| Change reports or CLI behavior     | `src/report.ts`, `src/cli.ts`                                                                |
| Add a vendor adapter               | `benchmark/v0.2/adapter-contract.md`; do not change portable control meaning                 |

## Non-negotiables

- A score is derived from evidence; file presence alone cannot prove enforcement or measurement.
- Readiness floors are non-compensating. Strong documentation never offsets weak security,
  verification, governance, or rollback.
- The scanner is local-first, read-only, and network-free by default. It never uploads source,
  prompts, secrets, or repository contents.
- Automated evidence and human attestation remain distinguishable in every report.
- Benchmark changes are versioned. Never change historical scoring semantics in place.
- Avoid vendor preference in portable controls. Vendor names belong only in adapters and examples.
- Do not add model calls to the reference scanner.

## Verification

Before pushing, run:

```bash
npm run check
node dist/cli.js assess tests/fixtures/mature --profile pr-creation --format markdown
```

Human approval is required before publishing a release, changing a readiness floor, or claiming
independent verification/certification.
