import pool from '../../../../themes/f1/pool.generated.json';

/**
 * The 24 labels of the committed F1 pool most likely to fail a card cell, picked
 * without a human choosing any of them.
 *
 * `docs/SURFACES.md` records that the card has been measured wrong three separate
 * times, and the standing card gate answers a different question from this one: it
 * drives a *synthetic* pool padded to the 30-character cap, which gates the worst
 * case the cap permits. This file gates the worst case that actually exists — the
 * pool as committed — so a reword in `themes/f1/overrides.json` plus
 * `pnpm pool:build` changes what is screened without anyone editing a list.
 *
 * The pool is imported statically rather than read from disk, so it is bundled at
 * build time and the deployed page needs no file access and no API.
 */

/**
 * The runs of a label that cannot be broken across lines — its words, and the
 * pieces a hyphen splits a word into, because a browser may wrap after a hyphen.
 *
 * A mirror of `unbreakableRuns` in `packages/theme/src/build.ts`, which is what
 * `pnpm pool:build` enforces `RUN_MAX_CHARS` against. Duplicated rather than
 * imported because `@twinion-bingo/theme` does not export it and this page is
 * client-side; if the two ever disagree, the build's definition is the real one.
 */
function unbreakableRuns(label: string): string[] {
  return label
    .split(/\s+/)
    .flatMap((word) => word.split(/(?<=-)/))
    .filter((run) => run.length > 0);
}

/** One pool square with the two numbers that decide whether its cell can hold it. */
export type ScreenedLabel = {
  id: string;
  label: string;
  description: string;
  tier: string;
  /** Characters in the label — how many lines the cell has to find room for. */
  chars: number;
  /** The longest run that cannot be broken — what decides the cell's *width*. */
  run: number;
  /** That run itself, so a failure names the word to reword. */
  runWord: string;
};

const screened: ScreenedLabel[] = pool.squares.map((square) => {
  const longest = unbreakableRuns(square.label).reduce(
    (worst, run) => (run.length > worst.length ? run : worst),
    '',
  );

  return {
    id: square.id,
    label: square.label,
    description: square.description,
    tier: square.tier,
    chars: square.label.length,
    run: longest.length,
    runWord: longest,
  };
});

/** Ties broken by id, so the same pool always yields the same 24 squares. */
const worstFirst = (metric: (square: ScreenedLabel) => number) =>
  [...screened].sort(
    (a, b) => metric(b) - metric(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

const byChars = worstFirst((square) => square.chars);
const byRun = worstFirst((square) => square.run);

/**
 * Both metrics, because they fail differently and neither implies the other: a long
 * label wraps to more lines than the cell is tall, while a long *word* is wider than
 * the cell whatever its label's length. `docs/SURFACES.md` records a 30-character
 * label with one 7-character run clipping both iPad viewports while longer labels
 * that broke cleanly did not, which is that distinction with a number on it.
 */
const picked = new Map<string, ScreenedLabel>();
for (const square of [...byChars.slice(0, 12), ...byRun.slice(0, 12)]) {
  picked.set(square.id, square);
}
// The two lists overlap, and a card is exactly 24 squares. Whatever the overlap
// costs is made back down the by-characters list.
for (const square of byChars) {
  if (picked.size >= 24) break;
  picked.set(square.id, square);
}

/** The card's 24 dealt squares, longest label first so the eye starts at the worst. */
export const WORST_24: ScreenedLabel[] = [...picked.values()].sort(
  (a, b) => b.chars - a.chars || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
);

/** The theme's free centre, so the card reads the way a real one does (D4). */
export const FREE_CENTRE: string = pool.freeCentre;
