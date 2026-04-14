#!/usr/bin/env zsh
# =============================================================================
# scripts/backup-db.sh
#
# Production Postgres backup script for MultiLLM Chat Assistant.
#
# Creates a pg_dump --format=custom backup of the production database, named
# with a timestamp so backups never overwrite each other. Compresses the output
# with gzip for storage efficiency.
#
# USAGE
# -----
#   bash scripts/backup-db.sh [--output-dir /path/to/backups] [--dry-run]
#
# OPTIONS
#   --output-dir DIR   Directory to write backups to.
#                      Default: $HOME/backups/multillm
#   --dry-run          Print what would happen without running pg_dump.
#   --help             Print this help text.
#
# REQUIREMENTS
# ------------
#   - DATABASE_URL must be set in the environment.
#     Example: postgresql://user:pass@host:5432/dbname
#   - pg_dump must be installed and on PATH.
#     macOS: brew install libpq && brew link --force libpq
#     Or install the Postgres.app bundle from https://postgresapp.com
#   - gzip must be available (ships with macOS).
#
# SECRETS
# -------
#   This script reads DATABASE_URL from the environment only.
#   It never prompts for or hardcodes credentials.
#   Recommended: source your env file before running, or use macOS Keychain.
#   Example (with Keychain): export DATABASE_URL=$(security find-generic-password -a multillm -s DATABASE_URL -w)
#
# OUTPUT
# ------
#   Backup file: <output-dir>/multillm_<YYYYMMDD_HHMMSS>.dump.gz
#   The .dump format is a pg_dump custom archive - restore with pg_restore.
#
# RESTORE INSTRUCTIONS
# --------------------
#   # Decompress:
#   gunzip multillm_20260411_143000.dump.gz
#
#   # Restore to an existing database (will overwrite data):
#   pg_restore --no-owner --role=<your_db_user> \
#     -d postgresql://user:pass@host:5432/dbname \
#     multillm_20260411_143000.dump
#
#   # Restore to a fresh database:
#   createdb -h host -U user newdbname
#   pg_restore --no-owner -d postgresql://user:pass@host:5432/newdbname \
#     multillm_20260411_143000.dump
#
# SMOKE TEST
# ----------
#   Run with --dry-run to verify env and tool availability before production use.
#   bash scripts/backup-db.sh --dry-run
#
# ROLLBACK
# --------
#   This script creates backups, it does not delete or modify the database.
#   No rollback is required. If a backup file is corrupt, run again.
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
readonly SCRIPT_NAME="$(basename "$0")"
readonly TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
readonly DEFAULT_OUTPUT_DIR="${HOME}/backups/multillm"

OUTPUT_DIR="${DEFAULT_OUTPUT_DIR}"
DRY_RUN=false

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      sed -n '/^# USAGE/,/^# ====/p' "$0" | head -n -1 | sed 's/^# *//'
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      echo "Run $SCRIPT_NAME --help for usage." >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log_info()  { echo "[INFO]  $(date '+%H:%M:%S') $*"; }
log_ok()    { echo "[OK]    $(date '+%H:%M:%S') $*"; }
log_error() { echo "[ERROR] $(date '+%H:%M:%S') $*" >&2; }
log_dry()   { echo "[DRY]   $(date '+%H:%M:%S') $*"; }

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
START_EPOCH=$(date +%s)

log_info "Starting database backup - $SCRIPT_NAME"
log_info "Timestamp: $TIMESTAMP"
log_info "Output dir: $OUTPUT_DIR"
[[ "$DRY_RUN" == "true" ]] && log_dry "Dry run mode - no changes will be made."

# Require DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
  log_error "DATABASE_URL is not set."
  log_error "Export it before running: export DATABASE_URL=postgresql://user:pass@host:5432/dbname"
  log_error "Or load it from Keychain: export DATABASE_URL=\$(security find-generic-password -a multillm -s DATABASE_URL -w)"
  exit 1
fi

# Validate DATABASE_URL starts with postgresql:// or postgres://
if [[ "${DATABASE_URL}" != postgresql://* && "${DATABASE_URL}" != postgres://* ]]; then
  log_error "DATABASE_URL does not look like a Postgres connection string."
  log_error "Expected: postgresql://user:pass@host:5432/dbname"
  exit 1
fi

# Require pg_dump
if ! command -v pg_dump &>/dev/null; then
  log_error "pg_dump is not installed or not on PATH."
  log_error "macOS: brew install libpq && brew link --force libpq"
  log_error "Or install from: https://postgresapp.com"
  exit 1
fi

# Require gzip
if ! command -v gzip &>/dev/null; then
  log_error "gzip is not available. It ships with macOS - check your PATH."
  exit 1
fi

# ---------------------------------------------------------------------------
# Derive connection details for display (never print password)
# ---------------------------------------------------------------------------
# Strip the password from the URL for logging by replacing :pass@ with :***@
DISPLAY_URL=$(echo "$DATABASE_URL" | sed -E 's|(:)[^:@]+(@)|\1***\2|')
log_info "Target: $DISPLAY_URL"

PG_VERSION=$(pg_dump --version 2>&1 | head -1)
log_info "pg_dump: $PG_VERSION"

# ---------------------------------------------------------------------------
# Prepare output directory
# ---------------------------------------------------------------------------
BACKUP_FILE="${OUTPUT_DIR}/multillm_${TIMESTAMP}.dump"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"

if [[ "$DRY_RUN" == "true" ]]; then
  log_dry "Would create directory: $OUTPUT_DIR"
  log_dry "Would write backup to:  $BACKUP_FILE_GZ"
  log_dry "pg_dump command: pg_dump --format=custom --no-password \"$DISPLAY_URL\" | gzip > \"$BACKUP_FILE_GZ\""
  log_ok "Dry run complete. No files written."
  exit 0
fi

# Create output directory if it doesn't exist (idempotent)
mkdir -p "$OUTPUT_DIR"
log_ok "Output directory ready: $OUTPUT_DIR"

# ---------------------------------------------------------------------------
# Run backup
# ---------------------------------------------------------------------------
log_info "Running pg_dump..."

# Use PGPASSWORD if DATABASE_URL contains a password component, otherwise
# pg_dump reads from the URL directly. We set PGPASSWORD="" to avoid
# interactive prompts if no password is embedded.
# pg_dump with a connection string URL handles auth natively.
if pg_dump \
    --format=custom \
    --compress=0 \
    --no-password \
    "$DATABASE_URL" \
  | gzip -9 > "$BACKUP_FILE_GZ"; then
  log_ok "pg_dump completed successfully."
else
  EXIT_CODE=$?
  log_error "pg_dump failed with exit code $EXIT_CODE."
  # Remove partial file if it exists
  [[ -f "$BACKUP_FILE_GZ" ]] && rm -f "$BACKUP_FILE_GZ" && log_info "Partial file removed."
  exit $EXIT_CODE
fi

# ---------------------------------------------------------------------------
# Verify and summarize
# ---------------------------------------------------------------------------
if [[ ! -f "$BACKUP_FILE_GZ" ]]; then
  log_error "Backup file was not created: $BACKUP_FILE_GZ"
  exit 1
fi

FILESIZE=$(du -sh "$BACKUP_FILE_GZ" | cut -f1)
END_EPOCH=$(date +%s)
ELAPSED=$((END_EPOCH - START_EPOCH))

log_ok "======================================================"
log_ok "Backup complete."
log_ok "  File:    $BACKUP_FILE_GZ"
log_ok "  Size:    $FILESIZE"
log_ok "  Elapsed: ${ELAPSED}s"
log_ok ""
log_ok "Restore command:"
log_ok "  gunzip $BACKUP_FILE_GZ"
log_ok "  pg_restore --no-owner -d \"\$DATABASE_URL\" ${BACKUP_FILE}"
log_ok "======================================================"
