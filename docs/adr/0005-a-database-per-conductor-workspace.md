# ADR-0005: A database per Conductor workspace

- **Status:** accepted
- **Date:** 2026-07-29
- **Amends:** `docs/adr/0001-bingo-schema-isolation.md` (mechanism 3 gains a third belt)
- **Implemented by:** issue #81

## Context

This repo is developed from several Conductor workspaces at once — separate git worktrees, separate
branches, one machine. All of them pointed at **one** local Postgres database: `postgres` on
`127.0.0.1:55432`. Three collisions happened in a single session:

- One workspace's `pnpm --filter @twinion-bingo/api test` **TRUNCATEd every `bingo` table** while two
  siblings had dev servers up on rooms they were mid-QA on.
- One workspace's migration **dropped `room_events_call_unique`** from the shared database, so a
  sibling's `schema.db.test.ts` failed on a defect that was not in its code.
- The shared `bingo.__drizzle_migrations` journal recorded one branch's migration as applied **for
  every branch**, and had to be repaired by hand.

The root cause was not carelessness. `.worktreeinclude` listed `apps/api/.env`, so every new
worktree **inherited a copy** of the existing `.env` — with its hardcoded shared `DATABASE_URL`
already in it. Conductor's setup guard, `[ -f apps/api/.env ] || cp apps/api/.env.example
apps/api/.env`, therefore never fired: the file it was there to create always already existed.
`TEST_DATABASE_URL`, meanwhile, was in no env file at all, so a session that wanted the DB-backed
suites pasted the README's shared-database literal by hand — and a session that did not paste it ran
five suites that **silently skipped**.

Only test fixtures were lost. The next occurrence could land mid-QA on a real room.

ADR-0001's three mechanisms are all about the **shared production project**, and they held: no
workspace ever reached Supabase. They say nothing about workspaces colliding with each other on a
throwaway local container, because when they were written there was one workspace.

## Decision

**Each workspace owns its own database** on the one local container — its own tables *and* its own
migration journal — provisioned automatically, and enforced by a guard that throws.

1. **One container, one database per workspace.** Not one container per workspace: containers are
   the expensive part, databases are free, and `CREATE DATABASE` from the maintenance connection is
   one statement. Port 55432 stays the single local Postgres.

2. **The name derives from the workspace *directory basename*.** `gwangju` → `bingo_gwangju`.
   Computed in exactly one place, `apps/api/src/db/workspace-database.ts`, imported by both the
   provisioner and the test guard — the two agreeing is the entire point, so they cannot each have
   their own copy of the rule.

   The basename is lowercased, `[^a-z0-9_]` folds to `_`, the result is prefixed `bingo_` and sliced
   to 63 bytes (`NAMEDATALEN - 1`, so Postgres never truncates it silently for us). Unquoted
   Postgres identifiers admit only `[a-z0-9_$]` and cannot lead with a digit; the fold settles the
   first and the prefix settles the second.

   The directory, not the branch and not the Conductor workspace name: the directory is what
   survives a rename and a branch switch, and a workspace that changed database mid-session would
   strand its own data. A workspace *outside* Conductor — CI, a plain clone — derives `undefined`,
   which every caller reads as "not applicable". That is what keeps CI inert.

   Two accepted consequences, documented rather than engineered around: `my-branch` and `my_branch`
   fold to the same database, and two directories that differ only past 57 characters do too. Both
   are already naming mistakes.

3. **The guard throws on a foreign database name.** `apps/api/test/support/test-database.ts` gains a
   third belt beside ADR-0001's local-host refusal: `TEST_DATABASE_URL` must name *this* workspace's
   database. A sibling's database, or the shared `postgres`, fails at module load with a message
   naming the expected database, the actual one, and `pnpm db:workspace`. It is inert when
   `CONDUCTOR_WORKSPACE_PATH` is unset, so CI is unaffected — and a test pins that shape.

   The two existing belts are untouched. Belt 2 (non-local refusal) is load-bearing for the shared
   Supabase credential and this does not replace it: `bingo_belmopan` on a remote host must keep
   failing for the *host*, not for the name.

4. **Conductor's `setup` script does the whole job.** `pnpm db:workspace` →
   `apps/api/src/db/provision-workspace.ts`: ensure a Postgres is up, `CREATE DATABASE`, write
   `apps/api/.env`, migrate. It is what makes the guard humane — the error it throws names a command
   that actually fixes the situation. Gated on `CONDUCTOR_IS_LOCAL != 0`, since cloud workspaces
   have no Docker.

Supporting rules that follow:

- **`.worktreeinclude` no longer lists `apps/api/.env`.** That line was the root cause. Conductor's
  resolution order is `.worktreeinclude` → `file_include_globs` → a default `.env*` pattern, so the
  file must keep listing `apps/web/.env.local` — emptying it would re-enable the default and copy
  every env file again.
- **The provisioner probes reachability *before* it touches Docker**, which makes it
  container-name-agnostic: whatever answers on 55432 is honoured, whether that is `bingo-pg`,
  `bingo-pg-13`, or a native Postgres. Only if nothing answers does it `docker start`/`docker run`
  a container named `bingo-pg`.
- **It upserts exactly two keys in `apps/api/.env`, line by line**, so `WEB_ORIGIN`, `PORT` and
  every comment survive. `TEST_DATABASE_URL` is forced. `DATABASE_URL` is rewritten only if what is
  there is already local — a non-local value earns a warning and is left alone, so an operator who
  deliberately aimed it at the shared project is told, not overruled.
- **It spawns `db:migrate` rather than importing it.** `migrate.ts` runs on import, resolves
  `drizzle/` against cwd, and `migration-safety.test.ts` asserts on its text; folding provisioning
  into it would blur "migrations are applied by one command" while still passing every test.
- **`apps/api/vitest.config.ts` lifts `TEST_DATABASE_URL` out of `apps/api/.env`, and only that
  key.** Vitest 4 does not read `.env`, and Vite's `loadEnv` only exposes `VITE_`-prefixed keys
  (`resolveEnvPrefix` throws on an empty prefix), so a provisioned value would sit in the file while
  the suites skipped. `DATABASE_URL` is deliberately *not* lifted — it carries the shared credential
  during an operator's migration run, and ADR-0001 belt 3 exists so it never enters a truncating
  process. A bare `process.loadEnvFile()` would undo that. An explicit CLI or CI value always wins,
  and no CI job has a `.env` to read.
- **`.dockerignore` gained `**/.env` patterns.** Its root-anchored `.env` / `.env.*` covered `/.env`
  only. Every workspace now has an `apps/api/.env`, and `COPY apps/api apps/api` would carry a
  connection string into the build stage. It never reached the runtime image, but the build stage is
  enough.

### The ports rule, while we are here

The same session also collided on ports, and that one was operator error, so it gets written down
rather than engineered:

**Never pass `PORT` explicitly. Run `pnpm dev` and let it derive from `CONDUCTOR_PORT`** — web on
`CONDUCTOR_PORT`, API on `CONDUCTOR_PORT + 1`. Conductor hands every workspace a distinct
`CONDUCTOR_PORT`; a hand-picked `PORT` throws that away and lands on a sibling.

## Consequences

- The three failures that motivated this are now unreachable *by construction* rather than by
  discipline: a workspace physically cannot see a sibling's tables, and each has its own journal.
- **`fileParallelism: false` stays.** Per-workspace databases fix collisions *between* workspaces;
  five suites still truncate one database *within* a workspace, which is the 40P01 deadlock
  ADR-0001 recorded.
- A workspace's database is disposable, and that matters because of a trap Drizzle's migrator has:
  it compares against the last applied `created_at`, so switching a workspace to a branch with a
  **shorter** chain is a **silent no-op** — the database keeps the newer indexes and a journal row
  for a migration the checkout no longer has. Documented in the README as a reset, not automated:

  ```
  docker exec <container> psql -U postgres -d postgres -c 'DROP DATABASE "bingo_<workspace>"'
  pnpm db:workspace
  ```

- Databases accumulate as workspaces come and go. Cheap, and visible in
  `psql -Atc 'select datname from pg_database'`; dropping a dead one is one statement.
- A non-Conductor clone is unchanged and must still set both variables by hand. The README documents
  that flow, and CI already did it.
- `run_mode = "nonconcurrent"` is kept but is not part of this: it serialises Conductor-*launched*
  scripts only, and every collision here came from a session running `pnpm test` directly.

## Alternatives considered

- **A container per workspace, on `CONDUCTOR_PORT`-derived ports.** Real isolation, and rejected:
  four Postgres containers for four databases, a second port allocation to get wrong, and nothing
  gained over separate databases in one server.
- **A schema per workspace inside the shared database.** Would have collided with ADR-0001's whole
  mechanism — `schemaFilter: ['bingo']` and `migrationsSchema: 'bingo'` name that schema literally,
  so per-workspace schemas mean per-workspace config, and drizzle-kit would generate drops for the
  siblings it was not told about. Worse than the problem.
- **Deriving the name from the git branch.** Tempting, since Conductor names workspaces after
  branches, and rejected: a branch switch would silently move a workspace to a different database,
  and long or slash-bearing branch names sanitise into collisions far more often than directory
  names do.
- **A `TRUNCATE`-free test suite (transaction rollback per test).** The real fix to the *truncate*
  half, and out of scope: it does not touch the migration-journal half at all, and rewriting five
  suites is a much larger change than one `CREATE DATABASE`.
- **Documenting the rule and trusting sessions to paste the right URL.** That was the status quo.
  It produced three collisions in one session, and the shared journal had to be repaired by hand.
