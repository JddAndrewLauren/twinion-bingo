import { randomBytes } from 'node:crypto';
import type { Pool } from '@twinion-bingo/theme';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { cards, games, players, roomEvents, rooms } from '../db/schema.js';
import { RoomNotFound } from '../rooms/store.js';
import { composeDeck, dealCard } from './deck.js';
import { poolFor } from './pools.js';

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

/** A card as it renders: the square's prose, plus the theme's free centre. */
export type CardSquare = {
  id: string;
  label: string;
  description: string;
  tier: string;
};

export type GameView = {
  id: string;
  state: string;
  /** The theme-flavoured centre cell — "LIGHTS OUT" for F1 (D4). */
  freeCentre: string;
  /** This player's 24 earnable squares, or null for someone not in the room. */
  card: CardSquare[] | null;
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
    .select({ id: players.id })
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
    })
    .from(games)
    .where(eq(games.roomCode, code))
    .orderBy(desc(games.startedAt))
    .limit(1);

  if (game === undefined) return undefined;

  const pool = poolFor(pools, game.themeId);

  const [hand] =
    playerId === undefined
      ? []
      : await db
          .select({ squareIds: cards.squareIds })
          .from(cards)
          .where(and(eq(cards.gameId, game.id), eq(cards.playerId, playerId)));

  return {
    id: game.id,
    state: game.state,
    freeCentre: pool.freeCentre,
    card: hand === undefined ? null : describeCard(pool, hand.squareIds),
  };
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
