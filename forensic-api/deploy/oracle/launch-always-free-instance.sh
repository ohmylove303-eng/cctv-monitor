#!/usr/bin/env bash
set -euo pipefail

PROFILE="${OCI_CLI_PROFILE:-DEFAULT}"
AUTH="${OCI_CLI_AUTH:-security_token}"
CONFIG_FILE="${OCI_CLI_CONFIG_FILE:-${HOME}/.oci/config}"
COMPARTMENT_OCID="${OCI_COMPARTMENT_OCID:-}"
SUBNET_OCID="${OCI_SUBNET_OCID:-}"
IMAGE_OCID="${OCI_IMAGE_OCID:-}"
AVAILABILITY_DOMAIN="${OCI_AVAILABILITY_DOMAIN:-}"
SSH_PUBLIC_KEY_PATH="${OCI_SSH_PUBLIC_KEY_PATH:-$HOME/.ssh/id_ed25519.pub}"
INSTANCE_NAME="${OCI_INSTANCE_NAME:-its-forensic-api}"
SHAPE="${OCI_SHAPE:-VM.Standard.A1.Flex}"
OCPUS="${OCI_OCPUS:-1}"
MEMORY_GB="${OCI_MEMORY_GB:-6}"

for required in COMPARTMENT_OCID SUBNET_OCID IMAGE_OCID AVAILABILITY_DOMAIN; do
  if [ -z "${!required}" ]; then
    echo "Missing required env: ${required}" >&2
    exit 1
  fi
done

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

oci compute instance launch \
  --config-file "$CONFIG_FILE" \
  --profile "$PROFILE" \
  --auth "$AUTH" \
  --compartment-id "$COMPARTMENT_OCID" \
  --availability-domain "$AVAILABILITY_DOMAIN" \
  --display-name "$INSTANCE_NAME" \
  --shape "$SHAPE" \
  --shape-config "{\"ocpus\":${OCPUS},\"memoryInGBs\":${MEMORY_GB}}" \
  --subnet-id "$SUBNET_OCID" \
  --image-id "$IMAGE_OCID" \
  --metadata "file://$METADATA_JSON" \
  --assign-public-ip true \
  --query 'data.{id:id,name:"display-name",state:"lifecycle-state"}'
