# Copilot Instructions

This repository builds the `alif-fund` CLI and Cloudflare Worker backend.

Follow `AGENTS.md` for full project instructions.

Important defaults:

- Public command: `npx alif-fund apply`
- Hosted API: `https://alif-api.imuthuvappa.workers.dev`
- Backend stack: Cloudflare Workers, D1, Queues, Cron Triggers
- Do not commit secrets or generated tarballs.
- Verify TypeScript changes with `npm run typecheck`.
