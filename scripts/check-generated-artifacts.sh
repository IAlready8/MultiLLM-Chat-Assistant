#!/usr/bin/env bash
set -euo pipefail

failures=0

report_failure() {
  printf 'Generated artifact hygiene failure: %s\n' "$1" >&2
  failures=1
}

for path in \
  ".vercel/output" \
  "playwright-report" \
  "test-results" \
  ".pytest_cache"
do
  if [[ -e "$path" ]]; then
    report_failure "$path exists"
  fi
done

while IFS= read -r path; do
  report_failure "${path#./} exists"
done < <(
  find . \
    -path './.git' -prune -o \
    -path './node_modules' -prune -o \
    -name '*.tsbuildinfo' -print
)

while IFS= read -r path; do
  report_failure "${path#./} exists"
done < <(
  find . \
    -path './.git' -prune -o \
    -path './node_modules' -prune -o \
    -name '*.db' -print
)

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

printf 'Generated artifact hygiene check passed.\n'
