# TwinIon Bingo

Themed multiplayer bingo where the squares are *events*, not numbers. See `PLAN.md` for the design.

```
apps/api          Hono API on its own Fly app (D2) — SSE stream lives here
apps/web          Next.js 16 / React 19 / Tailwind v4 (D12)
packages/theme    pool:build — expands a theme folder into its square pool (D9)
themes/           one folder per theme, generated pool committed (D10)
```

## What works today

A host creates a room and gets a four-character code and a share link; anyone opening the link
joins by name and appears on the roster. The room's state is an append-only log
(`bingo.room_events`), streamed to every device over SSE at `GET /rooms/:code/stream` and
resumable with `Last-Event-ID`, so a phone that slept through twenty minutes reconnects and gets
exactly the rows it missed. Theme folders expand into committed square pools via `pool:build`.

The host starts a game at `POST /rooms/:code/games`: the server draws the room's ~40-square deck
from the theme pool, deals every player a 24-square card from that one deck, and appends
`GAME_STARTED` — so every connected phone renders its own card off the stream it was already
holding. The draw is seeded and the seed stored, so a deal can be reproduced from the row. Cards
hold `square_ids` and nothing else: marks are derived from the call log, never stored.

**The F1 theme supplies that deck.** D6's quotas are hard constraints, and the committed F1 pool —
300 squares at `poolVersion: v2`, 230 generated from 11 teams and 22 drivers plus 70 hand-crafted —
meets every one of them, so starting a game deals real cards. A pool that could not would be
refused rather than degraded: the composer answers 503 naming the quotas it cannot reach.
`docs/adr/0002-deck-composition-hard-quotas.md` has the arithmetic and why it fails loudly.

Not built yet: calling squares and the win ladder — see the open issues off the master plan (#1).

## Local development

```bash
pnpm install
pnpm dev            # web on :3000, API on :8080
```

Copy each app's `.env.example` to `.env` (API) / `.env.local` (web) to override defaults. The
API needs a `DATABASE_URL` to start — point it at the ephemeral container under **Database**
below, never at the shared project.

Square pools are generated at build time and committed, so regenerate and commit the diff after
editing any theme folder — see `themes/README.md`:

```bash
pnpm pool:build     # rewrites themes/*/pool.generated.json
```

The API reads those committed pools off disk at boot to draw decks from — from `themes/` at the
repo root by default, resolved relative to the running module rather than to `cwd`, and overridable
with `THEMES_ROOT`. The image gets its own copy at `/repo/themes`.

Gates, all run by CI on push. **`pnpm build` comes first**, not last: `apps/api` imports
`@twinion-bingo/theme`, whose `exports` resolve to its emitted `dist/`, so typechecking, linting
and testing the API all need the theme package built. On a fresh clone a bare `pnpm test` fails to
resolve the import until it has been.

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

CI runs two more jobs the commands above do not cover: `image` builds `apps/api/Dockerfile` from
the repo root (the deploy path, which is the only place it has ever broken), and `db` applies the
migration chain twice against an ephemeral service container and then runs the truncating suites
with `TEST_DATABASE_URL` set — see **Database** below.

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
fly secrets set \
  WEB_ORIGIN=https://<web-host> \
  DATABASE_URL=<shared-project-connection-string> \
  --app twinion-bingo-api

# Both are required, and both must be secrets — fly.toml's [env] is committed, so it
# can hold NODE_ENV and PORT but never a credential. The API reads them at boot and
# throws before it listens, so a missing or empty one is not a degraded API: the
# deploy fails its health check and Fly rolls back to the previous release.
#
# WEB_ORIGIN is a comma-separated list of browser origins allowed to call the API.
# Vercel preview URLs are matched automatically under the listed project's prefix,
# so previews need no extra entry. In production there is no localhost default.
#
# DATABASE_URL is the connection string for the shared project's database, where the
# bingo tables live in their own `bingo` schema. There is no in-memory mode, so the
# API refuses to start without it in every environment. Setting it here only lets the
# API read and write rooms; applying a migration stays the separate operator step
# under **Database** above, and neither drizzle-kit push/pull nor the truncating tests
# may ever be pointed at this value.

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
