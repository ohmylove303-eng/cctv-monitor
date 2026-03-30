#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPERVISOR_SCRIPT="$SCRIPT_DIR/oracle-supervisor.sh"
LOOP_SLEEP_SECONDS="${SUPERVISOR_LOOP_SLEEP_SECONDS:-5}"
LOOP_LOG_FILE="${SUPERVISOR_LOOP_LOG_FILE:-$SCRIPT_DIR/oracle-supervisor-loop.log}"
LOOP_PID_FILE="${SUPERVISOR_LOOP_PID_FILE:-$SCRIPT_DIR/oracle-supervisor-loop.pid}"

log_now() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

printf '%s' "$$" > "$LOOP_PID_FILE"
printf '[%s] loop_start pid=%s sleep=%ss\n' "$(log_now)" "$$" "$LOOP_SLEEP_SECONDS" | tee -a "$LOOP_LOG_FILE"

while :; do
  printf '[%s] launch_supervisor\n' "$(log_now)" | tee -a "$LOOP_LOG_FILE"
  "$SUPERVISOR_SCRIPT" >> "$LOOP_LOG_FILE" 2>&1 || true
  printf '[%s] supervisor_exit sleep=%ss\n' "$(log_now)" "$LOOP_SLEEP_SECONDS" | tee -a "$LOOP_LOG_FILE"
  sleep "$LOOP_SLEEP_SECONDS"
done
