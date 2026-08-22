import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolSquare, SquareSource, SquareTier } from '@twinion-bingo/theme';
import { describe, expect, it } from 'vitest';
import {
  CARD_SQUARES,
  DECK_SIZE,
  MAX_PER_TEMPLATE,
  MAX_RARE_PER_CARD,
  MIN_CERTAIN_PER_CARD,
  SOURCE_QUOTA,
  TIER_QUOTA,
  composeDeck,
  dealCard,
  type Deck,
} from '../src/games/deck.js';
import { defaultThemeId, loadPoolRegistry, poolFor, themesRoot } from '../src/games/pools.js';

/**
 * The quotas are proved against a committed synthetic pool rather than against the
 * real F1 one, because the real pool is authored copy: its counts move every time
 * a square is written, and these tests exist to pin numbers. The real pool gets its
 * own test below, asserting only that it can supply a deck at all.
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

  it('bounds one card at 5 rare and 6 certain, the ruling of 2026-07-29', () => {
    expect(MAX_RARE_PER_CARD).toBe(5);
    expect(MIN_CERTAIN_PER_CARD).toBe(6);
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
    const groups = new Set(fixture.squares.flatMap((s) => s.exclusivityGroups));

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
 * The other half of option C. This test was written to fail loudly while the
 * committed F1 pool was a 47-square starter that could not reach D6's quotas, and
 * to flip once #16 authored the pool for real — which #58 did. What it pins now is
 * that the committed artefact, not only the synthetic fixture, satisfies every
 * quota the composer refuses to bend.
 */
describe('composing a deck from the real F1 pool', () => {
  const f1 = poolFor(loadPoolRegistry(themesRoot()), defaultThemeId());

  it('composes a deck meeting every tier and source quota', () => {
    const deck = composeDeck(f1, 'seed-one');

    expect(deck).toHaveLength(DECK_SIZE);
    expect(tiersOf(deck)).toEqual(TIER_QUOTA);
    expect(sourcesOf(deck)).toEqual(SOURCE_QUOTA);
  });

  it('deals a full card from it, one square per exclusivity group', () => {
    const deck = composeDeck(f1, 'seed-one');
    const card = dealCard(deck, 'seed-one', 'player-a');
    const groups = deck
      .filter((square) => card.includes(square.id))
      .flatMap((square) => square.exclusivityGroups);

    expect(card).toHaveLength(CARD_SQUARES);
    // No two dealt squares share a group: a square can carry several, so the
    // union can run over CARD_SQUARES, but every group in it names exactly one.
    expect(new Set(groups).size).toBe(groups.length);
  });

  /**
   * "Without straining" (#59), as something executable. One lucky seed proves the
   * pool can be drawn from; it does not prove the pool is comfortable. A pool that
   * only just reaches the quotas succeeds on some seeds and exhausts all 200 draw
   * attempts on others, so the honest check is that every seed lands — and that a
   * full six-player room deals out of the resulting deck.
   */
  it('composes and deals for every seed, not just a lucky one', () => {
    for (let n = 0; n < 25; n += 1) {
      const seed = `strain-${n}`;
      const deck = composeDeck(f1, seed);

      expect(tiersOf(deck)).toEqual(TIER_QUOTA);
      expect(sourcesOf(deck)).toEqual(SOURCE_QUOTA);

      for (const player of ['a', 'b', 'c', 'd', 'e', 'f']) {
        expect(dealCard(deck, seed, `player-${player}`)).toHaveLength(CARD_SQUARES);
      }
    }
  });
});

/**
 * The card bounds, proved against the committed pool rather than the fixture.
 * The fixture is synthetic and even-handed; the real pool is authored copy, with
 * clustered exclusivity groups and an uneven tier spread, and it is the one cards
 * are actually dealt from. A dealer that only shuffles passes every other test in
 * this file and fails the first test here.
 */
describe('the card tier bounds, against the real F1 pool', () => {
  const f1 = poolFor(loadPoolRegistry(themesRoot()), defaultThemeId());
  const PLAYERS = ['a', 'b', 'c', 'd', 'e', 'f'];
  // 500 seeds x 6 players is the 3000-deal measurement this file's module
  // comment documents, extended (#122) into an executable regression: every one
  // of those 3000 deals has to come back 24 squares, or `dealCard` throws and
  // this whole describe block fails before a single expectation runs.
  const SEEDS = 500;

  /** Every card of a 500-seed, six-player room: 3000 cards, as tier counts. */
  const cards: Record<SquareTier, number>[] = [];

  for (let n = 0; n < SEEDS; n += 1) {
    const seed = `bounds-${n}`;
    const deck = composeDeck(f1, seed);
    const byId = new Map(deck.map((square) => [square.id, square]));

    for (const player of PLAYERS) {
      const card = dealCard(deck, seed, `player-${player}`);

      if (card.length !== CARD_SQUARES) {
        throw new Error(`seed ${seed}/${player} dealt ${card.length} squares, not ${CARD_SQUARES}`);
      }

      cards.push(tiersOf(card.map((id) => byId.get(id)!)));
    }
  }

  /** The population's shape, for the failure message: how many cards held each count. */
  const histogram = (tier: SquareTier) =>
    Object.fromEntries(
      [...new Set(cards.map((card) => card[tier]))]
        .sort((a, b) => a - b)
        .map((count) => [count, cards.filter((card) => card[tier] === count).length]),
    );

  it('never puts more than the cap of rare squares on a card', () => {
    const worst = Math.max(...cards.map((card) => card.rare));

    expect(worst, `rare per card: ${JSON.stringify(histogram('rare'))}`).toBeLessThanOrEqual(
      MAX_RARE_PER_CARD,
    );
  });

  it('never puts fewer than the floor of certain squares on a card', () => {
    const worst = Math.min(...cards.map((card) => card.certain));

    expect(
      worst,
      `certain per card: ${JSON.stringify(histogram('certain'))}`,
    ).toBeGreaterThanOrEqual(MIN_CERTAIN_PER_CARD);
  });

  it('still deals 24 squares with no two sharing a group under the bounds', () => {
    const deck = composeDeck(f1, 'bounds-0');
    const byId = new Map(deck.map((square) => [square.id, square]));

    for (const player of PLAYERS) {
      const card = dealCard(deck, 'bounds-0', `player-${player}`);
      const groups = card.flatMap((id) => byId.get(id)!.exclusivityGroups);

      expect(card, `player ${player}`).toHaveLength(CARD_SQUARES);
      expect(new Set(groups).size, `player ${player}`).toBe(groups.length);
    }

    expect(cards).toHaveLength(SEEDS * PLAYERS.length);
  });

  it('deals the same card again for the same deck, seed and player', () => {
    for (let n = 0; n < 5; n += 1) {
      const seed = `bounds-${n}`;
      const deck = composeDeck(f1, seed);

      for (const player of PLAYERS) {
        expect(dealCard(deck, seed, `player-${player}`), `${seed}/${player}`).toEqual(
          dealCard(deck, seed, `player-${player}`),
        );
      }
    }
  });

  /**
   * The bounds hold above; this is the shape underneath them, and it is here so a
   * dealer that satisfies the bounds by some degenerate route — always exactly the
   * cap, or always the floor — is caught too. Both bounds bind often on the real
   * pool: with 7 rare in 40 the cap is the common case, and the floor is reached
   * on roughly one card in seven. The bands are wide because these are empirical
   * numbers, not decisions; they exist to catch a collapse, not to pin a value.
   */
  it('spreads the tiers under the bounds rather than pinning them to it', () => {
    const at = (tier: SquareTier, count: number) =>
      cards.filter((card) => card[tier] === count).length / cards.length;
    const mean = (tier: SquareTier) =>
      cards.reduce((total, card) => total + card[tier], 0) / cards.length;
    const shape = `rare ${JSON.stringify(histogram('rare'))}, certain ${JSON.stringify(histogram('certain'))}`;

    // The cap binds, but a third of cards sit below it rather than all at it.
    expect(at('rare', MAX_RARE_PER_CARD), shape).toBeGreaterThan(0.1);
    expect(at('rare', MAX_RARE_PER_CARD), shape).toBeLessThan(0.6);
    expect(mean('rare'), shape).toBeGreaterThan(2.5);
    expect(mean('rare'), shape).toBeLessThan(4.5);

    // The floor binds too, and cards routinely carry well over it.
    expect(at('certain', MIN_CERTAIN_PER_CARD), shape).toBeGreaterThan(0.02);
    expect(at('certain', MIN_CERTAIN_PER_CARD), shape).toBeLessThan(0.5);
    expect(mean('certain'), shape).toBeGreaterThan(MIN_CERTAIN_PER_CARD);
  });
});

/**
 * The bounds are not a property of 13/20/7. Thirteen certain squares are plenty
 * of squares and far too few groups if they cluster, so the deck that cannot be
 * dealt within the bounds has to be refused where it is drawn, and the deal has
 * to refuse a deck it is handed anyway.
 */
describe('refusing a deck the bounds cannot be met from', () => {
  /** One square per group, tiers in the order given: a deck built to fail. */
  function deckOf(tiers: readonly SquareTier[]): Deck {
    return tiers.map((tier, index) => ({
      id: `x.v1:t:${index}`,
      label: `Square ${index}`,
      description: 'A square.',
      tier,
      source: 'generated',
      exclusivityGroups: [`group-${index}`],
      entities: {},
      templateId: 't',
    })) satisfies PoolSquare[];
  }

  function tiers(counts: Partial<Record<SquareTier, number>>): SquareTier[] {
    return TIERS.flatMap((tier) =>
      Array.from({ length: counts[tier] ?? 0 }, (): SquareTier => tier),
    );
  }

  it('names the certain groups it is short of', () => {
    const deck = deckOf(tiers({ certain: 5, medium: 35 }));

    expect(() => dealCard(deck, 'seed-one', 'player-a')).toThrow(
      /only 5 of its exclusivity groups hold a certain square, and a card needs 6/,
    );
  });

  it('names the non-rare groups it is short of', () => {
    const deck = deckOf(tiers({ certain: 18, rare: 22 }));

    expect(() => dealCard(deck, 'seed-one', 'player-a')).toThrow(
      /only 18 of its exclusivity groups hold a non-rare square, and a card capped at 5 rare needs 19/,
    );
  });

  /**
   * A pool that satisfies every quota the composer checks and still cannot yield
   * a dealable deck: its certain squares are plentiful but sit in three groups,
   * so no draw of thirteen of them can put six certain on a card.
   */
  it('refuses at the composer, not mid-game at the deal', () => {
    const clustered: Pool = {
      ...fixture,
      squares: fixture.squares.map((square, index) =>
        square.tier === 'certain'
          ? { ...square, exclusivityGroups: [`safety-car-${index % 3}`] }
          : square,
      ),
    };

    expect(() => composeDeck(clustered, 'seed-one')).toThrow(
      /at least 6 certain and at most 5 rare/,
    );
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
    const groups = card.flatMap((id) => byId.get(id)!.exclusivityGroups);

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
      exclusivityGroups: [index < 4 ? 'one' : 'two'],
      entities: {},
      templateId: 't',
    })) satisfies PoolSquare[];

    expect(() => dealCard(cramped, 'seed-one', 'player-a')).toThrow(
      /only 2 distinct exclusivity groups/,
    );
  });
});

/**
 * D6's quotas and the exclusivity groups above stop *contradictions* — two
 * squares that cannot both be true. Neither stops *crowding*: three squares
 * that contradict nothing but all name the same driver, which would put a
 * third of the grid on one competitor (#123). This deck is built so that
 * without a driver cap, three of its squares — in three different groups —
 * would otherwise all land on one card.
 */
describe('at most one square per driver per card (#123)', () => {
  function driverSquare(
    id: string,
    tier: SquareTier,
    group: string,
    drivers: readonly string[],
    source: SquareSource = 'generated',
  ): PoolSquare {
    return {
      id,
      label: id,
      description: 'A square.',
      tier,
      source,
      exclusivityGroups: [group],
      entities: { driver: [...drivers] },
      templateId: source === 'generated' ? 't' : null,
    };
  }

  /** Every driver a dealt card's squares name, generated or hand-crafted alike. */
  function drivenBy(card: readonly string[], byId: Map<string, PoolSquare>): string[] {
    return card.flatMap((id) => byId.get(id)!.entities.driver ?? []);
  }

  /**
   * 6 certain filler squares (own driver, own group, meeting the certain
   * floor on their own) plus 21 medium filler squares, plus three squares
   * that all name driver "X" in three different groups — one of them
   * hand-crafted (`templateId: null`), so the cap is proved source-agnostic,
   * not just for generated squares. 30 squares in 30 distinct groups, so
   * `cardBoundsShortfalls` sees plenty — the driver cap is the only thing
   * standing between this deck and a card that names "X" three times.
   */
  function crowdedDeck(): Deck {
    const certainFiller = Array.from({ length: 6 }, (_, i) =>
      driverSquare(`c${i}`, 'certain', `gc${i}`, [`filler-c${i}`]),
    );
    const mediumFiller = Array.from({ length: 21 }, (_, i) =>
      driverSquare(`m${i}`, 'medium', `gm${i}`, [`filler-m${i}`]),
    );
    const crowd = [
      driverSquare('x1', 'certain', 'x-wins', ['X']),
      driverSquare('x2', 'certain', 'x-podium', ['X']),
      driverSquare('x3', 'certain', 'x-fastest-lap', ['X'], 'handcrafted'),
    ];

    return [...certainFiller, ...mediumFiller, ...crowd];
  }

  it('never deals two squares naming the same driver', () => {
    const deck = crowdedDeck();
    const byId = new Map(deck.map((square) => [square.id, square]));

    for (let n = 0; n < 50; n += 1) {
      const card = dealCard(deck, `crowd-${n}`, 'player-a');
      const drivers = drivenBy(card, byId);

      expect(new Set(drivers).size, `seed crowd-${n}`).toBe(drivers.length);
    }
  });

  /**
   * A single square can name two of the same entity type — "2021 Nostalgia"
   * in the real F1 pool names both Verstappen and Hamilton — so taking it
   * has to claim both drivers, not just the first.
   */
  it('never deals a second square for either driver a two-driver square names', () => {
    const filler = Array.from({ length: 22 }, (_, i) =>
      driverSquare(`f${i}`, 'certain', `gf${i}`, [`filler-${i}`]),
    );
    const twoDriver = driverSquare('nostalgia', 'certain', 'nostalgia-group', ['X', 'Y']);
    const echoX = driverSquare('echo-x', 'medium', 'echo-x-group', ['X']);
    const echoY = driverSquare('echo-y', 'medium', 'echo-y-group', ['Y']);
    const deck: Deck = [...filler, twoDriver, echoX, echoY];
    const byId = new Map(deck.map((square) => [square.id, square]));

    for (let n = 0; n < 50; n += 1) {
      const card = dealCard(deck, `nostalgia-${n}`, 'player-a');
      const drivers = drivenBy(card, byId);

      expect(new Set(drivers).size, `seed nostalgia-${n}`).toBe(drivers.length);
      if (card.includes('nostalgia')) {
        expect(card, `seed nostalgia-${n}`).not.toEqual(
          expect.arrayContaining(['echo-x', 'echo-y']),
        );
      }
    }
  });

  /**
   * The real F1 pool, over many seeded deals — not just the synthetic decks
   * above. This is the regression that would have caught #123's own gap: the
   * pool's hand-crafted squares (`max_complains`, `hammertime`,
   * `alonso_age_stat`, `russell_bad_luck`, `orange_smoke`, `nostalgia_2021`)
   * name a driver too, and a card pairing one of them with a generated
   * square for the same driver is exactly the crowding this issue exists to
   * stop. IndyCar's pool cannot compose a deck at all yet (it has no
   * hand-crafted squares against D6's quota, a pre-existing gap unrelated to
   * this cap — see the PR), so it is not exercised through `composeDeck`
   * here. The mechanism itself reads only `entities.driver`, whatever the
   * theme, and does not special-case F1: the synthetic-deck tests above are
   * what prove that.
   */
  it('holds for the real F1 pool, over many seeded deals, hand-crafted squares included', () => {
    const f1 = poolFor(loadPoolRegistry(themesRoot()), defaultThemeId());
    const namedDriverHandcrafted = f1.squares.filter(
      (square) => square.source === 'handcrafted' && (square.entities.driver?.length ?? 0) > 0,
    );

    // The audit behind this fix, pinned: exactly these six hand-crafted
    // squares name a driver in the committed F1 pool, and one of them names
    // two. If this count changes, the pool changed and this test should be
    // revisited alongside it, not silently pass either side.
    expect(namedDriverHandcrafted.map((square) => square.id).sort()).toEqual(
      [
        'f1.v3:hand:alonso_age_stat',
        'f1.v3:hand:hammertime',
        'f1.v3:hand:max_complains',
        'f1.v3:hand:nostalgia_2021',
        'f1.v3:hand:orange_smoke',
        'f1.v3:hand:russell_bad_luck',
      ].sort(),
    );
    expect(
      namedDriverHandcrafted.find((square) => square.id === 'f1.v3:hand:nostalgia_2021')?.entities
        .driver,
    ).toEqual(['VER', 'HAM']);

    for (let n = 0; n < 25; n += 1) {
      const seed = `driver-cap-${n}`;
      const deck = composeDeck(f1, seed);
      const byId = new Map(deck.map((square) => [square.id, square]));

      for (const player of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const card = dealCard(deck, seed, `player-${player}`);
        const drivers = drivenBy(card, byId);

        expect(new Set(drivers).size, `seed ${seed}/${player}`).toBe(drivers.length);
      }
    }
  });
});

/**
 * A square holding several exclusivity groups (#121) can make the three-pass
 * deal claim more than one group's worth of budget on a single square, which is
 * what turns `dealCard`'s "Unreachable" throw reachable (#122): the shortfall
 * check's counts stay necessary but stop being sufficient. These decks pass
 * `cardBoundsShortfalls` — a card of 24 groups genuinely fits — but a single
 * shuffle can still land short depending on the order a multi-group square is
 * offered relative to the squares it overlaps.
 */
describe('dealing a card under multi-group squares (#122)', () => {
  function sq(id: string, tier: SquareTier, groups: string[]): PoolSquare {
    return {
      id,
      label: id,
      description: 'A square.',
      tier,
      source: 'generated',
      exclusivityGroups: groups,
      entities: {},
      templateId: 't',
    };
  }

  /**
   * 6 certain, 13 solo medium, 5 solo rare: 24 distinct groups, exactly enough
   * for the card. `q` adds no new group — it doubles up on two of the medium
   * squares' groups — so whether a card reaches 24 depends on whether `q` is
   * offered before or after `m0` and `m1` in the shuffle. Confirmed against the
   * pre-#122 three-pass-only algorithm: roughly half of 200 trial seeds threw.
   */
  function orderDependentDeck(): Deck {
    const certain = Array.from({ length: MIN_CERTAIN_PER_CARD }, (_, i) =>
      sq(`c${i}`, 'certain', [`g${i}`]),
    );
    const medium = Array.from({ length: 13 }, (_, i) => sq(`m${i}`, 'medium', [`h${i}`]));
    const doubled = sq('q', 'medium', ['h0', 'h1']);
    const rare = Array.from({ length: MAX_RARE_PER_CARD }, (_, i) => sq(`r${i}`, 'rare', [`r${i}`]));

    return [...certain, ...medium, doubled, ...rare];
  }

  it('still deals 24 squares across many seeds, retrying past a short shuffle', () => {
    const deck = orderDependentDeck();

    for (let n = 0; n < 200; n += 1) {
      const card = dealCard(deck, `order-${n}`, 'player-a');
      const groups = card.flatMap((id) => deck.find((square) => square.id === id)!.exclusivityGroups);

      expect(card, `seed order-${n}`).toHaveLength(CARD_SQUARES);
      expect(new Set(groups).size, `seed order-${n}`).toBe(groups.length);
    }
  });

  /**
   * A deck no shuffle can deal: every square shares one common group, so at most
   * one square can ever be taken. `cardBoundsShortfalls` cannot see this — the
   * necessary counts all pass — so this is the real failure path DEAL_ATTEMPTS
   * exists for, not the removed "Unreachable" assertion.
   */
  it('gives up with a named error, not a false assertion, on a truly undealable deck', () => {
    const commonGroup = 'shared';
    const certain = Array.from({ length: 6 }, (_, i) => sq(`c${i}`, 'certain', [`g${i}`, commonGroup]));
    const medium = Array.from({ length: 20 }, (_, i) => sq(`m${i}`, 'medium', [`h${i}`, commonGroup]));
    const rare = Array.from({ length: 14 }, (_, i) => sq(`r${i}`, 'rare', [`r${i}`, commonGroup]));
    const deck: Deck = [...certain, ...medium, ...rare];

    expect(() => dealCard(deck, 'seed-one', 'player-a')).toThrow(
      /could not deal a 24-square card .* after 200 reshuffles/,
    );
  });
});
