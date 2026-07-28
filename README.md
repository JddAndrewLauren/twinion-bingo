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

## Database

The bingo tables live in their own `bingo` schema of the Supabase project shared with the
twinion project (D3). `apps/api/drizzle.config.ts` sets `schemaFilter: ['bingo']` and its own
`out` directory so drizzle-kit can never see twinion's `public` tables as absent and generate
drops for them — and the migration journal is kept in `bingo` too, not in the default
`drizzle` schema that twinion's own chain owns.

**Never run `drizzle-kit push` or `pull`, and never point a tool at the shared project from a
development machine.** Schema changes go through the migration chain, applied by a command:

```bash
# Edit apps/api/src/db/schema.ts, then emit SQL and read it before running it.
pnpm --filter @twinion-bingo/api db:generate

# An ephemeral local Postgres to verify against — throw it away afterwards.
docker run -d --name bingo-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17-alpine
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres \
  pnpm --filter @twinion-bingo/api db:migrate
# Note the different variable: the schema tests truncate every bingo table, so they
# read TEST_DATABASE_URL and never DATABASE_URL, and refuse any non-local host.
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres \
  pnpm --filter @twinion-bingo/api test
docker rm -f bingo-pg
```

CI's `db` job runs exactly that against a service container, twice, so re-applying stays a
no-op. `pnpm test` without a `TEST_DATABASE_URL` skips the schema tests and still runs the
safety gate that reads the emitted SQL. Applying a migration to the shared project is an
operator step, run with a credential that never reaches CI or an agent — and because that
credential goes in `DATABASE_URL`, which the truncating tests do not read, running the
operator sequence can never point them at the shared project.

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
