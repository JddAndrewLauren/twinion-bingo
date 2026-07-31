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
  MAX_RARE_PER_CARD,
  MIN_CERTAIN_PER_CARD,
  SOURCE_QUOTA,
  TIER_QUOTA,
  composeDeck,
  dealCard,
} from '../src/games/deck.js';
import { defaultThemeId } from '../src/games/pools.js';
import { LINES } from '../src/games/lines.js';
import { noTestDatabase, testDatabaseUrl } from './support/test-database.js';

const db = createDb(testDatabaseUrl ?? 'postgres://unused');

/**
 * The synthetic pool, keyed the way a room's `theme_id` names it. This suite is
 * about rooms and games rather than about theme content, so a room created here
 * is pointed at a pool whose counts are pinned in the fixture and cannot shift
 * under it when someone edits `themes/f1/` — the real pool is `deck.test.ts`'s
 * subject, not this suite's.
 */
const fixture = JSON.parse(
  readFileSync(joinPath(import.meta.dirname, 'fixtures/pool-180.json'), 'utf8'),
) as Pool;

const pools = new Map<string, Pool>([[defaultThemeId(), fixture]]);

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
type Mark = { squareId: string; seq: number; actorPlayerId: string };
type GameView = {
  id: string;
  state: string;
  freeCentre: string;
  card: CardSquare[] | null;
  deck: { squares: CardSquare[]; called: Mark[] } | null;
  marks: Mark[];
  inheritedMarks: string[];
  prizes: { prizeKind: string; playerId: string }[];
  standings: { playerId: string; name: string; marks: number }[];
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

async function retract(
  gameId: string,
  seq: number,
  token?: string,
): Promise<Response> {
  return app.request(`/games/${gameId}/retract`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ seq }),
  });
}

async function reroll(gameId: string, token?: string): Promise<Response> {
  return app.request(`/games/${gameId}/card/reroll`, {
    method: 'POST',
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

async function marksOf(code: string, token: string): Promise<Mark[]> {
  return ((await (await readGame(code, token)).json()) as GameView).marks;
}

/** The marked square ids alone, for the assertions that are only about which. */
async function markedIdsOf(code: string, token: string): Promise<string[]> {
  return (await marksOf(code, token)).map((mark) => mark.squareId);
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
      pools: new Map([[defaultThemeId(), { ...fixture, squares: fixture.squares.slice(0, 20) }]]),
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

  it('holds square_ids and claim metadata, never a stored mark', async () => {
    const rows = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'bingo' AND table_name = 'cards'
          ORDER BY column_name`,
    );

    expect([...rows].map((row) => row.column_name)).toEqual([
      'game_id',
      'latest_reroll_seq',
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

describe.skipIf(noTestDatabase)('re-rolling a card', () => {
  beforeEach(truncate);

  it('replaces a clean card with a valid card from the same deck', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const before = (await (await readGame(host.code, host.token)).json()) as GameView;

    const res = await reroll(started.id, host.token);

    expect(res.status).toBe(200);
    const after = (await res.json()) as GameView;
    expect(after.id).toBe(started.id);
    expect(after.card).toHaveLength(CARD_SQUARES);

    const deck = new Set(before.deck!.squares.map((square) => square.id));
    const card = after.card!;
    const poolSquareById = new Map(fixture.squares.map((square) => [square.id, square]));
    expect(card.every((square) => deck.has(square.id))).toBe(true);
    expect(new Set(card.map((square) => square.id)).size).toBe(CARD_SQUARES);
    expect(
      new Set(card.map((square) => poolSquareById.get(square.id)!.exclusivityGroup)).size,
    ).toBe(CARD_SQUARES);
    expect(card.filter((square) => square.tier === 'rare').length).toBeLessThanOrEqual(
      MAX_RARE_PER_CARD,
    );
    expect(card.filter((square) => square.tier === 'certain').length).toBeGreaterThanOrEqual(
      MIN_CERTAIN_PER_CARD,
    );
    expect(new Set(card.map((square) => square.id))).not.toEqual(
      new Set(before.card!.map((square) => square.id)),
    );
  });

  it('can re-roll a clean card repeatedly with different memberships', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;

    const first = (await (await reroll(started.id, host.token)).json()) as GameView;
    const second = (await (await reroll(started.id, host.token)).json()) as GameView;

    const firstIds = new Set(first.card!.map((square) => square.id));
    const secondIds = new Set(second.card!.map((square) => square.id));
    expect(secondIds).not.toEqual(firstIds);
  });

  it('keeps calls made after the re-roll eligible for prizes', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    expect((await reroll(started.id, host.token)).status).toBe(200);

    const refreshed = (await (await readGame(host.code, host.token)).json()) as GameView;
    const line = LINES[0]!.map((index) => refreshed.card![index]!.id);
    for (const squareId of line) {
      expect((await call(started.id, squareId, host.token)).status).toBe(201);
    }

    const afterCalls = (await (await readGame(host.code, host.token)).json()) as GameView;
    expect(afterCalls.prizes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ prizeKind: 'LINE', playerId: host.player.id }),
      ]),
    );
  });

  it('refuses a marked card without changing the card or log', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const originalIds = started.card!.map((square) => square.id);
    const called = (await (await call(started.id, originalIds[0]!, host.token)).json()) as {
      seq: number;
    };

    const res = await reroll(started.id, host.token);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'your card has a live mark' });
    const refreshed = (await (await readGame(host.code, host.token)).json()) as GameView;
    expect(refreshed.card!.map((square) => square.id)).toEqual(originalIds);

    const events = await db.execute<{ kind: string; seq: string }>(
      sql`SELECT kind, seq FROM bingo.room_events WHERE room_code = ${host.code} ORDER BY seq`,
    );
    expect([...events].map((event) => event.kind)).not.toContain('CARD_REROLLED');
    expect([...events].find((event) => Number(event.seq) === called.seq)?.kind).toBe(
      'CALL',
    );
  });

  it('allows a re-roll after the blocking call is retracted', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const squareId = started.card![0]!.id;
    const called = (await (await call(started.id, squareId, host.token)).json()) as {
      seq: number;
    };

    expect((await retract(started.id, called.seq, host.token)).status).toBe(201);
    const res = await reroll(started.id, host.token);

    expect(res.status).toBe(200);
    expect(
      new Set(((await res.json()) as GameView).card!.map((square) => square.id)),
    ).not.toEqual(new Set(started.card!.map((square) => square.id)));
  });

  it('requires authentication and leaves unknown games without writes', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;

    expect((await reroll(started.id)).status).toBe(401);
    expect((await reroll(started.id, 'not-a-token')).status).toBe(401);
    expect((await reroll('nonsense', host.token)).status).toBe(404);
    expect(
      (await reroll('00000000-0000-4000-8000-000000000000', host.token)).status,
    ).toBe(404);

    const events = await db.execute<{ kind: string }>(
      sql`SELECT kind FROM bingo.room_events WHERE room_code = ${host.code}`,
    );
    expect([...events].map((event) => event.kind)).not.toContain('CARD_REROLLED');
  });

  it('exhausts the seeded attempts when the deck has no other membership', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const originalIds = started.card!.map((square) => square.id);

    await db.execute(
      sql`UPDATE bingo.games SET deck = ARRAY[${sql.join(
        originalIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[] WHERE id = ${started.id}`,
    );

    const res = await reroll(started.id, host.token);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'no different card could be dealt' });
    const events = await db.execute<{ kind: string }>(
      sql`SELECT kind FROM bingo.room_events WHERE game_id = ${started.id}`,
    );
    expect([...events].map((event) => event.kind)).not.toContain('CARD_REROLLED');
  });

  it('returns the stored reroll event boundary for the player and game', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;

    const res = await reroll(started.id, host.token);
    expect(res.status).toBe(200);
    const refreshed = (await res.json()) as GameView;

    const rows = await db.execute<{
      event_seq: string;
      event_room_code: string;
      event_game_id: string;
      event_actor_player_id: string;
      latest_reroll_seq: string;
    }>(
      sql`SELECT e.seq AS event_seq, e.room_code AS event_room_code,
                 e.game_id AS event_game_id, e.actor_player_id AS event_actor_player_id,
                 c.latest_reroll_seq
          FROM bingo.room_events AS e
          INNER JOIN bingo.cards AS c
            ON c.game_id = e.game_id AND c.player_id = e.actor_player_id
          WHERE e.kind = 'CARD_REROLLED' AND e.game_id = ${started.id}`,
    );
    const [row] = [...rows];

    expect(row).toMatchObject({
      event_room_code: host.code,
      event_game_id: started.id,
      event_actor_player_id: host.player.id,
      latest_reroll_seq: row!.event_seq,
    });
    expect(refreshed.card!.map((square) => square.id)).toHaveLength(CARD_SQUARES);
  });

  it('404s a player who has no card and refuses a finished game', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;

    await db.execute(
      sql`INSERT INTO bingo.players (room_code, name, token, join_seq)
          VALUES (${host.code}, 'No card', 'no-card-token', 999)`,
    );
    const noCard = await reroll(started.id, 'no-card-token');
    expect(noCard.status).toBe(404);
    expect(await noCard.json()).toEqual({ error: 'you have no card in this game' });

    await db.execute(sql`UPDATE bingo.games SET state = 'done' WHERE id = ${started.id}`);
    const finished = await reroll(started.id, host.token);
    expect(finished.status).toBe(409);
    expect(await finished.json()).toEqual({ error: 'this game has finished' });
  });

  it('serializes a guest call against a re-roll using the current card', async () => {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const guestView = (await (await readGame(host.code, guest.token)).json()) as GameView;
    const row = await gameRow(host.code);
    const byId = new Map(fixture.squares.map((square) => [square.id, square]));
    const deck = row.deck.map((id) => byId.get(id)!);
    const oldIds = guestView.card!.map((square) => square.id);
    const oldSet = new Set(oldIds);
    let replacement: string[] | undefined;

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const candidate = dealCard(
        deck,
        `${row.seed}:${guest.player.id}:${guest.player.joinSeq}:${attempt}`,
        guest.player.id,
      );
      const candidateSet = new Set(candidate);
      if (
        candidateSet.size !== oldSet.size ||
        [...candidateSet].some((id) => !oldSet.has(id))
      ) {
        replacement = candidate;
        break;
      }
    }

    const oldOnly = oldIds.find((id) => !replacement!.includes(id));
    expect(oldOnly).toBeDefined();

    const [called, rerolled] = await Promise.all([
      call(started.id, oldOnly!, guest.token),
      reroll(started.id, guest.token),
    ]);

    if (rerolled.status === 200) {
      expect(called.status).toBe(403);
      expect(await called.json()).toEqual({ error: 'that square is not on your card' });
    } else {
      expect(rerolled.status).toBe(409);
      expect(await called.json()).toMatchObject({ appended: true });
      expect(await rerolled.json()).toEqual({ error: 'your card has a live mark' });
    }
  });

  it('resets the claim boundary when older deck calls enter the replacement card', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const original = new Set(started.card!.map((square) => square.id));
    const outside = started.deck!.squares
      .map((square) => square.id)
      .filter((id) => !original.has(id));

    for (const squareId of outside) {
      expect((await call(started.id, squareId, host.token)).status).toBe(201);
    }

    const res = await reroll(started.id, host.token);
    expect(res.status).toBe(200);
    const refreshed = (await res.json()) as GameView;

    expect(refreshed.inheritedMarks.length).toBeGreaterThan(0);
    expect(refreshed.marks.map((mark) => mark.squareId)).toEqual(
      expect.arrayContaining(refreshed.inheritedMarks),
    );
    expect(
      refreshed.standings.find((standing) => standing.playerId === host.player.id)?.marks,
    ).toBe(refreshed.marks.length);
  });

  /**
   * The whole point of the boundary: a line can look complete on the grid and still
   * win nothing. Retracting the inherited calls and making them again — the only
   * change being which side of the boundary they sit on — hands the prize over.
   */
  it('never lets an inherited mark complete a line, until it is called again', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const original = new Set(started.card!.map((square) => square.id));
    const seqBySquare = new Map<string, number>();

    for (const squareId of started.deck!.squares.map((square) => square.id)) {
      if (original.has(squareId)) continue;
      const res = await call(started.id, squareId, host.token);
      expect(res.status).toBe(201);
      seqBySquare.set(squareId, ((await res.json()) as { seq: number }).seq);
    }

    const rerolled = await reroll(started.id, host.token);
    expect(rerolled.status).toBe(200);
    const refreshed = (await rerolled.json()) as GameView;
    const cardIds = refreshed.card!.map((square) => square.id);
    const inherited = new Set(refreshed.inheritedMarks);
    expect(inherited.size).toBeGreaterThan(0);

    // Every card index sits on a row and a column, so an inherited square always
    // has a line to spoil.
    const line = LINES.find((candidate) =>
      candidate.some((index) => inherited.has(cardIds[index]!)),
    );
    expect(line).toBeDefined();
    const lineIds = line!.map((index) => cardIds[index]!);

    for (const squareId of lineIds.filter((id) => !inherited.has(id))) {
      expect((await call(started.id, squareId, host.token)).status).toBe(201);
    }

    const gated = (await (await readGame(host.code, host.token)).json()) as GameView;
    expect(gated.marks.map((mark) => mark.squareId)).toEqual(
      expect.arrayContaining(lineIds),
    );
    expect(gated.prizes).toEqual([]);

    for (const squareId of lineIds.filter((id) => inherited.has(id))) {
      expect(
        (await retract(started.id, seqBySquare.get(squareId)!, host.token)).status,
      ).toBe(201);
      expect((await call(started.id, squareId, host.token)).status).toBe(201);
    }

    const earned = (await (await readGame(host.code, host.token)).json()) as GameView;
    expect(earned.prizes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ prizeKind: 'LINE', playerId: host.player.id }),
      ]),
    );
  });

  it('refuses a second re-roll while an inherited mark sits on the replacement card', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const original = new Set(started.card!.map((square) => square.id));

    for (const squareId of started.deck!.squares.map((square) => square.id)) {
      if (original.has(squareId)) continue;
      expect((await call(started.id, squareId, host.token)).status).toBe(201);
    }

    const first = await reroll(started.id, host.token);
    expect(first.status).toBe(200);
    const refreshed = (await first.json()) as GameView;
    expect(refreshed.inheritedMarks.length).toBeGreaterThan(0);

    const second = await reroll(started.id, host.token);

    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'your card has a live mark' });
    const after = (await (await readGame(host.code, host.token)).json()) as GameView;
    expect(after.card!.map((square) => square.id)).toEqual(
      refreshed.card!.map((square) => square.id),
    );

    const events = await db.execute<{ seq: string }>(
      sql`SELECT seq FROM bingo.room_events
          WHERE game_id = ${started.id} AND kind = 'CARD_REROLLED'`,
    );
    expect([...events]).toHaveLength(1);
  });

  it("leaves the other player's card, boundary and marks untouched", async () => {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const guestView = (await (await readGame(host.code, guest.token)).json()) as GameView;
    const guestIds = new Set(guestView.card!.map((square) => square.id));
    const hostIds = started.card!.map((square) => square.id);

    // A square only the host holds: it marks the host's card while leaving the
    // guest's clean enough to re-roll.
    const onlyHost = hostIds.find((id) => !guestIds.has(id));
    expect(onlyHost).toBeDefined();
    expect((await call(started.id, onlyHost!, host.token)).status).toBe(201);
    const hostBefore = (await (await readGame(host.code, host.token)).json()) as GameView;

    const rerolled = await reroll(started.id, guest.token);

    expect(rerolled.status).toBe(200);
    expect(new Set(((await rerolled.json()) as GameView).card!.map((s) => s.id))).not.toEqual(
      guestIds,
    );
    const hostAfter = (await (await readGame(host.code, host.token)).json()) as GameView;
    expect(hostAfter.card!.map((square) => square.id)).toEqual(hostIds);
    expect(hostAfter.marks).toEqual(hostBefore.marks);
    expect(hostAfter.inheritedMarks).toEqual([]);

    const events = await db.execute<{ seq: string; actor_player_id: string }>(
      sql`SELECT seq, actor_player_id FROM bingo.room_events
          WHERE game_id = ${started.id} AND kind = 'CARD_REROLLED'`,
    );
    const [rerollEvent] = [...events];
    expect([...events]).toHaveLength(1);
    expect(rerollEvent!.actor_player_id).toBe(guest.player.id);

    const cards = await db.execute<{ player_id: string; latest_reroll_seq: string | null }>(
      sql`SELECT player_id, latest_reroll_seq FROM bingo.cards WHERE game_id = ${started.id}`,
    );
    const boundaries = new Map(
      [...cards].map((row) => [row.player_id, row.latest_reroll_seq]),
    );
    expect(boundaries.get(host.player.id)).toBeNull();
    expect(boundaries.get(guest.player.id)).toBe(rerollEvent!.seq);
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
    expect(await markedIdsOf(host.code, host.token)).toEqual([shared]);
    expect(await markedIdsOf(host.code, guest.token)).toEqual([shared]);
  });

  it('leaves a card that does not hold the square unmarked', async () => {
    const { host, guest, gameId, onlyMine } = await twoPlayerGame();

    expect((await call(gameId, onlyMine, host.token)).status).toBe(201);

    expect(await markedIdsOf(host.code, host.token)).toEqual([onlyMine]);
    expect(await markedIdsOf(host.code, guest.token)).toEqual([]);
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
    expect(await markedIdsOf(host.code, host.token)).toEqual([]);
  });

  it('refuses a square id that is in no deck at all', async () => {
    const { host, gameId } = await twoPlayerGame();

    expect((await call(gameId, 'f1.v1:not_a_square:XXX', host.token)).status).toBe(403);
    expect(await callRows(host.code)).toEqual([]);
  });

  /**
   * The race the game-row lock arbitrates (ADR-0004). Both players spotted the
   * same event; exactly one row may result, and the one who arrived second is not
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
 * The other half of D7: the host calls from the whole deck, not only their card,
 * so a square that landed on one card while that player was in the kitchen can
 * still be repaired. Everything downstream of the scope check has to be the same
 * as a card call — same row, same derivation, same race behaviour.
 */
describe.skipIf(noTestDatabase)('the host deck sheet', () => {
  beforeEach(truncate);

  /**
   * A room mid-game, plus a deck square the host was not dealt. Cards are 24 of a
   * 40-square deck, so 16 of the host's deck are off their own card — and one of
   * those is the whole point of the sheet.
   */
  async function gameWithSheet() {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;

    const mine = new Set(started.card!.map((square) => square.id));
    const yours = new Set(theirs.card!.map((square) => square.id));
    const deck = started.deck!.squares.map((square) => square.id);
    const notMineButTheirs = deck.find((id) => !mine.has(id) && yours.has(id));
    const notTheirs = deck.find((id) => !yours.has(id));

    expect(notMineButTheirs).toBeDefined();
    expect(notTheirs).toBeDefined();

    return {
      host,
      guest,
      gameId: started.id,
      deck,
      /** In the deck and on the guest's card, but not on the host's. */
      notMineButTheirs: notMineButTheirs!,
      /** In the deck and off the guest's card — theirs to spot, not to call. */
      notTheirs: notTheirs!,
    };
  }

  it('hands the host the whole deck with its called state, and hands nobody else one', async () => {
    const { host, guest, notTheirs } = await gameWithSheet();

    const sheet = ((await (await readGame(host.code, host.token)).json()) as GameView)
      .deck;

    expect(sheet!.squares).toHaveLength(DECK_SIZE);
    expect(sheet!.squares.map((square) => square.id)).toEqual(
      (await gameRow(host.code)).deck,
    );
    // Prose, not just ids: the sheet is read aloud off the host's phone.
    expect(sheet!.squares.every((square) => square.label !== '')).toBe(true);
    expect(sheet!.called).toEqual([]);

    // A guest is not handed the deck at all, so there is nothing on their device
    // to hide — the sheet cannot leak what was never sent.
    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;
    expect(theirs.deck).toBeNull();
    // A deck square off their card reaches them nowhere in the response.
    expect(JSON.stringify(theirs)).not.toContain(notTheirs);

    // Nor is an anonymous reader, who gets no card either.
    expect(((await (await readGame(host.code)).json()) as GameView).deck).toBeNull();
  });

  it('comes back with the deal, so the host has the sheet before any re-read', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;

    expect(started.deck!.squares).toHaveLength(DECK_SIZE);
    expect(started.deck!.called).toEqual([]);
  });

  it('lets the host call a deck square that is on no card of theirs', async () => {
    const { host, guest, gameId, notMineButTheirs } = await gameWithSheet();

    const res = await call(gameId, notMineButTheirs, host.token);
    expect(res.status).toBe(201);
    expect((await res.json()) as { squareId: string }).toMatchObject({
      squareId: notMineButTheirs,
      actorPlayerId: host.player.id,
      appended: true,
    });

    // The same one row a card call writes, and the same derivation off it: the
    // guest holding the square is marked, and the host who called it is not.
    expect(await callRows(host.code)).toEqual([{ square_id: notMineButTheirs }]);
    expect(await markedIdsOf(host.code, guest.token)).toEqual([notMineButTheirs]);
    expect(await markedIdsOf(host.code, host.token)).toEqual([]);
  });

  /**
   * The asymmetry is the decision: the same out-of-card call is a repair from the
   * host and a denial incentive from anybody else, so the API answers the two
   * differently for the very same square.
   */
  it('refuses the same out-of-card call from a player who is not the host', async () => {
    const { host, guest, gameId, notTheirs } = await gameWithSheet();

    const refused = await call(gameId, notTheirs, guest.token);
    expect(refused.status).toBe(403);
    expect((await refused.json()) as { error: string }).toEqual({
      error: 'that square is not on your card',
    });
    expect(await callRows(host.code)).toEqual([]);

    // And the host, on that identical square, is allowed.
    expect((await call(gameId, notTheirs, host.token)).status).toBe(201);
    expect(await callRows(host.code)).toEqual([{ square_id: notTheirs }]);
  });

  it('refuses a square that is in no deck, even from the host', async () => {
    const { host, gameId } = await gameWithSheet();

    const res = await call(gameId, 'f1.v1:not_a_square:XXX', host.token);

    expect(res.status).toBe(403);
    expect((await res.json()) as { error: string }).toEqual({
      error: "that square is not in this game's deck",
    });
    expect(await callRows(host.code)).toEqual([]);
  });

  /**
   * The host loses a race like anybody else. A player got there first, so the
   * host's tap creates nothing — and that is not an error, because the square the
   * host was repairing is called, which is all they wanted.
   */
  it('hands the host the winning row when the square was already called', async () => {
    const { host, guest, gameId, notMineButTheirs } = await gameWithSheet();

    const theirs = (await (
      await call(gameId, notMineButTheirs, guest.token)
    ).json()) as { seq: number };

    const mine = await call(gameId, notMineButTheirs, host.token);
    expect(mine.status).toBe(200);
    expect((await mine.json()) as { seq: number }).toMatchObject({
      seq: theirs.seq,
      actorPlayerId: guest.player.id,
      appended: false,
    });

    expect(await callRows(host.code)).toEqual([{ square_id: notMineButTheirs }]);
  });

  /**
   * The sheet's called state is derived from the log exactly as marks are, so a
   * call made on a player's phone reaches the host's sheet with no second
   * mechanism — the host's next read of the game is the whole update path.
   */
  it('shows a call another player made, and drops it again when it is retracted', async () => {
    const { host, guest, gameId, notMineButTheirs } = await gameWithSheet();

    const theirs = (await (
      await call(gameId, notMineButTheirs, guest.token)
    ).json()) as { seq: number };

    const called = async () =>
      ((await (await readGame(host.code, host.token)).json()) as GameView).deck!.called;

    // The CALL row itself, not just the square id: the sheet is where the host
    // reaches a call to take it back, and a retraction names the row by `seq`.
    expect(await called()).toEqual([
      {
        squareId: notMineButTheirs,
        seq: theirs.seq,
        actorPlayerId: guest.player.id,
      },
    ]);

    // #9 owns the retract route; the sheet reads the same derivation marks do.
    await db.execute(
      sql`INSERT INTO bingo.room_events (room_code, game_id, actor_player_id, kind, target_seq)
          VALUES (${host.code}, ${gameId}, ${host.player.id}, 'RETRACT', ${theirs.seq})`,
    );

    expect(await called()).toEqual([]);
  });

  /**
   * The case #46 was filed for. A deck square on nobody's card is called by the
   * host from the sheet, and once the undo window shuts the sheet is the only
   * surface that can reach it — a player would be refused 403, because the call is
   * not theirs. So the seq has to arrive with the sheet or the call is permanent.
   */
  it('hands the host the seq for a deck square on nobody`s card, so it can be taken back', async () => {
    const { host, gameId, notTheirs } = await gameWithSheet();

    await call(gameId, notTheirs, host.token);

    const sheet = async () =>
      ((await (await readGame(host.code, host.token)).json()) as GameView).deck!.called;

    const [live] = await sheet();
    expect(live).toMatchObject({
      squareId: notTheirs,
      actorPlayerId: host.player.id,
    });

    expect((await retract(gameId, live!.seq, host.token)).status).toBe(201);

    expect(await sheet()).toEqual([]);
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
    expect(await markedIdsOf(host.code, host.token)).toEqual([square]);

    // Deleting the log's CALL rows unmarks the card, with nothing else touched —
    // which could not be true if a mark were written down anywhere.
    await db.execute(sql`DELETE FROM bingo.room_events WHERE kind = 'CALL'`);
    expect(await markedIdsOf(host.code, host.token)).toEqual([]);
  });

  it('drop a call a RETRACT supersedes, and keep the ones it does not', async () => {
    const host = await createRoom('Host');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const [first, second] = [started.card![0]!.id, started.card![1]!.id];

    const call1 = (await (await call(started.id, first, host.token)).json()) as {
      seq: number;
    };
    await call(started.id, second, host.token);

    expect((await retract(started.id, call1.seq, host.token)).status).toBe(201);

    expect(await markedIdsOf(host.code, host.token)).toEqual([second]);
  });

  /**
   * The seq a correction names. A device tapping a marked square has to be able
   * to say which CALL it means, and the derived answer is the only place it could
   * learn that from — nothing else on the client knows the log.
   */
  it('carry the call that made them, so a correction can name it', async () => {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;

    const yours = new Set(theirs.card!.map((square) => square.id));
    const shared = started.card!.map((square) => square.id).find((id) =>
      yours.has(id),
    )!;

    const called = (await (await call(started.id, shared, guest.token)).json()) as {
      seq: number;
    };

    // The host never touched it, and is still told which row marked it and who
    // made that row — which is what decides whether their phone may offer to take
    // it back, and what it would name if it did.
    expect(await marksOf(host.code, host.token)).toEqual([
      { squareId: shared, seq: called.seq, actorPlayerId: guest.player.id },
    ]);
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

    const stayed = await markedIdsOf(host.code, guest.token);
    const returned = await markedIdsOf(host.code, guest.token);

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

/**
 * D8's corrections. All three of the interactions the design describes — the
 * ten-second undo toast, the confirmation dialog after it, and the host's
 * unrestricted retract — arrive at this one route; what told them apart was
 * friction on the client. What the server enforces is the rule underneath: your
 * own call, or anyone's if you are the host.
 */
describe.skipIf(noTestDatabase)('retracting a call', () => {
  beforeEach(truncate);

  /** A room mid-game with one square called by the guest, on a card both hold. */
  async function calledGame() {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;

    const mine = started.card!.map((square) => square.id);
    const yours = new Set(theirs.card!.map((square) => square.id));
    const shared = mine.find((id) => yours.has(id))!;

    const res = await call(started.id, shared, guest.token);
    expect(res.status).toBe(201);
    const called = (await res.json()) as { seq: number };

    return { host, guest, gameId: started.id, shared, seq: called.seq };
  }

  async function eventKinds(code: string): Promise<string[]> {
    const rows = await db.execute<{ kind: string }>(
      sql`SELECT kind FROM bingo.room_events WHERE room_code = ${code} ORDER BY seq`,
    );

    return [...rows].map((row) => row.kind);
  }

  it('appends a RETRACT naming the call, and unmarks it on every card', async () => {
    const { host, guest, gameId, shared, seq } = await calledGame();

    expect(await markedIdsOf(host.code, host.token)).toEqual([shared]);

    const res = await retract(gameId, seq, guest.token);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      targetSeq: seq,
      squareId: shared,
      actorPlayerId: guest.player.id,
      appended: true,
    });

    // The caller's own card and a card belonging to someone who never touched it.
    expect(await markedIdsOf(host.code, guest.token)).toEqual([]);
    expect(await markedIdsOf(host.code, host.token)).toEqual([]);
  });

  /**
   * The reason D8 is append-only rather than a delete. A device replaying from
   * `Last-Event-ID` before the CALL is handed both rows and has to land where a
   * device that watched it happen live already is; a deleted CALL would leave the
   * replaying device marked forever, with nothing in the log to say otherwise.
   */
  it('never deletes or updates the call it supersedes', async () => {
    const { host, guest, gameId, shared, seq } = await calledGame();

    await retract(gameId, seq, guest.token);

    expect(await eventKinds(host.code)).toEqual([
      'PLAYER_JOINED',
      'PLAYER_JOINED',
      'GAME_STARTED',
      'CALL',
      'RETRACT',
    ]);
    // The CALL row is still exactly what it was, square id and all.
    expect(await callRows(host.code)).toEqual([{ square_id: shared }]);

    const rows = await db.execute<{ target_seq: string; actor_player_id: string }>(
      sql`SELECT target_seq, actor_player_id FROM bingo.room_events
          WHERE room_code = ${host.code} AND kind = 'RETRACT'`,
    );
    const [retraction] = [...rows];
    expect(Number(retraction!.target_seq)).toBe(seq);
    expect(retraction!.actor_player_id).toBe(guest.player.id);
  });

  /**
   * The criterion that a replaying client ends up where a live one is. Both read
   * the same derived answer, because the derivation is the only answer there is —
   * so this asserts what the whole append-only model was chosen to buy.
   */
  it('leaves a device replaying the whole log where a device that watched it is', async () => {
    const { host, gameId, seq } = await calledGame();

    await retract(gameId, seq, host.token);

    // Every row a device replaying from before the CALL would be handed.
    const rows = await db.execute<{ kind: string; square_id: string | null; target_seq: string | null }>(
      sql`SELECT kind, square_id, target_seq FROM bingo.room_events
          WHERE room_code = ${host.code} ORDER BY seq`,
    );
    const replayed = [...rows];
    expect(replayed.some((row) => row.kind === 'CALL')).toBe(true);
    expect(replayed.some((row) => row.kind === 'RETRACT')).toBe(true);

    // And what it derives from them is what the device that never left shows.
    expect(await markedIdsOf(host.code, host.token)).toEqual([]);
  });

  it('lets the host take back a call they did not make', async () => {
    const { host, gameId, seq } = await calledGame();

    expect((await retract(gameId, seq, host.token)).status).toBe(201);
    expect(await markedIdsOf(host.code, host.token)).toEqual([]);
  });

  /**
   * Correction scope, the mirror of D7's call scope. A player may fix their own
   * mis-tap; taking away someone else's call is the host's to do, or it would be
   * an argument rather than a correction.
   */
  it('refuses a player taking back someone else`s call, and writes nothing', async () => {
    const host = await createRoom('Host');
    const guest = await join(host.code, 'Guest');
    const other = await join(host.code, 'Other');
    const started = (await (await start(host.code, host.token)).json()) as GameView;
    const theirs = (await (await readGame(host.code, guest.token)).json()) as GameView;

    const yours = new Set(theirs.card!.map((square) => square.id));
    const shared = started.card!.map((square) => square.id).find((id) =>
      yours.has(id),
    )!;

    const called = (await (await call(started.id, shared, guest.token)).json()) as {
      seq: number;
    };

    expect((await retract(started.id, called.seq, other.token)).status).toBe(403);

    expect(await eventKinds(host.code)).toEqual([
      'PLAYER_JOINED',
      'PLAYER_JOINED',
      'PLAYER_JOINED',
      'GAME_STARTED',
      'CALL',
    ]);
    expect(await markedIdsOf(host.code, guest.token)).toEqual([shared]);
  });

  it('is idempotent: a call already taken back is not taken back twice', async () => {
    const { host, guest, gameId, seq } = await calledGame();

    expect((await retract(gameId, seq, guest.token)).status).toBe(201);

    const again = await retract(gameId, seq, host.token);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ targetSeq: seq, appended: false });

    expect(
      (await eventKinds(host.code)).filter((kind) => kind === 'RETRACT'),
    ).toHaveLength(1);
  });

  it('404s a seq that is not a call in this game', async () => {
    const { host, gameId, seq } = await calledGame();

    // The GAME_STARTED row is in the log, but it is not a call.
    expect((await retract(gameId, 1, host.token)).status).toBe(404);
    expect((await retract(gameId, seq + 1000, host.token)).status).toBe(404);

    expect(
      (await eventKinds(host.code)).filter((kind) => kind === 'RETRACT'),
    ).toHaveLength(0);
  });

  it('needs a player token, and a game that exists', async () => {
    const { gameId, seq } = await calledGame();

    expect((await retract(gameId, seq)).status).toBe(401);
    expect((await retract(gameId, seq, 'not-a-token')).status).toBe(401);
    expect(
      (await retract('00000000-0000-4000-8000-000000000000', seq, 'x')).status,
    ).toBe(404);
    expect((await retract('nonsense', seq, 'x')).status).toBe(404);
  });

  it('400s a request with no usable seq', async () => {
    const { host, gameId } = await calledGame();

    for (const body of [{}, { seq: 'nine' }, { seq: 0 }, { seq: -1 }]) {
      const res = await app.request(`/games/${gameId}/retract`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${host.token}`,
        },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(400);
    }
  });

  /**
   * A correction has to leave the square callable again, or the undo is a trap:
   * the event happened, the room saw it, and the one square that names it can
   * never be marked. Liveness is a property of a second row, which is why the
   * arbiter is the game-row lock and not a unique index (ADR-0004).
   */
  describe('re-calling a square that was taken back', () => {
    /** Every row the log holds for one square, in log order. */
    async function squareRows(code: string, squareId: string) {
      const rows = await db.execute<{
        seq: string;
        kind: string;
        actor_player_id: string;
        square_id: string | null;
        target_seq: string | null;
      }>(
        sql`SELECT seq, kind, actor_player_id, square_id, target_seq
            FROM bingo.room_events AS e
            WHERE e.room_code = ${code}
              AND (e.square_id = ${squareId}
                   OR e.target_seq IN (SELECT c.seq FROM bingo.room_events AS c
                                       WHERE c.room_code = ${code}
                                         AND c.kind = 'CALL'
                                         AND c.square_id = ${squareId}))
            ORDER BY seq`,
      );

      return [...rows];
    }

    /**
     * What a device replaying from before the first CALL derives, computed the
     * way the server does: a CALL counts unless some RETRACT names its seq.
     */
    function replayedMarks(
      rows: readonly { seq: string; kind: string; square_id: string | null; target_seq: string | null }[],
    ): string[] {
      const retracted = new Set(
        rows.filter((row) => row.kind === 'RETRACT').map((row) => row.target_seq),
      );

      return rows
        .filter((row) => row.kind === 'CALL' && !retracted.has(row.seq))
        .map((row) => row.square_id as string);
    }

    it('marks the square again, on a new row, for everyone holding it', async () => {
      const { host, guest, gameId, shared, seq } = await calledGame();
      expect((await retract(gameId, seq, guest.token)).status).toBe(201);
      expect(await markedIdsOf(host.code, host.token)).toEqual([]);

      const res = await call(gameId, shared, host.token);
      expect(res.status).toBe(201);

      const recalled = (await res.json()) as Mark & { appended: boolean };
      expect(recalled).toMatchObject({
        squareId: shared,
        actorPlayerId: host.player.id,
        appended: true,
      });
      expect(recalled.seq).toBeGreaterThan(seq);

      expect(await markedIdsOf(host.code, host.token)).toEqual([shared]);
      expect(await markedIdsOf(host.code, guest.token)).toEqual([shared]);
    });

    /**
     * The correction and the call it undid both stay. A re-call is a third row,
     * not an edit of the first — the same reason D8 appends rather than deletes.
     */
    it('destroys nothing: the call, its retraction and the re-call all stand', async () => {
      const { host, guest, gameId, shared, seq } = await calledGame();
      await retract(gameId, seq, guest.token);
      await call(gameId, shared, host.token);

      expect(await eventKinds(host.code)).toEqual([
        'PLAYER_JOINED',
        'PLAYER_JOINED',
        'GAME_STARTED',
        'CALL',
        'RETRACT',
        'CALL',
      ]);

      const rows = await squareRows(host.code, shared);
      expect(rows.map((row) => row.kind)).toEqual(['CALL', 'RETRACT', 'CALL']);

      // The superseded call is byte-for-byte what it was: the retraction still
      // names a seq that exists, and it is still the guest's call.
      const [original, retraction] = rows;
      expect(Number(original!.seq)).toBe(seq);
      expect(original!.actor_player_id).toBe(guest.player.id);
      expect(original!.square_id).toBe(shared);
      expect(Number(retraction!.target_seq)).toBe(seq);
    });

    it('leaves a device replaying the whole log marked, where a live one is', async () => {
      const { host, gameId, shared, seq } = await calledGame();
      await retract(gameId, seq, host.token);
      await call(gameId, shared, host.token);

      // No RETRACT names the second CALL, so replay derives it as marked — and
      // that is what the device that never left is showing.
      expect(replayedMarks(await squareRows(host.code, shared))).toEqual([shared]);
      expect(await markedIdsOf(host.code, host.token)).toEqual([shared]);
    });

    /** Call, undo, call, undo: the square converges on unmarked, not on stuck. */
    it('converges when the re-called square is taken back again', async () => {
      const { host, guest, gameId, shared, seq } = await calledGame();
      await retract(gameId, seq, guest.token);

      const again = (await (await call(gameId, shared, host.token)).json()) as {
        seq: number;
      };
      expect((await retract(gameId, again.seq, host.token)).status).toBe(201);

      expect(await markedIdsOf(host.code, host.token)).toEqual([]);
      expect(await markedIdsOf(host.code, guest.token)).toEqual([]);

      const rows = await squareRows(host.code, shared);
      expect(rows.map((row) => row.kind)).toEqual([
        'CALL',
        'RETRACT',
        'CALL',
        'RETRACT',
      ]);
      expect(replayedMarks(rows)).toEqual([]);
    });

    /**
     * Retracting the original call again, once the square has been re-called, is
     * still idempotent about *that call* — and says nothing about the square,
     * which a newer CALL now marks. A device holding a stale undo can therefore
     * be told `appended: false` for a square that is marked, so this pins the two
     * questions apart rather than leaving the contract to be guessed at.
     */
    it('stays idempotent for the old call without claiming the square is clear', async () => {
      const { host, guest, gameId, shared, seq } = await calledGame();
      await retract(gameId, seq, guest.token);
      const again = (await (await call(gameId, shared, host.token)).json()) as {
        seq: number;
      };

      const stale = await retract(gameId, seq, guest.token);
      expect(stale.status).toBe(200);
      expect(await stale.json()).toMatchObject({
        targetSeq: seq,
        squareId: shared,
        appended: false,
      });

      // No second RETRACT for the original call, and the square is still marked
      // by the newer one — the reply was about the call, not about the square.
      expect(
        (await eventKinds(host.code)).filter((kind) => kind === 'RETRACT'),
      ).toHaveLength(1);
      expect(await marksOf(host.code, host.token)).toEqual([
        { squareId: shared, seq: again.seq, actorPlayerId: host.player.id },
      ]);
    });

    /**
     * The regression the dropped index used to prevent, and the reason the
     * live-call read runs on `tx` *after* the `FOR UPDATE` lock rather than on
     * `db` before it. Two phones re-spotting the same retracted event still owe
     * the room exactly one new row.
     */
    it('turns two simultaneous re-calls into one new row, with neither caller erroring', async () => {
      const { host, guest, gameId, shared, seq } = await calledGame();
      expect((await retract(gameId, seq, guest.token)).status).toBe(201);

      const [mine, yours] = await Promise.all([
        call(gameId, shared, host.token),
        call(gameId, shared, guest.token),
      ]);

      expect(mine.ok).toBe(true);
      expect(yours.ok).toBe(true);
      expect([mine.status, yours.status].sort()).toEqual([200, 201]);

      // The retracted call, still in the log, plus exactly one new one.
      expect(await callRows(host.code)).toEqual([
        { square_id: shared },
        { square_id: shared },
      ]);

      const [one, two] = [
        (await mine.json()) as { seq: number; actorPlayerId: string },
        (await yours.json()) as { seq: number; actorPlayerId: string },
      ];
      expect(one.seq).toBe(two.seq);
      expect(one.actorPlayerId).toBe(two.actorPlayerId);
      // Neither was handed the dead row.
      expect(one.seq).toBeGreaterThan(seq);

      expect(await markedIdsOf(host.code, host.token)).toEqual([shared]);
    });
  });
});
