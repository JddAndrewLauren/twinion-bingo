import { Roboto_Condensed } from 'next/font/google';

/**
 * The cell face, and the reason it is not the system one.
 *
 * A cell is ~68pt and has to carry a phrase, so the question a face answers here
 * is characters per line at a readable size. #12 swept four faces against four
 * label sets at all four `docs/SURFACES.md` viewports, and every failure was the
 * same shape — one *word* too wide for the cell, never too many lines. Width is
 * therefore the lever, which rules for a condensed face and against the ones that
 * only buy x-height: Inter was the instructive miss, helping at 375 and clipping
 * on the iPad.
 *
 * Settled on real hardware, not in a desktop browser — see #12's closing comment.
 * Loaded here rather than in `layout.tsx` because it is the card's face and not
 * the app's: everything else on screen is prose in the system font.
 */
export const cardFont = Roboto_Condensed({
  subsets: ['latin'],
  display: 'swap',
});
