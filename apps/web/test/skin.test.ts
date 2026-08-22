import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKIN,
  nextSkin,
  parseSkin,
  SKIN_COOKIE,
  SKINS,
} from '../app/skin';

describe('the skin vocabulary', () => {
  it('names the four skins from the handoff', () => {
    expect(SKINS).toEqual(['pitwall', 'slipstream', 'confetti', 'scorecard']);
  });

  it('defaults to pitwall', () => {
    expect(DEFAULT_SKIN).toBe('pitwall');
  });

  it('names a cookie with no colon in it', () => {
    expect(SKIN_COOKIE).toBe('twinion_bingo_skin');
    expect(SKIN_COOKIE).not.toContain(':');
  });
});

describe('nextSkin', () => {
  it('cycles in the documented order and returns to pitwall from scorecard', () => {
    expect(nextSkin('pitwall')).toBe('slipstream');
    expect(nextSkin('slipstream')).toBe('confetti');
    expect(nextSkin('confetti')).toBe('scorecard');
    expect(nextSkin('scorecard')).toBe('pitwall');
  });
});

describe('parseSkin', () => {
  it('recognises every real skin', () => {
    for (const skin of SKINS) {
      expect(parseSkin(skin)).toBe(skin);
    }
  });

  it('falls back to the default on garbage', () => {
    expect(parseSkin('not-a-skin')).toBe(DEFAULT_SKIN);
    expect(parseSkin('')).toBe(DEFAULT_SKIN);
  });

  it('falls back to the default on an absent cookie', () => {
    expect(parseSkin(undefined)).toBe(DEFAULT_SKIN);
  });
});
