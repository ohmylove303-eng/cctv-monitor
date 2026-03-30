#!/usr/bin/env bash
set -euo pipefail

PROFILE="${OCI_CLI_PROFILE:-SESSION}"
CONFIG_FILE="${OCI_CLI_CONFIG_FILE:-${HOME}/.oci/config}"
REFRESH_INTERVAL_SECONDS="${REFRESH_INTERVAL_SECONDS:-1200}"

log_now() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

while :; do
  echo "[$(log_now)] validate"
  if oci session validate --config-file "$CONFIG_FILE" --profile "$PROFILE" >/dev/null 2>&1; then
    echo "[$(log_now)] session_valid"
  else
    echo "[$(log_now)] session_invalid"
  fi

  echo "[$(log_now)] refresh"
  if oci session refresh --config-file "$CONFIG_FILE" --profile "$PROFILE" >/dev/null 2>&1; then
    echo "[$(log_now)] refresh_ok"
  else
    echo "[$(log_now)] refresh_failed"
  fi

  sleep "$REFRESH_INTERVAL_SECONDS"
done
