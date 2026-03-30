#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${VENV_DIR:-$SCRIPT_DIR/.venv313}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "Python virtualenv not found at $VENV_DIR" >&2
  echo "Create it first: python3.13 -m venv .venv313 && ./.venv313/bin/pip install -r requirements.txt" >&2
  exit 1
fi

export PYTHONPATH="$SCRIPT_DIR"

exec "$VENV_DIR/bin/uvicorn" app.main:app --host "$HOST" --port "$PORT"
