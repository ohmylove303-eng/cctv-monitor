#!/usr/bin/env bash
set -euo pipefail

PROFILE="${OCI_CLI_PROFILE:-DEFAULT}"
AUTH="${OCI_CLI_AUTH:-security_token}"
CONFIG_FILE="${OCI_CLI_CONFIG_FILE:-${HOME}/.oci/config}"
COMPARTMENT_OCID="${OCI_COMPARTMENT_OCID:-}"
SUBNET_OCID="${OCI_SUBNET_OCID:-}"
IMAGE_OCID="${OCI_IMAGE_OCID:-}"
SSH_PUBLIC_KEY_PATH="${OCI_SSH_PUBLIC_KEY_PATH:-$HOME/.ssh/id_ed25519.pub}"
INSTANCE_NAME="${OCI_INSTANCE_NAME:-its-forensic-api}"
SHAPE="${OCI_SHAPE:-VM.Standard.A1.Flex}"
OCPUS="${OCI_OCPUS:-1}"
MEMORY_GB="${OCI_MEMORY_GB:-1}"
MAX_ROUNDS="${MAX_ROUNDS:-5}"
ATTEMPT_TIMEOUT_SECONDS="${ATTEMPT_TIMEOUT_SECONDS:-120}"
REGION="${OCI_REGION_OVERRIDE:-us-chicago-1}"
ROUND_SLEEP_SECONDS="${ROUND_SLEEP_SECONDS:-60}"

log_now() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

existing_instance_json() {
  oci compute instance list \
    --config-file "$CONFIG_FILE" \
    --profile "$PROFILE" \
    --auth "$AUTH" \
    --region "$REGION" \
    --compartment-id "$COMPARTMENT_OCID" \
    --all \
    --query "data[?\"display-name\"=='${INSTANCE_NAME}' && \"lifecycle-state\"!='TERMINATED'] | [0]"
}

check_existing_instance() {
  local existing
  existing="$(existing_instance_json)"
  if [ "$existing" != "null" ] && [ -n "$existing" ]; then
    echo "{\"status\":\"exists\",\"timestamp\":\"$(log_now)\",\"instance\":$existing}"
    return 0
  fi
  return 1
}

if [ -z "$COMPARTMENT_OCID" ] || [ -z "$SUBNET_OCID" ] || [ -z "$IMAGE_OCID" ]; then
  echo "Missing required OCI env values" >&2
  exit 1
fi

if [ ! -f "$SSH_PUBLIC_KEY_PATH" ]; then
  echo "SSH public key not found: $SSH_PUBLIC_KEY_PATH" >&2
  exit 1
fi

METADATA_JSON="$(mktemp)"
cat > "$METADATA_JSON" <<EOF
{
  "ssh_authorized_keys": $(python3 - <<PY
import json, pathlib
print(json.dumps(pathlib.Path("$SSH_PUBLIC_KEY_PATH").read_text().strip()))
PY
)
}
EOF
trap 'rm -f "$METADATA_JSON"' EXIT

attempt_launch() {
  local availability_domain="$1"

  python3 - \
    "$availability_domain" \
    "$ATTEMPT_TIMEOUT_SECONDS" \
    "$METADATA_JSON" \
    "$CONFIG_FILE" \
    "$PROFILE" \
    "$AUTH" \
    "$REGION" \
    "$COMPARTMENT_OCID" \
    "$INSTANCE_NAME" \
    "$SHAPE" \
    "$OCPUS" \
    "$MEMORY_GB" \
    "$SUBNET_OCID" \
    "$IMAGE_OCID" <<'PY'
import json
import subprocess
import sys

availability_domain = sys.argv[1]
timeout_seconds = int(sys.argv[2])
metadata_path = sys.argv[3]
config_file = sys.argv[4]
profile = sys.argv[5]
auth = sys.argv[6]
region = sys.argv[7]
compartment_ocid = sys.argv[8]
instance_name = sys.argv[9]
shape = sys.argv[10]
ocpus = int(sys.argv[11])
memory_gb = int(sys.argv[12])
subnet_ocid = sys.argv[13]
image_ocid = sys.argv[14]

cmd = [
    "oci",
    "compute",
    "instance",
    "launch",
    "--config-file", config_file,
    "--profile", profile,
    "--auth", auth,
    "--region", region,
    "--compartment-id", compartment_ocid,
    "--availability-domain", availability_domain,
    "--display-name", instance_name,
    "--shape", shape,
    "--shape-config", json.dumps({"ocpus": ocpus, "memoryInGBs": memory_gb}),
    "--subnet-id", subnet_ocid,
    "--image-id", image_ocid,
    "--metadata", f"file://{metadata_path}",
    "--assign-public-ip", "true",
    "--query", 'data.{id:id,name:"display-name",state:"lifecycle-state"}',
]

try:
    completed = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
except subprocess.TimeoutExpired:
    print(json.dumps({
        "status": "timeout",
        "availability_domain": availability_domain,
        "timeout_seconds": timeout_seconds,
    }))
    raise SystemExit(124)

if completed.returncode == 0:
    print(json.dumps({
        "status": "success",
        "availability_domain": availability_domain,
        "response": json.loads(completed.stdout),
    }))
    raise SystemExit(0)

print(json.dumps({
    "status": "error",
    "availability_domain": availability_domain,
    "stderr": completed.stderr.strip(),
}))
raise SystemExit(completed.returncode)
PY
}

if check_existing_instance; then
  exit 0
fi

round=1
while :; do
  if [ "$MAX_ROUNDS" -gt 0 ] && [ "$round" -gt "$MAX_ROUNDS" ]; then
    break
  fi

  if [ "$MAX_ROUNDS" -gt 0 ]; then
    echo "[$(log_now)] ROUND $round/$MAX_ROUNDS"
  else
    echo "[$(log_now)] ROUND $round/INF"
  fi

  for ad in "TktZ:US-CHICAGO-1-AD-1" "TktZ:US-CHICAGO-1-AD-2" "TktZ:US-CHICAGO-1-AD-3"; do
    if check_existing_instance; then
      exit 0
    fi

    echo "[$(log_now)] ATTEMPT ad=$ad ocpus=$OCPUS mem=${MEMORY_GB}GB"
    output="$(attempt_launch "$ad" || true)"
    echo "$output"
    if echo "$output" | grep -q '"status": "success"'; then
      exit 0
    fi
    if echo "$output" | grep -q 'NotAuthenticated'; then
      echo "{\"status\":\"auth_expired\",\"timestamp\":\"$(log_now)\",\"message\":\"re-authentication required\"}"
      break
    fi
  done

  round=$((round + 1))
  echo "[$(log_now)] SLEEP ${ROUND_SLEEP_SECONDS}s"
  sleep "$ROUND_SLEEP_SECONDS"
done

echo '{"status":"failed","message":"all retry rounds exhausted"}'
exit 1
