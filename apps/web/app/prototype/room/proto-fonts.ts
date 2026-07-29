/**
 * PROTOTYPE — the font axis. Delete with the rest of this folder.
 *
 * A cell is ~68pt and has to carry a phrase, so the question is characters per line
 * at a readable size, not "which typeface do we like". Two different things buy that,
 * and they are worth judging apart:
 *
 * - **A larger x-height at the same nominal size** (`inter`). Nothing is narrower;
 *   the letters just use more of the em, so a size that was too small becomes
 *   readable and you can hold the size you had.
 * - **Narrower letters** (`roboto-condensed`, `archivo`). Directly more characters
 *   per line. The risk is the opposite one — condensed faces lose legibility at a
 *   glance, which is the only way this app is ever read.
 *
 * `archivo` is here for a third reason: it is variable on the **`wdth` axis**, 62 to
 * 125. That is what lets the `condense` fit strategy narrow only the cells that
 * overflow, at the same font size, without the letterforms being distorted the way
 * a `scaleX` squeeze distorts them. See `proto-card.tsx`.
 *
 * `system` is the control — no webfont at all, which on the hardware this is judged
 * on means SF. It is also what the app renders today.
 */

import { Archivo, Inter, Roboto_Condensed } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

const robotoCondensed = Roboto_Condensed({ subsets: ['latin'], display: 'swap' });

/**
 * The `wdth` axis has to be asked for by name — without it `next/font` ships the
 * weight axis only and `font-stretch` silently does nothing, which looks exactly
 * like the `condense` strategy not working.
 */
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
});

export type ProtoFont = 'system' | 'inter' | 'roboto-condensed' | 'archivo';

type FontChoice = {
  key: ProtoFont;
  name: string;
  className: string;
  /** Whether `font-stretch` does anything, i.e. whether `condense` can work. */
  widthAxis: boolean;
};

/** Named, so `fontFor` has something definite to fall back to. */
const SYSTEM: FontChoice = {
  key: 'system',
  name: 'system',
  className: '',
  widthAxis: false,
};

export const FONTS: readonly FontChoice[] = [
  SYSTEM,
  { key: 'inter', name: 'Inter', className: inter.className, widthAxis: false },
  {
    key: 'roboto-condensed',
    name: 'Roboto Cond',
    className: robotoCondensed.className,
    widthAxis: false,
  },
  {
    key: 'archivo',
    name: 'Archivo wdth',
    className: archivo.className,
    widthAxis: true,
  },
] as const;

/**
 * Defaults to `roboto-condensed`, which is the decision — not to `system`, which is
 * the control. Arriving on the decided card is the point now that it is decided;
 * `?font=system` is one tap away for the comparison.
 */
export function asFont(asked: string | null): ProtoFont {
  return FONTS.find((font) => font.key === asked)?.key ?? 'roboto-condensed';
}

export function fontFor(key: ProtoFont): FontChoice {
  return FONTS.find((font) => font.key === key) ?? SYSTEM;
}
