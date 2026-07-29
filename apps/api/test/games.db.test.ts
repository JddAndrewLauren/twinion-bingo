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
  marks: string[];
  streamedThroughSeq: number;
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

async function call(
  gameId: string,
  squareId: string,
  token?: string,
): Promise<Response> {
  return app.request(`/games/${gameId}/call`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ square_id: squareId }),
  });
}

async function marksOf(code: string, token: string): Promise<string[]> {
  return ((await (await readGame(code, token)).json()) as GameView).marks;
}

async function callRows(code: string): Promise<{ square_id: string }[]> {
  const rows = await db.execute<{ square_id: string }>(
    sql`SELECT square_id FROM bingo.room_events
        WHERE room_code = ${code} AND kind = 'CALL' ORDER BY seq`,
  );

  return [...rows];
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

/**
 * D1, and the payoff for the derived-marks model: one appended row is the whole
 * write, and every card holding that square marks because the derivation says so.
 */
describe.skipIf(noTestDatabase)('calling a square', () => {
  beforeEach(truncate);

  /**
   * A room mid-game, plus a square both players hold. Cards are 24 of a 40-square
   * deck, so an overlap always exists — that overlap is what the call mechanic
   * runs on, and asserting it here keeps a bad deal from looking like a bad call.
   */
  async function twoPlayerGame() {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;

    const mine = started.card!.map((square) => square.id);
    const yours = new Set(theirs.card!.map((square) => square.id));
    const shared = mine.find((id) => yours.has(id));
    const onlyMine = mine.find((id) => !yours.has(id));

    expect(shared).toBeDefined();
    expect(onlyMine).toBeDefined();

    return { host, guest, gameId: started.id, shared: shared!, onlyMine: onlyMine! };
  }

  it('appends a CALL row and marks the square on every card holding it', async () => {
    const { host, guest, gameId, shared } = await twoPlayerGame();

    const res = await call(gameId, shared, host.token);
    expect(res.status).toBe(201);
    expect((await res.json()) as { squareId: string }).toMatchObject({
      squareId: shared,
      actorPlayerId: host.player.id,
      appended: true,
    });

    expect(await callRows(host.code)).toEqual([{ square_id: shared }]);

    // The spotter's card and a card they never touched, both marked.
    expect(await marksOf(host.code, host.token)).toEqual([shared]);
    expect(await marksOf(host.code, guest.token)).toEqual([shared]);
  });

  it('leaves a card that does not hold the square unmarked', async () => {
    const { host, guest, gameId, onlyMine } = await twoPlayerGame();

    expect((await call(gameId, onlyMine, host.token)).status).toBe(201);

    expect(await marksOf(host.code, host.token)).toEqual([onlyMine]);
    expect(await marksOf(host.code, guest.token)).toEqual([]);
  });

  /**
   * Call scope is card-only for players (D7). Opening it to the whole deck would
   * pay a player to stay quiet about a square they do not hold, so a square that
   * is not on your card is refused rather than silently accepted.
   */
  it('refuses a square that is not on the caller`s card, and writes nothing', async () => {
    const { host, guest, gameId, onlyMine } = await twoPlayerGame();

    const res = await call(gameId, onlyMine, guest.token);
    expect(res.status).toBe(403);

    expect(await callRows(host.code)).toEqual([]);
    expect(await marksOf(host.code, host.token)).toEqual([]);
  });

  it('refuses a square id that is in no deck at all', async () => {
    const { host, gameId } = await twoPlayerGame();

    expect((await call(gameId, 'f1.v1:not_a_square:XXX', host.token)).status).toBe(403);
    expect(await callRows(host.code)).toEqual([]);
  });

  /**
   * The race the partial unique index exists for. Both players spotted the same
   * event; exactly one row may result, and the one who lost the insert is not
   * looking at a failure — the square they spotted is called.
   */
  it('turns two simultaneous calls into one row, with neither caller erroring', async () => {
    const { host, guest, gameId, shared } = await twoPlayerGame();

    const [mine, yours] = await Promise.all([
      call(gameId, shared, host.token),
      call(gameId, shared, guest.token),
    ]);

    expect(mine.ok).toBe(true);
    expect(yours.ok).toBe(true);
    // One of them appended, the other was handed the row that won.
    expect([mine.status, yours.status].sort()).toEqual([200, 201]);

    expect(await callRows(host.code)).toEqual([{ square_id: shared }]);

    // And both were told about the same row, so neither is crediting a call the
    // rest of the room cannot see.
    const [one, two] = [
      (await mine.json()) as { seq: number; actorPlayerId: string },
      (await yours.json()) as { seq: number; actorPlayerId: string },
    ];
    expect(one.seq).toBe(two.seq);
    expect(one.actorPlayerId).toBe(two.actorPlayerId);
  });

  it('is idempotent when the same player taps twice', async () => {
    const { host, gameId, shared } = await twoPlayerGame();

    expect((await call(gameId, shared, host.token)).status).toBe(201);
    expect((await call(gameId, shared, host.token)).status).toBe(200);

    expect(await callRows(host.code)).toEqual([{ square_id: shared }]);
  });

  it('needs a player token, and a game that exists', async () => {
    const { host, gameId, shared } = await twoPlayerGame();

    expect((await call(gameId, shared)).status).toBe(401);
    expect((await call(gameId, shared, 'not-a-token')).status).toBe(401);
    expect(
      (await call('00000000-0000-4000-8000-000000000000', shared, host.token))
        .status,
    ).toBe(404);
    // Not a uuid at all: a bad URL, not a 500 out of Postgres.
    expect((await call('nonsense', shared, host.token)).status).toBe(404);

    expect(await callRows(host.code)).toEqual([]);
  });

  it('400s a request with no square_id', async () => {
    const { host, gameId } = await twoPlayerGame();

    const res = await app.request(`/games/${gameId}/call`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${host.token}`,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

/**
 * `marks(player) = card.square_ids ∩ {CALLs not superseded by a RETRACT}` — the
 * one idea the whole design follows from. These are about the derivation itself
 * rather than about any route.
 */
describe.skipIf(noTestDatabase)('marks', () => {
  beforeEach(truncate);

  it('are stored nowhere: the call log is the only place a mark comes from', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const square = started.card![0]!.id;

    expect(started.marks).toEqual([]);
    expect((await call(started.id, square, host.token)).status).toBe(201);
    expect(await marksOf(host.code, host.token)).toEqual([square]);

    // Deleting the log's CALL rows unmarks the card, with nothing else touched —
    // which could not be true if a mark were written down anywhere.
    await db.execute(sql`DELETE FROM bingo.room_events WHERE kind = 'CALL'`);
    expect(await marksOf(host.code, host.token)).toEqual([]);
  });

  it('drop a call a RETRACT supersedes, and keep the ones it does not', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const [first, second] = [started.card![0]!.id, started.card![1]!.id];

    const call1 = (await (await call(started.id, first, host.token)).json()) as {
      seq: number;
    };
    await call(started.id, second, host.token);

    // #9 owns the retract route; the derivation has to be right before it lands.
    await db.execute(
      sql`INSERT INTO bingo.room_events (room_code, game_id, actor_player_id, kind, target_seq)
          VALUES (${host.code}, ${started.id}, ${host.player.id}, 'RETRACT', ${call1.seq})`,
    );

    expect(await marksOf(host.code, host.token)).toEqual([second]);
  });

  /**
   * The reconnect criterion. A device that dropped and came back reads the same
   * derived answer as one that never dropped, because there is only one answer to
   * read — no per-device accumulation to fall behind.
   */
  it('read the same on a device that has just arrived as on one that never left', async () => {
    const { host, guest, gameId, shared, onlyMine } = await (async () => {
      const host = await createRoom('Host');
      const guest = await join(host.code, 'Guest');
      const started = (await (await start(host.code, host.token)).json()) as GameView;
      const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;

      const mine = started.card!.map((square) => square.id);
      const yours = new Set(theirs.card!.map((square) => square.id));

      return {
        host,
        guest,
        gameId: started.id,
        shared: mine.find((id) => yours.has(id))!,
        onlyMine: mine.find((id) => !yours.has(id))!,
      };
    })();

    await call(gameId, shared, host.token);
    await call(gameId, onlyMine, host.token);

    const stayed = await marksOf(host.code, guest.token);
    const returned = await marksOf(host.code, guest.token);

    expect(stayed).toEqual(returned);
    expect(stayed).toEqual([shared]);
  });

  /**
   * The horizon a device holds next to its stream. It has to sit at or above the
   * `GAME_STARTED` row the snapshot already reflects, or the first frame after a
   * connection would announce a game that is already on screen.
   */
  it('come with the log position they were computed at', async () => {
    const host = await createRoom('Host');
    await start(host.code, host.token);

    // Both rows are older than the stream's settle hold-back by now.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const view = (await (await readGame(host.code, host.token)).json()) as GameView;
    const rows = await db.execute<{ seq: string }>(
      sql`SELECT max(seq) AS seq FROM bingo.room_events WHERE room_code = ${host.code}`,
    );

    expect(view.streamedThroughSeq).toBe(Number([...rows][0]!.seq));
  });
});
