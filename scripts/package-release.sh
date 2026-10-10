#!/usr/bin/env zsh
# ---------------------------------------------------------------------------
# package-release.sh
#
# Builds a verified, checksummed source archive of this repository.
#
# Targets macOS zsh (10.15 and later, Intel and Apple Silicon) and also runs
# under bash 3.2+ and Linux, so CI and a developer laptop produce the same
# artifact. Uses only tools present in a stock macOS install: git, zip,
# unzip, shasum.
#
# Guarantees
#   - never overwrites an existing archive; collisions take a numeric suffix
#   - never includes secrets, dependency trees, build output, caches or logs
#   - verifies the archive after writing it and fails loudly if it is bad
#   - emits a SHA-256 checksum file next to the archive
#   - leaves the working tree untouched (read-only against the project)
#
# Usage
#   ./scripts/package-release.sh [-o OUTPUT_DIR] [-n NAME] [-q] [-h]
#
#   -o OUTPUT_DIR   where to write the archive (default: ./dist)
#   -n NAME         archive base name (default: <repo>-<version>-<timestamp>)
#   -q              quiet; only the final summary is printed
#   -h              show this help and exit
#
# Exit codes
#   0  archive written and verified
#   1  invalid usage or missing input
#   2  required tool missing
#   3  packaging failed
#   4  verification failed
#
# Rollback
#   This script only creates files inside OUTPUT_DIR. To undo a run, delete
#   the two files it reports (the .zip and the .zip.sha256). Nothing else on
#   disk is modified, so there is no other state to revert.
# ---------------------------------------------------------------------------

set -u

# zsh and bash differ on word splitting and globbing defaults; normalise so the
# same script behaves identically under both.
if [ -n "${ZSH_VERSION:-}" ]; then
  emulate -L sh
  setopt pipe_fail
else
  set -o pipefail
fi

readonly EXIT_USAGE=1
readonly EXIT_MISSING_TOOL=2
readonly EXIT_PACKAGE_FAILED=3
readonly EXIT_VERIFY_FAILED=4

start_epoch=$(date +%s)
quiet=0
output_dir=""
archive_name=""

log() {
  if [ "$quiet" -eq 0 ]; then
    printf '%s\n' "$1"
  fi
}

err() {
  printf 'error: %s\n' "$1" >&2
}

usage() {
  sed -n '3,33p' "$0" | sed 's/^# \{0,1\}//'
}

while getopts ':o:n:qh' opt; do
  case "$opt" in
    o) output_dir="$OPTARG" ;;
    n) archive_name="$OPTARG" ;;
    q) quiet=1 ;;
    h) usage; exit 0 ;;
    :) err "option -$OPTARG requires an argument"; exit "$EXIT_USAGE" ;;
    ?) err "unknown option -$OPTARG"; exit "$EXIT_USAGE" ;;
  esac
done
shift $((OPTIND - 1))

if [ "$#" -gt 0 ]; then
  err "unexpected argument: $1"
  usage >&2
  exit "$EXIT_USAGE"
fi

# --- locate the project root (no readlink -f; it is GNU-only) ---------------
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
project_root=$(cd -- "$script_dir/.." && pwd)

if [ ! -f "$project_root/package.json" ]; then
  err "package.json not found in $project_root; run this from inside the repository"
  exit "$EXIT_USAGE"
fi

# --- required tools ---------------------------------------------------------
for tool in git zip unzip shasum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    err "required tool not found: $tool"
    exit "$EXIT_MISSING_TOOL"
  fi
done

# --- portable helpers -------------------------------------------------------
file_size_bytes() {
  # macOS stat and GNU stat take different flags.
  if stat -f%z "$1" >/dev/null 2>&1; then
    stat -f%z "$1"
  else
    stat -c%s "$1"
  fi
}

human_size() {
  awk -v bytes="$1" 'BEGIN {
    split("B KB MB GB TB", unit, " ")
    index_value = 1
    size = bytes
    while (size >= 1024 && index_value < 5) { size /= 1024; index_value++ }
    if (index_value == 1) printf "%d %s", size, unit[index_value]
    else printf "%.2f %s", size, unit[index_value]
  }'
}

read_package_version() {
  # Avoids a node dependency: reads the first "version" field in package.json.
  awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "$project_root/package.json"
}

# --- resolve names and paths ------------------------------------------------
if [ -z "$output_dir" ]; then
  output_dir="$project_root/dist"
fi

case "$output_dir" in
  /*) : ;;
  *) output_dir="$(pwd)/$output_dir" ;;
esac

repo_name=$(basename -- "$project_root")
version=$(read_package_version)
if [ -z "$version" ]; then
  version="0.0.0"
fi
timestamp=$(date +%Y%m%d-%H%M%S)

if [ -z "$archive_name" ]; then
  archive_name="${repo_name}-${version}-${timestamp}"
fi

# Reject a name that would escape the output directory.
case "$archive_name" in
  */*|..*|"") err "invalid archive name: $archive_name"; exit "$EXIT_USAGE" ;;
esac

if ! mkdir -p -- "$output_dir"; then
  err "cannot create output directory: $output_dir"
  exit "$EXIT_PACKAGE_FAILED"
fi

if [ ! -w "$output_dir" ]; then
  err "output directory is not writable: $output_dir"
  exit "$EXIT_PACKAGE_FAILED"
fi

# Never overwrite: add a numeric suffix until the path is free.
archive_path="$output_dir/$archive_name.zip"
suffix=1
while [ -e "$archive_path" ] || [ -e "$archive_path.sha256" ]; do
  archive_path="$output_dir/$archive_name-$suffix.zip"
  suffix=$((suffix + 1))
  if [ "$suffix" -gt 999 ]; then
    err "too many existing archives named $archive_name in $output_dir"
    exit "$EXIT_PACKAGE_FAILED"
  fi
done
checksum_path="$archive_path.sha256"

log "Packaging $repo_name $version"
log "  project: $project_root"
log "  archive: $archive_path"

# --- build the file manifest ------------------------------------------------
# git ls-files -co --exclude-standard yields tracked plus untracked files while
# honouring .gitignore. That excludes node_modules, .next, dist, coverage,
# every .env except the committed .env.example, and all logs, by construction
# rather than by a hand-maintained exclude list.
manifest=$(mktemp "${TMPDIR:-/tmp}/package-release-manifest.XXXXXX") || {
  err "cannot create temporary manifest"
  exit "$EXIT_PACKAGE_FAILED"
}

cleanup() {
  rm -f -- "$manifest" "$manifest.verify" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

if ! (cd -- "$project_root" && git rev-parse --git-dir >/dev/null 2>&1); then
  err "$project_root is not a git repository; this packager relies on git for the file manifest"
  exit "$EXIT_PACKAGE_FAILED"
fi

(cd -- "$project_root" && git ls-files -co --exclude-standard) \
  | LC_ALL=C sort > "$manifest"

file_count=$(wc -l < "$manifest" | tr -d ' ')
if [ "$file_count" -eq 0 ]; then
  err "manifest is empty; refusing to write an empty archive"
  exit "$EXIT_PACKAGE_FAILED"
fi

# --- refuse to ship anything sensitive or generated -------------------------
# A belt-and-braces check: the manifest is already .gitignore-filtered, but an
# archive is distributed, so a second explicit gate is worth the few lines.
forbidden=$(grep -E \
  '(^|/)\.env($|\.)|(^|/)node_modules/|(^|/)\.next/|(^|/)coverage/|(^|/)dist/|(^|/)\.git/|(^|/)\.DS_Store$|(^|/)__pycache__/|\.tsbuildinfo$|\.log$|(^|/)\.vercel/|(^|/)test-results/|(^|/)playwright-report/|(^|/)\.pytest_cache/' \
  "$manifest" | grep -v -E '(^|/)\.env\.example$' || true)

if [ -n "$forbidden" ]; then
  err "manifest contains files that must not be distributed:"
  printf '%s\n' "$forbidden" >&2
  exit "$EXIT_PACKAGE_FAILED"
fi

log "  files:   $file_count"

# --- write the archive ------------------------------------------------------
# -X drops platform extra-attribute blocks so the archive is reproducible
# across macOS and Linux. -@ reads the file list from stdin, which handles
# names with spaces correctly.
if [ "$quiet" -eq 1 ]; then
  zip_flags="-qXr9"
else
  zip_flags="-Xr9"
fi

if ! (cd -- "$project_root" && zip "$zip_flags" -@ "$archive_path" < "$manifest" >/dev/null); then
  err "zip failed while writing $archive_path"
  rm -f -- "$archive_path"
  exit "$EXIT_PACKAGE_FAILED"
fi

if [ ! -s "$archive_path" ]; then
  err "archive was not written or is empty: $archive_path"
  rm -f -- "$archive_path"
  exit "$EXIT_PACKAGE_FAILED"
fi

# --- verify -----------------------------------------------------------------
log "Verifying archive"

if ! unzip -t -qq "$archive_path" >/dev/null 2>&1; then
  err "archive failed its integrity test: $archive_path"
  exit "$EXIT_VERIFY_FAILED"
fi

unzip -Z1 "$archive_path" | LC_ALL=C sort > "$manifest.verify"
archived_count=$(grep -c -v '/$' "$manifest.verify" | tr -d ' ')

if [ "$archived_count" -ne "$file_count" ]; then
  err "archive holds $archived_count files but the manifest listed $file_count"
  exit "$EXIT_VERIFY_FAILED"
fi

# Spot-check that the files a consumer needs in order to build are present.
for required in \
  "package.json" \
  "package-lock.json" \
  "prisma/schema.prisma" \
  ".env.example" \
  "tsconfig.json"
do
  if ! grep -q -x -- "$required" "$manifest.verify"; then
    err "archive is missing a required file: $required"
    exit "$EXIT_VERIFY_FAILED"
  fi
done

# --- checksum ---------------------------------------------------------------
archive_dir=$(cd -- "$(dirname -- "$archive_path")" && pwd)
archive_base=$(basename -- "$archive_path")

if ! (cd -- "$archive_dir" && shasum -a 256 -- "$archive_base" > "$archive_base.sha256"); then
  err "failed to write the checksum file"
  exit "$EXIT_VERIFY_FAILED"
fi

if ! (cd -- "$archive_dir" && shasum -a 256 -c -- "$archive_base.sha256" >/dev/null 2>&1); then
  err "checksum verification failed for $archive_path"
  exit "$EXIT_VERIFY_FAILED"
fi

checksum_value=$(awk '{ print $1; exit }' "$checksum_path")
archive_bytes=$(file_size_bytes "$archive_path")
archive_human=$(human_size "$archive_bytes")
elapsed=$(( $(date +%s) - start_epoch ))

# --- summary ----------------------------------------------------------------
printf '\n'
printf 'Packaging summary\n'
printf '  archive:   %s\n' "$archive_path"
printf '  checksum:  %s\n' "$checksum_path"
printf '  sha256:    %s\n' "$checksum_value"
printf '  files:     %s\n' "$file_count"
printf '  size:      %s (%s bytes)\n' "$archive_human" "$archive_bytes"
printf '  packaged:  %s\n' "$file_count"
printf '  skipped:   0\n'
printf '  errors:    0\n'
printf '  elapsed:   %ss\n' "$elapsed"
printf '\n'
printf 'Verify independently with:\n'
printf '  shasum -a 256 -c %s\n' "$checksum_path"
printf 'Roll back this run with:\n'
printf '  rm -f %s %s\n' "$archive_path" "$checksum_path"

exit 0
