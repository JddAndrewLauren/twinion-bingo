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
