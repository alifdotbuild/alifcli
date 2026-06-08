#!/usr/bin/env bash
set -euo pipefail

export ALIF_API_TOKEN="${ALIF_API_TOKEN:?Set ALIF_API_TOKEN first}"

VALUE="12000"
PERIOD="$(date +%G-W%V)"

npx alif metric update weekly_revenue "$VALUE" \
  --idempotency-key "acme-weekly-revenue-$PERIOD" \
  --source cron
