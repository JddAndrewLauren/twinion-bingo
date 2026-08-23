import { describe, expect, it } from 'vitest';
import { themeName } from '../app/theme-name';

describe('themeName', () => {
  it('names the f1 pack', () => {
    expect(themeName('f1.v3')).toBe('Formula 1');
  });

  it('names the indycar pack', () => {
    expect(themeName('indycar.v2')).toBe('IndyCar');
  });

  it('falls back to the id for an unknown namespace', () => {
    expect(themeName('nascar.v1')).toBe('nascar.v1');
  });
});
