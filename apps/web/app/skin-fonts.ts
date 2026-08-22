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
 * it. **So all five are downloaded on every page load, and four of them are
 * read by nothing in this slice** — the tokens land here, and the per-skin
 * `font-family` rules that will actually select one arrive with each skin's own
 * slice. Each instance is given a `variable` rather than a `className` so that
 * when those rules do arrive, `layout.tsx` has already put every family's
 * custom property on `<html>` and no skin change re-mounts anything.
 *
 * **Weights: the variable axis where the handoff asks for italic.** `next/font`
 * crosses `weight` with `style`, so it cannot express "700, plus italic only at
 * 700" — `weight: ['400','700'], style: ['normal','italic']` would pull a
 * 400-italic face *Assets* never asked for. The two families with an italic in
 * the handoff (Roboto Condensed 400/700/700-italic, Archivo 600/900/900-italic)
 * therefore omit `weight` and take the family's variable `100 900` axis, which
 * covers every weight either asked for and nothing extra to explain. The three
 * with no italic name their weights exactly, as *Assets* lists them.
 *
 * Omitting `weight` on Roboto Condensed is also what keeps the card face
 * unchanged: `app/r/[code]/card-font.ts` re-exports this instance rather than
 * loading the family a second time (#12 settled that face for the card's square
 * labels, and Pit Wall's own UI face is the same family), and the card's cells
 * ask for `font-semibold`. A static 400/700 pair would resolve that 600 to the
 * 700 face and widen every marked label — inside the very measurement #47's
 * overflow-shrink logic exists for. The variable axis resolves 600 as 600,
 * exactly as the card's own un-weighted call did before this module existed.
 */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const robotoCondensed = Roboto_Condensed({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-roboto-condensed',
  display: 'swap',
});

export const archivo = Archivo({
  subsets: ['latin'],
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
