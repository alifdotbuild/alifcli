# Alif CLI

Apply to Alif from your terminal, then let your coding agent keep your application updated with real traction.

Alif CLI is for founders using Codex, Claude Code, Hermes, Cursor agents, CI, cron, or custom scripts. You submit once, define the metric that matters, and your agent can keep that metric fresh.

## Quickstart

Target command after npm publishing:

```bash
npx @alifdotbuild/cli apply
```

Packaging note: the npm package name `alif` is currently owned by another publisher. If that name is acquired or transferred later, this can become `npx alif apply`.

You can run directly from GitHub today:

```bash
npx github:alifdotbuild/alifcli apply
```

Apply:

```bash
npx @alifdotbuild/cli apply
```

The CLI will:

- send an email login code
- collect your company/application details
- create your primary metric
- save a local agent token
- print the command your agent should run next

Update traction:

```bash
npx @alifdotbuild/cli metric update weekly_revenue 12000
```

Check status:

```bash
npx @alifdotbuild/cli status
```

Generate an agent command:

```bash
npx @alifdotbuild/cli setup-agent weekly_revenue
```

## Agent Usage

Agents and CI should use `ALIF_API_TOKEN`:

```bash
ALIF_API_TOKEN=alif_live_... \
npx @alifdotbuild/cli metric update weekly_revenue 12000 \
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
npx @alifdotbuild/cli apply
npx @alifdotbuild/cli login --email founder@example.com
npx @alifdotbuild/cli status
npx @alifdotbuild/cli whoami
npx @alifdotbuild/cli setup-agent weekly_revenue
npx @alifdotbuild/cli metric create weekly_active_users --unit users --cadence weekly
npx @alifdotbuild/cli metric update weekly_revenue 12000
```

## Hosted API

By default, the CLI uses:

```text
https://alif-api.imuthuvappa.workers.dev
```

Override it when developing or self-hosting:

```bash
ALIF_API_URL=http://localhost:8787 npx @alifdotbuild/cli apply
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
npm exec -- alif apply --api-url http://localhost:8787
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
