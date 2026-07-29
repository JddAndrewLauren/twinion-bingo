import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { ROOM_CODE_ALPHABET } from '../src/rooms/codes.js';
import { noTestDatabase, testDatabaseUrl } from './support/test-database.js';

/** Runs against the ephemeral local Postgres the README's two commands set up. */
const db = createDb(testDatabaseUrl ?? 'postgres://unused');

const app = createApp({ allowedOrigins: ['http://localhost:3000'], db });

type Joined = {
  code: string;
  token: string;
  player: { id: string; name: string; joinSeq: number };
};

type Roster = {
  code: string;
  themeId: string;
  hostPlayerId: string | null;
  players: { id: string; name: string; joinSeq: number }[];
  you: { id: string; name: string; joinSeq: number } | null;
};

async function createRoom(name: string): Promise<Joined> {
  const res = await app.request('/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  expect(res.status).toBe(201);

  return (await res.json()) as Joined;
}

async function join(code: string, name: string): Promise<Response> {
  return app.request(`/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

async function readRoom(code: string, token?: string): Promise<Response> {
  return app.request(`/rooms/${code}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

describe.skipIf(noTestDatabase)('creating a room and joining it', () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`,
    );
  });

  it('returns a four-character code from the reduced alphabet', async () => {
    const { code } = await createRoom('Host');

    expect(code).toHaveLength(4);
    for (const character of code) {
      expect(ROOM_CODE_ALPHABET).toContain(character);
    }
  });

  it('creates the host player and points the room at it', async () => {
    const created = await createRoom('Host');

    const roster = (await (await readRoom(created.code)).json()) as Roster;

    expect(roster.hostPlayerId).toBe(created.player.id);
    expect(roster.players.map((player) => player.name)).toEqual(['Host']);
    expect(roster.themeId).toBe('f1.v1');
  });

  it('issues a distinct opaque token to every player', async () => {
    const host = await createRoom('Host');
    const guest = (await (await join(host.code, 'Guest')).json()) as Joined;

    expect(host.token).not.toBe(guest.token);
    for (const token of [host.token, guest.token]) {
      expect(token.length).toBeGreaterThanOrEqual(32);
      // Opaque: nothing about the player is readable out of it.
      expect(token).not.toContain(host.code);
    }
  });

  it('rejects a join with no name', async () => {
    const { code } = await createRoom('Host');

    const res = await join(code, '   ');

    expect(res.status).toBe(400);
  });

  it('rejects a room creation with no name', async () => {
    const res = await app.request('/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('404s a join against a code no room has', async () => {
    const res = await join('ZZZZ', 'Nobody');

    expect(res.status).toBe(404);
  });

  it('400s a join against something that is not a code at all', async () => {
    const res = await join('ABC0', 'Nobody');

    expect(res.status).toBe(400);
  });

  it('accepts the code as it was typed, in any case', async () => {
    const { code } = await createRoom('Host');

    const res = await join(code.toLowerCase(), 'Guest');

    expect(res.status).toBe(201);
  });
});

describe.skipIf(noTestDatabase)('the room-scoped join sequence', () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`,
    );
  });

  it('appends a PLAYER_JOINED row for the host and for each join', async () => {
    const host = await createRoom('Host');
    await join(host.code, 'Guest');

    const rows = await db.execute<{ kind: string; actor_player_id: string }>(
      sql`SELECT kind, actor_player_id FROM bingo.room_events
          WHERE room_code = ${host.code} ORDER BY seq`,
    );

    expect([...rows].map((row) => row.kind)).toEqual([
      'PLAYER_JOINED',
      'PLAYER_JOINED',
    ]);
  });

  it('stamps join_seq from the sequence of the player own PLAYER_JOINED row', async () => {
    const host = await createRoom('Host');
    const guest = (await (await join(host.code, 'Guest')).json()) as Joined;

    const rows = await db.execute<{ seq: string; actor_player_id: string }>(
      sql`SELECT seq, actor_player_id FROM bingo.room_events
          WHERE room_code = ${host.code} ORDER BY seq`,
    );

    const seqByPlayer = new Map(
      [...rows].map((row) => [row.actor_player_id, Number(row.seq)]),
    );

    expect(host.player.joinSeq).toBe(seqByPlayer.get(host.player.id));
    expect(guest.player.joinSeq).toBe(seqByPlayer.get(guest.player.id));
    expect(guest.player.joinSeq).toBeGreaterThan(host.player.joinSeq);
  });

  it('orders the roster by join sequence', async () => {
    const host = await createRoom('Host');
    await join(host.code, 'Second');
    await join(host.code, 'Third');

    const roster = (await (await readRoom(host.code)).json()) as Roster;

    expect(roster.players.map((player) => player.name)).toEqual([
      'Host',
      'Second',
      'Third',
    ]);
  });
});

describe.skipIf(noTestDatabase)('coming back with a token', () => {
  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`,
    );
  });

  it('reads back as the same player, not a new one', async () => {
    const host = await createRoom('Host');

    const roster = (await (
      await readRoom(host.code, host.token)
    ).json()) as Roster;

    expect(roster.you).toEqual(host.player);
    expect(roster.players).toHaveLength(1);
  });

  it('leaves you unidentified without a token, so the web app can ask for a name', async () => {
    const host = await createRoom('Host');

    const roster = (await (await readRoom(host.code)).json()) as Roster;

    expect(roster.you).toBeNull();
  });

  it('never puts anyone token in the roster', async () => {
    const host = await createRoom('Host');

    const body = await (await readRoom(host.code, host.token)).text();

    expect(body).not.toContain(host.token);
  });

  it('does not accept a token from another room', async () => {
    const first = await createRoom('Host');
    const second = await createRoom('Other host');

    const roster = (await (
      await readRoom(second.code, first.token)
    ).json()) as Roster;

    expect(roster.you).toBeNull();
  });

  it('404s a roster read for a code no room has', async () => {
    const res = await readRoom('ZZZZ');

    expect(res.status).toBe(404);
  });
});
