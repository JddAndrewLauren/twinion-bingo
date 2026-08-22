import { robotoCondensed } from '../../skin-fonts';

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
 *
 * Re-exported from `app/skin-fonts.ts` rather than loaded here a second time:
 * #102's handoff asks for Roboto Condensed again, at different weights, for Pit
 * Wall's own UI — and one `next/font` call per family is what keeps a skin
 * switch from paying for the same face twice under two different names.
 */
export const cardFont = robotoCondensed;
