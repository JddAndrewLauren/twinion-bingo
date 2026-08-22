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
API needs a `DATABASE_URL` to start — point it at a local container, never at the shared project.
Inside a Conductor workspace, `pnpm db:workspace` does that for you; see **Database** below.

**Never pass `PORT` yourself.** `pnpm dev` derives both ports from `CONDUCTOR_PORT` — web on
`CONDUCTOR_PORT`, API on `CONDUCTOR_PORT + 1` — and Conductor gives every workspace a distinct one.
A hand-picked `PORT` throws that away and lands on whatever a sibling workspace is already serving.

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

One gate is not in CI, because it needs a running server and real minutes:

```bash
pnpm sim            # a scripted race against a live room, ~70s, exit 0 or a table of diffs
pnpm sim --sweep    # ...plus 20 simultaneous SSE spectators
```

`pnpm dev` has to be up. It is the deployment check rather than regression coverage, and
`--base-url` re-points it at Fly — see [docs/verification-runbook.md](docs/verification-runbook.md),
which also carries the two checks a script cannot make (a real phone in airplane mode, and Fly's
cold-start gap).

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

# Then apply it locally and run the suites. Inside a Conductor workspace this is
# the whole setup: it brings up a local Postgres on 55432, creates this
# workspace's own database, writes both URLs into apps/api/.env, and migrates.
pnpm db:workspace
pnpm --filter @twinion-bingo/api test
```

`db:workspace` gives **each workspace its own database**, named after its directory
(`gwangju` → `bingo_gwangju`) — its own tables and its own migration journal. Several workspaces of
this repo sharing one database meant one `pnpm test` truncated its siblings' fixtures and one
migration was journalled as applied for every branch. Both happened; see
`docs/adr/0005-a-database-per-conductor-workspace.md`. The truncating suites now refuse any database
but this workspace's own, and say `pnpm db:workspace` when they do.

It reuses whatever is already listening on 55432, whatever the container is named (this machine's is
`bingo-pg-13`; substitute yours in the `docker exec` lines below). Only if nothing answers does it
start or create one named `bingo-pg`.

**Outside Conductor** — a plain clone, or CI — there is nothing to derive a name from, so
`db:workspace` refuses and you set the two variables explicitly. Note that they are deliberately
different variables: the schema tests truncate every bingo table, so they read `TEST_DATABASE_URL`
and never `DATABASE_URL`, and refuse any non-local host.

```bash
docker run -d --name bingo-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17-alpine
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres \
  pnpm --filter @twinion-bingo/api db:migrate
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

### Resetting a workspace's database

Drizzle's migrator compares against the last applied `created_at`, so checking out a branch with a
**shorter** migration chain is a silent no-op: the database keeps the newer objects and a journal row
for a migration the checkout no longer has. A workspace database is disposable, so throw it away
rather than repairing it:

```bash
docker exec bingo-pg-13 psql -U postgres -d postgres -c 'DROP DATABASE "bingo_<workspace>"'
pnpm db:workspace
```

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

# Web — first time only
vercel env add SITE_URL production    # https://bingo.twinion.net

# Production only, and server-only. Every Room URL — the share link, the canonical
# tag, `metadataBase`, the unfurl — is built from it, and setting it is the whole
# difference between a room whose link names its one real home and one that names
# whichever deployment hostname happened to serve the page. Leave it unset in
# Preview and Development: there the host the request arrived on is the right
# answer, which is what makes a preview's share link point at that preview. It has
# no NEXT_PUBLIC_ prefix on purpose, so it never reaches a client bundle.
#
# It must name the same origin as the API's WEB_ORIGIN above. A canonical Room URL
# is only useful if a browser sitting on it is allowed to call the API.

# Web — every time
vercel deploy --prod    # root directory apps/web, NEXT_PUBLIC_API_URL=https://twinion-bingo-api.fly.dev
```

`fly.toml` carries the D2 settings that make a two-hour room of open SSE streams survivable:
connection-type concurrency, a 600 s idle timeout, and `auto_stop_machines = "stop"` with
`min_machines_running = 0` — mid-race stops are assumed and harmless, because state lives in
Postgres and `Last-Event-ID` replay covers the gap. Do not set `"off"`.
