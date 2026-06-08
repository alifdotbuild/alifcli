# Hermes Example

Any agent that can run shell commands can update Alif.

```bash
ALIF_API_TOKEN=alif_live_... \
npx alif metric update weekly_active_users 1842 \
  --timestamp 2026-06-07T16:00:00Z \
  --idempotency-key acme-wau-2026-W23 \
  --source hermes
```
