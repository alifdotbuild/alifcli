# Codex Example

Give Codex access to the repo or data source that contains your metric, then provide:

```bash
export ALIF_API_TOKEN=alif_live_...
```

Prompt:

```text
Calculate last week's weekly_revenue from the source of truth. Then run:

ALIF_API_TOKEN=$ALIF_API_TOKEN \
npx alif metric update weekly_revenue <value> \
  --timestamp <period_end_iso> \
  --idempotency-key <company>-weekly-revenue-<iso-week> \
  --source codex

Use the same idempotency key if you retry the same reporting period.
```
