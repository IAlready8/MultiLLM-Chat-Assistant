#!/usr/bin/env bash
set -euo pipefail

failures=0

report_failure() {
  printf 'Secret hygiene failure: %s\n' "$1" >&2
  failures=1
}

if [[ -f ".env.local" ]]; then
  report_failure ".env.local exists"
fi

if compgen -G ".vercel/.env.*.local" > /dev/null; then
  for path in .vercel/.env.*.local; do
    [[ -e "$path" ]] || continue
    report_failure "$path exists"
  done
fi

while IFS= read -r path; do
  case "$path" in
    ./.env.example) ;;
    ./.env.local) ;;
    ./.env|./.env.*)
      report_failure "${path#./} exists"
      ;;
  esac
done < <(find . -maxdepth 1 -name '.env*' -print)

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

printf 'Secret hygiene check passed.\n'
