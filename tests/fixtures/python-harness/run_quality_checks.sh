#!/usr/bin/env bash
# Canonical verification check. Mirrors CI after `uv sync`.
set -euo pipefail
uv run flake8 src tests
uv run mypy src
uv run pytest
