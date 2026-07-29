import { and, asc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.js';
import { cards, games, players, roomEvents } from '../db/schema.js';
import { claimableSquares, liveCalls, markedSquares, type LiveCall } from './calls.js';
import { completedLines, isFullHouse } from './lines.js';

/**
 * D5's ladder, in the order it is climbed. A kind is won once per game — by one
 * player, or by several at once — and the next rung is only reachable after it.
 */
export const LADDER = ['LINE', 'TWO_LINES', 'FULL_HOUSE'] as const;

export type PrizeKind = (typeof LADDER)[number];

/** A prize as it reads: who won what, and where in the log it was recorded. */
export type PrizeAward = {
  seq: number;
  prizeKind: string;
  playerId: string;
  name: string;
};

export type Standing = {
  playerId: string;
  name: string;
  /** Raw mark count (D5) — every mark on the card, gate or no gate. */
  marks: number;
};

export type TimelineEntry = {
  seq: number;
  squareId: string;
  /** Elapsed game time, `+42:10` (never a lap number — there is no timing feed). */
  elapsed: string;
  playerId: string;
  name: string;
};

/** One player's card, as the ladder, the standings and the timeline see it. */
export type Hand = {
  playerId: string;
  name: string;
  joinSeq: number;
  squareIds: string[];
};

function qualifies(hand: Hand, counting: Set<string>, kind: PrizeKind): boolean {
  if (kind === 'FULL_HOUSE') return isFullHouse(hand.squareIds, counting);

  return completedLines(hand.squareIds, counting) >= (kind === 'LINE' ? 1 : 2);
}

/**
 * Settles the win ladder for the call that has just been appended, inside that
 * call's own transaction.
 *
 * Prizes are `room_events` rows and nothing else (D5), so there is no `prizes`
 * table to keep in step and a device learns about a win from the stream it is
 * already holding. Awarding them here rather than deriving them on read is what
 * makes "first to the line" mean anything: derived-on-read would recompute the
 * winner every time the log changed, and a retraction would silently move a
 * prize that had already been announced.
 *
 * Every player who qualifies on this call is recorded, so a simultaneous
 * completion is two PRIZE rows rather than a tie-break invented here (D5). The
 * rungs are walked in order in one pass, so a call that completes a player's
 * first *and* second line appends LINE then TWO_LINES, in that order.
 *
 * The caller holds a `FOR UPDATE` lock on the game row, which is what stops two
 * concurrent calls from each seeing an unclaimed rung and awarding it twice.
 */
export async function settleWinLadder(
  tx: Tx,
  roomCode: string,
  gameId: string,
): Promise<void> {
  const [calls, hands, awarded] = await Promise.all([
    liveCalls(tx, gameId),
    readHands(tx, gameId),
    awardedKinds(tx, gameId),
  ]);

  const counting = new Map(
    hands.map((hand) => [
      hand.playerId,
      claimableSquares(hand.squareIds, calls, hand.joinSeq),
    ]),
  );

  let fullHouse = false;

  for (const kind of LADDER) {
    if (awarded.has(kind)) continue;

    const winners = hands.filter((hand) =>
      qualifies(hand, counting.get(hand.playerId) ?? new Set(), kind),
    );

    if (winners.length === 0) continue;

    await tx.insert(roomEvents).values(
      winners.map((winner) => ({
        roomCode,
        gameId,
        actorPlayerId: winner.playerId,
        kind: 'PRIZE' as const,
        prizeKind: kind,
      })),
    );

    if (kind === 'FULL_HOUSE') fullHouse = true;
  }

  // The full house is the ladder's last rung, so the session is over and the
  // standings on screen are final. It is also what gives the `live` check on a
  // call something to refuse.
  if (fullHouse) {
    await tx
      .update(games)
      .set({ state: 'done', endedAt: new Date() })
      .where(eq(games.id, gameId));
  }
}

/** Every card in the game, with the player it was dealt to. */
export async function readHands(db: Db | Tx, gameId: string): Promise<Hand[]> {
  return db
    .select({
      playerId: players.id,
      name: players.name,
      joinSeq: players.joinSeq,
      squareIds: cards.squareIds,
    })
    .from(cards)
    .innerJoin(players, eq(players.id, cards.playerId))
    .where(eq(cards.gameId, gameId))
    .orderBy(asc(players.joinSeq));
}

async function awardedKinds(
  db: Db | Tx,
  gameId: string,
): Promise<Set<PrizeKind>> {
  const rows = await db
    .select({ prizeKind: roomEvents.prizeKind })
    .from(roomEvents)
    .where(and(eq(roomEvents.gameId, gameId), eq(roomEvents.kind, 'PRIZE')));

  return new Set(
    rows
      .map((row) => row.prizeKind)
      .filter((kind): kind is PrizeKind => kind !== null),
  );
}

/** The prizes this game has recorded, in the order the log recorded them. */
export async function readPrizes(
  db: Db,
  gameId: string,
): Promise<PrizeAward[]> {
  const rows = await db
    .select({
      seq: roomEvents.seq,
      prizeKind: roomEvents.prizeKind,
      playerId: roomEvents.actorPlayerId,
      name: players.name,
    })
    .from(roomEvents)
    .innerJoin(players, eq(players.id, roomEvents.actorPlayerId))
    .where(and(eq(roomEvents.gameId, gameId), eq(roomEvents.kind, 'PRIZE')))
    .orderBy(asc(roomEvents.seq));

  return rows.map((row) => ({
    seq: Number(row.seq),
    prizeKind: row.prizeKind ?? '',
    playerId: row.playerId,
    name: row.name,
  }));
}

/**
 * Standings by raw mark count (D5) — every mark on the card, including any the
 * room called before a late joiner arrived. That is deliberately not the gated
 * count the ladder uses: the gate exists so nobody *claims* a line they did not
 * watch for, while the standings are the plain "how much of your card came up"
 * number, and applying the gate to both would punish a latecomer twice.
 *
 * Ties are left tied and ordered by join order, because a tie-break would be an
 * answer to a question D5 does not ask.
 */
export function standings(
  hands: readonly Hand[],
  calls: readonly LiveCall[],
): Standing[] {
  return hands
    .map((hand) => ({
      playerId: hand.playerId,
      name: hand.name,
      marks: markedSquares(hand.squareIds, calls).length,
    }))
    .sort((a, b) => b.marks - a.marks);
}

/**
 * The race timeline: every live call, stamped with elapsed game time and
 * credited to the player who spotted it.
 *
 * Elapsed, not lap number — there is no live timing feed and hand-entered laps
 * are not worth the friction. On a recording it is wall-clock since the host
 * started the game, so it includes any pause the room took; that is cosmetic and
 * deliberately not corrected.
 *
 * A retracted call is not in `calls` and so is not in the timeline: the timeline
 * says what happened, and the log's memory of a correction is the log's business.
 */
export function timeline(
  hands: readonly Hand[],
  calls: readonly LiveCall[],
  startedAt: Date | null,
): TimelineEntry[] {
  const named = new Map(hands.map((hand) => [hand.playerId, hand.name]));

  return calls.map((call) => ({
    seq: call.seq,
    squareId: call.squareId,
    elapsed: elapsedStamp(startedAt, call.at),
    playerId: call.actorPlayerId,
    name: named.get(call.actorPlayerId) ?? 'Someone',
  }));
}

/**
 * `+42:10`. Minutes are not wrapped into hours — a race is two of them, and
 * `+124:03` reads as further into the session than `+2:04:03` does at a glance
 * on a phone.
 */
export function elapsedStamp(startedAt: Date | null, at: Date): string {
  const ms = startedAt === null ? 0 : at.getTime() - startedAt.getTime();
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
