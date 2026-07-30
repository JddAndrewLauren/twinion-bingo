/**
 * A theme id as a human would say it — `f1.v2` is "Formula 1", not "f1.v2".
 *
 * The id is `<theme>.<poolVersion>` (D10: themes are repo folders, and the id is
 * composed from the folder's manifest), so a pool bump moves every room onto a
 * new id and must not move it off its own name. Only the namespace before the
 * dot is looked up.
 *
 * Tiny, and deliberately in one place: this is what a second theme has to be
 * taught its own name in, and the fallback means forgetting to shows the id in
 * an unfurl rather than showing nothing.
 */
const NAMES: Record<string, string> = {
  f1: 'Formula 1',
};

export function themeName(themeId: string): string {
  return NAMES[themeId.split('.')[0] ?? ''] ?? themeId;
}
