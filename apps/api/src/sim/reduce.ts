import { completedLines, isFullHouse } from '../games/lines.js';
import { LADDER, type PrizeKind } from '../games/prizes.js';
import type { RoomEvent } from '../rooms/events.js';

/**
 * The log, read a second time and a second way.
 *
 * The server derives marks, standings, timeline and the ladder out of SQL over
 * `room_events`. This derives them out of the rows a device actually received on
 * its stream, in plain TypeScript, so a run that agrees agrees twice — once
 * about the queries and once about what came down the wire. It deliberately
 * shares nothing with `games/calls.ts`: a shared helper would make the two
 * answers the same answer.
 *
 * `lines.ts` is the exception, and it is not a derivation — it is the geometry
 * of a 5x5 card, has its own unit tests, and a hand-copied second grid here
 * would only ever be a way to disagree about which cells are a diagonal.
 */

export type SimCard = {
  playerId: string;
  name: string;
  joinSeq: number;
  squareIds: string[];
};

export type ReducedCall = { seq: number; squareId: string; playerId: string };

export type ReducedStanding = { playerId: string; name: string; marks: number };

export type ReducedTimelineEntry = {
  seq: number;
  squareId: string;
  playerId: string;
  name: string;
};

export type ReducedPrize = { seq: number; prizeKind: string; playerId: string };

/** Every row up to but not including `seq` — the log as of just before a row. */
export function before(events: readonly RoomEvent[], seq: number): RoomEvent[] {
  return events.filter((event) => event.seq < seq);
}

/**
 *     marks(player) = card.square_ids ∩ {CALLs not superseded by a RETRACT}
 *
 * The one formula, in the one place this file computes anything.
 */
export function liveCalls(
  events: readonly RoomEvent[],
  gameId: string,
): ReducedCall[] {
  const superseded = new Set(
    events
      .filter((event) => event.kind === 'RETRACT' && event.targetSeq !== null)
      .map((event) => event.targetSeq),
  );

  return events
    .filter(
      (event) =>
        event.kind === 'CALL' &&
        event.gameId === gameId &&
        event.squareId !== null &&
        !superseded.has(event.seq),
    )
    .map((event) => ({
      seq: event.seq,
      squareId: event.squareId as string,
      playerId: event.actorPlayerId,
    }))
    .sort((left, right) => left.seq - right.seq);
}

/** In card order, like the server's, so the two line up cell by cell. */
export function marksOf(
  card: SimCard,
  calls: readonly ReducedCall[],
): string[] {
  const called = new Set(calls.map((call) => call.squareId));

  return card.squareIds.filter((id) => called.has(id));
}

/** Raw mark count (D5), ties left tied in join order. */
export function standingsOf(
  cards: readonly SimCard[],
  calls: readonly ReducedCall[],
): ReducedStanding[] {
  return [...cards]
    .sort((left, right) => left.joinSeq - right.joinSeq)
    .map((card) => ({
      playerId: card.playerId,
      name: card.name,
      marks: marksOf(card, calls).length,
    }))
    .sort((left, right) => right.marks - left.marks);
}

/**
 * Every live call, credited, newest first — the order CONTEXT.md defines the
 * timeline in. The elapsed stamp is the server's to format.
 */
export function timelineOf(
  cards: readonly SimCard[],
  calls: readonly ReducedCall[],
): ReducedTimelineEntry[] {
  const named = new Map(cards.map((card) => [card.playerId, card.name]));

  return [...calls].reverse().map((call) => ({
    seq: call.seq,
    squareId: call.squareId,
    playerId: call.playerId,
    name: named.get(call.playerId) ?? 'Someone',
  }));
}

export function prizesOf(
  events: readonly RoomEvent[],
  gameId: string,
): ReducedPrize[] {
  return events
    .filter((event) => event.kind === 'PRIZE' && event.gameId === gameId)
    .map((event) => ({
      seq: event.seq,
      prizeKind: event.prizeKind ?? '',
      playerId: event.actorPlayerId,
    }))
    .sort((left, right) => left.seq - right.seq);
}

/**
 * The squares that count towards a claim: the marks whose call landed at or
 * after this player joined. A late joiner's card is marked correctly and wins
 * nothing it walked in on.
 */
function claimable(card: SimCard, calls: readonly ReducedCall[]): Set<string> {
  const held = new Set(card.squareIds);

  return new Set(
    calls
      .filter((call) => call.seq >= card.joinSeq && held.has(call.squareId))
      .map((call) => call.squareId),
  );
}

export function qualifies(
  card: SimCard,
  calls: readonly ReducedCall[],
  kind: PrizeKind,
): boolean {
  const counting = claimable(card, calls);

  if (kind === 'FULL_HOUSE') return isFullHouse(card.squareIds, counting);

  return completedLines(card.squareIds, counting) >= (kind === 'LINE' ? 1 : 2);
}

/** Everyone who qualified for a rung on the log as it stood, in join order. */
export function winnersOf(
  cards: readonly SimCard[],
  calls: readonly ReducedCall[],
  kind: PrizeKind,
): string[] {
  return [...cards]
    .sort((left, right) => left.joinSeq - right.joinSeq)
    .filter((card) => qualifies(card, calls, kind))
    .map((card) => card.playerId);
}

/**
 * The ladder as the log recorded it, grouped into the rungs it climbed: a rung
 * is won once per game, by one player or by several at once (D5), and its rows
 * are appended together inside the winning call's own transaction.
 */
export function rungsOf(
  events: readonly RoomEvent[],
  gameId: string,
): { kind: string; at: number; winners: string[] }[] {
  const rungs: { kind: string; at: number; winners: string[] }[] = [];

  for (const prize of prizesOf(events, gameId)) {
    const rung = rungs.find((candidate) => candidate.kind === prize.prizeKind);

    if (rung === undefined) {
      rungs.push({ kind: prize.prizeKind, at: prize.seq, winners: [prize.playerId] });
    } else {
      rung.winners.push(prize.playerId);
    }
  }

  return rungs;
}

/** The ladder's rungs in the order D5 climbs them. */
export const ladderOrder: readonly string[] = LADDER;
