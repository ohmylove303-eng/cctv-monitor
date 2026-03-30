#!/usr/bin/env bash
set -euo pipefail

PROFILE="${OCI_CLI_PROFILE:-DEFAULT}"
AUTH="${OCI_CLI_AUTH:-security_token}"
CONFIG_FILE="${OCI_CLI_CONFIG_FILE:-${HOME}/.oci/config}"
TENANCY_OCID="${OCI_TENANCY_OCID:-}"
COMPARTMENT_OCID="${OCI_COMPARTMENT_OCID:-}"
NETWORK_COMPARTMENT_OCID="${OCI_NETWORK_COMPARTMENT_OCID:-${COMPARTMENT_OCID}}"

if ! command -v oci >/dev/null 2>&1; then
  echo "oci CLI is not installed" >&2
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo "~/.oci/config not found. Run: oci setup config" >&2
  exit 1
fi

if [ -z "$TENANCY_OCID" ] || [ -z "$COMPARTMENT_OCID" ]; then
  echo "Set OCI_TENANCY_OCID and OCI_COMPARTMENT_OCID first" >&2
  exit 1
fi

echo "[1/5] Auth check"
oci iam region-subscription list --config-file "$CONFIG_FILE" --profile "$PROFILE" --auth "$AUTH" --tenancy-id "$TENANCY_OCID" >/dev/null
echo "  ok: CLI auth works"

echo "[2/5] Availability domains"
oci iam availability-domain list --config-file "$CONFIG_FILE" --profile "$PROFILE" --auth "$AUTH" --compartment-id "$TENANCY_OCID" --all \
  --query 'data[].name' --raw-output

echo "[3/5] Compute shapes"
oci compute shape list --config-file "$CONFIG_FILE" --profile "$PROFILE" --auth "$AUTH" --compartment-id "$COMPARTMENT_OCID" --all \
  --query "data[?contains(shape, 'A1') || contains(shape, 'E2.1.Micro')].shape" --raw-output

echo "[4/5] VCN access"
oci network vcn list --config-file "$CONFIG_FILE" --profile "$PROFILE" --auth "$AUTH" --compartment-id "$NETWORK_COMPARTMENT_OCID" --all \
  --query 'data[]."display-name"' --raw-output

echo "[5/5] Subnet access"
oci network subnet list --config-file "$CONFIG_FILE" --profile "$PROFILE" --auth "$AUTH" --compartment-id "$NETWORK_COMPARTMENT_OCID" --all \
  --query 'data[]."display-name"' --raw-output

echo
echo "OCI access validation completed."
