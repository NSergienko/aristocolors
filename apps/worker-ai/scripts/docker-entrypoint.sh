#!/usr/bin/env bash
set -euo pipefail

if [ "${WARMUP_ON_STARTUP:-true}" = "true" ]; then
  echo "[worker-ai] Starting model prewarm download..."
  python /app/scripts/warmup_weights.py --download

  echo "[worker-ai] Verifying warmed model weights..."
  python /app/scripts/warmup_weights.py --check-only --strict
fi

exec "$@"
