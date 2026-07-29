import type { Pool } from '@twinion-bingo/theme';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { cards, games } from '../db/schema.js';
import { dealCard, type Deck } from './deck.js';
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
      deck: games.deck,
      seed: games.seed,
    })
    .from(games)
    .where(and(eq(games.roomCode, code), eq(games.state, 'live')));

  if (live === undefined) return;

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

/**
 * The stored deck is a list of ids; dealing needs the squares themselves, for
 * their exclusivity groups — a card must never hold two squares one event would
 * mark.
 */
function deckSquares(pool: Pool, deck: readonly string[]): Deck {
  const byId = new Map(pool.squares.map((square) => [square.id, square]));

  return deck.map((id) => {
    const square = byId.get(id);

    if (square === undefined) {
      throw new Error(
        `the live deck holds square "${id}", which theme ${pool.themeId} has no square for`,
      );
    }

    return square;
  });
}
