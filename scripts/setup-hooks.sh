#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[setup-hooks] Not inside a git worktree. Skipping hook setup."
  exit 0
fi

if [[ -d ".githooks" ]]; then
  git config core.hooksPath .githooks
  echo "[setup-hooks] core.hooksPath set to .githooks"
fi

if [[ -d ".git/hooks" ]]; then
  find .git/hooks -maxdepth 1 -type f -exec chmod +x {} +
  echo "[setup-hooks] Ensured executable permissions on existing hooks."
fi

echo "[setup-hooks] Completed."
