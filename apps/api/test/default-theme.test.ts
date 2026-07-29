import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultThemeId } from '../src/games/pools.js';

const roots: string[] = [];

/** A themes root holding one F1 manifest and nothing else — the id needs no more. */
function themesRootWith(poolVersion: string): string {
  const root = mkdtempSync(join(tmpdir(), 'twinion-themes-'));
  roots.push(root);

  mkdirSync(join(root, 'f1'));
  writeFileSync(
    join(root, 'f1', 'theme.json'),
    JSON.stringify({ id: 'f1', poolVersion, freeCentre: 'LIGHTS OUT' }),
  );

  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('the theme id new rooms are created with', () => {
  it('is the manifest id and poolVersion joined', () => {
    expect(defaultThemeId(themesRootWith('v1'))).toBe('f1.v1');
  });

  /** The one that would pass on a constant: the same folder, a bumped version. */
  it('follows the manifest when its poolVersion is not v1', () => {
    expect(defaultThemeId(themesRootWith('v9'))).toBe('f1.v9');
  });
});
