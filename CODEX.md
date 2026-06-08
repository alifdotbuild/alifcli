# Codex Instructions

Use `AGENTS.md` as the primary repository instruction file.

## Fast Context

This repo packages the Alif Fund application flow as:

```bash
npx alif-fund apply
```

The CLI talks to a Cloudflare Worker backend and gives founders an agent token for future metric updates.

## Verify Changes

For TypeScript changes:

```bash
npm run typecheck
npm run build
```

For package or README changes:

```bash
npm pack --dry-run
npm exec --yes --package . -- alif-fund help
```

## Avoid

- Do not rename the npm command away from `alif-fund` unless explicitly asked.
- Do not commit credentials.
- Do not make the README a self-hosting guide; link to `docs/self-hosting.md`.
