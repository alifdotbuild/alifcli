# Alif CLI

Apply to Alif from your terminal, then let your coding agent keep your application updated with real traction.

Alif CLI is for founders using Codex, Claude Code, Hermes, Cursor agents, CI, cron, or custom scripts. You submit once, define the metric that matters, and your agent can keep that metric fresh.

## Quickstart

Target public command after npm publishing:

```bash
npx alif apply
```

Packaging note: the npm package name `alif` is currently owned by another publisher. Until that name is acquired or transferred, publish this package under a scoped name such as `@alif/cli` and run `npx @alif/cli apply`.

You can run directly from GitHub today:

```bash
npx github:imranye/alifcli apply
```

Apply:

```bash
npx alif apply
```

The CLI will:

- send an email login code
- collect your company/application details
- create your primary metric
- save a local agent token
- print the command your agent should run next

Update traction:

```bash
npx alif metric update weekly_revenue 12000
```

Check status:

```bash
npx alif status
```

Generate an agent command:

```bash
npx alif setup-agent weekly_revenue
```

## Agent Usage

Agents and CI should use `ALIF_API_TOKEN`:

```bash
ALIF_API_TOKEN=alif_live_... \
npx alif metric update weekly_revenue 12000 \
  --timestamp 2026-06-07T16:00:00Z \
  --idempotency-key acme-weekly-revenue-2026-W23 \
  --source codex
```

Use the same idempotency key when retrying the same reporting period. Duplicate retries are ignored.

Examples:

- [Codex](examples/codex.md)
- [Claude Code](examples/claude-code.md)
- [Hermes](examples/hermes.md)
- [GitHub Actions](examples/github-actions.yml)
- [Cron](examples/cron.sh)

## Commands

```bash
npx alif apply
npx alif login --email founder@example.com
npx alif status
npx alif whoami
npx alif setup-agent weekly_revenue
npx alif metric create weekly_active_users --unit users --cadence weekly
npx alif metric update weekly_revenue 12000
```

## Hosted API

By default, the CLI uses:

```text
https://alif-api.imuthuvappa.workers.dev
```

Override it when developing or self-hosting:

```bash
ALIF_API_URL=http://localhost:8787 npx alif apply
```

## Local Development

```bash
npm install
npm run build
npm run db:migrate:local
npm run dev
```

In another terminal:

```bash
node dist/cli.js apply --api-url http://localhost:8787
```

## Docs

- [Self-hosting on Cloudflare](docs/self-hosting.md)
- [Auth model](docs/auth.md)
- [Security notes](docs/security.md)

## Status

This is an early MVP. The core loop works:

```text
email login -> apply -> create metric -> agent updates traction -> detect growth spike
```
