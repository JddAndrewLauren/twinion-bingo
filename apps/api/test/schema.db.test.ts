import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs against an ephemeral local Postgres that already has the migration
 * applied — see the README for the two commands. These tests TRUNCATE, so they
 * deliberately do NOT read `DATABASE_URL`: that variable carries the shared
 * Supabase credential during an operator's real migration run, and the README's
 * sequence would otherwise arm the truncate against it. A separate
 * `TEST_DATABASE_URL` has to be set on purpose, and it has to be local.
 * Unset, these skip rather than fail; CI's `db` job provides one.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Second belt. A `TEST_DATABASE_URL` pointing anywhere but this machine is a
 * mistake worth failing loudly over, never one to silently truncate through.
 */
function assertLocal(url: string): void {
  const { hostname } = new URL(url);
  if (!localHosts.has(hostname)) {
    throw new Error(
      `TEST_DATABASE_URL must point at a local, throwaway Postgres; got host "${hostname}". ` +
        'These tests truncate every bingo table.',
    );
  }
}

if (databaseUrl !== undefined && databaseUrl !== '') assertLocal(databaseUrl);

describe.skipIf(databaseUrl === undefined || databaseUrl === '')('the bingo schema', () => {
  // Never connected when skipped; postgres.js only dials on the first query.
  const sql = postgres(databaseUrl ?? 'postgres://unused', { max: 1 });

  let gameId: string;
  let playerId: string;

  beforeAll(async () => {
    await sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`;

    await sql`INSERT INTO bingo.rooms (code, theme_id) VALUES ('ABCD', 'f1.v1')`;
    const [player] = await sql<{ id: string }[]>`
      INSERT INTO bingo.players (room_code, name, token, join_seq)
      VALUES ('ABCD', 'Max', 'token-1', 1)
      RETURNING id`;
    const [game] = await sql<{ id: string }[]>`
      INSERT INTO bingo.games (room_code, theme_id, deck, seed)
      VALUES ('ABCD', 'f1.v1', ARRAY['f1.v1:driver_retires:VER'], 'seed-1')
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

  it('rejects a duplicate CALL for the same square in the same game', async () => {
    await sql`
      INSERT INTO bingo.room_events (room_code, game_id, actor_player_id, kind, square_id)
      VALUES ('ABCD', ${gameId}, ${playerId}, 'CALL', 'f1.v1:driver_retires:VER')`;

    await expect(
      sql`
        INSERT INTO bingo.room_events (room_code, game_id, actor_player_id, kind, square_id)
        VALUES ('ABCD', ${gameId}, ${playerId}, 'CALL', 'f1.v1:driver_retires:VER')`,
    ).rejects.toThrow(/room_events_call_unique/);
  });

  it('still allows repeated non-CALL rows for that square', async () => {
    const insertRetract = () => sql`
      INSERT INTO bingo.room_events (room_code, game_id, actor_player_id, kind, square_id)
      VALUES ('ABCD', ${gameId}, ${playerId}, 'RETRACT', 'f1.v1:driver_retires:VER')`;

    await insertRetract();
    await expect(insertRetract()).resolves.toBeDefined();
  });

  it('allows the same square to be called again in a different game', async () => {
    const [next] = await sql<{ id: string }[]>`
      INSERT INTO bingo.games (room_code, theme_id, deck, seed)
      VALUES ('ABCD', 'f1.v1', ARRAY['f1.v1:driver_retires:VER'], 'seed-2')
      RETURNING id`;

    expect(next).toBeDefined();

    await expect(
      sql`
        INSERT INTO bingo.room_events (room_code, game_id, actor_player_id, kind, square_id)
        VALUES ('ABCD', ${next?.id ?? null}, ${playerId}, 'CALL', 'f1.v1:driver_retires:VER')`,
    ).resolves.toBeDefined();
  });
});
