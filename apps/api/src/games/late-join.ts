import type { Pool } from '@twinion-bingo/theme';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { cards, games, rooms } from '../db/schema.js';
import { dealCard, deckSquares } from './deck.js';
import { poolFor } from './pools.js';

/**
 * Deals a player who joined mid-game a card, from the deck the room is already
 * playing — not a fresh draw. The whole point of one room deck (D6) is that
 * every square sits on several cards, and a card drawn from anywhere else would
 * hold squares nobody could call.
 *
 * Marks need no attention here. They are the intersection of this card's ids
 * with the log's live calls, so the card arrives correctly marked the first time
 * it is read — the free lunch the derived-marks model was chosen for.
 *
 * Runs inside the join's own transaction: a player who exists without the card
 * the room's live game owes them would be a roster row staring at a lobby that
 * is not there.
 */
export async function dealLateJoinCard(
  tx: Tx,
  pools: Map<string, Pool>,
  code: string,
  playerId: string,
): Promise<void> {
  const [live] = await tx
    .select({
      id: games.id,
      themeId: games.themeId,
      deck: rooms.deck,
      seed: games.seed,
    })
    .from(games)
    .innerJoin(rooms, eq(rooms.code, games.roomCode))
    .where(and(eq(games.roomCode, code), eq(games.state, 'live')));

  if (live === undefined) return;
  if (live.deck === null) throw new Error(`room ${code} has a live game but no deck`);

  await tx.insert(cards).values({
    gameId: live.id,
    playerId,
    squareIds: dealCard(
      deckSquares(poolFor(pools, live.themeId), live.deck),
      live.seed,
      playerId,
    ),
  });
}
