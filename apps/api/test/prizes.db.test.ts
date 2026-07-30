import { readFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import type { Pool } from '@twinion-bingo/theme';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { CARD_SQUARES } from '../src/games/deck.js';
import { LINES } from '../src/games/lines.js';
import { defaultThemeId } from '../src/games/pools.js';
import { noTestDatabase, testDatabaseUrl } from './support/test-database.js';

const db = createDb(testDatabaseUrl ?? 'postgres://unused');

/** The committed F1 pool cannot supply D6's deck until #16; this one can. */
const fixture = JSON.parse(
  readFileSync(joinPath(import.meta.dirname, 'fixtures/pool-180.json'), 'utf8'),
) as Pool;

const app = createApp({
  allowedOrigins: ['http://localhost:3000'],
  db,
  pools: new Map<string, Pool>([[defaultThemeId(), fixture]]),
});

type Joined = {
  code: string;
  token: string;
  player: { id: string; name: string; joinSeq: number };
};

type GameView = {
  id: string;
  state: string;
  card: { id: string; label: string }[] | null;
  /** #9's shape: a mark carries the CALL row that made it, not just the id. */
  marks: { squareId: string; seq: number; actorPlayerId: string }[];
  inheritedMarks: string[];
  prizes: { seq: number; prizeKind: string; playerId: string; name: string }[];
  standings: { playerId: string; name: string; marks: number }[];
  timeline: { seq: number; squareId: string; elapsed: string; name: string }[];
  streamedThroughSeq: number;
};

async function post(url: string, token?: string, body?: unknown) {
  return app.request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createRoom(name: string): Promise<Joined> {
  const res = await post('/rooms', undefined, { name });
  expect(res.status).toBe(201);

  return (await res.json()) as Joined;
}

async function join(code: string, name: string): Promise<Joined> {
  const res = await post(`/rooms/${code}/join`, undefined, { name });
  expect(res.status).toBe(201);

  return (await res.json()) as Joined;
}

async function view(code: string, token: string): Promise<GameView> {
  const res = await app.request(`/rooms/${code}/game`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);

  return (await res.json()) as GameView;
}

async function call(gameId: string, squareId: string, token: string) {
  return post(`/games/${gameId}/call`, token, { square_id: squareId });
}

async function retract(gameId: string, seq: number, token: string) {
  return post(`/games/${gameId}/retract`, token, { seq });
}

/** Every PRIZE the log holds, in log order — the only place a prize lives. */
async function prizeRows(code: string) {
  const rows = await db.execute<{ prize_kind: string; actor_player_id: string }>(
    sql`SELECT prize_kind, actor_player_id FROM bingo.room_events
        WHERE room_code = ${code} AND kind = 'PRIZE' ORDER BY seq`,
  );

  return [...rows];
}

/** The 40 square ids the room is playing, in the order the draw put them. */
async function deckOf(gameId: string): Promise<string[]> {
  const rows = await db.execute<{ deck: string[] }>(
    sql`SELECT deck FROM bingo.games WHERE id = ${gameId}`,
  );

  return [...rows][0]!.deck;
}

const truncate = async () => {
  await db.execute(
    sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`,
  );
};

/**
 * Calls the squares of one of the player's lines, host-first. Returns the ids so
 * a test can say which squares the room now holds in common.
 */
async function callLine(
  gameId: string,
  card: { id: string }[],
  token: string,
  line: readonly number[],
): Promise<string[]> {
  const ids = line.map((index) => card[index]!.id);

  for (const id of ids) {
    const res = await call(gameId, id, token);
    expect(res.ok).toBe(true);
  }

  return ids;
}

describe.skipIf(noTestDatabase)('the win ladder', () => {
  beforeEach(truncate);

  async function soloGame() {
    const host = await createRoom('Ash');
    const started = (await (
      await post(`/rooms/${host.code}/games`, host.token)
    ).json()) as GameView;

    return { host, gameId: started.id, card: started.card! };
  }

  /**
   * D5's ladder in order. A prize is a `room_events` row and nothing else, so
   * this reads the log rather than a table — there is no table to read.
   */
  it('appends LINE, then TWO_LINES, then FULL_HOUSE, in that order', async () => {
    const { host, gameId, card } = await soloGame();

    await callLine(gameId, card, host.token, LINES[0]!);
    expect((await prizeRows(host.code)).map((row) => row.prize_kind)).toEqual([
      'LINE',
    ]);

    // A column crossing the row already called: the second line.
    await callLine(gameId, card, host.token, LINES[5]!);
    expect((await prizeRows(host.code)).map((row) => row.prize_kind)).toEqual([
      'LINE',
      'TWO_LINES',
    ]);

    for (const square of card) await call(gameId, square.id, host.token);

    expect((await prizeRows(host.code)).map((row) => row.prize_kind)).toEqual([
      'LINE',
      'TWO_LINES',
      'FULL_HOUSE',
    ]);
  });

  it('records no prize twice, however many more lines land', async () => {
    const { host, gameId, card } = await soloGame();

    await callLine(gameId, card, host.token, LINES[0]!);
    await callLine(gameId, card, host.token, LINES[1]!);
    await callLine(gameId, card, host.token, LINES[2]!);

    expect((await prizeRows(host.code)).map((row) => row.prize_kind)).toEqual([
      'LINE',
      'TWO_LINES',
    ]);
  });

  /**
   * Co-winners are allowed on simultaneous completion (D5). Two players holding
   * the same 24 squares complete their first line on the same call, and both are
   * recorded rather than one of them losing a tie-break invented in code.
   */
  it('records both players when one call completes a line for each', async () => {
    const host = await createRoom('Ash');
    const guest = await join(host.code, 'Bea');
    const started = (await (
      await post(`/rooms/${host.code}/games`, host.token)
    ).json()) as GameView;
    const theirs = await view(host.code, guest.token);

    const mine = started.card!.map((square) => square.id);
    const yours = theirs.card!.map((square) => square.id);
    const shared = mine.filter((id) => yours.includes(id));

    // Call shared squares until both cards are one square short of a full house
    // apart from the same last square, which is the simultaneous completion.
    const last = shared.at(-1)!;
    for (const id of [...mine, ...yours]) {
      if (id === last) continue;
      const res = await call(
        started.id,
        id,
        mine.includes(id) ? host.token : guest.token,
      );
      expect(res.ok).toBe(true);
    }

    // Nothing has finished either card yet, and the ladder's rungs so far were
    // won singly; the last shared square completes both full houses at once.
    const before = await prizeRows(host.code);
    expect(before.some((row) => row.prize_kind === 'FULL_HOUSE')).toBe(false);

    expect((await call(started.id, last, host.token)).ok).toBe(true);

    const fullHouse = (await prizeRows(host.code)).filter(
      (row) => row.prize_kind === 'FULL_HOUSE',
    );
    expect(fullHouse).toHaveLength(2);
    expect(new Set(fullHouse.map((row) => row.actor_player_id))).toEqual(
      new Set([host.player.id, guest.player.id]),
    );
  });

  it('closes the game on the full house, and then refuses a call', async () => {
    const { host, gameId, card } = await soloGame();

    for (const square of card.slice(0, CARD_SQUARES - 1)) {
      expect((await call(gameId, square.id, host.token)).ok).toBe(true);
    }

    const last = card.at(-1)!.id;
    expect((await call(gameId, last, host.token)).status).toBe(201);

    const rows = await db.execute<{ state: string; ended_at: string | null }>(
      sql`SELECT state, ended_at FROM bingo.games WHERE room_code = ${host.code}`,
    );
    const [row] = [...rows];
    expect(row!.state).toBe('done');
    expect(row!.ended_at).not.toBeNull();

    // The seam #8 left open: a finished game does not take calls.
    expect((await call(gameId, last, host.token)).status).toBe(409);
    expect((await view(host.code, host.token)).state).toBe('done');
  });

  /**
   * The other half of that seam, and the one #11 opened rather than inherited.
   * `done` is a one-way door, so a retraction that landed after the full house
   * would leave the log asserting a full house its own calls no longer support,
   * in a game already refusing the calls that could rebuild it. Refused, under
   * the same lock the call takes.
   */
  it('refuses a correction once the full house has closed the game', async () => {
    const { host, gameId, card } = await soloGame();

    const seqs: number[] = [];
    for (const square of card) {
      const res = await call(gameId, square.id, host.token);
      expect(res.ok).toBe(true);
      seqs.push(((await res.json()) as { seq: number }).seq);
    }

    const winning = seqs.at(-1)!;
    expect((await retract(gameId, winning, host.token)).status).toBe(409);

    // Nothing was appended, and the prizes still describe a full house that the
    // log's own calls still support.
    const rows = await db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM bingo.room_events
          WHERE room_code = ${host.code} AND kind = 'RETRACT'`,
    );
    expect([...rows][0]!.count).toBe('0');

    const after = await view(host.code, host.token);
    expect(after.state).toBe('done');
    expect(after.marks).toHaveLength(CARD_SQUARES);
    expect(after.prizes.map((prize) => prize.prizeKind)).toEqual([
      'LINE',
      'TWO_LINES',
      'FULL_HOUSE',
    ]);
  });

  /** A live game still corrects freely — the guard is about `done`, not about D8. */
  it('still allows a correction while the game is live', async () => {
    const { host, gameId, card } = await soloGame();

    const res = await call(gameId, card[0]!.id, host.token);
    const { seq } = (await res.json()) as { seq: number };

    expect((await retract(gameId, seq, host.token)).status).toBe(201);
    expect((await view(host.code, host.token)).marks).toEqual([]);
  });

  /** No `prizes` table — the schema has one place a prize can be (D5). */
  it('keeps no prizes table in the schema', async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'bingo' ORDER BY table_name`,
    );

    const tables = [...rows].map((row) => row.table_name);
    expect(tables).not.toContain('prizes');
    expect(tables).toContain('room_events');
  });
});

describe.skipIf(noTestDatabase)('standings and the timeline', () => {
  beforeEach(truncate);

  it('rank every player by raw mark count, read out of the log', async () => {
    const host = await createRoom('Ash');
    const guest = await join(host.code, 'Bea');
    const started = (await (
      await post(`/rooms/${host.code}/games`, host.token)
    ).json()) as GameView;
    const theirs = await view(host.code, guest.token);

    const mine = started.card!.map((square) => square.id);
    const yours = new Set(theirs.card!.map((square) => square.id));
    const onlyMine = mine.filter((id) => !yours.has(id));
    expect(onlyMine.length).toBeGreaterThan(0);

    for (const id of onlyMine) {
      expect((await call(started.id, id, host.token)).ok).toBe(true);
    }

    const standings = (await view(host.code, host.token)).standings;
    expect(standings).toEqual([
      { playerId: host.player.id, name: 'Ash', marks: onlyMine.length },
      { playerId: guest.player.id, name: 'Bea', marks: 0 },
    ]);
  });

  it('lists calls with an elapsed stamp and the crediting player', async () => {
    const host = await createRoom('Ash');
    const started = (await (
      await post(`/rooms/${host.code}/games`, host.token)
    ).json()) as GameView;

    const [first, second] = [started.card![0]!.id, started.card![1]!.id];
    await call(started.id, first, host.token);
    await call(started.id, second, host.token);

    const timeline = (await view(host.code, host.token)).timeline;

    expect(timeline.map((entry) => entry.squareId)).toEqual([first, second]);
    expect(timeline.every((entry) => entry.name === 'Ash')).toBe(true);
    expect(timeline.every((entry) => /^\+\d{2,}:\d{2}$/.test(entry.elapsed))).toBe(
      true,
    );
  });

  /**
   * A retracted call did not happen, so it leaves the timeline and the standings
   * — both are recomputed from the log on read, which is the same property that
   * makes them survive a `seq` gap or a dropped frame.
   */
  it('drop a call a RETRACT supersedes', async () => {
    const host = await createRoom('Ash');
    const started = (await (
      await post(`/rooms/${host.code}/games`, host.token)
    ).json()) as GameView;

    const square = started.card![0]!.id;
    const { seq } = (await (
      await call(started.id, square, host.token)
    ).json()) as { seq: number };

    // #9 owns the retract route; the derivation has to be right before it lands.
    await db.execute(
      sql`INSERT INTO bingo.room_events (room_code, game_id, actor_player_id, kind, target_seq)
          VALUES (${host.code}, ${started.id}, ${host.player.id}, 'RETRACT', ${seq})`,
    );

    const after = await view(host.code, host.token);
    expect(after.timeline).toEqual([]);
    expect(after.standings[0]!.marks).toBe(0);
  });

  /**
   * The disconnect criterion. There is no catch-up path to get wrong: two reads
   * of the same log give the same prizes, standings and timeline, so a phone that
   * slept through a stint lands exactly where one that never dropped is.
   */
  it('read the same on a device that has just arrived as on one that never left', async () => {
    const host = await createRoom('Ash');
    const started = (await (
      await post(`/rooms/${host.code}/games`, host.token)
    ).json()) as GameView;

    await callLine(started.id, started.card!, host.token, LINES[0]!);

    const stayed = await view(host.code, host.token);
    const returned = await view(host.code, host.token);

    expect(returned.prizes).toEqual(stayed.prizes);
    expect(returned.standings).toEqual(stayed.standings);
    expect(returned.timeline).toEqual(stayed.timeline);
    expect(stayed.prizes.map((prize) => prize.prizeKind)).toEqual(['LINE']);
  });
});

/**
 * The greyed-line rule, which is what makes late joining real work: the card is
 * correct for free, and the win gate is not.
 */
describe.skipIf(noTestDatabase)('joining mid-game', () => {
  beforeEach(truncate);

  /**
   * A room mid-stint: the host has taken a line off their own card, and has
   * called the rest of the deck's traffic besides — every square the deck holds
   * that the host's card does not.
   *
   * The second half is what makes the newcomer's inheritance a fact rather than
   * a coin toss. A card is 24 of the deck's 40, so no card can miss more than 16
   * called squares; calling those 16 alongside the line puts at least five of
   * the 21 on whatever card the newcomer is dealt, however the dealer picks.
   * They are squares the host does not hold, so they add calls to the log
   * without adding the host a second line.
   */
  async function roomWithALineAlreadyCalled() {
    const host = await createRoom('Ash');
    const started = (await (
      await post(`/rooms/${host.code}/games`, host.token)
    ).json()) as GameView;

    const called = await callLine(
      started.id,
      started.card!,
      host.token,
      LINES[0]!,
    );

    const held = new Set(started.card!.map((square) => square.id));
    for (const id of await deckOf(started.id)) {
      if (held.has(id)) continue;

      expect((await call(started.id, id, host.token)).ok).toBe(true);
      called.push(id);
    }

    return { host, gameId: started.id, called };
  }

  it('deals the newcomer a card from the same deck, already marked', async () => {
    const { host, gameId, called } = await roomWithALineAlreadyCalled();
    const late = await join(host.code, 'Cass');

    const theirs = await view(host.code, late.token);
    expect(theirs.id).toBe(gameId);
    expect(theirs.card).toHaveLength(CARD_SQUARES);

    const deck = new Set(await deckOf(gameId));
    expect(theirs.card!.every((square) => deck.has(square.id))).toBe(true);

    // The marks arrive for free: the card's ids intersected with the live calls,
    // the same derivation everyone else's card runs.
    const held = theirs.card!.map((square) => square.id);
    expect(theirs.marks.map((mark) => mark.squareId)).toEqual(
      held.filter((id) => called.includes(id)),
    );
    expect(theirs.marks.length).toBeGreaterThan(0);
  });

  /** Nobody walks in at lap 50 and claims the line the room spent an hour on. */
  it('counts nothing called before the newcomer joined towards a win', async () => {
    const { host, gameId } = await roomWithALineAlreadyCalled();
    const late = await join(host.code, 'Cass');

    const theirs = await view(host.code, late.token);

    // Everything on their card that is marked is inherited, so it greys and
    // claims nothing — no line of theirs can be complete out of these.
    expect(theirs.inheritedMarks).toEqual(
      theirs.marks.map((mark) => mark.squareId),
    );

    // And the ladder agrees: only the host, who was here, has won anything.
    const prizes = await prizeRows(host.code);
    expect(prizes.map((row) => row.actor_player_id)).toEqual([host.player.id]);

    // A call the newcomer *is* here for is theirs to claim with.
    const marked = new Set(theirs.marks.map((mark) => mark.squareId));
    const fresh = theirs.card!.find((square) => !marked.has(square.id))!;
    expect((await call(gameId, fresh.id, late.token)).ok).toBe(true);

    const after = await view(host.code, late.token);
    expect(after.marks.map((mark) => mark.squareId)).toContain(fresh.id);
    expect(after.inheritedMarks).not.toContain(fresh.id);
  });

  /**
   * Standings are raw mark count (D5), which is deliberately not the gated count
   * the ladder uses — the gate stops a latecomer claiming a line, not showing up
   * in the table.
   */
  it('counts an inherited mark in the standings all the same', async () => {
    const { host } = await roomWithALineAlreadyCalled();
    const late = await join(host.code, 'Cass');

    const theirs = await view(host.code, late.token);
    const cass = theirs.standings.find(
      (standing) => standing.playerId === late.player.id,
    );

    expect(cass?.marks).toBe(theirs.marks.length);
  });

  it('leaves a player who was here when it started nothing inherited', async () => {
    const { host } = await roomWithALineAlreadyCalled();

    expect((await view(host.code, host.token)).inheritedMarks).toEqual([]);
  });
});
