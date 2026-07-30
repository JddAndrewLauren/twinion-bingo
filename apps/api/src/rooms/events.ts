import { and, asc, eq, gt, lt, max, sql } from 'drizzle-orm';
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
 * `at` is `clock_timestamp()`, the insert's own clock, so a row is eligible at
 * `insert + 250ms` no matter how long its transaction had already been open.
 * The grace does not shrink as the call transaction grows.
 *
 * What is still not guaranteed: eligibility is measured from the *insert*, but
 * visibility begins at the *commit*. A transaction spending more than
 * `SETTLE_MS` between its insert and its commit surfaces a row that is already
 * past the window, and the cursor is monotonic, so a row surfacing below it is
 * lost for good. So this is a mitigation with a bound — no gaps unless a
 * writer's insert-to-commit exceeds `SETTLE_MS` — and not a proof. Closing it
 * needs a cursor that will not advance past an unfilled gap, rejected at triage
 * because an aborted transaction leaves a `seq` no row will ever fill.
 *
 * The predicates below deliberately stay on `now()`. The asymmetry is safe in
 * the direction it errs: on the write side a transaction-start stamp made a row
 * eligible *sooner* than 250ms, while on the read side an earlier clock only
 * withholds *longer*. Every caller is autocommit today, so the two are in fact
 * equivalent — and `clock_timestamp()` is volatile, which would perturb the
 * planner's selectivity estimate that `stream.db.test.ts`'s EXPLAIN pins.
 */
export const SETTLE_MS = 250;

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

/**
 * The highest `seq` the stream would already have delivered — the same horizon
 * `eventsAfterQuery` reads up to, hold-back included.
 *
 * A device that has just read a snapshot needs this to tell a frame announcing
 * something new from a frame replaying something the snapshot already accounted
 * for. On a first connection `Last-Event-ID` is absent and the room's whole log
 * arrives at once, so without a horizon every call ever made looks live.
 *
 * It has to be the *settled* head rather than `max(seq)`: matching the stream's
 * own cut-off is what makes "the stream will deliver this row as new" and "this
 * row is above the horizon" the same statement.
 */
export async function settledHeadSeq(db: Db, code: string): Promise<number> {
  const [head] = await db
    .select({ seq: max(roomEvents.seq) })
    .from(roomEvents)
    .where(
      and(
        eq(roomEvents.roomCode, code),
        lt(roomEvents.at, sql`now() - ${`${SETTLE_MS} milliseconds`}::interval`),
      ),
    );

  return head?.seq === null || head?.seq === undefined ? 0 : Number(head.seq);
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
