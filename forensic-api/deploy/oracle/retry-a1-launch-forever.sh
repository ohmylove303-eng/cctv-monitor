#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -a
# shellcheck disable=SC1091
source "$SCRIPT_DIR/.env.cli"
export MAX_ROUNDS=0
set +a

exec "$SCRIPT_DIR/retry-a1-launch.sh"
