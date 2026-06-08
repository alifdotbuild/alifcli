# Claude Code Instructions

Read `AGENTS.md` first. Follow it as the source of truth for this repository.

## Claude-Specific Guidance

- Prefer small, direct changes that keep `npx alif-fund apply` as the primary user experience.
- When editing docs, keep the main README founder-facing and move backend details into `docs/`.
- When touching auth, preserve the two-token model:
  - human session: `alif_session_...`
  - agent automation token: `alif_live_...`
- Do not invent a new backend framework; this project is intentionally Cloudflare Worker + D1 + Queues.
- Before finishing code changes, run:

```bash
npm run typecheck
npm run build
```

- Before finishing package/docs changes, run:

```bash
npm pack --dry-run
```
