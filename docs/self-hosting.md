# Self-Hosting On Cloudflare

Alif is built for Cloudflare:

- Workers for the API
- D1 for relational storage
- Queues for async metric evaluation
- Cron Triggers for scheduled backend work
- Email Sending for production OTP delivery

## Create Resources

```bash
npx wrangler d1 create alif-db
npx wrangler queues create alif-metric-events
```

Copy the D1 `database_id` into `wrangler.jsonc`.

## Email OTP Delivery

Enable Cloudflare Email Sending for a domain:

```bash
npx wrangler email sending enable yourdomain.com
npx wrangler email sending list
```

Add the binding and production vars to `wrangler.jsonc`:

```jsonc
{
  "send_email": [{ "name": "EMAIL" }],
  "vars": {
    "ALIF_ENV": "production",
    "REQUIRE_EMAIL_OTP": "true",
    "OTP_FROM_EMAIL": "login@yourdomain.com",
    "OTP_FROM_NAME": "Alif"
  }
}
```

Without an Email Sending binding, development OTP requests return the OTP in the API response. Do not run production with that fallback.

## Migrate And Deploy

```bash
npm run db:migrate:remote
npm run deploy
```

Optional private beta gate:

```bash
npx wrangler secret put SIGNUP_SECRET
```

Then pass it during application creation:

```bash
ALIF_SIGNUP_SECRET=... npx @alifdotbuild/cli apply --api-url https://your-worker.example.workers.dev
```
