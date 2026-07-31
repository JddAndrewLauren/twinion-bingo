import { CARD_SQUARES } from './deck.js';

/** 5x5 with a free centre (D4), so cell 12 is not one of the 24 dealt squares. */
const SIDE = 5;
const CENTRE_CELL = 12;

/**
 * The 12 lines of a 5x5 card — 5 rows, 5 columns, 2 diagonals — expressed as
 * indexes into a card's 24 dealt squares rather than into the 5x5 grid.
 *
 * The free centre is dropped rather than treated as always-marked, which comes
 * to the same thing: nothing has to happen for it to count, so the three lines
 * through it are complete when their other four squares are. Doing the drop here
 * is what lets the rest of this module work in card order — the same order the
 * grid renders and `marks` arrives in.
 */
export const LINES: readonly (readonly number[])[] = buildLines();

function buildLines(): number[][] {
  const rows = Array.from({ length: SIDE }, (_, row) =>
    Array.from({ length: SIDE }, (_, column) => row * SIDE + column),
  );
  const columns = Array.from({ length: SIDE }, (_, column) =>
    Array.from({ length: SIDE }, (_, row) => row * SIDE + column),
  );
  const diagonals = [
    Array.from({ length: SIDE }, (_, step) => step * SIDE + step),
    Array.from({ length: SIDE }, (_, step) => step * SIDE + (SIDE - 1 - step)),
  ];

  return [...rows, ...columns, ...diagonals].map((line) =>
    line
      .filter((cell) => cell !== CENTRE_CELL)
      .map((cell) => (cell < CENTRE_CELL ? cell : cell - 1)),
  );
}

/**
 * How many of the card's lines are complete, given the square ids that count for
 * this player. The card is the fixed list of ids; `counting` is whatever the
 * caller decided is claimable — which can be narrower than what is merely marked
 * when the player joined late or re-rolled (see `claimableSquares`).
 */
export function completedLines(
  squareIds: readonly string[],
  counting: ReadonlySet<string>,
): number {
  return LINES.filter((line) =>
    line.every((index) => {
      const id = squareIds[index];

      return id !== undefined && counting.has(id);
    }),
  ).length;
}

/** Every earnable square, which is the full house. The centre was never earned. */
export function isFullHouse(
  squareIds: readonly string[],
  counting: ReadonlySet<string>,
): boolean {
  return (
    squareIds.length === CARD_SQUARES &&
    squareIds.every((id) => counting.has(id))
  );
}
