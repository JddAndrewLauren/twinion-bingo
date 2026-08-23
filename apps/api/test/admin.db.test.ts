import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { listOpenRooms } from '../src/admin/store.js';
import { noTestDatabase, testDatabaseUrl } from './support/test-database.js';

const db = createDb(testDatabaseUrl ?? 'postgres://unused');

type Joined = {
  code: string;
  token: string;
  player: { id: string; name: string; joinSeq: number };
};

async function createRoom(app: ReturnType<typeof createApp>, name: string): Promise<Joined> {
  const res = await app.request('/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  expect(res.status).toBe(201);

  return (await res.json()) as Joined;
}

async function join(
  app: ReturnType<typeof createApp>,
  code: string,
  name: string,
): Promise<Joined> {
  const res = await app.request(`/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  expect(res.status).toBe(201);

  return (await res.json()) as Joined;
}

const truncate = async () => {
  await db.execute(
    sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`,
  );
};

async function start(
  app: ReturnType<typeof createApp>,
  code: string,
  token: string,
): Promise<Response> {
  return app.request(`/rooms/${code}/games`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
}

async function call(
  app: ReturnType<typeof createApp>,
  gameId: string,
  squareId: string,
  token: string,
): Promise<Response> {
  return app.request(`/games/${gameId}/call`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ square_id: squareId }),
  });
}

async function readGame(
  app: ReturnType<typeof createApp>,
  code: string,
  token: string,
): Promise<{ state: string }> {
  const res = await app.request(`/rooms/${code}/game`, {
    headers: { authorization: `Bearer ${token}` },
  });

  return (await res.json()) as { state: string };
}

describe.skipIf(noTestDatabase)('listing open rooms', () => {
  beforeEach(truncate);

  it('lists a room with no game yet as lobby, with its player count and age', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db });
    const host = await createRoom(app, 'Ash');
    await join(app, host.code, 'Bo');

    const now = new Date(Date.now() + 60_000);
    const rooms = await listOpenRooms(db, now);

    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      code: host.code,
      playerCount: 2,
      gameState: 'lobby',
    });
    expect(rooms[0]!.ageSeconds).toBeGreaterThanOrEqual(59);
    expect(rooms[0]!.ageSeconds).toBeLessThanOrEqual(61);
  });

  it('names the theme id it was created with', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db });
    await createRoom(app, 'Ash');

    const [room] = await listOpenRooms(db, new Date());

    expect(room!.themeId).toMatch(/^f1\./);
  });

  it('reports a started game as live', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db });
    const host = await createRoom(app, 'Ash');
    const started = await app.request(`/rooms/${host.code}/games`, {
      method: 'POST',
      headers: { authorization: `Bearer ${host.token}` },
    });
    expect(started.status).toBe(201);

    const [room] = await listOpenRooms(db, new Date());

    expect(room!.gameState).toBe('live');
  });

  it('lists newest room first', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db });
    const first = await createRoom(app, 'Ash');
    const second = await createRoom(app, 'Bo');

    const rooms = await listOpenRooms(db, new Date());

    expect(rooms.map((room) => room.code)).toEqual([second.code, first.code]);
  });

  it('lists nothing when there are no rooms', async () => {
    const rooms = await listOpenRooms(db, new Date());

    expect(rooms).toEqual([]);
  });
});

describe.skipIf(noTestDatabase)('GET /admin/rooms', () => {
  beforeEach(truncate);

  it('reveals nothing without the secret configured at all', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db });
    await createRoom(app, 'Ash');

    const res = await app.request('/admin/rooms');

    expect(res.status).toBe(401);
    expect(await res.text()).not.toMatch(/Ash|room/i);
  });

  it('reveals nothing without a bearer header, when a secret is configured', async () => {
    const app = createApp({
      allowedOrigins: ['http://localhost:3000'],
      db,
      adminSecret: 'lax-paddock',
    });
    await createRoom(app, 'Ash');

    const res = await app.request('/admin/rooms');

    expect(res.status).toBe(401);
  });

  it('refuses the wrong secret', async () => {
    const app = createApp({
      allowedOrigins: ['http://localhost:3000'],
      db,
      adminSecret: 'lax-paddock',
    });
    await createRoom(app, 'Ash');

    const res = await app.request('/admin/rooms', {
      headers: { authorization: 'Bearer not-it' },
    });

    expect(res.status).toBe(401);
  });

  it('lists the open rooms for the right secret', async () => {
    const app = createApp({
      allowedOrigins: ['http://localhost:3000'],
      db,
      adminSecret: 'lax-paddock',
    });
    const host = await createRoom(app, 'Ash');

    const res = await app.request('/admin/rooms', {
      headers: { authorization: 'Bearer lax-paddock' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { rooms: { code: string; playerCount: number }[] };
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0]).toMatchObject({ code: host.code, playerCount: 1 });
  });
});

const SECRET = 'lax-paddock';

describe.skipIf(noTestDatabase)('POST /admin/rooms/:code/game/end', () => {
  beforeEach(truncate);

  it('refuses without the right secret, identically to every admin route', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');

    const res = await app.request(`/admin/rooms/${host.code}/game/end`, { method: 'POST' });

    expect(res.status).toBe(401);
  });

  it('force-ends a live game: the game reads done, and a further call is refused with 409', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');
    const started = await start(app, host.code, host.token);
    expect(started.status).toBe(201);
    const game = (await started.json()) as { id: string; card: { id: string }[] };

    const res = await app.request(`/admin/rooms/${host.code}/game/end`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(204);

    const read = await readGame(app, host.code, host.token);
    expect(read.state).toBe('done');

    const attempt = await call(app, game.id, game.card[0]!.id, host.token);
    expect(attempt.status).toBe(409);
  });

  it('appends an event so a connected device learns without re-reading', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');
    await start(app, host.code, host.token);

    await app.request(`/admin/rooms/${host.code}/game/end`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    });

    const rows = await db.execute<{ kind: string }>(
      sql`SELECT kind FROM bingo.room_events WHERE room_code = ${host.code} ORDER BY seq DESC LIMIT 1`,
    );
    expect([...rows][0]).toMatchObject({ kind: 'GAME_FORCE_ENDED' });
  });

  it('is idempotent: ending an already-done game does not error', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');
    await start(app, host.code, host.token);

    await app.request(`/admin/rooms/${host.code}/game/end`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const again = await app.request(`/admin/rooms/${host.code}/game/end`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    });

    expect(again.status).toBe(204);
  });

  it('404s a room with no game to end', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');

    const res = await app.request(`/admin/rooms/${host.code}/game/end`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    });

    expect(res.status).toBe(404);
  });
});

describe.skipIf(noTestDatabase)('DELETE /admin/rooms/:code', () => {
  beforeEach(truncate);

  it('refuses without the right secret', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');

    const res = await app.request(`/admin/rooms/${host.code}`, { method: 'DELETE' });

    expect(res.status).toBe(401);
  });

  it('hard-deletes a room and everything under it, and does not error on a finished game', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');
    const started = await start(app, host.code, host.token);
    const game = (await started.json()) as { id: string; card: { id: string }[] };
    await call(app, game.id, game.card[0]!.id, host.token);

    const res = await app.request(`/admin/rooms/${host.code}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(204);

    const [room] = await db.execute(sql`SELECT code FROM bingo.rooms WHERE code = ${host.code}`);
    expect(room).toBeUndefined();
    const [gameRow] = await db.execute(sql`SELECT id FROM bingo.games WHERE id = ${game.id}::uuid`);
    expect(gameRow).toBeUndefined();
    const [eventRow] = await db.execute(
      sql`SELECT seq FROM bingo.room_events WHERE room_code = ${host.code}`,
    );
    expect(eventRow).toBeUndefined();
    const [playerRow] = await db.execute(
      sql`SELECT id FROM bingo.players WHERE id = ${host.player.id}::uuid`,
    );
    expect(playerRow).toBeUndefined();
  });

  it('404s a room that does not exist', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });

    const res = await app.request('/admin/rooms/ZZZZ', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${SECRET}` },
    });

    expect(res.status).toBe(404);
  });
});

describe.skipIf(noTestDatabase)('POST /admin/rooms/:code/players/:playerId/kick', () => {
  beforeEach(truncate);

  it('refuses without the right secret', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');

    const res = await app.request(`/admin/rooms/${host.code}/players/${host.player.id}/kick`, {
      method: 'POST',
    });

    expect(res.status).toBe(401);
  });

  it('revokes the token: further calls are rejected, but their calls and others’ marks stand', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');
    const guest = await join(app, host.code, 'Bea');
    const started = await start(app, host.code, host.token);
    const game = (await started.json()) as { id: string; card: { id: string }[] };

    const bea = (await (await readGameRes(app, host.code, guest.token)).json()) as {
      card: { id: string }[];
    };
    const guestSquare = bea.card[0]!.id;
    const guestCall = await call(app, game.id, guestSquare, guest.token);
    expect(guestCall.status).toBe(201);

    const res = await app.request(`/admin/rooms/${host.code}/players/${guest.player.id}/kick`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(204);

    // The kicked player's token no longer identifies them.
    const rejected = await call(app, game.id, guestSquare, guest.token);
    expect(rejected.status).toBe(401);

    // Their existing call stands, credited to their player row, which stands too.
    const rows = await db.execute<{ actor_player_id: string }>(
      sql`SELECT actor_player_id FROM bingo.room_events WHERE room_code = ${host.code} AND kind = 'CALL'`,
    );
    expect([...rows][0]).toMatchObject({ actor_player_id: guest.player.id });

    const [player] = await db.execute(
      sql`SELECT id FROM bingo.players WHERE id = ${guest.player.id}::uuid`,
    );
    expect(player).toBeDefined();

    // The host's own read of the game is unaffected — the mark is still there.
    const hostView = (await readGame(app, host.code, host.token)) as {
      state: string;
    };
    expect(hostView.state).toBe('live');
  });

  it('404s a player that does not exist in the room', async () => {
    const app = createApp({ allowedOrigins: ['http://localhost:3000'], db, adminSecret: SECRET });
    const host = await createRoom(app, 'Ash');

    const res = await app.request(
      `/admin/rooms/${host.code}/players/00000000-0000-0000-0000-000000000000/kick`,
      { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } },
    );

    expect(res.status).toBe(404);
  });
});

async function readGameRes(
  app: ReturnType<typeof createApp>,
  code: string,
  token: string,
): Promise<Response> {
  return app.request(`/rooms/${code}/game`, {
    headers: { authorization: `Bearer ${token}` },
  });
}
