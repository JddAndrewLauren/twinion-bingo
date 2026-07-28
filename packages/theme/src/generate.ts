import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPool, serializePool } from './build.js';
import type {
  Entities,
  HandcraftedSquare,
  Overrides,
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

export function loadTheme(themeDir: string): ThemeSource {
  return {
    meta: readJson<ThemeMeta>(join(themeDir, 'theme.json')),
    entities: readJson<Entities>(join(themeDir, 'entities.json')),
    templates: readJson<{ templates: Template[] }>(join(themeDir, 'templates.json')).templates,
    handcrafted: readJson<{ squares: HandcraftedSquare[] }>(join(themeDir, 'handcrafted.json'))
      .squares,
    overrides: readJson<Overrides>(join(themeDir, 'overrides.json')),
  };
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
