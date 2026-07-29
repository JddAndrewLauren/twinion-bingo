import { randomBytes } from 'node:crypto';
import type { Pool } from '@twinion-bingo/theme';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import { cards, games, players, roomEvents, rooms } from '../db/schema.js';
import { settledHeadSeq } from '../rooms/events.js';
import { RoomNotFound } from '../rooms/store.js';
import {
  callsBySquare,
  claimableSquares,
  liveCalls,
  type Mark,
} from './calls.js';
import { composeDeck, dealCard } from './deck.js';
import { poolFor } from './pools.js';
import {
  readHands,
  readPrizes,
  settleWinLadder,
  standings,
  timeline,
  type PrizeAward,
  type Standing,
  type TimelineEntry,
} from './prizes.js';

export type { Mark } from './calls.js';

/** Only the host starts a game (D6); everyone else's start button is not shown. */
export class NotHost extends Error {
  constructor() {
    super('only the host can start a game');
    this.name = 'NotHost';
  }
}

export class GameAlreadyLive extends Error {
  constructor(code: string) {
    super(`room ${code} already has a live game`);
    this.name = 'GameAlreadyLive';
  }
}

/**
 * Call scope is card-only for players (D7): a mark is monotonically good for you,
 * so under card-only calling you always call the moment you spot it. Opening
 * calling to the whole deck would pay you to stay quiet about a square you do not
 * hold. The host is the one exception, and calls through the deck sheet instead.
 */
export class NotOnYourCard extends Error {
  constructor(squareId: string) {
    super(`square ${squareId} is not on your card`);
    this.name = 'NotOnYourCard';
  }
}

/**
 * The host's scope is the room's deck, not everything (D7). Nothing outside the
 * deck can be on anybody's card, so a CALL for it could never mark anything — it
 * would only put a row in the log that no reader can account for.
 */
export class NotInDeck extends Error {
  constructor(squareId: string) {
    super(`square ${squareId} is not in this game's deck`);
    this.name = 'NotInDeck';
  }
}

/**
 * The full house ends the session (D5), and a finished game takes no more
 * writes — neither a call nor a correction. Checked under the same `FOR UPDATE`
 * lock the ladder settles under, so a tap arriving in the same tick as the
 * winning one is refused rather than landing after the standings went final.
 */
export class GameNotLive extends Error {
  constructor(state: string) {
    super(`this game is ${state}, not live`);
    this.name = 'GameNotLive';
  }
}

/** The `seq` a retraction named is not a CALL in this game — or not there at all. */
export class CallNotFound extends Error {
  constructor(seq: number) {
    super(`this game has no call at seq ${seq}`);
    this.name = 'CallNotFound';
  }
}

/**
 * Correction scope, the mirror of D7's call scope: you may take back your own
 * call, and the host may take back anyone's (D8). Without the first half a
 * mis-tap becomes an argument rather than a correction; without the second the
 * room has no way to fix a call whose caller has put their phone down.
 */
export class NotYourCall extends Error {
  constructor(seq: number) {
    super(`call ${seq} was made by someone else, and you are not the host`);
    this.name = 'NotYourCall';
  }
}

/** A card as it renders: the square's prose, plus the theme's free centre. */
export type CardSquare = {
  id: string;
  label: string;
  description: string;
  tier: string;
};

/**
 * The host's deck sheet: the whole ~40-square room deck and which of it has been
 * called. Sent to the host and to nobody else — every other device knows the
 * prose for its own 24 squares only, which is what keeps the sheet an admin
 * surface rather than a leak of everyone's cards.
 */
export type DeckView = {
  squares: CardSquare[];
  /** Deck squares with a live CALL — the same set marks are derived from. */
  called: string[];
};

export type GameView = {
  id: string;
  state: string;
  /** The theme-flavoured centre cell — "LIGHTS OUT" for F1 (D4). */
  freeCentre: string;
  /** This player's 24 earnable squares, or null for someone not in the room. */
  card: CardSquare[] | null;
  /** The deck sheet, for the host reading this and null for everyone else. */
  deck: DeckView | null;
  /**
   * Which of `card`'s squares are marked, computed here and stored nowhere: the
   * card's square ids intersected with the game's live CALLs. Sending the derived
   * answer rather than the log is also what makes a reconnecting device exact —
   * it re-reads the whole truth instead of accumulating frames it might have
   * missed.
   */
  marks: Mark[];
  /**
   * The square ids in `marks` this player cannot claim with: calls that landed
   * before they joined. Empty for anyone who was in the room when the game
   * started, which is everybody in the ordinary case.
   *
   * It is sent so the card can grey them. A line already complete when a late
   * joiner arrived is theirs to look at and not to win with, and a cell that
   * looked exactly like an earned one would make that rule arrive as a surprise
   * at the moment the prize went elsewhere.
   */
  inheritedMarks: string[];
  /** The win ladder as the log recorded it: who won which rung, in order (D5). */
  prizes: PrizeAward[];
  /** Every player by raw mark count, derived on read like everything else. */
  standings: Standing[];
  /** The race timeline: live calls, elapsed stamps, and who spotted each. */
  timeline: TimelineEntry[];
  /**
   * How far down the room's log these marks account for, in stream event ids. A
   * device holds it next to the stream it opens: a frame above this is news, a
   * frame at or below it is replay the snapshot already includes.
   */
  streamedThroughSeq: number;
};

/** The row a call resolved to, whether this request wrote it or lost the race. */
export type CallResult = {
  seq: number;
  squareId: string;
  actorPlayerId: string;
  /** False when another device's identical call was already in the log. */
  appended: boolean;
};

/** The row a retraction resolved to, and the CALL it supersedes. */
export type RetractResult = {
  seq: number;
  targetSeq: number;
  squareId: string;
  actorPlayerId: string;
  /** False when that call had already been retracted by someone else. */
  appended: boolean;
};

/**
 * Starts the room's game: one deck for the room, one card per player dealt from
 * it, and a `GAME_STARTED` row so every connected device learns about it through
 * the stream it is already holding rather than through a second channel.
 *
 * All of it in one transaction. A game whose cards were half-written would be a
 * room where some players are playing and others are staring at a lobby, and no
 * amount of retrying afterwards could tell the two states apart.
 */
export async function startGame(
  db: Db,
  pools: Map<string, Pool>,
  code: string,
  playerId: string,
): Promise<GameView> {
  const [room] = await db
    .select({ themeId: rooms.themeId, hostPlayerId: rooms.hostPlayerId })
    .from(rooms)
    .where(eq(rooms.code, code));

  if (room === undefined) throw new RoomNotFound(code);
  if (room.hostPlayerId !== playerId) throw new NotHost();

  const [live] = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.roomCode, code), eq(games.state, 'live')));

  if (live !== undefined) throw new GameAlreadyLive(code);

  const pool = poolFor(pools, room.themeId);

  // 16 bytes: the seed is stored and reproduced, never guessed at, so its only
  // job is to be different every game.
  const seed = randomBytes(16).toString('hex');
  const deck = composeDeck(pool, seed);

  const roster = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.roomCode, code))
    .orderBy(asc(players.joinSeq));

  const dealt = roster.map((player) => ({
    playerId: player.id,
    squareIds: dealCard(deck, seed, player.id),
  }));

  const gameId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(games)
      .values({
        roomCode: code,
        themeId: room.themeId,
        deck: deck.map((square) => square.id),
        seed,
        state: 'live',
        startedAt: new Date(),
      })
      .returning({ id: games.id });

    if (inserted === undefined) throw new Error('inserting the game added no row');

    await tx.insert(cards).values(
      dealt.map((hand) => ({
        gameId: inserted.id,
        playerId: hand.playerId,
        squareIds: hand.squareIds,
      })),
    );

    await tx.insert(roomEvents).values({
      roomCode: code,
      gameId: inserted.id,
      actorPlayerId: playerId,
      kind: 'GAME_STARTED',
    });

    return inserted.id;
  });

  const mine = dealt.find((hand) => hand.playerId === playerId);

  return {
    id: gameId,
    state: 'live',
    freeCentre: pool.freeCentre,
    card: mine === undefined ? null : describeCard(pool, mine.squareIds),
    // Whoever got this far is the host — `NotHost` is thrown above otherwise — so
    // the deck sheet comes back with the deal rather than waiting for a re-read.
    deck: { squares: describeCard(pool, deck.map((square) => square.id)), called: [] },
    // A game one transaction old has no calls, so every one of these is the
    // derived answer rather than a placeholder for one — the standings included,
    // which is the whole roster on nothing.
    marks: [],
    inheritedMarks: [],
    prizes: [],
    standings: standings(
      dealt.map((hand) => ({
        playerId: hand.playerId,
        name: roster.find((player) => player.id === hand.playerId)!.name,
        joinSeq: 0,
        squareIds: hand.squareIds,
      })),
      [],
    ),
    timeline: [],
    streamedThroughSeq: await settledHeadSeq(db, code),
  };
}

/**
 * The room's current game and the reader's own card. This is what a device calls
 * when the stream tells it a game started, and what a reloading phone calls to
 * come back to the card it already had — the card is a stored list of square ids,
 * so both answers are the same read.
 */
export async function readGame(
  db: Db,
  pools: Map<string, Pool>,
  code: string,
  playerId: string | undefined,
): Promise<GameView | undefined> {
  const [game] = await db
    .select({
      id: games.id,
      themeId: games.themeId,
      state: games.state,
      startedAt: games.startedAt,
      deck: games.deck,
      hostPlayerId: rooms.hostPlayerId,
    })
    .from(games)
    .innerJoin(rooms, eq(rooms.code, games.roomCode))
    .where(eq(games.roomCode, code))
    .orderBy(desc(games.startedAt))
    .limit(1);

  if (game === undefined) return undefined;

  const pool = poolFor(pools, game.themeId);

  /**
   * The one formula the whole design follows from:
   *
   *     marks(player) = card.square_ids ∩ {CALLs not superseded by a RETRACT}
   *
   * Computed on every read and written down nowhere. That is what buys free
   * reconnect, correct late joiners and cheap corrections — a stored mark would
   * be a second description of what is marked, and the two would eventually
   * disagree. The deck sheet's called state is the same intersection taken
   * against the deck instead of a card, and the prizes, standings and timeline
   * below are the same log read again — so all of them come off one query.
   *
   * The order is the card's (and the deck's), not the log's, so a caller can line
   * the answer up against the cells it already has.
   *
   * A mark carries the CALL row that made it, not just the square id, because a
   * correction has to name that row by `seq` and a device cannot learn a seq
   * anywhere else (D8). The deck sheet wants only the ids, so it takes the keys.
   *
   * Reading all of it here rather than accumulating any of it is what makes the
   * disconnect criterion hold with no catch-up path: a device that slept through
   * a stint re-reads the whole derived answer instead of replaying its way to one.
   */
  const [calls, hands, prizes, streamedThroughSeq] = await Promise.all([
    liveCalls(db, game.id),
    readHands(db, game.id),
    readPrizes(db, game.id),
    settledHeadSeq(db, code),
  ]);

  const called = callsBySquare(calls);
  const hand = hands.find((candidate) => candidate.playerId === playerId);

  const marks =
    hand === undefined
      ? []
      : hand.squareIds
          .map((id) => called.get(id))
          .filter((mark): mark is Mark => mark !== undefined);

  /**
   * Win detection counts only calls at or after this player's `join_seq`, so a
   * mark they walked in on is theirs to look at and not to win with. The card
   * greys exactly this set.
   */
  const claimable =
    hand === undefined
      ? new Set<string>()
      : claimableSquares(hand.squareIds, calls, hand.joinSeq);

  return {
    id: game.id,
    state: game.state,
    freeCentre: pool.freeCentre,
    card: hand === undefined ? null : describeCard(pool, hand.squareIds),
    deck:
      playerId !== undefined && playerId === game.hostPlayerId
        ? {
            squares: describeCard(pool, game.deck),
            called: game.deck.filter((id) => called.has(id)),
          }
        : null,
    marks,
    inheritedMarks: marks
      .map((mark) => mark.squareId)
      .filter((id) => !claimable.has(id)),
    prizes,
    standings: standings(hands, calls),
    timeline: timeline(hands, calls, game.startedAt),
    streamedThroughSeq,
  };
}

/**
 * First-to-spot calls it for everyone (D1). One appended CALL row is the whole
 * write: every card holding that square marks because the derivation says so, and
 * every device finds out from the stream it is already holding.
 *
 * Two phones tapping the same square in the same tick both get here. The partial
 * unique index on `(game_id, square_id) WHERE kind = 'CALL'` makes exactly one of
 * them a row and the other a 23505, and the loser is handed the winning row —
 * because from the player's side nothing went wrong: the square they spotted is
 * marked, which is all they were asking for.
 *
 * The host is the one caller not held to their own card (D7): they repair a miss
 * from the deck sheet, and everything downstream of the scope check is the same
 * row, the same fanout and the same credit. That includes losing the race — a
 * host calling a square a player already called is handed the winning row too.
 *
 * The row and the prizes it earns are appended together, under a lock on the
 * game — see the transaction below.
 */
export async function callSquare(
  db: Db,
  gameId: string,
  playerId: string,
  squareId: string,
): Promise<CallResult> {
  const [game] = await db
    .select({
      roomCode: games.roomCode,
      deck: games.deck,
      hostPlayerId: rooms.hostPlayerId,
    })
    .from(games)
    .innerJoin(rooms, eq(rooms.code, games.roomCode))
    .where(eq(games.id, gameId));

  if (game === undefined) throw new NotOnYourCard(squareId);

  if (playerId === game.hostPlayerId) {
    if (!game.deck.includes(squareId)) throw new NotInDeck(squareId);
  } else {
    const [hand] = await db
      .select({ squareIds: cards.squareIds })
      .from(cards)
      .where(and(eq(cards.gameId, gameId), eq(cards.playerId, playerId)));

    if (hand === undefined) throw new NotOnYourCard(squareId);
    if (!hand.squareIds.includes(squareId)) throw new NotOnYourCard(squareId);
  }

  try {
    return await db.transaction(async (tx) => {
      await assertLive(tx, gameId);

      const [appended] = await tx
        .insert(roomEvents)
        .values({
          roomCode: game.roomCode,
          gameId,
          actorPlayerId: playerId,
          kind: 'CALL',
          squareId,
        })
        .returning({ seq: roomEvents.seq });

      if (appended === undefined) throw new Error('appending CALL added no row');

      // Same transaction as the call that earned them: a prize written
      // afterwards could be lost to a crash, and unlike a mark it is not
      // recomputed on the next read, so there would be nothing to heal it.
      await settleWinLadder(tx, game.roomCode, gameId);

      return {
        seq: Number(appended.seq),
        squareId,
        actorPlayerId: playerId,
        appended: true,
      };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    return readCall(db, gameId, squareId);
  }
}

/**
 * Locks the game row and refuses anything but a live game — the check and the
 * lock in one statement, because they are the same concern.
 *
 * `FOR UPDATE` serialises a single game's writes, which is what lets the ladder
 * read "has this rung been won yet" and act on the answer: two concurrent calls
 * each finding a rung unclaimed would award it twice. It also makes the state
 * check exact rather than advisory, for the call and the retraction alike. A
 * room is six phones, so the contention this costs is nothing.
 */
async function assertLive(tx: Tx, gameId: string): Promise<void> {
  const [game] = await tx
    .select({ state: games.state })
    .from(games)
    .where(eq(games.id, gameId))
    .for('update');

  if (game === undefined) throw new Error(`no game with id ${gameId}`);
  if (game.state !== 'live') throw new GameNotLive(game.state);
}

/** The CALL already in the log for this square — the winner of a tied race. */
async function readCall(
  db: Db,
  gameId: string,
  squareId: string,
): Promise<CallResult> {
  const [existing] = await db
    .select({ seq: roomEvents.seq, actorPlayerId: roomEvents.actorPlayerId })
    .from(roomEvents)
    .where(
      and(
        eq(roomEvents.gameId, gameId),
        eq(roomEvents.kind, 'CALL'),
        eq(roomEvents.squareId, squareId),
      ),
    );

  if (existing === undefined) {
    throw new Error(
      `CALL for ${squareId} conflicted with a row that is not there`,
    );
  }

  return {
    seq: Number(existing.seq),
    squareId,
    actorPlayerId: existing.actorPlayerId,
    appended: false,
  };
}

/**
 * D8's correction, and the reason the log is append-only. A RETRACT row names the
 * CALL it supersedes by `target_seq`; the CALL itself is never deleted and never
 * updated, so a device replaying from `Last-Event-ID` before the CALL sees both
 * rows and derives the same unmarked square as one that watched it happen live.
 *
 * The graduated friction of D8 — a one-tap undo inside ten seconds, a
 * confirmation dialog after — is entirely the client's, because it is about how
 * likely a tap was a mistake and not about who is allowed to do what. The server
 * enforces only the part that is a rule: your own call, or any call if you are
 * the host.
 *
 * A call that is already retracted is not retracted twice. There is no unique
 * index to make that airtight and a duplicate RETRACT would derive the same
 * marks anyway, so this is about the timeline read out of the log, which should
 * not say the same call was taken back twice because two thumbs landed together.
 *
 * A finished game takes no correction either, under the same lock a call takes.
 * The full house is a one-way door and PRIZE rows are appended facts rather than
 * derived ones: retracting the winning call would leave the log asserting a full
 * house that its own calls no longer support, in a game already refusing the
 * calls that could rebuild it. Refusing keeps the log self-consistent, and the
 * room's way forward is a new game rather than a rewritten finished one — the
 * alternative, reopening a `done` game, means reversing appended prizes, which
 * is a design change and not a correction.
 */
export async function retractCall(
  db: Db,
  gameId: string,
  playerId: string,
  targetSeq: number,
): Promise<RetractResult> {
  const [target] = await db
    .select({
      squareId: roomEvents.squareId,
      actorPlayerId: roomEvents.actorPlayerId,
      roomCode: games.roomCode,
      hostPlayerId: rooms.hostPlayerId,
    })
    .from(roomEvents)
    .innerJoin(games, eq(games.id, roomEvents.gameId))
    .innerJoin(rooms, eq(rooms.code, games.roomCode))
    .where(
      and(
        eq(roomEvents.seq, BigInt(targetSeq)),
        eq(roomEvents.gameId, gameId),
        eq(roomEvents.kind, 'CALL'),
      ),
    );

  if (target === undefined || target.squareId === null) {
    throw new CallNotFound(targetSeq);
  }

  const yours = target.actorPlayerId === playerId;
  const youAreHost = target.hostPlayerId === playerId;
  if (!yours && !youAreHost) throw new NotYourCall(targetSeq);

  const [already] = await db
    .select({ seq: roomEvents.seq, actorPlayerId: roomEvents.actorPlayerId })
    .from(roomEvents)
    .where(
      and(
        eq(roomEvents.kind, 'RETRACT'),
        eq(roomEvents.targetSeq, BigInt(targetSeq)),
      ),
    );

  if (already !== undefined) {
    return {
      seq: Number(already.seq),
      targetSeq,
      squareId: target.squareId,
      actorPlayerId: already.actorPlayerId,
      appended: false,
    };
  }

  const squareId = target.squareId;

  return db.transaction(async (tx) => {
    await assertLive(tx, gameId);

    const [appended] = await tx
      .insert(roomEvents)
      .values({
        roomCode: target.roomCode,
        gameId,
        actorPlayerId: playerId,
        kind: 'RETRACT',
        targetSeq: BigInt(targetSeq),
      })
      .returning({ seq: roomEvents.seq });

    if (appended === undefined) throw new Error('appending RETRACT added no row');

    return {
      seq: Number(appended.seq),
      targetSeq,
      squareId,
      actorPlayerId: playerId,
      appended: true,
    };
  });
}

/** The room a game belongs to, which is what scopes a player's token to it. */
export async function roomCodeForGame(
  db: Db,
  gameId: string,
): Promise<string | undefined> {
  const [game] = await db
    .select({ roomCode: games.roomCode })
    .from(games)
    .where(eq(games.id, gameId));

  return game?.roomCode;
}

/**
 * Cards store square ids and nothing else, so their prose is looked up in the
 * theme's pool on the way out — which is what lets a reworded square reach a card
 * that was dealt before the rewording.
 */
function describeCard(pool: Pool, squareIds: string[]): CardSquare[] {
  const byId = new Map(pool.squares.map((square) => [square.id, square]));

  return squareIds.map((id) => {
    const square = byId.get(id);

    if (square === undefined) {
      throw new Error(`card holds square "${id}", which theme ${pool.themeId} has no square for`);
    }

    return {
      id: square.id,
      label: square.label,
      description: square.description,
      tier: square.tier,
    };
  });
}
