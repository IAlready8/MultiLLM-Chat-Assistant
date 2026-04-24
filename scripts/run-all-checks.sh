#!/usr/bin/env bash
set -euo pipefail

echo '[validate:all] Running full quality gate'
npm run type-check
npm run lint
npm run test:run
npm run build

echo '[validate:all] All checks passed'
