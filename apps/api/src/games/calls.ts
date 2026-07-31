import { and, asc, eq, isNotNull, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db, Tx } from '../db/client.js';
import { roomEvents } from '../db/schema.js';

/**
 * A marked square, and the CALL row that marked it. The seq is what a retraction
 * names (D8), and the actor is what decides which of D8's three paths a device
 * may offer: your own call, or anyone's if you are the host.
 */
export type Mark = {
  squareId: string;
  seq: number;
  actorPlayerId: string;
};

/** One CALL the log still stands behind, plus when it landed, in log order. */
export type LiveCall = Mark & { at: Date };

/**
 * "No RETRACT names this row" — the half of the derivation that makes liveness a
 * property of a *second* row, correlated on the CALL's own `seq` (D8).
 *
 * It is a helper rather than a repeated expression because more than one query
 * needs it now: the reads below, and the call path, which asks whether a square
 * has a live call before appending one (ADR-0004). A second hand-rolled copy of
 * this predicate is exactly how a retracted square becomes callable to one reader
 * and uncallable to another.
 */
function notSuperseded(db: Db | Tx) {
  const retraction = alias(roomEvents, 'retraction');

  return notExists(
    db
      .select({ seq: retraction.seq })
      .from(retraction)
      .where(
        and(
          eq(retraction.kind, 'RETRACT'),
          eq(retraction.targetSeq, roomEvents.seq),
        ),
      ),
  );
}

/**
 * The game's live calls — the right-hand side of the one formula the whole
 * design follows from:
 *
 *     marks(player) = card.square_ids ∩ {CALLs not superseded by a RETRACT}
 *
 * A RETRACT names the CALL it supersedes by `target_seq` (D8), so the correction
 * is an appended row and the call it undoes stays in the log — deleting it would
 * break `Last-Event-ID` replay for every device that had already seen it.
 *
 * A card's marks, the host deck sheet's called set, the standings, the timeline
 * and the win ladder are all read out of this one query rather than each running
 * their own, so there is no way for them to disagree about what has been called.
 *
 * Each call carries its `seq` and its actor because a correction needs both:
 * `POST /games/:id/retract` names the CALL by `seq`, and whether a device may
 * offer that correction at all turns on who made it (D8).
 */
export async function liveCalls(
  db: Db | Tx,
  gameId: string,
): Promise<LiveCall[]> {
  const rows = await db
    .select({
      seq: roomEvents.seq,
      squareId: roomEvents.squareId,
      at: roomEvents.at,
      actorPlayerId: roomEvents.actorPlayerId,
    })
    .from(roomEvents)
    .where(
      and(
        eq(roomEvents.gameId, gameId),
        eq(roomEvents.kind, 'CALL'),
        isNotNull(roomEvents.squareId),
        notSuperseded(db),
      ),
    )
    .orderBy(asc(roomEvents.seq));

  return rows.map((row) => ({
    seq: Number(row.seq),
    squareId: row.squareId as string,
    at: row.at,
    actorPlayerId: row.actorPlayerId,
  }));
}

/**
 * The one live call for a square, if the log still stands behind one — the same
 * derivation `liveCalls` runs, narrowed to a single square.
 *
 * This is what the call path asks before appending: a square with a live call is
 * already marked, so the caller is handed that row rather than a duplicate; a
 * square whose only call was retracted has none, so it is callable again (#45).
 * Both answers come from the query above's predicate rather than a second copy of
 * it, which is the point — the reader and the writer cannot disagree.
 *
 * Only meaningful inside `callSquare`'s transaction, after the `FOR UPDATE` lock
 * on the game row: the lock is what makes "is there a live call" still true by the
 * time the insert lands (ADR-0004).
 */
export async function liveCallFor(
  tx: Db | Tx,
  gameId: string,
  squareId: string,
): Promise<Mark | undefined> {
  const [row] = await tx
    .select({ seq: roomEvents.seq, actorPlayerId: roomEvents.actorPlayerId })
    .from(roomEvents)
    .where(
      and(
        eq(roomEvents.gameId, gameId),
        eq(roomEvents.kind, 'CALL'),
        eq(roomEvents.squareId, squareId),
        notSuperseded(tx),
      ),
    )
    .orderBy(asc(roomEvents.seq))
    .limit(1);

  return row === undefined
    ? undefined
    : { squareId, seq: Number(row.seq), actorPlayerId: row.actorPlayerId };
}

/**
 * The same calls keyed by the square they marked. A card takes `.get()` for the
 * mark itself; the host's deck sheet takes `.has()` for which of its 40 squares
 * are called — one map off one query, feeding both.
 *
 * A square should have at most one live call, and under the game-row lock it does
 * (ADR-0004). But that is now an application invariant rather than a constraint
 * the database refuses to break, so this says out loud what happens if it ever is
 * broken: the earliest live call wins, because first-to-spot is who D1 credits.
 * `liveCallFor` resolves the same tie the same way, so the reader and the writer
 * name the same row rather than differing by which one overwrote the other.
 */
export function callsBySquare(
  calls: readonly LiveCall[],
): Map<string, Mark> {
  const bySquare = new Map<string, Mark>();

  for (const { squareId, seq, actorPlayerId } of calls) {
    if (!bySquare.has(squareId)) {
      bySquare.set(squareId, { squareId, seq, actorPlayerId });
    }
  }

  return bySquare;
}

/**
 * The squares a player's card shows as marked. The order is the card's, not the
 * log's, so a caller can line marks up against the cells it already has.
 */
export function markedSquares(
  squareIds: readonly string[],
  calls: readonly LiveCall[],
): string[] {
  const called = new Set(calls.map((call) => call.squareId));

  return squareIds.filter((id) => called.has(id));
}

/**
 * The squares that count towards this player's win claims: the marks whose call
 * landed at or after their current claim boundary.
 *
 * A player's card always arrives correctly marked — it is the same derivation
 * everyone else's runs — but nobody claims a line the room completed before
 * that player's current boundary. A re-roll moves the boundary forward too, so
 * a mark inherited by the replacement card is visible but cannot win a prize.
 */
export function claimableSquares(
  squareIds: readonly string[],
  calls: readonly LiveCall[],
  claimBoundarySeq: number,
): Set<string> {
  const held = new Set(squareIds);

  return new Set(
    calls
      .filter((call) => call.seq >= claimBoundarySeq && held.has(call.squareId))
      .map((call) => call.squareId),
  );
}
