import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import {
  SETTLE_MS,
  eventsAfterQuery,
  readEventsAfter,
} from '../src/rooms/events.js';
import { noTestDatabase, testDatabaseUrl } from './support/test-database.js';

/** Runs against the ephemeral local Postgres the README's two commands set up. */
const db = createDb(testDatabaseUrl ?? 'postgres://unused');

/**
 * The real periods are a second and twenty-five, which no test should sit
 * through. Everything else about the stream is the production path.
 */
const app = createApp({
  allowedOrigins: ['http://localhost:3000'],
  db,
  streamTimings: { pollMs: 20, pingMs: 150 },
});

type Joined = {
  code: string;
  token: string;
  player: { id: string; name: string; joinSeq: number };
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

/**
 * Opens the stream, reads until `until` is satisfied (or the deadline passes),
 * then hangs up the way a browser does — cancelling the body, which is what the
 * route watches for. `meanwhile` runs with the stream already open, so a join
 * can land on a connection rather than before it.
 */
async function readStream(
  code: string,
  options: {
    until: (raw: string) => boolean;
    lastEventId?: string;
    meanwhile?: () => Promise<unknown>;
    timeoutMs?: number;
  },
): Promise<string> {
  const res = await app.request(`/rooms/${code}/stream`, {
    headers:
      options.lastEventId === undefined
        ? {}
        : { 'last-event-id': options.lastEventId },
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  expect(res.body).not.toBeNull();

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let raw = '';

  let expire: () => void = () => {};
  const expired = new Promise<'expired'>((resolve) => {
    const timer = setTimeout(() => resolve('expired'), options.timeoutMs ?? 3000);
    expire = () => clearTimeout(timer);
  });

  try {
    await options.meanwhile?.();

    while (!options.until(raw)) {
      const next = await Promise.race([reader.read(), expired]);
      if (next === 'expired' || next.done) break;
      raw += decoder.decode(next.value, { stream: true });
    }
  } finally {
    expire();
    await reader.cancel();
  }

  return raw;
}

/** The `id:` line of every frame — the `room_events.seq` the client would resume from. */
function eventIds(raw: string): number[] {
  return [...raw.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
}

function eventKinds(raw: string): string[] {
  return [...raw.matchAll(/^data: (.+)$/gm)].map(
    (match) => (JSON.parse(match[1]!) as { kind: string }).kind,
  );
}

function countedAtLeast(howMany: number): (raw: string) => boolean {
  return (raw) => eventIds(raw).length >= howMany;
}

async function logSeqs(code: string): Promise<number[]> {
  const rows = await db.execute<{ seq: string }>(
    sql`SELECT seq FROM bingo.room_events WHERE room_code = ${code} ORDER BY seq`,
  );

  return [...rows].map((row) => Number(row.seq));
}

const truncate = async () => {
  await db.execute(
    sql`TRUNCATE bingo.room_events, bingo.cards, bingo.games, bingo.players, bingo.rooms CASCADE`,
  );
};

describe.skipIf(noTestDatabase)('the room stream', () => {
  beforeEach(truncate);

  it('streams the log as SSE with the sequence as the event id', async () => {
    const host = await createRoom('Host');
    await join(host.code, 'Guest');

    const raw = await readStream(host.code, { until: countedAtLeast(2) });

    expect(eventIds(raw)).toEqual(await logSeqs(host.code));
    expect(eventKinds(raw)).toEqual(['PLAYER_JOINED', 'PLAYER_JOINED']);
  });

  it('delivers a join that happens while the stream is open', async () => {
    const host = await createRoom('Host');

    const raw = await readStream(host.code, {
      until: countedAtLeast(2),
      meanwhile: () => join(host.code, 'Guest'),
    });

    expect(eventKinds(raw)).toEqual(['PLAYER_JOINED', 'PLAYER_JOINED']);
    expect(eventIds(raw)).toEqual(await logSeqs(host.code));
  });

  it('400s a code that is not shaped like one, and 404s an unknown room', async () => {
    const bad = await app.request('/rooms/ABC0/stream');
    expect(bad.status).toBe(400);

    const missing = await app.request('/rooms/ZZZZ/stream');
    expect(missing.status).toBe(404);
  });

  /**
   * `cors.test.ts` proves the stream route sits under the CORS middleware on its
   * 400 path. This is the other half: that the header survives on the response
   * that actually matters, the long-lived 200 `text/event-stream`. Hono's cors
   * middleware sets headers after the handler returns, and `streamSSE` returns
   * while the body is still open — so the two interacting correctly is a real
   * property, not an obvious one.
   */
  it('carries the allow-origin header on the open stream itself', async () => {
    const host = await createRoom('Host');

    const res = await app.request(`/rooms/${host.code}/stream`, {
      headers: { Origin: 'http://localhost:3000' },
    });

    try {
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:3000',
      );
    } finally {
      await res.body?.cancel();
    }
  });

  it('keeps a quiet stream open with a :ping comment', async () => {
    const host = await createRoom('Host');

    const raw = await readStream(host.code, {
      until: (text) => text.includes(': ping'),
    });

    expect(raw).toContain(': ping\n\n');
  });
});

describe.skipIf(noTestDatabase)('resuming with Last-Event-ID', () => {
  beforeEach(truncate);

  it('replays exactly the rows after the id, with no gaps and no duplicates', async () => {
    const host = await createRoom('Host');
    await join(host.code, 'Second');
    await join(host.code, 'Third');

    const all = await logSeqs(host.code);
    expect(all).toHaveLength(3);

    const resumed = await readStream(host.code, {
      lastEventId: String(all[0]),
      until: countedAtLeast(2),
    });

    expect(eventIds(resumed)).toEqual(all.slice(1));
  });

  it('replays the whole room to a client that has seen nothing', async () => {
    const host = await createRoom('Host');
    await join(host.code, 'Guest');

    const raw = await readStream(host.code, { until: countedAtLeast(2) });

    expect(eventIds(raw)).toEqual(await logSeqs(host.code));
  });

  it('ignores an id that is not a sequence at all', async () => {
    const host = await createRoom('Host');

    const raw = await readStream(host.code, {
      lastEventId: 'not-a-number',
      until: countedAtLeast(1),
    });

    expect(eventIds(raw)).toEqual(await logSeqs(host.code));
  });

  it('leaves a client that dropped for a while holding the same rows as one that never did', async () => {
    const host = await createRoom('Host');
    await join(host.code, 'Second');

    // The device that sleeps: it sees the room so far, then goes away.
    const beforeDrop = await readStream(host.code, { until: countedAtLeast(2) });
    const seen = eventIds(beforeDrop);

    // The room carries on without it.
    await join(host.code, 'Third');
    await join(host.code, 'Fourth');

    const afterDrop = await readStream(host.code, {
      lastEventId: String(seen.at(-1)),
      until: countedAtLeast(2),
    });

    // The device that never dropped, for comparison.
    const neverDropped = await readStream(host.code, {
      until: countedAtLeast(4),
    });

    expect([...seen, ...eventIds(afterDrop)]).toEqual(eventIds(neverDropped));
    expect(eventIds(neverDropped)).toEqual(await logSeqs(host.code));
  });
});

/**
 * The settle window is the whole reason the resume query has a third predicate,
 * and #8 builds a first-to-spot race directly on top of it — so what it does and
 * what it does *not* do both need to be pinned. `events.ts` documents the shape
 * honestly; these tests are that document made executable, so that a later
 * change to `SETTLE_MS`, to the predicate, or to `at`'s default cannot quietly
 * strengthen or weaken the claim #8 inherits.
 */
describe.skipIf(noTestDatabase)('the settle window', () => {
  beforeEach(truncate);

  /** Long enough that a row appended at `now()` has certainly become eligible. */
  const pastTheWindow = () =>
    new Promise((resolve) => setTimeout(resolve, SETTLE_MS + 100));

  /**
   * Appends a row with `at` set explicitly, because `at` — not the insert's own
   * wall-clock moment — is what the filter compares. `ageMs` is how old the row
   * claims to be.
   */
  async function appendAged(
    code: string,
    actorPlayerId: string,
    ageMs: number,
    seq?: number,
  ): Promise<number> {
    const columns =
      seq === undefined
        ? sql`(room_code, actor_player_id, kind, at)`
        : sql`(seq, room_code, actor_player_id, kind, at)`;
    const leading = seq === undefined ? sql`` : sql`${seq},`;

    const rows = await db.execute<{ seq: string }>(
      sql`INSERT INTO bingo.room_events ${columns}
          VALUES (${leading} ${code}, ${actorPlayerId}::uuid, 'PLAYER_JOINED',
                  now() - make_interval(secs => ${ageMs} / 1000.0))
          RETURNING seq`,
    );

    return Number([...rows][0]!.seq);
  }

  it('withholds a row until it is older than the settle window', async () => {
    const host = await createRoom('Host');

    // Start from a cursor past the join row, so the only row in play is the one
    // this test appends and the timing under test is only its own.
    await pastTheWindow();
    const cursor = (await logSeqs(host.code)).at(-1)!;
    expect(await readEventsAfter(db, host.code, cursor)).toEqual([]);

    const fresh = await appendAged(host.code, host.player.id, 0);

    expect(await readEventsAfter(db, host.code, cursor)).toEqual([]);

    await pastTheWindow();

    expect(
      (await readEventsAfter(db, host.code, cursor)).map((event) => event.seq),
    ).toEqual([fresh]);
  });

  /**
   * The filter compares `at` and nothing else — not the moment the row landed.
   * A row that arrives already claiming to be older than the window therefore
   * gets no grace at all.
   */
  it('measures the window from `at`, not from when the row was inserted', async () => {
    const host = await createRoom('Host');

    await pastTheWindow();
    const cursor = (await logSeqs(host.code)).at(-1)!;

    const backdated = await appendAged(
      host.code,
      host.player.id,
      SETTLE_MS + 50,
    );

    // No wait: the row is eligible the instant it lands.
    expect(
      (await readEventsAfter(db, host.code, cursor)).map((event) => event.seq),
    ).toEqual([backdated]);
  });

  /**
   * And the consequence: the cursor only moves forward, so a row that becomes
   * visible *after* the cursor passed its `seq` is lost for good. This is the
   * residual the `clock_timestamp()` default does not reach — an out-of-order
   * commit rather than a window that shrank with the transaction — and the gap
   * `events.ts` refuses to claim it closes. Only a cursor that will not advance
   * past an unfilled gap would invert this test.
   */
  it('steps over a lower-seq row that only becomes eligible later', async () => {
    const host = await createRoom('Host');

    await pastTheWindow();
    const cursor = (await logSeqs(host.code)).at(-1)!;

    // The fast writer, two seqs ahead: the slow writer already took `cursor + 1`
    // from the sequence but has not committed yet.
    const ahead = await appendAged(
      host.code,
      host.player.id,
      SETTLE_MS + 50,
      cursor + 2,
    );

    const delivered = await readEventsAfter(db, host.code, cursor);
    expect(delivered.map((event) => event.seq)).toEqual([ahead]);

    // The slow writer finally commits, holding the seq it reserved earlier.
    const skipped = await appendAged(
      host.code,
      host.player.id,
      SETTLE_MS + 50,
      cursor + 1,
    );

    // It is in the log...
    expect(await logSeqs(host.code)).toContain(skipped);
    // ...and the stream will never send it, because the cursor is already past.
    expect(await readEventsAfter(db, host.code, ahead)).toEqual([]);
  });

  /**
   * The mechanism the window's promise rests on. Compared *inside* the
   * transaction, where `now()` is by definition the transaction's start, so the
   * gap between the two clocks needs no timestamp parsing to read.
   */
  it('stamps `at` at the insert, not at its transaction’s start', async () => {
    const host = await createRoom('Host');

    const lagMs = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_sleep(${(SETTLE_MS + 100) / 1000}::double precision)`,
      );

      const rows = await tx.execute<{ lag_ms: string }>(
        sql`INSERT INTO bingo.room_events (room_code, actor_player_id, kind)
            VALUES (${host.code}, ${host.player.id}::uuid, 'PLAYER_JOINED')
            RETURNING extract(epoch from (at - now())) * 1000 AS lag_ms`,
      );

      return Number([...rows][0]!.lag_ms);
    });

    expect(lagMs).toBeGreaterThan(SETTLE_MS);
  });

  /**
   * And what that buys on the read path: a row appended by a long transaction
   * gets the whole window, not the remainder of it. On a transaction-start
   * stamp this row is deliverable the instant it commits.
   */
  it('gives a row from a long transaction the full window', async () => {
    const host = await createRoom('Host');

    await pastTheWindow();
    const cursor = (await logSeqs(host.code)).at(-1)!;

    const appended = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_sleep(${(SETTLE_MS + 100) / 1000}::double precision)`,
      );

      const rows = await tx.execute<{ seq: string }>(
        sql`INSERT INTO bingo.room_events (room_code, actor_player_id, kind)
            VALUES (${host.code}, ${host.player.id}::uuid, 'PLAYER_JOINED')
            RETURNING seq`,
      );

      return Number([...rows][0]!.seq);
    });

    expect(await readEventsAfter(db, host.code, cursor)).toEqual([]);

    await pastTheWindow();

    expect(
      (await readEventsAfter(db, host.code, cursor)).map((event) => event.seq),
    ).toEqual([appended]);
  });

  /**
   * The asymmetry, pinned. `at` is stamped with `clock_timestamp()` but the
   * filter compares against `now()`, and that is deliberate: an earlier clock on
   * the read side only withholds a row *longer*, which is the safe direction,
   * and `clock_timestamp()` is volatile — matching the two would perturb the
   * selectivity estimate the EXPLAIN assertion below depends on. Without this,
   * a well-meaning "make both clocks agree" edit has nothing to fail against.
   * `settledHeadSeq` carries the same predicate and must move with this one.
   */
  it('compares against `now()` on the read side', () => {
    const { sql: text } = eventsAfterQuery(db, 'ABCD', 0).toSQL();

    expect(text).toContain('"at" < now() - ');
    expect(text).not.toContain('clock_timestamp');
  });
});

describe.skipIf(noTestDatabase)('the resume query plan', () => {
  beforeEach(truncate);

  /**
   * A room streams for two hours, so the resume query runs on a loop against a
   * log that holds every room's rows. It has to be an index scan on
   * `(room_code, seq)` — reading the whole table once per poll per device would
   * be the one thing that stops working exactly when the race starts.
   */
  it('resumes through the (room_code, seq) index rather than a table scan', async () => {
    // A race day's worth of rooms, all logging into the one table at once, so
    // one room's rows are scattered through the sequence rather than in a block.
    const rooms = [];
    for (let index = 0; index < 6; index += 1) {
      rooms.push(await createRoom(`Host ${index}`));
    }

    const values = sql.join(
      rooms.map((room) => sql`(${room.code}, ${room.player.id})`),
      sql`, `,
    );

    // `at` is backdated past the settle window, so the planner sees the rows
    // the resume query would actually return rather than an empty result.
    await db.execute(
      sql`INSERT INTO bingo.room_events (room_code, actor_player_id, kind, at)
          SELECT room.code, room.player_id::uuid, 'PLAYER_JOINED',
                 now() - make_interval(secs => n)
          FROM generate_series(1, 1000) AS n
          CROSS JOIN (VALUES ${values}) AS room(code, player_id)
          ORDER BY n, room.code`,
    );
    await db.execute(sql`ANALYZE bingo.room_events`);

    const mine = rooms[0]!;

    const explained = await db.execute<Record<string, string>>(
      sql`EXPLAIN ${eventsAfterQuery(db, mine.code, 0).getSQL()}`,
    );

    const plan = [...explained]
      .map((row) => Object.values(row).join(' '))
      .join('\n');

    expect(plan).toContain('room_events_room_code_seq_idx');
    expect(plan).not.toContain('Seq Scan');
  });
});
