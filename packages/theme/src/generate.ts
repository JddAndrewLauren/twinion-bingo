import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPool, composeThemeId, serializePool } from './build.js';
import type {
  Entities,
  HandcraftedSquare,
  Overrides,
  Pool,
  Template,
  ThemeMeta,
  ThemeSource,
} from './types.js';

export const POOL_FILENAME = 'pool.generated.json';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Every theme folder under the themes root, sorted so runs are reproducible. */
export function discoverThemes(themesRoot: string): string[] {
  return readdirSync(themesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * A theme folder's manifest alone. The composed theme id is derivable from this
 * much, so a caller that only needs the id — the API naming a room's theme —
 * reads one small file rather than the whole authored source.
 */
export function loadThemeMeta(themeDir: string): ThemeMeta {
  return readJson<ThemeMeta>(join(themeDir, 'theme.json'));
}

export function loadTheme(themeDir: string): ThemeSource {
  return {
    meta: loadThemeMeta(themeDir),
    entities: readJson<Entities>(join(themeDir, 'entities.json')),
    templates: readJson<{ templates: Template[] }>(join(themeDir, 'templates.json')).templates,
    handcrafted: readJson<{ squares: HandcraftedSquare[] }>(join(themeDir, 'handcrafted.json'))
      .squares,
    overrides: readJson<Overrides>(join(themeDir, 'overrides.json')),
  };
}

/**
 * Reads a theme folder's committed pool. The API draws decks from this file
 * rather than re-expanding the sources, so what a room plays with is exactly the
 * reviewed artefact in the repo — `pool:build` is an authoring step, not a
 * runtime one.
 */
export function loadPool(themeDir: string): Pool {
  return readJson<Pool>(join(themeDir, POOL_FILENAME));
}

/**
 * Every theme's pool, keyed by its composed theme id — the same string
 * `rooms.theme_id` stores. Keyed off each pool's own manifest fields rather than
 * its folder name, so a theme is found by what it says it is.
 */
export function loadPools(themesRoot: string): Map<string, Pool> {
  const pools = new Map<string, Pool>();

  for (const theme of discoverThemes(themesRoot)) {
    const pool = loadPool(join(themesRoot, theme));
    pools.set(composeThemeId({ id: pool.themeId, poolVersion: pool.poolVersion }), pool);
  }

  return pools;
}

export interface BuiltTheme {
  theme: string;
  path: string;
  squareCount: number;
}

/**
 * Builds every theme folder under `themesRoot` and writes each pool next to its
 * sources. Themes are found on disk, so a second theme folder needs no change here.
 */
export function buildAllThemes(themesRoot: string): BuiltTheme[] {
  return discoverThemes(themesRoot).map((theme) => {
    const themeDir = join(themesRoot, theme);
    const pool = buildPool(loadTheme(themeDir));
    const path = join(themeDir, POOL_FILENAME);
    writeFileSync(path, serializePool(pool));
    return { theme, path, squareCount: pool.squares.length };
  });
}
