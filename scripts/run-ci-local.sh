#!/usr/bin/env bash
set -euo pipefail

echo '[ci:local] Matching CI quality checks'
"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run-all-checks.sh"

echo '[ci:local] CI-equivalent checks passed'
