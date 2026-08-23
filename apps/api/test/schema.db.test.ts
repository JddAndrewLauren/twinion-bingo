import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { noTestDatabase, testDatabaseUrl } from './support/test-database.js';

/**
 * Runs against the ephemeral local Postgres the README's two commands set up —
 * this suite is the one that needs the migration already applied.
 */
describe.skipIf(noTestDatabase)('the bingo schema', () => {
  // Never connected when skipped; postgres.js only dials on the first query.
  const sql = postgres(testDatabaseUrl ?? 'postgres://unused', { max: 1 });

  let gameId: string;
  let playerId: string;

  beforeAll(async () => {
    await sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`;

    // The deck lives on `rooms` now (ADR-0010), not on the game row.
    await sql`INSERT INTO bingo.rooms (code, theme_id, deck) VALUES ('ABCD', 'f1.v1', ARRAY['f1.v1:driver_retires:VER'])`;
    const [player] = await sql<{ id: string }[]>`
      INSERT INTO bingo.players (room_code, name, token, join_seq)
      VALUES ('ABCD', 'Max', 'token-1', 1)
      RETURNING id`;
    const [game] = await sql<{ id: string }[]>`
      INSERT INTO bingo.games (room_code, theme_id, seed)
      VALUES ('ABCD', 'f1.v1', 'seed-1')
      RETURNING id`;

    if (player === undefined || game === undefined) {
      throw new Error('fixture inserts returned no rows');
    }

    playerId = player.id;
    gameId = game.id;
  });

  afterAll(async () => {
    await sql.end();
  });

  it('holds all five tables, and holds them in bingo', async () => {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'bingo'
        AND table_type = 'BASE TABLE'
        AND table_name <> '__drizzle_migrations'`;

    expect(new Set(rows.map((row) => row.table_name))).toEqual(
      new Set(['rooms', 'players', 'games', 'cards', 'room_events']),
    );
  });

  it('creates nothing in the public schema a neighbour project would own', async () => {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

    expect(rows).toEqual([]);
  });

  it('records the migration journal inside bingo, not the shared drizzle schema', async () => {
    const journals = await sql<{ table_schema: string }[]>`
      SELECT table_schema FROM information_schema.tables
      WHERE table_name = '__drizzle_migrations'`;

    expect(journals.map((row) => row.table_schema)).toEqual(['bingo']);
  });

  /**
   * The stated cost of ADR-0004, asserted rather than assumed. A partial unique
   * index used to reject a second CALL for the same square, which made a retracted
   * square uncallable for the rest of the game (#45) — a constraint cannot see the
   * RETRACT that superseded the call it is comparing against.
   *
   * So the log itself constrains nothing here, and one-live-call-per-square is
   * `callSquare`'s to keep under the game-row lock. This asserts the index is gone
   * rather than merely unused: an index left behind would still reject the
   * re-call the application is now free to append.
   */
  it('leaves one live call per square to the application, not to an index', async () => {
    const indexes = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'bingo' AND tablename = 'room_events'`;

    expect(indexes.map((row) => row.indexname)).not.toContain(
      'room_events_call_unique',
    );

    const insertCall = () => sql`
      INSERT INTO bingo.room_events (room_code, game_id, actor_player_id, kind, square_id)
      VALUES ('ABCD', ${gameId}, ${playerId}, 'CALL', 'f1.v1:driver_retires:VER')`;

    await insertCall();
    await expect(insertCall()).resolves.toBeDefined();
  });

  /**
   * The lookup that replaced the constraint runs on every call rather than only
   * on a lost race, and it runs holding the game row's lock — so without these it
   * is two sequential scans of a log that is never pruned, and the lock is held
   * for as long as that takes. Asserted non-unique: uniqueness moved to the lock
   * (ADR-0004), and a unique index here would restore #45's dead end.
   */
  it('indexes the live-call lookup, without constraining it', async () => {
    const rows = await sql<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'bingo' AND tablename = 'room_events'
        AND indexname IN ('room_events_call_idx', 'room_events_target_seq_idx')`;

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.indexdef).not.toMatch(/UNIQUE/i);
    }
  });

  it('includes the card re-roll event kind', async () => {
    const rows = await sql<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
      WHERE pg_namespace.nspname = 'bingo' AND pg_type.typname = 'room_event_kind'
      ORDER BY pg_enum.enumsortorder`;

    expect(rows.map((row) => row.enumlabel)).toContain('CARD_REROLLED');
  });

  it('stores the latest card re-roll sequence as a nullable bigint', async () => {
    const [column] = await sql<
      { data_type: string; is_nullable: string }[]
    >`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'bingo' AND table_name = 'cards'
        AND column_name = 'latest_reroll_seq'`;

    expect(column).toEqual({ data_type: 'bigint', is_nullable: 'YES' });
  });
});
