import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolSquare, SquareSource, SquareTier } from '@twinion-bingo/theme';
import { describe, expect, it } from 'vitest';
import {
  CARD_SQUARES,
  DECK_SIZE,
  MAX_RARE_PER_CARD,
  MIN_CERTAIN_PER_CARD,
  SOURCE_QUOTA,
  TIER_QUOTA,
  cardBoundsShortfalls,
  composeToQuotas,
  feasibleMix,
} from '../src/games/deck.js';
import { defaultThemeId, loadPoolRegistry, poolFor, themesRoot } from '../src/games/pools.js';
import { createRandom } from '../src/games/random.js';

const TIERS = ['certain', 'medium', 'rare'] as const satisfies SquareTier[];
const SOURCES = ['handcrafted', 'generated'] as const satisfies SquareSource[];

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/pool-180.json'), 'utf8'),
) as Pool;

describe('the feasible mix of a healthy pool', () => {
  const mix = feasibleMix(fixture);

  it('reports a range for every tier and every source', () => {
    for (const tier of TIERS) {
      expect(mix.tier[tier].min, tier).toBeLessThanOrEqual(mix.tier[tier].max);
    }
    for (const source of SOURCES) {
      expect(mix.source[source].min, source).toBeLessThanOrEqual(mix.source[source].max);
    }
  });

  it("brackets D6's own default mix, since the default is itself a deck this pool composes", () => {
    for (const tier of TIERS) {
      expect(TIER_QUOTA[tier], tier).toBeGreaterThanOrEqual(mix.tier[tier].min);
      expect(TIER_QUOTA[tier], tier).toBeLessThanOrEqual(mix.tier[tier].max);
    }
    for (const source of SOURCES) {
      expect(SOURCE_QUOTA[source], source).toBeGreaterThanOrEqual(mix.source[source].min);
      expect(SOURCE_QUOTA[source], source).toBeLessThanOrEqual(mix.source[source].max);
    }
  });

  it('never lets certain drop below the card floor of 6', () => {
    expect(mix.tier.certain.min).toBeGreaterThanOrEqual(MIN_CERTAIN_PER_CARD);
  });

  it('never lets rare rise above the card ceiling of 21', () => {
    expect(mix.tier.rare.max).toBeLessThanOrEqual(DECK_SIZE - (CARD_SQUARES - MAX_RARE_PER_CARD));
  });
});

/**
 * Splits `DECK_SIZE - value` between the two tiers other than `target`, in
 * D6's own ratio — the same natural complement `feasibleMix` verified its
 * boundaries against, rebuilt here rather than imported so the test proves
 * the range through the public composer (`composeToQuotas`), not through the
 * range function's own internals.
 */
function proportionalTierQuota(target: SquareTier, value: number): Record<SquareTier, number> {
  const others = TIERS.filter((tier) => tier !== target) as [SquareTier, SquareTier];
  const weight = TIER_QUOTA[others[0]] + TIER_QUOTA[others[1]];
  const remaining = DECK_SIZE - value;
  const first = Math.round((remaining * TIER_QUOTA[others[0]]) / weight);

  return {
    [target]: value,
    [others[0]]: first,
    [others[1]]: remaining - first,
  } as Record<SquareTier, number>;
}

/** Whether a deck can actually be drawn and dealt at these quotas, for real. */
function composesAndDeals(
  pool: Pool,
  tierQuota: Record<SquareTier, number>,
  sourceQuota: Record<SquareSource, number>,
  seed: string,
): boolean {
  try {
    const deck = composeToQuotas(pool, tierQuota, sourceQuota, seed);
    return cardBoundsShortfalls(deck).length === 0;
  } catch {
    return false;
  }
}

describe("the feasible mix's boundaries, proved against the real composer", () => {
  const f1 = poolFor(loadPoolRegistry(themesRoot()), defaultThemeId());
  const mix = feasibleMix(f1);

  it('composes and deals at every tier boundary it reports', () => {
    for (const tier of TIERS) {
      const { min, max } = mix.tier[tier];

      expect(
        composesAndDeals(f1, proportionalTierQuota(tier, min), SOURCE_QUOTA, `boundary:${tier}:min`),
        `${tier} at its reported min of ${min}`,
      ).toBe(true);
      expect(
        composesAndDeals(f1, proportionalTierQuota(tier, max), SOURCE_QUOTA, `boundary:${tier}:max`),
        `${tier} at its reported max of ${max}`,
      ).toBe(true);
    }
  });

  it('composes and deals at every source boundary it reports', () => {
    for (const source of SOURCES) {
      const { min, max } = mix.source[source];
      const [other] = SOURCES.filter((candidate) => candidate !== source) as [SquareSource];

      expect(
        composesAndDeals(
          f1,
          TIER_QUOTA,
          { [source]: min, [other]: DECK_SIZE - min } as Record<SquareSource, number>,
          `boundary:${source}:min`,
        ),
        `${source} at its reported min of ${min}`,
      ).toBe(true);
      expect(
        composesAndDeals(
          f1,
          TIER_QUOTA,
          { [source]: max, [other]: DECK_SIZE - max } as Record<SquareSource, number>,
          `boundary:${source}:max`,
        ),
        `${source} at its reported max of ${max}`,
      ).toBe(true);
    }
  });
});

/** D6's fixed card-floor policy limits (#119): certain never drops below the
 * card's certain floor, rare never rises above its ceiling, whatever a given
 * pool's exclusivity groups might occasionally tolerate — "the guarantee the
 * host is not allowed to trade away". A boundary sitting exactly on one of
 * these is a deliberate policy limit, not a pool-derived one, so it is not
 * asserted unreachable one step further: a pool whose certain squares each
 * carry several exclusivity groups (the real F1 pool has some) can sometimes
 * still reach 6 certain groups from 5 certain squares, and that is fine — the
 * slider simply never offers it, by design, rather than by pool structure.
 */
const RARE_DECK_CEILING = DECK_SIZE - (CARD_SQUARES - MAX_RARE_PER_CARD);

/**
 * `feasibleMix`'s own default seed, and the seed pattern it probes each
 * candidate value under internally. Reused here rather than a fresh seed of
 * the test's own choosing: `composeToQuotas` is a 200-attempt retry search
 * (D6, `DRAW_ATTEMPTS`), and right at a genuine boundary a *different* seed
 * can land a different verdict by luck alone, same as `composeDeck` itself
 * has always been seed-sensitive at its own margins. Testing under the exact
 * seed `feasibleMix` searched under proves the boundary it actually found,
 * rather than re-litigating the search with different dice.
 */
const MIX_SEED = 'feasible-mix';

describe("the feasible mix's boundaries, proved against the real composer — one step outside", () => {
  const f1 = poolFor(loadPoolRegistry(themesRoot()), defaultThemeId());
  const mix = feasibleMix(f1, MIX_SEED);

  /**
   * A slider dragged one notch past what `feasibleMix` reports must be
   * unreachable under the same seed it was searched with, or the range is a
   * lie in the direction that matters — a human being told a mix is fine
   * when it isn't. Skipped at a fixed policy limit (see above), and at the
   * pool's edges (0 and `DECK_SIZE`), where there is no "one step further".
   */
  it('refuses one step below every reported tier and source minimum', () => {
    for (const tier of TIERS) {
      const value = mix.tier[tier].min - 1;
      if (value < 0 || mix.tier[tier].min === MIN_CERTAIN_PER_CARD) continue;

      expect(
        composesAndDeals(
          f1,
          proportionalTierQuota(tier, value),
          SOURCE_QUOTA,
          `${MIX_SEED}:tier:${tier}:${value}`,
        ),
        `${tier} at ${value}, one below its reported min`,
      ).toBe(false);
    }
    for (const source of SOURCES) {
      const value = mix.source[source].min - 1;
      if (value < 0) continue;
      const [other] = SOURCES.filter((candidate) => candidate !== source) as [SquareSource];

      expect(
        composesAndDeals(
          f1,
          TIER_QUOTA,
          { [source]: value, [other]: DECK_SIZE - value } as Record<SquareSource, number>,
          `${MIX_SEED}:source:${source}:${value}`,
        ),
        `${source} at ${value}, one below its reported min`,
      ).toBe(false);
    }
  });

  it('refuses one step above every reported tier and source maximum', () => {
    for (const tier of TIERS) {
      const value = mix.tier[tier].max + 1;
      if (value > DECK_SIZE || mix.tier[tier].max === RARE_DECK_CEILING) continue;

      expect(
        composesAndDeals(
          f1,
          proportionalTierQuota(tier, value),
          SOURCE_QUOTA,
          `${MIX_SEED}:tier:${tier}:${value}`,
        ),
        `${tier} at ${value}, one above its reported max`,
      ).toBe(false);
    }
    for (const source of SOURCES) {
      const value = mix.source[source].max + 1;
      if (value > DECK_SIZE) continue;
      const [other] = SOURCES.filter((candidate) => candidate !== source) as [SquareSource];

      expect(
        composesAndDeals(
          f1,
          TIER_QUOTA,
          { [source]: value, [other]: DECK_SIZE - value } as Record<SquareSource, number>,
          `${MIX_SEED}:source:${source}:${value}`,
        ),
        `${source} at ${value}, one above its reported max`,
      ).toBe(false);
    }
  });
});

/**
 * A synthetic pool, seeded and shaped like a committed theme's rather than the
 * fixture's even hand: templates repeat (so `MAX_PER_TEMPLATE` bites),
 * exclusivity groups sometimes overlap (so a square can carry more than one,
 * as #121 established real squares do), and the tier/source split is skewed
 * rather than uniform. Exists so the exactness property below is proved over
 * pool shapes this repo did not hand-pick, per #119's acceptance criteria.
 */
function syntheticPool(seed: string, size = 260): Pool {
  const random = createRandom(seed);
  const templates = Array.from({ length: 18 }, (_, index) => `synth-tpl-${index}`);
  const pickTier = (): SquareTier => {
    const roll = random();
    if (roll < 0.22) return 'certain';
    if (roll < 0.78) return 'medium';
    return 'rare';
  };

  const squares: PoolSquare[] = Array.from({ length: size }, (_, index) => {
    const handcrafted = random() < 0.25;
    const templateId = handcrafted ? null : templates[Math.floor(random() * templates.length)]!;
    // ~15% of squares double up on a neighbour's group, the way a template's
    // implication closure (D6) makes "wins" carry "podium" too.
    const groups =
      random() < 0.15 && index > 0 ? [`solo-${index}`, `solo-${index - 1}`] : [`solo-${index}`];

    return {
      id: `synthetic.v1:${seed}:${index}`,
      label: `Square ${index}`,
      description: 'Synthetic square.',
      tier: pickTier(),
      source: handcrafted ? 'handcrafted' : 'generated',
      exclusivityGroups: groups,
      entities: {},
      templateId,
    };
  });

  return { themeId: `synthetic-${seed}`, poolVersion: 'v1', freeCentre: 'FREE', squares };
}

describe('the feasible mix of seeded synthetic pools, not just the committed themes', () => {
  const SEEDS = ['synth-a', 'synth-b', 'synth-c', 'synth-d', 'synth-e'];

  for (const seed of SEEDS) {
    describe(`pool ${seed}`, () => {
      const pool = syntheticPool(seed);
      // Only pools that can supply D6's own default are exercised: a pool too
      // thin even for that has an empty feasible mix, which is a real and
      // separately-tested case (`assertPoolCanSupply`'s own suite), not this
      // property's.
      let composable = true;
      try {
        composeToQuotas(pool, TIER_QUOTA, SOURCE_QUOTA, seed);
      } catch {
        composable = false;
      }

      /**
       * The "inside" half of exactness, over pool shapes this repo did not
       * hand-pick: every reported boundary itself composes and deals. The
       * "outside" half — one step past a boundary always failing — is proved
       * above against the real F1 pool (#119's "every committed theme"), not
       * repeated here: a synthetic pool with a doubled-up exclusivity group
       * can let a mix one step past an *arithmetic* boundary still deal (the
       * same reason `cardBoundsShortfalls`'s own counts are "necessary, not
       * sufficient" — see that function's comment), so asserting it here
       * would be asserting a property the domain itself does not guarantee,
       * not testing this function.
       */
      it.runIf(composable)('composes and deals at every reported boundary', () => {
        const mix = feasibleMix(pool, seed);

        for (const tier of TIERS) {
          const { min, max } = mix.tier[tier];

          expect(
            composesAndDeals(pool, proportionalTierQuota(tier, min), SOURCE_QUOTA, `${seed}:tier:${tier}:${min}`),
            `${seed}: ${tier} at its reported min of ${min}`,
          ).toBe(true);
          expect(
            composesAndDeals(pool, proportionalTierQuota(tier, max), SOURCE_QUOTA, `${seed}:tier:${tier}:${max}`),
            `${seed}: ${tier} at its reported max of ${max}`,
          ).toBe(true);
        }

        for (const source of SOURCES) {
          const { min, max } = mix.source[source];
          const [other] = SOURCES.filter((candidate) => candidate !== source) as [SquareSource];
          const quotaAt = (value: number) =>
            ({ [source]: value, [other]: DECK_SIZE - value }) as Record<SquareSource, number>;

          expect(
            composesAndDeals(pool, TIER_QUOTA, quotaAt(min), `${seed}:source:${source}:${min}`),
            `${seed}: ${source} at its reported min of ${min}`,
          ).toBe(true);
          expect(
            composesAndDeals(pool, TIER_QUOTA, quotaAt(max), `${seed}:source:${source}:${max}`),
            `${seed}: ${source} at its reported max of ${max}`,
          ).toBe(true);
        }
      });

      /** The policy limits (#119) never move, whatever the pool looks like. */
      it.runIf(composable)('never reports certain below the card floor or rare above its ceiling', () => {
        const mix = feasibleMix(pool, seed);

        expect(mix.tier.certain.min, seed).toBeGreaterThanOrEqual(MIN_CERTAIN_PER_CARD);
        expect(mix.tier.rare.max, seed).toBeLessThanOrEqual(RARE_DECK_CEILING);
      });
    });
  }
});
