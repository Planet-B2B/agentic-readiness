# Example implementation specification

## Objective

Provide a dry-run-only Python command with deterministic output.

## Acceptance criteria

- The command exits successfully without network access.
- Unit tests verify the rendered output.
- CI runs lint, typing, and tests.

## Constraints

- Python 3.11.9 is required.
- External writes remain human-controlled.

## Non-goals

Deployment and connected execution are excluded.

## Verification

Run `./run_quality_checks.sh` and attach the result to the proposed change.
