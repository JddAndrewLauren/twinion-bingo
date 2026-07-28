import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { eventsAfterQuery } from '../src/rooms/events.js';
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
