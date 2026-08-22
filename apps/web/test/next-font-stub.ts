/**
 * `next/font/google` is a build-time macro, not a runtime module: the Next compiler
 * rewrites the call into a generated stylesheet and a class name. Nothing does that
 * rewrite under vitest, so importing it for real gets "Roboto_Condensed is not a
 * function" — the loader is real, the export it is asked for is not.
 *
 * The stub returns the shape a loader returns, minus the font. That is the honest
 * boundary for these tests anyway: which face the card renders in is a thing only a
 * browser can answer, and it is answered by the gate rather than here.
 *
 * `variable` joined #102's skin fonts to this shape: `app/skin-fonts.ts` reads
 * every family's `.variable` to build `<html>`'s class list, and a stub missing
 * it took the whole suite down with `undefined` in a `className` string rather
 * than a font.
 */
type Loaded = { className: string; variable: string; style: { fontFamily: string } };

const loaded: Loaded = {
  className: '',
  variable: '',
  style: { fontFamily: 'sans-serif' },
};

export const Archivo = (): Loaded => loaded;
export const Baloo_2 = (): Loaded => loaded;
export const Fredoka = (): Loaded => loaded;
export const Inter = (): Loaded => loaded;
export const JetBrains_Mono = (): Loaded => loaded;
export const Roboto_Condensed = (): Loaded => loaded;
