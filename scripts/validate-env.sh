#!/usr/bin/env bash
set -euo pipefail

MODE="local"
ENV_FILE=".env.local"

print_usage() {
  cat <<USAGE
Usage: bash scripts/validate-env.sh [options]

Options:
  --mode <local|production>  Validation profile (default: local)
  --env-file <path>          Env file to inspect (default: .env.local)
USAGE
}

has_nonempty_env_value() {
  local key="$1"
  local line
  local value
  local trimmed

  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  value="${line#*=}"
  trimmed="${value#"${value%%[![:space:]]*}"}"
  trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
  trimmed="$(strip_matching_quotes "$trimmed")"

  if [[ "$trimmed" =~ ^[[:space:]]*$ ]]; then
    return 1
  fi

  return 0
}

strip_matching_quotes() {
  local value="$1"
  local first_char
  local last_char

  if [[ ${#value} -ge 2 ]]; then
    first_char="${value:0:1}"
    last_char="${value: -1}"
    if [[ ( "$first_char" == '"' && "$last_char" == '"' ) || ( "$first_char" == "'" && "$last_char" == "'" ) ]]; then
      printf '%s\n' "${value:1:${#value}-2}"
      return
    fi
  fi

  printf '%s\n' "$value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      if [[ $# -lt 2 ]]; then
        echo '[env:validate] Missing value for --mode' >&2
        print_usage >&2
        exit 1
      fi
      MODE="$2"
      shift 2
      ;;
    --env-file)
      if [[ $# -lt 2 ]]; then
        echo '[env:validate] Missing value for --env-file' >&2
        print_usage >&2
        exit 1
      fi
      ENV_FILE="$2"
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "[env:validate] Unknown option: $1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
done

case "$MODE" in
  local|production)
    ;;
  *)
    echo "[env:validate] Invalid --mode value: $MODE" >&2
    print_usage >&2
    exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[env:validate] Missing env file: $ENV_FILE" >&2
  exit 1
fi

required_local=(
  "NEXTAUTH_URL"
  "API_KEY_ENCRYPTION_SEED"
)

required_production=(
  "DATABASE_URL"
  "NEXTAUTH_URL"
  "API_KEY_ENCRYPTION_SEED"
)

if [[ "$MODE" == "production" ]]; then
  required=("${required_production[@]}")
else
  required=("${required_local[@]}")
fi

missing=0
for key in "${required[@]}"; do
  if ! has_nonempty_env_value "$key"; then
    echo "[env:validate] Missing or empty: $key"
    missing=1
  fi
done

if [[ "$MODE" == "production" ]]; then
  if ! has_nonempty_env_value 'NEXTAUTH_SECRET' && ! has_nonempty_env_value 'AUTH_SECRET'; then
    echo '[env:validate] Missing or empty: NEXTAUTH_SECRET or AUTH_SECRET'
    missing=1
  fi
fi

if [[ $missing -ne 0 ]]; then
  echo "[env:validate] FAILED ($MODE profile)"
  exit 1
fi

echo "[env:validate] OK ($MODE profile) using $ENV_FILE"
