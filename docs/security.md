# Security Notes

Implemented:

- write endpoints require authentication
- email OTP challenges are hashed before storage
- OTPs expire after 10 minutes
- human session tokens are separate from agent tokens
- API token secrets are hashed before storage
- metric writes are idempotent
- mutations are recorded in `audit_log`
- metric processing happens asynchronously through Cloudflare Queues
- CLI output does not print raw agent tokens unless `--show-token` is passed

Recommended before broad public launch:

- enable Cloudflare Email Sending and set `REQUIRE_EMAIL_OTP=true`
- add Cloudflare rate limits for OTP, applications, and metric writes
- add token creation/list/revocation commands
- scope automation tokens to specific metric keys
- add Turnstile or invite-gating for public application creation
- put reviewer dashboard behind Cloudflare Access
- add CI tests for auth, idempotency, and alert generation

## Secret Audit

Before pushing or publishing:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!.git/**' --glob '!.wrangler/**' \
  "(alif_live_|alif_session_|sk-[A-Za-z0-9]|sk-proj-|api[_-]?key|secret|password|BEGIN [A-Z ]*PRIVATE KEY)" .
```

Expected matches should be placeholders, code identifiers, or docs explaining token formats. Do not commit real token values.
