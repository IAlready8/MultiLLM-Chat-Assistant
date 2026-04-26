#!/usr/bin/env bash
set -euo pipefail

echo '[ci:local] Matching CI quality checks'
npm run type-check
npm run lint
npm run test:run
npm run build

echo '[ci:local] CI-equivalent checks passed'
