import type { Pool, PoolSquare, SquareSource, SquareTier } from '@twinion-bingo/theme';
import { createRandom, shuffled } from './random.js';

/**
 * D6's composition, as numbers. These are hard quotas: the composer either draws
 * a deck that meets every one of them or it refuses to draw at all.
 *
 * Refusing is deliberate: the alternative is a relaxation policy invented here,
 * in code, and a loud failure is the honest version of "this pool is too thin".
 * The committed F1 pool is 300 squares and composes comfortably, so the refusal
 * is a guard on future themes rather than a description of this one.
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
 * The deck's 13/20/7 does not reach the card on its own. Dealing 24 of 40 by
 * shuffle alone put six or seven rare squares on 11.5% of cards across 3000
 * measured deals, and the worst card held seven rare against three certain —
 * most of a third of the grid dead all race, with almost nothing firing in the
 * opening laps. So the card is bounded directly, on top of the deck's quotas.
 *
 * Both bounds are one-sided on purpose. Capping rare protects the card from
 * being unplayable; flooring certain protects the opening laps from being
 * silent. Nothing bounds medium, which is what the card is mostly made of.
 */
export const MAX_RARE_PER_CARD = 5;

export const MIN_CERTAIN_PER_CARD = 6;

/**
 * How many independent draws to try before declaring the pool unable to supply a
 * deck. Each attempt fills slot by slot from whatever is still eligible, so it
 * can paint itself into a corner on an awkward pool; a restart costs nothing and
 * a healthy pool succeeds on the first one.
 */
const DRAW_ATTEMPTS = 200;

/**
 * How many reshuffles `dealCard` tries before declaring a deck undealable (#122).
 * A square holding several exclusivity groups can make one of the three passes
 * spend more than one group's worth of budget on a single square — order-
 * dependent, not a property of the deck — so a shuffle that comes up short is
 * retried against a fresh order rather than trusted as proof the deck cannot
 * deal. See docs/adr/0007-dealcard-retries-a-short-shuffle.md.
 */
const DEAL_ATTEMPTS = 200;

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

/** Resolves a stored deck of ids back to the pool squares needed for dealing. */
export function deckSquares(pool: Pool, deck: readonly string[]): Deck {
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

/**
 * Draws the room's deck. Every card in the game is dealt from this one deck
 * rather than independently from the pool — 24 of 40 puts each square on ~3.6 of
 * 6 cards, so there is nearly always a second player watching for it (D6).
 *
 * The tier quota is not what makes a deck dealable within the card bounds: 13
 * certain and 33 non-rare are plenty of squares, but squares that share an
 * exclusivity group count once on a card. A 13/20/7 deck whose certain squares
 * sit in five groups cannot put six certain on any card, whatever order it is
 * dealt in. That is a property of the draw, not of the numbers, so it is fixed
 * here — by rejecting such a draw and taking another — rather than by moving the
 * quotas, which would not fix it.
 */
export function composeDeck(pool: Pool, seed: string): Deck {
  assertPoolCanSupply(pool);

  const random = createRandom(seed);

  for (let attempt = 0; attempt < DRAW_ATTEMPTS; attempt += 1) {
    const deck = attemptDraw(pool.squares, random);

    // A deck no card can be dealt from is not a deck, so the composer is where
    // that is caught — not the deal, mid-game, for one unlucky player. The
    // shortfall counts are only necessary: they union group names, so a draw
    // whose squares all share one group passes them and still deals nothing,
    // and they do not read `entities` at all, so the driver cap is invisible to
    // them. Dealing one card proves what counting cannot, at the price of one
    // shuffle per candidate draw. A draw that is merely order-unlucky is
    // rejected here too — harmless, since there are DRAW_ATTEMPTS of them.
    if (
      deck !== undefined &&
      cardBoundsShortfalls(deck).length === 0 &&
      attemptDeal(deck, `${seed}:probe:${attempt}`) !== undefined
    ) {
      return deck;
    }
  }

  throw new DeckCompositionError(pool.themeId, [
    `no draw satisfying every quota was found in ${DRAW_ATTEMPTS} attempts, ` +
      'even though the per-tier and per-source counts above are individually sufficient — ' +
      'either the tier and source quotas cannot be met at the same time by this pool, ' +
      'or the draws that meet them spread too few exclusivity groups to deal a ' +
      `${CARD_SQUARES}-square card holding at least ${MIN_CERTAIN_PER_CARD} certain ` +
      `and at most ${MAX_RARE_PER_CARD} rare`,
  ]);
}

/**
 * Deals one player's 24 squares from the deck. A square can belong to several
 * exclusivity groups — a template declares the implication closure, not just its
 * own slot — and the deal takes a square only if it shares no group with
 * anything already taken. So a card never carries both "Norris wins" and
 * "Norris on the podium": winning implies a podium, so both squares carry
 * Norris's `finish` group and one event would otherwise mark two cells. At most
 * MAX_RARE_PER_CARD rare and at least MIN_CERTAIN_PER_CARD certain, so no player
 * spends a race staring at a grid that cannot fill.
 *
 * Exclusivity groups stop contradictions, not crowding: "Norris fastest lap",
 * "Norris leads a lap" and "Norris on the podium" contradict nothing, so
 * nothing above stops all three landing on one card and quietly handing a
 * third of the grid to one driver. So the deal also takes a square only if
 * none of the drivers it names (`entities.driver`, `CROWDING_ENTITY_TYPE`
 * below — almost always at most one, but a hand-crafted square can name two)
 * has already been taken — at most one square per driver per card (#123),
 * generated and hand-crafted squares alike. Teams get no cap of their own:
 * see docs/adr/0008-no-team-crowding-cap.md.
 *
 * Three passes over one shuffle, in bound order: the certain floor first, then
 * the non-rare squares up to the rare cap's complement, then anything left. Each
 * pass takes whatever the shuffle offers in an unused group, so no pass can
 * spend a budget a later pass needs and none of them can loop — 24 slots, three
 * single passes over a 40-square list. A greedy single pass could not do this:
 * it would spend the rare cap on squares whose groups also held a medium, and
 * then find the leftover groups were rare-only and the card short.
 *
 * Seeded by the game's seed and the player's id, so the same game with the same
 * roster deals the same cards however many times it is replayed. A shuffle that
 * comes up short is retried against a fresh order derived from the same seed
 * (#122), so the replay stays deterministic across attempts too.
 */
export function dealCard(deck: Deck, seed: string, playerId: string): string[] {
  const shortfalls = cardBoundsShortfalls(deck);
  if (shortfalls.length > 0) {
    throw new Error(
      `cannot deal a ${CARD_SQUARES}-square card from this deck:\n` +
        shortfalls.map((reason) => `  - ${reason}`).join('\n'),
    );
  }

  for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt += 1) {
    const attemptSeed = attempt === 0 ? `${seed}:${playerId}` : `${seed}:${playerId}:${attempt}`;
    const squareIds = attemptDeal(deck, attemptSeed);

    if (squareIds !== undefined) return squareIds;
  }

  // A real failure path, not an assumption: the shortfall check above is
  // necessary but not sufficient once a square can hold several exclusivity
  // groups, so a deck can pass it and still have no shuffle order that fills
  // all 24 slots. DEAL_ATTEMPTS reshuffles rule that out for every deck the
  // committed pools draw in practice (see the seeded-deal regression suite),
  // but the deck itself does not prove it, so this stays a loud, named error
  // rather than an "Unreachable" assertion (#122).
  throw new Error(
    `could not deal a ${CARD_SQUARES}-square card from a deck of ${deck.length} in ` +
      `${distinctGroups(deck)} distinct exclusivity groups after ${DEAL_ATTEMPTS} reshuffles`,
  );
}

/**
 * The `entities` key the driver cap (#123) reads. Hardcoded rather than
 * derived: it names a vocabulary word every theme's `entities.json` happens
 * to spell `driver`, not a structural property `Pool` enforces. IndyCar also
 * declares `indy500Driver` (unused by any template today); a square naming
 * only that type would silently escape this cap. If a theme ever needs the
 * cap to reach a second driver-shaped entity type, this is the one place to
 * widen.
 */
const CROWDING_ENTITY_TYPE = 'driver';

/** One shuffle's worth of the three-pass deal, or undefined if it fell short. */
function attemptDeal(deck: Deck, seed: string): string[] | undefined {
  const random = createRandom(seed);
  const order = shuffled(deck, random);
  const groups = new Set<string>();
  const drivers = new Set<string>();
  const squareIds: string[] = [];

  /** Fills up to `upTo` squares, taking only squares this pass will accept. */
  const fill = (upTo: number, accepts: (square: PoolSquare) => boolean): void => {
    for (const square of order) {
      if (squareIds.length === upTo) return;
      if (square.exclusivityGroups.some((group) => groups.has(group))) continue;
      const namedDrivers = square.entities[CROWDING_ENTITY_TYPE] ?? [];
      if (namedDrivers.some((driver) => drivers.has(driver))) continue;
      if (!accepts(square)) continue;

      for (const group of square.exclusivityGroups) groups.add(group);
      for (const driver of namedDrivers) drivers.add(driver);
      squareIds.push(square.id);
    }
  };

  fill(MIN_CERTAIN_PER_CARD, (square) => square.tier === 'certain');
  fill(CARD_SQUARES - MAX_RARE_PER_CARD, (square) => square.tier !== 'rare');
  fill(CARD_SQUARES, () => true);

  return squareIds.length === CARD_SQUARES ? squareIds : undefined;
}

/**
 * Why a deck cannot be dealt within the card bounds, or nothing if it can. The
 * three counts are necessary and sufficient together when every square holds
 * exactly one exclusivity group, which is what lets the deal above be three flat
 * passes rather than a search: a card is 24 groups of which at least
 * MIN_CERTAIN_PER_CARD must offer a certain square and at least
 * CARD_SQUARES - MAX_RARE_PER_CARD must offer a non-rare one, and the passes
 * claim those groups in that order, so each pass has what the count promised.
 *
 * A square that spans several groups can claim more than one pass's budget at
 * once, so the counts here stay necessary but stop being provably sufficient
 * on their own — used as a cheap early refusal for decks that are short on
 * their face, with `dealCard`'s reshuffle-and-retry (#122) covering the gap
 * a single flat pass can no longer close by itself.
 */
function cardBoundsShortfalls(deck: Deck): string[] {
  const groupsHolding = (accepts: (square: PoolSquare) => boolean): number =>
    new Set(deck.filter(accepts).flatMap((square) => square.exclusivityGroups)).size;

  const nonRareNeeded = CARD_SQUARES - MAX_RARE_PER_CARD;
  const total = distinctGroups(deck);
  const nonRare = groupsHolding((square) => square.tier !== 'rare');
  const certain = groupsHolding((square) => square.tier === 'certain');
  const reasons: string[] = [];

  if (total < CARD_SQUARES) {
    reasons.push(
      `it holds only ${total} distinct exclusivity groups, and a card is ` +
        `${CARD_SQUARES} squares in ${CARD_SQUARES} of them`,
    );
  }

  if (nonRare < nonRareNeeded) {
    reasons.push(
      `only ${nonRare} of its exclusivity groups hold a non-rare square, and a ` +
        `card capped at ${MAX_RARE_PER_CARD} rare needs ${nonRareNeeded}`,
    );
  }

  if (certain < MIN_CERTAIN_PER_CARD) {
    reasons.push(
      `only ${certain} of its exclusivity groups hold a certain square, and a ` +
        `card needs ${MIN_CERTAIN_PER_CARD}`,
    );
  }

  return reasons;
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
  return new Set(deck.flatMap((square) => square.exclusivityGroups)).size;
}
