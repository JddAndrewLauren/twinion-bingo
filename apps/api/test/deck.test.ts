import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolSquare, SquareSource, SquareTier } from '@twinion-bingo/theme';
import { describe, expect, it } from 'vitest';
import {
  CARD_SQUARES,
  DECK_SIZE,
  DeckCompositionError,
  MAX_PER_TEMPLATE,
  SOURCE_QUOTA,
  TIER_QUOTA,
  composeDeck,
  dealCard,
  type Deck,
} from '../src/games/deck.js';
import { loadPoolRegistry, poolFor, themesRoot } from '../src/games/pools.js';

/**
 * The pool #7's numbers were written against does not exist yet — #16 authors the
 * F1 pool to ~180 squares, and the committed one is a 47-square starter. So the
 * quotas are proved against a committed synthetic pool of that size, and the real
 * pool gets its own test proving the composer refuses it loudly.
 *
 * The fixture is committed rather than generated in a `beforeAll` on purpose: a
 * pool that changed shape between runs would make every count below unstable,
 * and these tests exist precisely to pin counts.
 */
const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/pool-180.json'), 'utf8'),
) as Pool;

/** Counts every value, with the known keys present at zero rather than absent. */
function tally<K extends string>(
  keys: readonly K[],
  values: readonly K[],
): Record<K, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

  for (const value of values) counts[value] += 1;

  return counts;
}

const TIERS = ['certain', 'medium', 'rare'] as const satisfies SquareTier[];
const SOURCES = ['handcrafted', 'generated'] as const satisfies SquareSource[];

function tiersOf(squares: readonly PoolSquare[]): Record<SquareTier, number> {
  return tally(
    TIERS,
    squares.map((square) => square.tier),
  );
}

function sourcesOf(squares: readonly PoolSquare[]): Record<SquareSource, number> {
  return tally(
    SOURCES,
    squares.map((square) => square.source),
  );
}

/**
 * The quota tests below compare a drawn deck against these constants, so on their
 * own they would pass just as happily if the constants were changed. This is the
 * test that stops that: D6's numbers as literals, in one place, so editing a quota
 * is a deliberate act that fails here first.
 */
describe("D6's composition, as numbers", () => {
  it('is 40 squares, 13/20/7 by tier, ~24/~16 by source, 3 per template, 24 per card', () => {
    expect(DECK_SIZE).toBe(40);
    expect(TIER_QUOTA).toEqual({ certain: 13, medium: 20, rare: 7 });
    expect(SOURCE_QUOTA).toEqual({ handcrafted: 24, generated: 16 });
    expect(MAX_PER_TEMPLATE).toBe(3);
    expect(CARD_SQUARES).toBe(24);
  });

  it('splits the deck exactly, by tier and by source alike', () => {
    const sum = (counts: Record<string, number>) =>
      Object.values(counts).reduce((total, count) => total + count, 0);

    expect(sum(TIER_QUOTA)).toBe(DECK_SIZE);
    expect(sum(SOURCE_QUOTA)).toBe(DECK_SIZE);
  });
});

describe('the fixture pool', () => {
  it('is big enough to satisfy every quota, which is the point of it', () => {
    expect(fixture.squares).toHaveLength(180);
    expect(sourcesOf(fixture.squares).handcrafted).toBeGreaterThanOrEqual(
      SOURCE_QUOTA.handcrafted,
    );

    const tiers = tiersOf(fixture.squares);
    for (const tier of TIERS) {
      expect(tiers[tier]).toBeGreaterThanOrEqual(TIER_QUOTA[tier]);
    }
  });

  it('shares exclusivity groups between squares, so a card has to exclude some', () => {
    const groups = new Set(fixture.squares.map((s) => s.exclusivityGroup));

    expect(groups.size).toBeLessThan(fixture.squares.length);
  });
});

describe('composing a deck', () => {
  const deck = composeDeck(fixture, 'seed-one');

  it('draws exactly the deck size, with no square twice', () => {
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map((square) => square.id)).size).toBe(DECK_SIZE);
  });

  it('draws only squares that are in the pool', () => {
    const poolIds = new Set(fixture.squares.map((square) => square.id));

    expect(deck.every((square) => poolIds.has(square.id))).toBe(true);
  });

  it('hits the 13/20/7 tier mix exactly', () => {
    expect(tiersOf(deck)).toEqual(TIER_QUOTA);
  });

  it('hits the hand-crafted/generated source quota exactly', () => {
    expect(sourcesOf(deck)).toEqual(SOURCE_QUOTA);
  });

  it('takes no more than the cap from any one template', () => {
    const templateIds = deck
      .map((square) => square.templateId)
      .filter((id): id is string => id !== null);

    for (const templateId of new Set(templateIds)) {
      const count = templateIds.filter((id) => id === templateId).length;

      expect(count, `template ${templateId}`).toBeLessThanOrEqual(MAX_PER_TEMPLATE);
    }
  });

  /**
   * The cap is what stops a deck reading as "ten ways to say a driver retired",
   * and on a pool with fourteen templates it never has to do anything: sixteen
   * generated squares spread over fourteen templates rarely put four anywhere.
   * So this narrows the pool to seven templates, where an uncapped draw would
   * pile up — the only shape in which the cap is observable.
   */
  it('keeps the cap on a pool narrow enough for it to bite', () => {
    const narrow: Pool = {
      ...fixture,
      squares: fixture.squares.filter(
        (square) =>
          square.templateId === null || square.templateId <= 't07',
      ),
    };

    const templates = new Set(
      narrow.squares.map((square) => square.templateId).filter((id) => id !== null),
    );
    expect(templates.size).toBe(7);

    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const counts = new Map<string, number>();

      for (const square of composeDeck(narrow, seed)) {
        if (square.templateId === null) continue;
        counts.set(square.templateId, (counts.get(square.templateId) ?? 0) + 1);
      }

      expect(Math.max(...counts.values()), `seed ${seed}`).toBeLessThanOrEqual(3);
    }
  });

  /**
   * The properties above are asserted over the drawn deck rather than against a
   * hand-written expected array, so they hold for any seed rather than for the
   * one that happened to be written down.
   */
  it('holds those properties for other seeds too', () => {
    for (const seed of ['a', 'b', 'c', 'lights-out', '0']) {
      const other = composeDeck(fixture, seed);

      expect(other).toHaveLength(DECK_SIZE);
      expect(tiersOf(other)).toEqual(TIER_QUOTA);
      expect(sourcesOf(other)).toEqual(SOURCE_QUOTA);
    }
  });

  it('reproduces the same deck from the same seed, and a different one otherwise', () => {
    const ids = (from: Deck) => from.map((square) => square.id);

    expect(ids(composeDeck(fixture, 'seed-one'))).toEqual(ids(deck));
    expect(ids(composeDeck(fixture, 'seed-two'))).not.toEqual(ids(deck));
  });
});

/**
 * Option C, made executable. The committed F1 pool cannot supply this deck, and
 * the composer says so in numbers rather than degrading silently — the numbers
 * being the whole reason #7 was quarantined. When #16 lands, this test is what
 * will notice: it should start failing, and become a passing composition test.
 */
describe('composing a deck from the real F1 pool', () => {
  const f1 = poolFor(loadPoolRegistry(themesRoot()), 'f1.v1');

  it('refuses, naming the quotas the starter pool cannot reach', () => {
    expect(() => composeDeck(f1, 'seed-one')).toThrow(DeckCompositionError);

    let message = '';
    try {
      composeDeck(f1, 'seed-one');
    } catch (error) {
      message = (error as Error).message;
    }

    // 13 certain wanted, and the cap of 3 per template leaves fewer selectable
    // than the 8 the pool holds; 24 hand-crafted wanted against 5.
    expect(message).toContain('13 certain squares');
    expect(message).toContain('24 handcrafted squares');
  });

  it('is a shortfall in the pool, not in the composer: the fixture composes', () => {
    expect(composeDeck(fixture, 'seed-one')).toHaveLength(DECK_SIZE);
  });
});

describe('dealing a card', () => {
  const deck = composeDeck(fixture, 'seed-one');
  const card = dealCard(deck, 'seed-one', 'player-a');

  it('deals the 24 earnable squares of a 5x5 card with a free centre', () => {
    expect(card).toHaveLength(CARD_SQUARES);
    expect(new Set(card).size).toBe(CARD_SQUARES);
  });

  it('deals only from the room deck, never from the pool at large', () => {
    const deckIds = new Set(deck.map((square) => square.id));

    expect(card.every((id) => deckIds.has(id))).toBe(true);
  });

  it('puts at most one square per exclusivity group on a card', () => {
    const byId = new Map(deck.map((square) => [square.id, square]));
    const groups = card.map((id) => byId.get(id)!.exclusivityGroup);

    expect(new Set(groups).size).toBe(groups.length);
  });

  it('reproduces the same card from the same seed and player', () => {
    expect(dealCard(deck, 'seed-one', 'player-a')).toEqual(card);
  });

  it('deals different cards to different players from the one deck', () => {
    expect(dealCard(deck, 'seed-one', 'player-b')).not.toEqual(card);
  });

  it('deals a different card for the same player under a different seed', () => {
    expect(dealCard(deck, 'seed-two', 'player-a')).not.toEqual(card);
  });

  /**
   * The overlap that makes the call mechanic work: 24 of 40 puts each square on
   * roughly 3.6 of 6 cards, so an event nearly always has a second player
   * watching for it. A deal that drew independently from the pool would pass
   * every other test here and fail this one.
   */
  it('overlaps six players heavily, which is why cards come from one deck', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f'];
    const cards = players.map((player) => dealCard(deck, 'seed-one', player));

    const appearances = deck.map(
      (square) => cards.filter((held) => held.includes(square.id)).length,
    );
    const mean =
      appearances.reduce((total, count) => total + count, 0) / appearances.length;

    expect(mean).toBeGreaterThan(3);
    expect(appearances.filter((count) => count <= 1).length).toBeLessThan(4);
  });

  /**
   * The exclusivity rule, on a deck built to make it bite: eight squares, all in
   * one group but two. A card cannot be 24 squares here, so this is the guard
   * that the shortfall is loud rather than a three-square card.
   */
  it('refuses a deck with fewer distinct groups than a card has squares', () => {
    const cramped: Deck = Array.from({ length: 8 }, (_, index) => ({
      id: `x.v1:t:${index}`,
      label: `Square ${index}`,
      description: 'A square.',
      tier: 'medium',
      source: 'generated',
      exclusivityGroup: index < 4 ? 'one' : 'two',
      templateId: 't',
    })) satisfies PoolSquare[];

    expect(() => dealCard(cramped, 'seed-one', 'player-a')).toThrow(
      /only 2 distinct exclusivity groups/,
    );
  });
});
