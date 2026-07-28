# TwinIon Bingo

Themed multiplayer bingo where the squares are *events*, not numbers. See `PLAN.md` for the design.

```
apps/api    Hono API on its own Fly app (D2) — SSE stream lives here
apps/web    Next.js 16 / React 19 / Tailwind v4 (D12)
```

## Local development

```bash
pnpm install
pnpm dev            # web on :3000, API on :8080
```

Copy each app's `.env.example` to `.env` (API) / `.env.local` (web) to override defaults.

Gates, all run by CI on push:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Deploy

The API is its own Fly app; the web app is on Vercel. Both are deployed manually.

```bash
# API — first time only
fly launch --no-deploy --copy-config --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
fly secrets set WEB_ORIGIN=https://<web-host> --app twinion-bingo-api

# API — every time (build context is the repo root, per the Dockerfile)
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile

# Web
vercel deploy --prod    # root directory apps/web, NEXT_PUBLIC_API_URL=https://twinion-bingo-api.fly.dev
```

`fly.toml` carries the D2 settings that make a two-hour room of open SSE streams survivable:
connection-type concurrency, a 600 s idle timeout, and `auto_stop_machines = "stop"` with
`min_machines_running = 0` — mid-race stops are assumed and harmless, because state lives in
Postgres and `Last-Event-ID` replay covers the gap. Do not set `"off"`.
