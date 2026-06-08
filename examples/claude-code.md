# Claude Code Example

Set the token in your shell or project environment:

```bash
export ALIF_API_TOKEN=alif_live_...
```

Prompt:

```text
Read our analytics/revenue source and submit weekly_revenue to Alif.
Use:

npx alif metric update weekly_revenue <value> \
  --timestamp <period_end_iso> \
  --idempotency-key <company>-weekly-revenue-<iso-week> \
  --source claude-code
```
