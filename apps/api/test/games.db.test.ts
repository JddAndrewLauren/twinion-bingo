import { readFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import type { Pool } from '@twinion-bingo/theme';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import {
  CARD_SQUARES,
  DECK_SIZE,
  SOURCE_QUOTA,
  TIER_QUOTA,
  composeDeck,
  dealCard,
} from '../src/games/deck.js';
import { noTestDatabase, testDatabaseUrl } from './support/test-database.js';

const db = createDb(testDatabaseUrl ?? 'postgres://unused');

/**
 * The synthetic pool, keyed the way a room's `theme_id` names it. The committed
 * F1 pool cannot supply D6's deck until #16 authors it to ~180 squares, so a room
 * created here is pointed at a pool that can — the composer's refusal of the real
 * one is `deck.test.ts`'s subject, not this suite's.
 */
const fixture = JSON.parse(
  readFileSync(joinPath(import.meta.dirname, 'fixtures/pool-180.json'), 'utf8'),
) as Pool;

const pools = new Map<string, Pool>([['f1.v1', fixture]]);

const app = createApp({
  allowedOrigins: ['http://localhost:3000'],
  db,
  pools,
});

type Joined = {
  code: string;
  token: string;
  player: { id: string; name: string; joinSeq: number };
};

type CardSquare = { id: string; label: string; description: string; tier: string };
type GameView = {
  id: string;
  state: string;
  freeCentre: string;
  card: CardSquare[] | null;
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

async function join(code: string, name: string): Promise<Joined> {
  const res = await app.request(`/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  expect(res.status).toBe(201);

  return (await res.json()) as Joined;
}

async function start(code: string, token?: string): Promise<Response> {
  return app.request(`/rooms/${code}/games`, {
    method: 'POST',
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

async function readGame(code: string, token?: string): Promise<Response> {
  return app.request(`/rooms/${code}/game`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

async function gameRow(code: string): Promise<{ seed: string; deck: string[]; state: string }> {
  const rows = await db.execute<{ seed: string; deck: string[]; state: string }>(
    sql`SELECT seed, deck, state FROM bingo.games WHERE room_code = ${code}`,
  );

  const [row] = [...rows];
  expect(row).toBeDefined();

  return row!;
}

const truncate = async () => {
  await db.execute(
    sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`,
  );
};

describe.skipIf(noTestDatabase)('starting a game', () => {
  beforeEach(truncate);

  it('draws a deck, deals every player a card, and goes live', async () => {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');

    const res = await start(host.code, host.token);
    expect(res.status).toBe(201);

    const started = (await res.json()) as GameView;
    expect(started.state).toBe('live');
    expect(started.freeCentre).toBe('LIGHTS OUT');
    expect(started.card).toHaveLength(CARD_SQUARES);

    const row = await gameRow(host.code);
    expect(row.state).toBe('live');
    expect(row.deck).toHaveLength(DECK_SIZE);

    // The guest was dealt one too, without having asked for it.
    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;
    expect(theirs.card).toHaveLength(CARD_SQUARES);
    expect(theirs.id).toBe(started.id);
  });

  it('composes the deck to D6 quotas from the pool the room names', async () => {
    const host = await createRoom('Host');
    await start(host.code, host.token);

    const deck = (await gameRow(host.code)).deck;
    const byId = new Map(fixture.squares.map((square) => [square.id, square]));
    const squares = deck.map((id) => byId.get(id)!);

    expect(squares.every((square) => square !== undefined)).toBe(true);

    for (const tier of ['certain', 'medium', 'rare'] as const) {
      expect(squares.filter((square) => square.tier === tier)).toHaveLength(
        TIER_QUOTA[tier],
      );
    }
    for (const source of ['handcrafted', 'generated'] as const) {
      expect(squares.filter((square) => square.source === source)).toHaveLength(
        SOURCE_QUOTA[source],
      );
    }
  });

  it('appends GAME_STARTED, carrying the game the stream is announcing', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;

    const rows = await db.execute<{ kind: string; game_id: string; actor_player_id: string }>(
      sql`SELECT kind, game_id, actor_player_id FROM bingo.room_events
          WHERE room_code = ${host.code} ORDER BY seq`,
    );

    const events = [...rows];
    expect(events.map((event) => event.kind)).toEqual([
      'PLAYER_JOINED',
      'GAME_STARTED',
    ]);
    expect(events[1]!.game_id).toBe(started.id);
    expect(events[1]!.actor_player_id).toBe(host.player.id);
  });

  it('stores the seed, and the stored seed reproduces the deck and the deal', async () => {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const started = (await (await start(host.code, host.token)).json()) as GameView;

    const row = await gameRow(host.code);
    expect(row.seed).not.toBe('');

    // The whole point of storing it: the draw is a function of the seed, so the
    // row is enough to replay what the room was dealt.
    const replayed = composeDeck(fixture, row.seed);
    expect(replayed.map((square) => square.id)).toEqual(row.deck);

    expect(dealCard(replayed, row.seed, host.player.id)).toEqual(
      started.card!.map((square) => square.id),
    );

    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;
    expect(dealCard(replayed, row.seed, guest.player.id)).toEqual(
      theirs.card!.map((square) => square.id),
    );
  });

  it('deals different players different cards from the one deck', async () => {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;

    const mine = started.card!.map((square) => square.id);
    const yours = theirs.card!.map((square) => square.id);
    const deck = new Set((await gameRow(host.code)).deck);

    expect(mine).not.toEqual(yours);
    expect(mine.every((id) => deck.has(id))).toBe(true);
    expect(yours.every((id) => deck.has(id))).toBe(true);
    // Two cards of 24 from a deck of 40 must share at least 8 squares, which is
    // the overlap the call mechanic runs on.
    expect(mine.filter((id) => yours.includes(id)).length).toBeGreaterThanOrEqual(8);
  });

  it('rejects a non-host, and a caller with no token at all', async () => {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');

    expect((await start(host.code, guest.token)).status).toBe(403);
    expect((await start(host.code)).status).toBe(401);
    expect((await start(host.code, 'not-a-token')).status).toBe(401);

    // And none of those left a game behind.
    const rows = await db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM bingo.games WHERE room_code = ${host.code}`,
    );
    expect([...rows][0]!.count).toBe('0');
  });

  it('400s a code that is not shaped like one, and 404s an unknown room', async () => {
    const host = await createRoom('Host');

    expect((await start('ABC0', host.token)).status).toBe(400);
    expect((await start('ZZZZ', host.token)).status).toBe(401);
    expect((await readGame('ABC0')).status).toBe(400);
    expect((await readGame('ZZZZ')).status).toBe(404);
  });

  it('refuses to start a second game while one is live', async () => {
    const host = await createRoom('Host');

    expect((await start(host.code, host.token)).status).toBe(201);
    expect((await start(host.code, host.token)).status).toBe(409);

    const rows = await db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM bingo.games WHERE room_code = ${host.code}`,
    );
    expect([...rows][0]!.count).toBe('1');
  });

  it('has no game to read before the host starts one', async () => {
    const host = await createRoom('Host');

    expect((await readGame(host.code, host.token)).status).toBe(404);
  });

  /**
   * A shortfall in the theme's pool is not the request's fault and no retry fixes
   * it, so it comes back as a 503 carrying the composer's arithmetic — see
   * `deck.test.ts` for what that arithmetic says about the F1 starter pool.
   */
  it('503s with the shortfall when the room names a pool too thin for a deck', async () => {
    const thin = createApp({
      allowedOrigins: ['http://localhost:3000'],
      db,
      pools: new Map([['f1.v1', { ...fixture, squares: fixture.squares.slice(0, 20) }]]),
    });

    const host = await createRoom('Host');

    const res = await thin.request(`/rooms/${host.code}/games`, {
      method: 'POST',
      headers: { authorization: `Bearer ${host.token}` },
    });

    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain(
      'cannot compose a 40-square deck',
    );
  });
});

/**
 * Marks are derived from the call log and never stored — the one idea the whole
 * design follows from (D4). A mark column on `cards` would make two descriptions
 * of what is marked, so its absence is asserted rather than assumed.
 */
describe.skipIf(noTestDatabase)('the cards table', () => {
  beforeEach(truncate);

  it('holds square_ids and nothing else that could carry a mark', async () => {
    const rows = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'bingo' AND table_name = 'cards'
          ORDER BY column_name`,
    );

    expect([...rows].map((row) => row.column_name)).toEqual([
      'game_id',
      'player_id',
      'square_ids',
    ]);
  });

  it('stores a card as 24 square ids', async () => {
    const host = await createRoom('Host');
    await start(host.code, host.token);

    const rows = await db.execute<{ square_ids: string[] }>(
      sql`SELECT square_ids FROM bingo.cards`,
    );

    const [row] = [...rows];
    expect(row!.square_ids).toHaveLength(CARD_SQUARES);
  });
});
