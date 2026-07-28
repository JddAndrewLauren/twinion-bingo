import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { roomEvents, rooms } from '../db/schema.js';

/** One row of the append-only log, as it goes over the wire. */
export type RoomEvent = {
  seq: number;
  kind: string;
  at: string;
  gameId: string | null;
  actorPlayerId: string;
  squareId: string | null;
  targetSeq: number | null;
  prizeKind: string | null;
};

/**
 * How long a row must look old before the stream will send it.
 *
 * `seq` comes from a sequence, so it is handed out when a transaction inserts
 * and not when it commits: a row with a lower `seq` can become visible after a
 * row with a higher one. A cursor that advanced on sight would step over the
 * slower writer and lose its row for good, so rows are held back to give the
 * slower writer time to commit first.
 *
 * Be precise about how much time that actually is. The filter compares `at`,
 * and `at` is `defaultNow()` — `now()`, which in Postgres is the *transaction
 * start* time, not the insert's. The append happens inside a multi-statement
 * transaction (`store.ts`), so a row becomes eligible at `tx_start + 250ms`,
 * and the grace this really buys is 250ms *minus* whatever that transaction
 * spent before its insert. A writer that stalls longer than the remainder can
 * still be stepped over. So this makes gaps rare, not impossible — it is a
 * mitigation, not the proof that "no gaps" holds.
 *
 * Making it a guarantee needs the timestamp to be the insert's, i.e. a
 * `clock_timestamp()` default on `room_events.at` (a schema change, out of
 * scope here), or a cursor that does not advance past an unfilled gap. That is
 * #8's problem, and #8 should not inherit the stronger claim.
 */
const SETTLE_MS = 250;

/** A cap so a two-hour room's backlog arrives in pages rather than one write. */
const PAGE_SIZE = 500;

export async function roomExists(db: Db, code: string): Promise<boolean> {
  const [room] = await db
    .select({ code: rooms.code })
    .from(rooms)
    .where(eq(rooms.code, code));

  return room !== undefined;
}

/**
 * The resume query, and the only query the stream runs. Both `room_code` and
 * `seq` are in one index, so replaying a room's tail never reads another room's
 * rows — see the EXPLAIN assertion in `stream.db.test.ts`.
 */
export function eventsAfterQuery(db: Db, code: string, afterSeq: number) {
  return db
    .select({
      seq: roomEvents.seq,
      kind: roomEvents.kind,
      at: roomEvents.at,
      gameId: roomEvents.gameId,
      actorPlayerId: roomEvents.actorPlayerId,
      squareId: roomEvents.squareId,
      targetSeq: roomEvents.targetSeq,
      prizeKind: roomEvents.prizeKind,
    })
    .from(roomEvents)
    .where(
      and(
        eq(roomEvents.roomCode, code),
        gt(roomEvents.seq, BigInt(afterSeq)),
        lt(roomEvents.at, sql`now() - ${`${SETTLE_MS} milliseconds`}::interval`),
      ),
    )
    .orderBy(asc(roomEvents.seq))
    .limit(PAGE_SIZE);
}

export async function readEventsAfter(
  db: Db,
  code: string,
  afterSeq: number,
): Promise<RoomEvent[]> {
  const rows = await eventsAfterQuery(db, code, afterSeq);

  return rows.map((row) => ({
    seq: Number(row.seq),
    kind: row.kind,
    at: row.at.toISOString(),
    gameId: row.gameId,
    actorPlayerId: row.actorPlayerId,
    squareId: row.squareId,
    targetSeq: row.targetSeq === null ? null : Number(row.targetSeq),
    prizeKind: row.prizeKind,
  }));
}

/**
 * `Last-Event-ID` is whatever the client last saw, and a client that saw
 * nothing sends nothing — so anything unreadable means replay the room from the
 * start, which is also exactly right for a first connection.
 */
export function parseLastEventId(header: string | undefined): number {
  const seq = Number(header);

  return Number.isSafeInteger(seq) && seq > 0 ? seq : 0;
}
