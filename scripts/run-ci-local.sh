#!/usr/bin/env bash
set -euo pipefail

echo '[ci:local] Matching CI quality checks'
bash scripts/run-all-checks.sh
echo '[ci:local] CI-equivalent checks passed'
