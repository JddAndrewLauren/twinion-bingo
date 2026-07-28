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
fly apps create twinion-bingo-api --org personal
fly secrets set WEB_ORIGIN=https://<web-host> --app twinion-bingo-api

# WEB_ORIGIN is a comma-separated list of browser origins allowed to call the API.
# Vercel preview URLs are matched automatically under the listed project's prefix,
# so previews need no extra entry. The API refuses to start in production without it.

# API — every time. Run from the repo root and pass it as the build context; the
# Dockerfile needs the workspace manifest and lockfile. Do NOT add --dockerfile:
# that path resolves relative to fly.toml's own directory.
fly deploy . --config apps/api/fly.toml

# Web
vercel deploy --prod    # root directory apps/web, NEXT_PUBLIC_API_URL=https://twinion-bingo-api.fly.dev
```

`fly.toml` carries the D2 settings that make a two-hour room of open SSE streams survivable:
connection-type concurrency, a 600 s idle timeout, and `auto_stop_machines = "stop"` with
`min_machines_running = 0` — mid-race stops are assumed and harmless, because state lives in
Postgres and `Last-Event-ID` replay covers the gap. Do not set `"off"`.
