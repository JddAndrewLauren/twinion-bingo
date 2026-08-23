import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { noTestDatabase, testDatabaseUrl } from './support/test-database.js';

/**
 * The semantics of ADR-0010's `games.deck` -> `rooms.deck` backfill, which
 * `migration-safety.test.ts` deliberately does not cover: that gate reads the
 * *shape* of the emitted DDL and refuses anything that could touch a table
 * outside `bingo`, and it would pass a backfill that silently picked the wrong
 * game's deck.
 *
 * Two things make this suite different from every other DB-backed one here.
 *
 * First, it cannot run against `bingo`: migration 0005 is already applied
 * there, so the pre-migration shape it needs (a `deck` column on `games`, none
 * on `rooms`) no longer exists. It builds that shape in a throwaway schema of
 * its own instead.
 *
 * Second, and the reason the schema is throwaway rather than a TRUNCATE: four
 * Conductor workspaces share one local Postgres, so anything this suite wrote
 * into `bingo` would land in a sibling's fixtures. It creates and drops its own
 * schema and never names `bingo` at all.
 */

const BACKFILL_SCHEMA = 'bingo_backfill_0005';

/**
 * The statement under test is read out of the migration rather than restated,
 * so the assertions cannot drift away from the SQL an operator actually runs.
 * drizzle-kit separates statements with `--> statement-breakpoint`, and the
 * backfill is the file's only UPDATE.
 */
function backfillStatement(): string {
  const migration = readFileSync(
    fileURLToPath(
      new URL('../drizzle/0005_lyrical_queen_noir.sql', import.meta.url),
    ),
    'utf8',
  );

  const updates = migration
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => /^UPDATE\b/i.test(statement));

  if (updates.length !== 1) {
    throw new Error(
      `expected exactly one UPDATE in migration 0005, found ${updates.length}`,
    );
  }

  // The only edit: point the real statement at this suite's throwaway schema.
  // The correlated subquery's unqualified `games.`/`rooms.` references resolve
  // by table name and need no rewriting.
  return updates[0]!.replaceAll('"bingo".', `"${BACKFILL_SCHEMA}".`);
}

describe.skipIf(noTestDatabase)('ADR-0010 deck backfill (migration 0005)', () => {
  // Never connected when skipped; postgres.js only dials on the first query.
  const sql = postgres(testDatabaseUrl ?? 'postgres://unused', { max: 1 });

  /** Whatever the migration says, run against the pre-0005 shape below. */
  const backfill = backfillStatement();

  beforeAll(async () => {
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${BACKFILL_SCHEMA}" CASCADE`);
    await sql.unsafe(`CREATE SCHEMA "${BACKFILL_SCHEMA}"`);

    // The pre-0005 shape, cut down to the columns the backfill reads: rooms
    // without a deck, games with one.
    await sql.unsafe(`
      CREATE TABLE "${BACKFILL_SCHEMA}"."rooms" (
        code varchar(6) PRIMARY KEY,
        theme_id text NOT NULL
      );
      CREATE TABLE "${BACKFILL_SCHEMA}"."games" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_code varchar(6) NOT NULL REFERENCES "${BACKFILL_SCHEMA}"."rooms"(code),
        started_at timestamptz,
        deck text[]
      );
      ALTER TABLE "${BACKFILL_SCHEMA}"."rooms" ADD COLUMN deck text[];
    `);

    await sql.unsafe(`
      INSERT INTO "${BACKFILL_SCHEMA}"."rooms" (code, theme_id) VALUES
        ('MANY', 'f1.v1'),
        ('LOBBY', 'f1.v1'),
        ('ONLYL', 'f1.v1'),
        ('NONE', 'f1.v1');

      INSERT INTO "${BACKFILL_SCHEMA}"."games" (room_code, started_at, deck) VALUES
        -- MANY: three started sessions. Only the newest deck survives.
        ('MANY',  '2026-01-01T10:00:00Z', ARRAY['oldest']),
        ('MANY',  '2026-01-03T10:00:00Z', ARRAY['newest']),
        ('MANY',  '2026-01-02T10:00:00Z', ARRAY['middle']),
        -- LOBBY: a started session plus an unstarted one. Postgres orders NULLs
        -- FIRST under a plain DESC, so without NULLS LAST the lobby row wins.
        ('LOBBY', '2026-01-01T10:00:00Z', ARRAY['started']),
        ('LOBBY', NULL,                   ARRAY['lobby']),
        -- ONLYL: an unstarted session and nothing else.
        ('ONLYL', NULL,                   ARRAY['lobby-only']);
      -- NONE deliberately has no games at all.
    `);

    await sql.unsafe(backfill);
  });

  afterAll(async () => {
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${BACKFILL_SCHEMA}" CASCADE`);
    await sql.end();
  });

  const deckOf = async (code: string): Promise<string[] | null> => {
    const rows = await sql.unsafe<{ deck: string[] | null }[]>(
      `SELECT deck FROM "${BACKFILL_SCHEMA}"."rooms" WHERE code = $1`,
      [code],
    );
    return rows[0]?.deck ?? null;
  };

  it('keeps the most recently started game’s deck when a room has several', async () => {
    expect(await deckOf('MANY')).toEqual(['newest']);
  });

  /**
   * The assertion `ORDER BY ... DESC NULLS LAST` exists for. A plain `DESC` in
   * Postgres is `NULLS FIRST`, so an unstarted lobby game would outrank the
   * real session and every player in that room would come back to a deck their
   * cards were never dealt from.
   */
  it('never lets an unstarted game outrank a started one', async () => {
    expect(await deckOf('LOBBY')).toEqual(['started']);
  });

  /**
   * NULLS LAST demotes the unstarted row; it does not exclude it. A room whose
   * only game never started still has exactly one candidate deck, and that is
   * the one it should keep.
   */
  it('still takes an unstarted game’s deck when it is the only candidate', async () => {
    expect(await deckOf('ONLYL')).toEqual(['lobby-only']);
  });

  /**
   * `rooms.deck` is nullable precisely so this case has an answer — ADR-0010's
   * first Consequence. The subquery returns no row and the UPDATE writes NULL,
   * which is what "the host has not started the game" means.
   */
  it('leaves a room with no games null', async () => {
    expect(await deckOf('NONE')).toBeNull();
  });

  /**
   * The backfill's blast radius, pinned. It is an unfiltered `UPDATE ... SET`
   * over every room, so a subquery that failed to correlate would quietly give
   * every room the same deck. Distinct decks across rooms is the evidence it
   * correlated per row.
   */
  it('correlates per room rather than writing one deck everywhere', async () => {
    const rows = await sql.unsafe<{ code: string; deck: string[] | null }[]>(
      `SELECT code, deck FROM "${BACKFILL_SCHEMA}"."rooms" ORDER BY code`,
    );

    expect(rows).toEqual([
      { code: 'LOBBY', deck: ['started'] },
      { code: 'MANY', deck: ['newest'] },
      { code: 'NONE', deck: null },
      { code: 'ONLYL', deck: ['lobby-only'] },
    ]);
  });
});
