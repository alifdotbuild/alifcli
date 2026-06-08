# Hermes Instructions

Use `AGENTS.md` as the shared agent guide for this repository.

## Mission

Keep the CLI easy for founders and agents:

```bash
npx alif-fund apply
npx alif-fund metric update weekly_revenue 12000
```

## Working Rules

- Keep examples in `examples/` aligned with the `alif-fund` package name.
- Keep Cloudflare setup details in `docs/self-hosting.md`.
- Preserve idempotent metric updates.
- Preserve email OTP and token hashing behavior.

## Checks

```bash
npm run typecheck
npm pack --dry-run
```
