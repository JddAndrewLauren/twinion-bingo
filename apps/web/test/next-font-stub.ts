/**
 * `next/font/google` is a build-time macro, not a runtime module: the Next compiler
 * rewrites the call into a generated stylesheet and a class name. Nothing does that
 * rewrite under vitest, so importing it for real gets "Roboto_Condensed is not a
 * function" — the loader is real, the export it is asked for is not.
 *
 * The stub returns the shape a loader returns, minus the font. That is the honest
 * boundary for these tests anyway: which face the card renders in is a thing only a
 * browser can answer, and it is answered by the gate rather than here.
 */
type Loaded = { className: string; style: { fontFamily: string } };

const loaded: Loaded = { className: '', style: { fontFamily: 'sans-serif' } };

export const Archivo = (): Loaded => loaded;
export const Inter = (): Loaded => loaded;
export const Roboto_Condensed = (): Loaded => loaded;
