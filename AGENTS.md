# Agent Instructions

This repository contains the Alif Fund CLI and Cloudflare Worker backend.

## Product Goal

Founders should be able to run:

```bash
npx alif-fund apply
```

Then their coding agent can keep traction updated with:

```bash
ALIF_API_TOKEN=alif_live_... npx alif-fund metric update weekly_revenue 12000
```

Keep the applicant path simple. Do not expose Cloudflare setup details in the main user flow unless the task is about self-hosting.

## Project Structure

- `src/cli.ts`: Node CLI entrypoint and command handling.
- `src/worker.ts`: Cloudflare Worker API.
- `migrations/`: D1 database schema migrations.
- `docs/`: deeper operator/security/auth docs.
- `examples/`: agent and automation examples.
- `wrangler.jsonc`: self-hosting Worker config template.

## Commands

```bash
npm install
npm run typecheck
npm run build
npm pack --dry-run
npm exec --yes --package . -- alif-fund help
```

For local backend testing:

```bash
npm run db:migrate:local
npm run dev
```

## Engineering Rules

- Keep the default CLI API pointed at the hosted Alif API unless the user asks for self-hosting.
- Use the ASCII package name and command `alif-fund`; do not use an en dash.
- Preserve separation between human sessions (`alif_session_...`) and agent tokens (`alif_live_...`).
- Never commit raw tokens, OTPs, API keys, or `.dev.vars`.
- Keep docs and examples consistent with the current npm command: `npx alif-fund ...`.
- Run `npm run typecheck` after TypeScript changes.
- Run `npm pack --dry-run` after package metadata or README changes.

## Publishing Notes

The npm package name is `alif-fund`. Publishing requires npm auth and, if enabled, an OTP:

```bash
npm publish --otp <code>
```

The public GitHub repo is:

```text
https://github.com/alifdotbuild/alifcli
```
