#!/usr/bin/env bash
set -euo pipefail

failures=0

report_failure() {
  printf 'Secret hygiene failure: %s\n' "$1" >&2
  failures=1
}

while IFS= read -r path; do
  case "$path" in
    .env.example) ;;
    .env|.env.*|.vercel/.env.*.local)
      report_failure "$path is tracked"
      ;;
  esac
done < <(git ls-files)

for path in \
  ".env" \
  ".env.local" \
  ".env.production" \
  ".vercel/.env.preview.local"
do
  if ! git check-ignore --no-index -q -- "$path"; then
    report_failure "$path is not covered by .gitignore"
  fi
done

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

printf 'Secret hygiene check passed.\n'
