#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ORACLE_ENV_FILE:-$SCRIPT_DIR/.env.cli}"
SUPERVISOR_INTERVAL_SECONDS="${SUPERVISOR_INTERVAL_SECONDS:-30}"
BOOTSTRAP_STATE_FILE="${BOOTSTRAP_STATE_FILE:-$SCRIPT_DIR/bootstrap-state.json}"
SUPERVISOR_LOG_FILE="${SUPERVISOR_LOG_FILE:-$SCRIPT_DIR/oracle-supervisor.log}"
SUPERVISOR_PID_FILE="${SUPERVISOR_PID_FILE:-$SCRIPT_DIR/oracle-supervisor.pid}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

log_now() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

log_line() {
  printf '[%s] %s\n' "$(log_now)" "$*" | tee -a "$SUPERVISOR_LOG_FILE"
}

pidfile_for() {
  printf '%s/%s.pid\n' "$SCRIPT_DIR" "$1"
}

logfile_for() {
  printf '%s/%s.log\n' "$SCRIPT_DIR" "$1"
}

script_for() {
  printf '%s/%s.sh\n' "$SCRIPT_DIR" "$1"
}

is_running() {
  local pid_file="$1"
  local expected="$2"
  local pid
  if [ ! -f "$pid_file" ]; then
    return 1
  fi

  pid="$(tr -d '[:space:]' < "$pid_file")"
  if [ -z "$pid" ]; then
    return 1
  fi

  if ! ps -p "$pid" >/dev/null 2>&1; then
    return 1
  fi

  ps -p "$pid" -o command= | grep -F "$expected" >/dev/null 2>&1
}

should_restart() {
  local name="$1"
  if [ "$name" = "retry-a1-launch" ] || [ "$name" = "watch-and-bootstrap" ]; then
    if [ -f "$BOOTSTRAP_STATE_FILE" ]; then
      return 1
    fi
  fi
  return 0
}

session_is_valid() {
  local profile auth config_file
  profile="${OCI_CLI_PROFILE:-SESSION}"
  auth="${OCI_CLI_AUTH:-security_token}"
  config_file="${OCI_CLI_CONFIG_FILE:-$HOME/.oci/config}"

  if [ "$auth" != "security_token" ]; then
    return 0
  fi

  oci session validate --config-file "$config_file" --profile "$profile" >/dev/null 2>&1
}

start_worker() {
  local name="$1"
  local script_path log_path pid_path pid
  script_path="$(script_for "$name")"
  log_path="$(logfile_for "$name")"
  pid_path="$(pidfile_for "$name")"

  if [ ! -x "$script_path" ]; then
    log_line "missing_executable name=$name path=$script_path"
    return 1
  fi

  nohup "$script_path" >> "$log_path" 2>&1 &
  pid="$!"
  printf '%s' "$pid" > "$pid_path"
  log_line "started name=$name pid=$pid"
}

printf '%s' "$$" > "$SUPERVISOR_PID_FILE"
log_line "supervisor_start pid=$$ interval=${SUPERVISOR_INTERVAL_SECONDS}s"

while :; do
  for worker in retry-a1-launch refresh-session-loop watch-and-bootstrap; do
    if ! should_restart "$worker"; then
      continue
    fi

    if [ "$worker" != "refresh-session-loop" ] && ! session_is_valid; then
      log_line "session_invalid_skip name=$worker"
      continue
    fi

    if ! is_running "$(pidfile_for "$worker")" "$(script_for "$worker")"; then
      log_line "restart_needed name=$worker"
      start_worker "$worker"
    fi
  done

  sleep "$SUPERVISOR_INTERVAL_SECONDS"
done
