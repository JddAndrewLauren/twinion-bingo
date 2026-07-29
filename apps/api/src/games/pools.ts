import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeThemeId, loadPools, loadThemeMeta, type Pool } from '@twinion-bingo/theme';

/**
 * Where the committed pools live. Themes are repo folders (D10), so they are
 * neither a package nor a table — the API reads `themes/<theme>/pool.generated.json`
 * off disk at boot.
 *
 * The default walks up from this module rather than from `process.cwd()`, which
 * differs between `pnpm dev`, a test run and the container. `dist/` mirrors
 * `src/`, so the same four hops reach the repo root in the image, where the
 * Dockerfile puts `themes/` alongside `apps/`.
 */
export function themesRoot(): string {
  const configured = process.env.THEMES_ROOT?.trim();

  return configured !== undefined && configured !== ''
    ? configured
    : fileURLToPath(new URL('../../../../themes', import.meta.url));
}

/**
 * The theme every new room is created with, until choosing one is a thing a host
 * can do. It names a folder, not an id: the id is whatever that folder's manifest
 * says it is, so bumping `poolVersion` moves new rooms onto the pool the build
 * actually produces instead of leaving them pointing at a version that no longer
 * exists.
 */
const DEFAULT_THEME = 'f1';

export function defaultThemeId(root: string = themesRoot()): string {
  return composeThemeId(loadThemeMeta(join(root, DEFAULT_THEME)));
}

export class ThemeNotFound extends Error {
  constructor(themeId: string) {
    super(`no theme with id ${themeId}`);
    this.name = 'ThemeNotFound';
  }
}

/**
 * Read once, at boot. A pool is a committed file that cannot change under a
 * running process, and a room reads it on every game start.
 */
export function loadPoolRegistry(root: string = themesRoot()): Map<string, Pool> {
  return loadPools(root);
}

export function poolFor(pools: Map<string, Pool>, themeId: string): Pool {
  const pool = pools.get(themeId);

  if (pool === undefined) throw new ThemeNotFound(themeId);

  return pool;
}
