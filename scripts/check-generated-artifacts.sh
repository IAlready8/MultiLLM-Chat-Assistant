#!/usr/bin/env bash
set -euo pipefail

failures=0

report_failure() {
  printf 'Generated artifact hygiene failure: %s\n' "$1" >&2
  failures=1
}

while IFS= read -r path; do
  case "$path" in
    .vercel/output|.vercel/output/*|\
    playwright-report|playwright-report/*|\
    test-results|test-results/*|\
    .pytest_cache|.pytest_cache/*|\
    .pip-audit-cache|.pip-audit-cache/*|\
    prisma/prisma/dev.db|\
    *.tsbuildinfo|\
    __pycache__/*|*/__pycache__/*)
      report_failure "$path is tracked"
      ;;
  esac
done < <(git ls-files)

for path in \
  ".vercel/output/config.json" \
  "playwright-report/index.html" \
  "test-results/results.json" \
  ".pytest_cache/v/cache/nodeids" \
  ".pip-audit-cache/http-v2/example" \
  "prisma/prisma/dev.db" \
  "tsconfig.tsbuildinfo" \
  "src/core/__pycache__/module.pyc"
do
  if ! git check-ignore --no-index -q -- "$path"; then
    report_failure "$path is not covered by .gitignore"
  fi
done

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

printf 'Generated artifact hygiene check passed.\n'
