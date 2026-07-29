import { describe, expect, it } from 'vitest';
import { CARD_SQUARES } from '../src/games/deck.js';
import { LINES, completedLines, isFullHouse } from '../src/games/lines.js';
import { elapsedStamp } from '../src/games/prizes.js';

/** A card's ids, in the order the grid lays them out. */
const card = Array.from({ length: CARD_SQUARES }, (_, index) => `s${index}`);

const marking = (...indexes: number[]) =>
  new Set(indexes.map((index) => card[index]!));

describe('the lines of a 5x5 card', () => {
  it('is 5 rows, 5 columns and 2 diagonals', () => {
    expect(LINES).toHaveLength(12);
  });

  /**
   * The free centre is not a dealt square (D4), so the three lines through it —
   * the middle row, the middle column and both diagonals — are four squares
   * long, and the other eight are five.
   */
  it('drops the free centre rather than requiring it', () => {
    expect(LINES.filter((line) => line.length === 4)).toHaveLength(4);
    expect(LINES.filter((line) => line.length === 5)).toHaveLength(8);
    expect(LINES.every((line) => line.every((index) => index < CARD_SQUARES))).toBe(true);
  });

  it('counts a top row as one line', () => {
    expect(completedLines(card, marking(0, 1, 2, 3, 4))).toBe(1);
  });

  /** Grid cells 2, 7, 17, 22 — the centre column, minus the free middle. */
  it('completes a line through the centre on four squares', () => {
    expect(completedLines(card, marking(2, 7, 16, 21))).toBe(1);
  });

  it('counts a row and a column crossing it as two lines', () => {
    // Top row (0-4) plus the left column: grid cells 0, 5, 10, 15, 20.
    expect(completedLines(card, marking(0, 1, 2, 3, 4, 5, 10, 14, 19))).toBe(2);
  });

  it('is not a line one square short', () => {
    expect(completedLines(card, marking(0, 1, 2, 3))).toBe(0);
  });

  it('calls every earnable square a full house, and 23 of them not one', () => {
    expect(isFullHouse(card, new Set(card))).toBe(true);
    expect(isFullHouse(card, new Set(card.slice(1)))).toBe(false);
  });
});

/**
 * Elapsed game time, not lap numbers — there is no live timing feed and
 * hand-entered laps are not worth the friction.
 */
describe('the timeline stamp', () => {
  const started = new Date('2026-08-23T13:00:00Z');
  const at = (seconds: number) => new Date(started.getTime() + seconds * 1000);

  it('reads as +MM:SS', () => {
    expect(elapsedStamp(started, at(42 * 60 + 10))).toBe('+42:10');
    expect(elapsedStamp(started, at(0))).toBe('+00:00');
    expect(elapsedStamp(started, at(9))).toBe('+00:09');
  });

  /** A race is two hours; +124:03 reads as further in than +2:04:03 does. */
  it('runs minutes past 60 rather than wrapping into hours', () => {
    expect(elapsedStamp(started, at(124 * 60 + 3))).toBe('+124:03');
  });

  it('never goes backwards, whatever the clock says', () => {
    expect(elapsedStamp(started, at(-30))).toBe('+00:00');
    expect(elapsedStamp(null, at(90))).toBe('+00:00');
  });
});
