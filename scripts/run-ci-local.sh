#!/usr/bin/env bash
set -euo pipefail

run_all_checks_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run-all-checks.sh"

if [[ ! -f "$run_all_checks_script" ]]; then
  echo "[ci:local] Script not found: $run_all_checks_script" >&2
  exit 1
fi

if [[ ! -x "$run_all_checks_script" ]]; then
  echo "[ci:local] Script is not executable: $run_all_checks_script" >&2
  exit 1
fi

echo '[ci:local] Matching CI quality checks'
"$run_all_checks_script"

echo '[ci:local] CI-equivalent checks passed'
