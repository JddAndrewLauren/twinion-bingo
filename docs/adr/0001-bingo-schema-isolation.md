# ADR-0001: Isolate the bingo tables in their own schema of a shared database

- **Status:** accepted
- **Date:** 2026-07-28
- **Context in the plan:** decision D3 on issue #1; implemented by issue #3
- **Amended by:** `docs/adr/0005-a-database-per-conductor-workspace.md` — mechanism 3 now has three
  belts, and "a separate database", rejected below for the shared production project, is adopted for
  local development

## Context

TwinIon Bingo does not get its own database. It shares the Supabase Postgres project that the
neighbouring `twinion` project already owns, whose tables live in `public` and whose own Drizzle
migration chain manages them.

Drizzle-kit manages **every** schema in a database unless told otherwise. Pointed at this shared
database from the bingo repo, it compares what it finds against `apps/api/src/db/schema.ts`, sees
twinion's `public` tables as objects that ought not to exist, and generates statements to remove
them. `push` and `pull` would do it immediately; `generate` writes it into a migration file that
looks routine until it is applied.

The failure mode is dropping another live project's production tables, so the question is not
"how do we keep the two tidy" but "what makes the destructive outcome unreachable".

## Decision

The bingo tables live in a dedicated `bingo` schema, and **three** separate mechanisms keep the
boundary — because each one covers a different tool path, and no one of them covers all three.

1. **`schemaFilter: ['bingo']`** in `apps/api/drizzle.config.ts`, plus its own `out: './drizzle'`
   migration directory. This is what stops drizzle-kit from diffing, and therefore from ever
   generating drops against, anything outside `bingo`.

2. **`migrationsSchema: 'bingo'`** on the `migrate()` call in `apps/api/src/db/migrate.ts`. This
   is the half that is easy to miss, and it is not the same setting as the first: `schemaFilter`
   governs what gets *diffed*, while the migrator's `__drizzle_migrations` journal defaults to a
   bare `drizzle` schema — a shared object that twinion's chain would also claim. Two projects
   journalling into one table is worse than no isolation, because each then reads applied-migration
   hashes it does not recognise. Note that `migrationsSchema` is an option on the programmatic
   `migrate()` call, **not** a `drizzle.config.ts` key, which is why the two settings live in two
   different files.

3. **A separate environment variable for the truncating tests, and three belts on it.** The
   DB-backed suites run
   `TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`, so
   `apps/api/test/support/test-database.ts` checks, in order:

   1. **A different variable.** They read **`TEST_DATABASE_URL`** and never `DATABASE_URL`.
      `DATABASE_URL` is the variable that carries the real shared credential during an operator's
      migration run, so the two names being disjoint is what makes it impossible for the operator's
      own documented sequence to arm a truncate against production. Unset, the suites skip rather
      than fail.
   2. **A local host.** `localhost`, `127.0.0.1`, `::1` — anything else throws before a connection
      is opened.
   3. **This workspace's own database.** Added later, by ADR-0005: several Conductor workspaces
      develop this repo on one machine, and a stale or hand-pasted local URL truncated two siblings'
      fixtures. The database in the URL must be the one derived from this workspace's directory
      (`apps/api/src/db/workspace-database.ts`), and `pnpm db:workspace` is what provisions it. Inert
      when `CONDUCTOR_WORKSPACE_PATH` is unset, which is CI's shape and a plain clone's.

   Belts 2 and 3 are not redundant: belt 2 is what protects the shared Supabase credential, and a
   remote host must keep failing for being remote whatever the database is called.

Supporting rules that follow from the above:

- **`drizzle-kit push` and `pull` are never run**, in any environment. Schema changes go through
  the generated migration chain, applied by `db:migrate`.
- **No development machine and no CI job holds the shared credential.** CI's `db` job uses an
  ephemeral service container; applying a migration to the shared project is an operator step
  (issue #26).
- **The emitted SQL is gated by a test, not by review.** `apps/api/test/migration-safety.test.ts`
  reads every file in `apps/api/drizzle/` and asserts no mention of `public`, that every
  schema-qualified name is `bingo`, and that any statement containing `DROP` matches a narrow
  allowlist — `DROP INDEX [IF EXISTS] "bingo"."<name>";`, one index at a time, nothing else. (The
  allowlist replaced a blanket no-`DROP` rule once a migration legitimately needed to replace an
  index.) So the guarantee is checked against the artefact that actually runs, not against the
  config that was supposed to produce it.

## Consequences

- Isolation is enforced by config plus tests over emitted SQL, so a regression fails CI rather than
  a deploy.
- The two-variable convention is load-bearing and counter-intuitive: a future contributor's
  instinct to "simplify" the test setup by falling back to `DATABASE_URL` would remove the property
  the design exists for. It is commented at every site and stated in the README.
- Any second consumer of this database must set its own `migrationsSchema`. That obligation is
  tracked for the twinion repo as issue #17 — filed originally as `schemaFilter` insurance only,
  and since amended, because `schemaFilter` alone leaves the journal shared.
- The API's DB-backed tests need a real Postgres. They are ephemeral-container tests rather than
  mocked, which is slower but is the only way the `bingo`-qualification and the query plans are
  actually exercised.
- `apps/api/vitest.config.ts` sets `fileParallelism: false`. Three suites truncating the same
  throwaway database in parallel deadlock on a genuine lock-order inversion (40P01), so they run one
  file at a time. This is a consequence of the truncate-based isolation, not an unrelated tuning
  choice, and re-enabling parallelism reintroduces the deadlock. **ADR-0005's per-workspace databases
  do not retire this**: they stop workspaces colliding with *each other*, while five suites still
  truncate one database *within* a workspace.
- `apps/api/vitest.config.ts` also lifts `TEST_DATABASE_URL` out of `apps/api/.env` by hand, because
  Vitest 4 does not read `.env` files. It lifts **only** that key: reading `DATABASE_URL` there would
  put the shared credential into the truncating process and undo belt 1, which is why
  `process.loadEnvFile()` is not used.

## Alternatives considered

- **A separate database for bingo.** The obvious fix, and rejected for cost and operational
  overhead on a project whose whole point is a handful of phones on race weekends. If that changes,
  this ADR is the thing to revisit — most of the machinery above becomes unnecessary. Note the scope
  of that rejection: it is about the **shared production project**, which bingo still shares. For
  **local development** a separate database per workspace has since been adopted —
  `docs/adr/0005-a-database-per-conductor-workspace.md` — for isolation between concurrent
  workspaces, which costs nothing on a throwaway container.
- **`schemaFilter` alone.** Insufficient: it leaves the migrator's journal in a shared default
  schema. This is exactly the gap found while implementing #3.
- **Relying on review to catch bad migrations.** Rejected. The dangerous artefact is a generated
  file that looks ordinary, which is precisely the case review is worst at and an assertion over
  the SQL is best at.
