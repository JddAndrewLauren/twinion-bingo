import type { Pool, PoolSquare, SquareSource, SquareTier } from '@twinion-bingo/theme';
import { createRandom, shuffled } from './random.js';

/**
 * D6's composition, as numbers. These are hard quotas: the composer either draws
 * a deck that meets every one of them or it refuses to draw at all.
 *
 * Refusing is deliberate. The committed F1 pool is a 47-square starter that
 * cannot satisfy them — see #16, which authors it to ~180 — and the alternative
 * to refusing is a relaxation policy invented here, in code, for a pool that is
 * about to be replaced. A loud failure is the honest version of "not yet".
 */
export const DECK_SIZE = 40;

export const TIER_QUOTA: Record<SquareTier, number> = {
  certain: 13,
  medium: 20,
  rare: 7,
};

/** ~24 of the 40 hand-written, so the deck's character is guaranteed (D6). */
export const SOURCE_QUOTA: Record<SquareSource, number> = {
  handcrafted: 24,
  generated: 16,
};

/**
 * Per deck, not per card: it is what stops a deck reading as "ten ways to say a
 * driver retired". A template with more than this many squares in the pool
 * simply contributes at most this many.
 */
export const MAX_PER_TEMPLATE = 3;

/** 5x5 with a free centre (D4). The centre is the theme's, not a pool square. */
export const CARD_SQUARES = 24;

/**
 * How many independent draws to try before declaring the pool unable to supply a
 * deck. Each attempt fills slot by slot from whatever is still eligible, so it
 * can paint itself into a corner on an awkward pool; a restart costs nothing and
 * a healthy pool succeeds on the first one.
 */
const DRAW_ATTEMPTS = 200;

export class DeckCompositionError extends Error {
  constructor(themeId: string, reasons: string[]) {
    super(
      `cannot compose a ${DECK_SIZE}-square deck from theme "${themeId}":\n` +
        reasons.map((reason) => `  - ${reason}`).join('\n'),
    );
    this.name = 'DeckCompositionError';
  }
}

/**
 * The composed deck: the squares themselves, because dealing needs their
 * exclusivity groups. Only the ids are stored on the game row.
 */
export type Deck = PoolSquare[];

/**
 * Draws the room's deck. Every card in the game is dealt from this one deck
 * rather than independently from the pool — 24 of 40 puts each square on ~3.6 of
 * 6 cards, so there is nearly always a second player watching for it (D6).
 */
export function composeDeck(pool: Pool, seed: string): Deck {
  assertPoolCanSupply(pool);

  const random = createRandom(seed);

  for (let attempt = 0; attempt < DRAW_ATTEMPTS; attempt += 1) {
    const deck = attemptDraw(pool.squares, random);

    // A deck with fewer distinct exclusivity groups than a card has squares
    // cannot be dealt from at all, so it is not a deck.
    if (deck !== undefined && distinctGroups(deck) >= CARD_SQUARES) return deck;
  }

  throw new DeckCompositionError(pool.themeId, [
    `no draw satisfying every quota was found in ${DRAW_ATTEMPTS} attempts, ` +
      'even though the per-tier and per-source counts above are individually sufficient — ' +
      'the tier and source quotas cannot be met at the same time by this pool',
  ]);
}

/**
 * Deals one player's 24 squares from the deck. At most one square per exclusivity
 * group, so a card never carries both "Norris wins" and "Norris on the podium" —
 * one event would mark two cells.
 *
 * Seeded by the game's seed and the player's id, so the same game with the same
 * roster deals the same cards however many times it is replayed.
 */
export function dealCard(deck: Deck, seed: string, playerId: string): string[] {
  const random = createRandom(`${seed}:${playerId}`);
  const groups = new Set<string>();
  const squareIds: string[] = [];

  for (const square of shuffled(deck, random)) {
    if (squareIds.length === CARD_SQUARES) break;
    if (groups.has(square.exclusivityGroup)) continue;

    groups.add(square.exclusivityGroup);
    squareIds.push(square.id);
  }

  // Unreachable for a deck from `composeDeck`, which will not return one with
  // fewer than CARD_SQUARES distinct groups. Asserted rather than assumed
  // because a card short of 24 squares would be a silently unplayable game.
  if (squareIds.length !== CARD_SQUARES) {
    throw new Error(
      `dealt ${squareIds.length} squares, not ${CARD_SQUARES}: the deck holds ` +
        `only ${distinctGroups(deck)} distinct exclusivity groups`,
    );
  }

  return squareIds;
}

/**
 * One draw: fill the deck slot by slot, each time choosing uniformly among the
 * squares that are still eligible. Picking from what the remaining quotas allow
 * — rather than picking freely and repairing afterwards — is what makes the tier
 * mix, the source split and the template cap all come out exact.
 *
 * Returns undefined when a slot has nothing eligible left, which is a restart.
 */
function attemptDraw(
  squares: readonly PoolSquare[],
  random: () => number,
): Deck | undefined {
  const tierLeft = { ...TIER_QUOTA };
  const sourceLeft = { ...SOURCE_QUOTA };
  const perTemplate = new Map<string, number>();
  const taken = new Set<string>();
  const deck: Deck = [];

  while (deck.length < DECK_SIZE) {
    const eligible = squares.filter(
      (square) =>
        !taken.has(square.id) &&
        tierLeft[square.tier] > 0 &&
        sourceLeft[square.source] > 0 &&
        (square.templateId === null ||
          (perTemplate.get(square.templateId) ?? 0) < MAX_PER_TEMPLATE),
    );

    const picked = eligible[Math.floor(random() * eligible.length)];
    if (picked === undefined) return undefined;

    taken.add(picked.id);
    tierLeft[picked.tier] -= 1;
    sourceLeft[picked.source] -= 1;
    if (picked.templateId !== null) {
      perTemplate.set(
        picked.templateId,
        (perTemplate.get(picked.templateId) ?? 0) + 1,
      );
    }
    deck.push(picked);
  }

  return deck;
}

/**
 * The arithmetic the pool has to pass before a draw is even worth attempting,
 * and the whole point of failing loudly: the message names every quota the pool
 * cannot reach, so "the pool is too small" arrives as a list of numbers rather
 * than as a timeout.
 *
 * A template contributes at most MAX_PER_TEMPLATE squares however many it holds,
 * so availability is counted under that cap and not as a raw total — that is the
 * constraint that binds first and the one a raw square count hides.
 */
function assertPoolCanSupply(pool: Pool): void {
  const reasons: string[] = [];

  for (const tier of Object.keys(TIER_QUOTA) as SquareTier[]) {
    const available = selectableCount(
      pool.squares.filter((square) => square.tier === tier),
    );

    if (available < TIER_QUOTA[tier]) {
      reasons.push(
        `needs ${TIER_QUOTA[tier]} ${tier} squares, and only ${available} are ` +
          `selectable (of ${pool.squares.filter((s) => s.tier === tier).length} in the pool, ` +
          `under the cap of ${MAX_PER_TEMPLATE} per template)`,
      );
    }
  }

  for (const source of Object.keys(SOURCE_QUOTA) as SquareSource[]) {
    const available = selectableCount(
      pool.squares.filter((square) => square.source === source),
    );

    if (available < SOURCE_QUOTA[source]) {
      reasons.push(
        `needs ${SOURCE_QUOTA[source]} ${source} squares, and only ${available} are selectable`,
      );
    }
  }

  if (reasons.length > 0) throw new DeckCompositionError(pool.themeId, reasons);
}

/** How many of these squares a single deck could hold, template cap included. */
function selectableCount(squares: readonly PoolSquare[]): number {
  const perTemplate = new Map<string, number>();
  let handcrafted = 0;

  for (const square of squares) {
    if (square.templateId === null) {
      handcrafted += 1;
      continue;
    }
    perTemplate.set(
      square.templateId,
      (perTemplate.get(square.templateId) ?? 0) + 1,
    );
  }

  return [...perTemplate.values()].reduce(
    (total, count) => total + Math.min(count, MAX_PER_TEMPLATE),
    handcrafted,
  );
}

function distinctGroups(deck: Deck): number {
  return new Set(deck.map((square) => square.exclusivityGroup)).size;
}
