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
  const retraction = alias(roomEvents, 'retraction');

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
        notExists(
          db
            .select({ seq: retraction.seq })
            .from(retraction)
            .where(
              and(
                eq(retraction.kind, 'RETRACT'),
                eq(retraction.targetSeq, roomEvents.seq),
              ),
            ),
        ),
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
 * The same calls keyed by the square they marked. A card takes `.get()` for the
 * mark itself; the host's deck sheet takes `.has()` for which of its 40 squares
 * are called — one map off one query, feeding both.
 */
export function callsBySquare(
  calls: readonly LiveCall[],
): Map<string, Mark> {
  return new Map(
    calls.map(({ squareId, seq, actorPlayerId }) => [
      squareId,
      { squareId, seq, actorPlayerId },
    ]),
  );
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
 * landed at or after they joined.
 *
 * A late joiner's card arrives correctly marked — it is the same derivation
 * everyone else's runs — but nobody walks in at lap 50 and claims the line the
 * room spent an hour filling in. `join_seq` is the sequence number of the
 * player's own PLAYER_JOINED row, so "after I joined" and "later in the log" are
 * the same comparison, with no clock involved.
 */
export function claimableSquares(
  squareIds: readonly string[],
  calls: readonly LiveCall[],
  joinSeq: number,
): Set<string> {
  const held = new Set(squareIds);

  return new Set(
    calls
      .filter((call) => call.seq >= joinSeq && held.has(call.squareId))
      .map((call) => call.squareId),
  );
}
