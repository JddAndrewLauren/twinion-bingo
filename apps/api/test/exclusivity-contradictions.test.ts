import type { Pool, PoolSquare } from '@twinion-bingo/theme';
import { describe, expect, it } from 'vitest';
import { composeDeck, dealCard } from '../src/games/deck.js';
import { defaultThemeId, loadPoolRegistry, poolFor } from '../src/games/pools.js';

/**
 * D6's exclusivity rule, checked against meaning rather than against the data
 * that implements it.
 *
 * `deck.test.ts` proves the mechanism: a card never holds two squares from one
 * `exclusivityGroup`. That is a tautology over whatever the pool says the groups
 * are, so it passes just as happily when two squares that contradict each other
 * sit in *different* groups — which is how "Nobody Retires" shipped alongside all
 * twenty-two "{driver} DNFs" squares. This file spells the contradictions out as
 * data, independently of the pool's own grouping, and deals real cards from the
 * real committed pool to prove none of them can meet.
 */
const pool: Pool = poolFor(loadPoolRegistry(), defaultThemeId());

const handcrafted = (key: string): string =>
  `${pool.themeId}.${pool.poolVersion}:hand:${key}`;

/**
 * A set of squares whose truths are entangled: whatever the race does, no two of
 * them can be resolved independently, so a card holding two of them either
 * double-marks on one event or carries a cell that is already dead.
 *
 * Deliberately *not* listed here are the partial overlaps recorded on #59 —
 * `out:{driver}` vs `gravel:{driver}`, `stewards:time_penalty` vs
 * `penalty:{driver}`, `team:cadillac_overperforms` vs `in_points:PER`/`BOT`.
 * Those entangle on some outcomes and not others, so grouping them would exclude
 * the half that does not overlap. A family below entangles on *every* outcome.
 */
interface ContradictionFamily {
  name: string;
  /** Why every pair in the family is entangled, in one line. */
  why: string;
  holds: (square: PoolSquare) => boolean;
  /** How many squares the family covers, so a rename cannot quietly empty it. */
  size: number;
}

const FAMILIES: ContradictionFamily[] = [
  {
    name: 'retirement',
    why:
      'any car retiring makes "Nobody Retires" false, and an early, double or ' +
      'power-unit retirement is a retirement',
    holds: (square) =>
      square.templateId === 'driver_dnf' ||
      [
        handcrafted('early_retirement'),
        handcrafted('nobody_retires'),
        handcrafted('double_dnf'),
        handcrafted('power_unit_failure'),
      ].includes(square.id),
    size: 26,
  },
  {
    name: 'rain',
    why: 'the race is wet or it is dry, and fitting rain tyres settles which',
    holds: (square) =>
      [
        handcrafted('rain_arrives'),
        handcrafted('rain_never_arrives'),
        handcrafted('wet_tyres'),
      ].includes(square.id),
    size: 3,
  },
];

function membersOf(family: ContradictionFamily): PoolSquare[] {
  return pool.squares.filter((square) => family.holds(square));
}

describe('contradiction families in the committed pool', () => {
  it.each(FAMILIES)('covers the squares $name names', (family) => {
    expect(membersOf(family)).toHaveLength(family.size);
  });

  /**
   * The fix, stated where it is authored: entangled squares share one group. This
   * is the check that would have caught the defect at pool-build time rather than
   * after a card was dealt.
   */
  it.each(FAMILIES)('files every $name square under one exclusivity group', (family) => {
    const members = membersOf(family);
    const first = members[0]!;

    for (const square of members) {
      expect(
        square.exclusivityGroup,
        `"${square.id}" and "${first.id}" contradict each other (${family.why}), ` +
          'so they have to share one exclusivity group',
      ).toBe(first.exclusivityGroup);
    }
  });
});

/**
 * The end-to-end version: many seeds, six players each, dealt exactly as a room
 * deals them. A pool can satisfy the grouping check above and still fail here if
 * a future family is added that grouping alone cannot express.
 */
describe('cards dealt from the committed pool', () => {
  const SEEDS = 40;
  const PLAYERS = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('never holds two squares that contradict each other', () => {
    const byId = new Map(pool.squares.map((square) => [square.id, square]));
    let dealt = 0;

    for (let seed = 0; seed < SEEDS; seed += 1) {
      const deck = composeDeck(pool, `contradiction-seed-${seed}`);

      for (const player of PLAYERS) {
        const card = dealCard(deck, `contradiction-seed-${seed}`, player);

        for (const family of FAMILIES) {
          const held = card
            .map((id) => byId.get(id)!)
            .filter((square) => family.holds(square));

          if (held.length > 1) {
            expect.fail(
              `seed ${seed}, player ${player}: "${held[0]!.id}" and "${held[1]!.id}" ` +
                `are on the same card, but ${family.why}`,
            );
          }
        }

        dealt += 1;
      }
    }

    expect(dealt).toBe(SEEDS * PLAYERS.length);
  });
});
