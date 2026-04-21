#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo '[ci:local] Matching CI quality checks'
"${SCRIPT_DIR}/run-all-checks.sh"

echo '[ci:local] CI-equivalent checks passed'
