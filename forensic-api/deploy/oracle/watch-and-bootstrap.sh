#!/usr/bin/env bash
set -euo pipefail

PROFILE="${OCI_CLI_PROFILE:-SESSION}"
AUTH="${OCI_CLI_AUTH:-security_token}"
CONFIG_FILE="${OCI_CLI_CONFIG_FILE:-${HOME}/.oci/config}"
COMPARTMENT_OCID="${OCI_COMPARTMENT_OCID:-}"
INSTANCE_NAME="${OCI_INSTANCE_NAME:-its-forensic-api}"
REGION="${OCI_REGION_OVERRIDE:-us-chicago-1}"
SSH_PRIVATE_KEY_PATH="${OCI_SSH_PRIVATE_KEY_PATH:-$HOME/.ssh/id_ed25519}"
SSH_USER="${OCI_SSH_USER:-ubuntu}"
POLL_SECONDS="${BOOTSTRAP_POLL_SECONDS:-60}"
STATE_FILE="${BOOTSTRAP_STATE_FILE:-/Users/jungsunghoon/cctv-monitor/forensic-api/deploy/oracle/bootstrap-state.json}"
WORKSPACE_ROOT="/Users/jungsunghoon/cctv-monitor"
APP_ROOT="$WORKSPACE_ROOT/forensic-api"

log_now() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

if [ -z "$COMPARTMENT_OCID" ]; then
  echo "Missing OCI_COMPARTMENT_OCID" >&2
  exit 1
fi

if [ ! -f "$SSH_PRIVATE_KEY_PATH" ]; then
  echo "SSH private key not found: $SSH_PRIVATE_KEY_PATH" >&2
  exit 1
fi

ssh_opts=(
  -i "$SSH_PRIVATE_KEY_PATH"
  -o StrictHostKeyChecking=accept-new
  -o UserKnownHostsFile="$HOME/.ssh/known_hosts"
  -o ConnectTimeout=10
)

instance_json() {
  oci compute instance list \
    --config-file "$CONFIG_FILE" \
    --profile "$PROFILE" \
    --auth "$AUTH" \
    --region "$REGION" \
    --compartment-id "$COMPARTMENT_OCID" \
    --all \
    --query "data[?\"display-name\"=='${INSTANCE_NAME}' && \"lifecycle-state\"=='RUNNING'] | [0]"
}

public_ip_for_instance() {
  local instance_id="$1"
  oci compute instance list-vnics \
    --config-file "$CONFIG_FILE" \
    --profile "$PROFILE" \
    --auth "$AUTH" \
    --region "$REGION" \
    --instance-id "$instance_id" \
    --query 'data[0]."public-ip"' \
    --raw-output
}

bootstrap_remote() {
  local public_ip="$1"

  tar --exclude '.venv*' --exclude '__pycache__' -czf - -C "$WORKSPACE_ROOT" forensic-api | \
    ssh "${ssh_opts[@]}" "${SSH_USER}@${public_ip}" '
      set -euo pipefail
      sudo mkdir -p /opt/its-forensic-api
      sudo chown -R ubuntu:ubuntu /opt/its-forensic-api
      rm -rf /opt/its-forensic-api/*
      tar xzf - -C /opt/its-forensic-api --strip-components=1
      sudo apt-get update
      sudo apt-get install -y python3 python3-venv python3-pip
      cd /opt/its-forensic-api
      python3 -m venv .venv
      ./.venv/bin/pip install --upgrade pip
      ./.venv/bin/pip install -r requirements.txt
      cat > /opt/its-forensic-api/.env <<EOF
FORENSIC_DEMO_MODE=true
YOLO_MODEL_PATH=yolov8n.pt
YOLO_CONFIDENCE=0.25
ANALYZE_FRAME_LIMIT=18
TRACK_CAMERA_LIMIT=24
TRACK_HIT_LIMIT=12
EOF
      sudo cp /opt/its-forensic-api/deploy/oracle/forensic-api.service /etc/systemd/system/forensic-api.service
      sudo systemctl daemon-reload
      sudo systemctl enable forensic-api
      sudo systemctl restart forensic-api
      sleep 5
      curl -fsS http://127.0.0.1:8000/healthz
    '
}

while :; do
  echo "[$(log_now)] poll"
  instance="$(instance_json || true)"
  if [ -n "$instance" ] && [ "$instance" != "null" ]; then
    instance_id="$(printf '%s' "$instance" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
    public_ip="$(public_ip_for_instance "$instance_id" || true)"
    if [ -n "$public_ip" ] && [ "$public_ip" != "null" ]; then
      echo "[$(log_now)] instance_ready id=$instance_id ip=$public_ip"
      if ssh "${ssh_opts[@]}" "${SSH_USER}@${public_ip}" 'echo ssh_ready' >/dev/null 2>&1; then
        echo "[$(log_now)] bootstrap_start"
        if bootstrap_remote "$public_ip"; then
          printf '{"instance_id":"%s","public_ip":"%s","bootstrapped_at":"%s"}\n' "$instance_id" "$public_ip" "$(log_now)" > "$STATE_FILE"
          echo "[$(log_now)] bootstrap_done"
          exit 0
        else
          echo "[$(log_now)] bootstrap_failed"
        fi
      else
        echo "[$(log_now)] ssh_not_ready ip=$public_ip"
      fi
    fi
  fi

  sleep "$POLL_SECONDS"
done
