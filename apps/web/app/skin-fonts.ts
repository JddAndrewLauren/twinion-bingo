import {
  Archivo,
  Baloo_2,
  Fredoka,
  JetBrains_Mono,
  Roboto_Condensed,
} from 'next/font/google';

/**
 * One `next/font/google` instance per family the four skins need, all loaded
 * from this one module rather than scattered across per-skin files, so a
 * skin switch never has to wait on a family that some other file forgot to
 * import.
 *
 * The handoff's *Assets* section asks for every family up front: switching
 * skins must not flash unstyled text, and the only way this app can guarantee
 * that is to have already paid for the request by the time a press can ask for
 * it. Each instance is given a `variable` rather than being applied through its
 * own `className`, so `layout.tsx` can put every family's custom property on
 * `<html>` once and `globals.css`'s per-skin blocks pick the active one with
 * plain `font-family: var(--font-…)` — no re-mounting anything on a skin
 * change.
 *
 * `Roboto_Condensed` is exported here and re-exported by
 * `app/r/[code]/card-font.ts` rather than being loaded twice: #12 already
 * settled that face for the card's square labels, and Pit Wall's own UI face
 * asked for by this handoff is the same family, just at different weights — one
 * module, one `next/font` call, matching the docblock's own "why one place" for
 * `theme-name.ts`.
 */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const robotoCondensed = Roboto_Condensed({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-roboto-condensed',
  display: 'swap',
});

export const archivo = Archivo({
  subsets: ['latin'],
  weight: ['600', '900'],
  style: ['normal', 'italic'],
  variable: '--font-archivo',
  display: 'swap',
});

export const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fredoka',
  display: 'swap',
});

export const baloo2 = Baloo_2({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-baloo-2',
  display: 'swap',
});

/** Every family's custom property, for `layout.tsx` to put on `<html>` at once. */
export const SKIN_FONT_VARIABLES = [
  jetbrainsMono.variable,
  robotoCondensed.variable,
  archivo.variable,
  fredoka.variable,
  baloo2.variable,
].join(' ');
