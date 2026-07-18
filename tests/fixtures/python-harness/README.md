# Python harness fixture

## Quick start

Install uv, then create the exact project environment and run the offline smoke command:

```bash
uv sync
uv run python -m example --dry-run
./run_quality_checks.sh
```

The quality script is the canonical verification command and runs flake8, mypy, and pytest.
