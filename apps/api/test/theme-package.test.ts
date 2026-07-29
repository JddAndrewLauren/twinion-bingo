import { describe, expect, it } from 'vitest';
import { composeThemeId, loadPools } from '@twinion-bingo/theme';
import { themesRoot } from '../src/games/pools.js';

/**
 * The guard for #32. `@twinion-bingo/theme` shipped raw TypeScript with no build
 * and was not a dependency of this app, so the first import from here would have
 * broken `pnpm build` and the image build rather than a test. This suite imports
 * real values — not types, which erase — so that consumability is pinned by
 * something that fails.
 */
describe('the theme package, as apps/api consumes it', () => {
  it('exports the theme-id format, rather than each caller composing it', () => {
    expect(composeThemeId({ id: 'f1', poolVersion: 'v1' })).toBe('f1.v1');
  });

  it('reads the committed pools from the themes folder the API ships with', () => {
    const pools = loadPools(themesRoot());
    const f1 = pools.get('f1.v1');

    expect(f1?.freeCentre).toBe('LIGHTS OUT');
    expect(f1?.squares.length).toBeGreaterThan(0);
  });
});
