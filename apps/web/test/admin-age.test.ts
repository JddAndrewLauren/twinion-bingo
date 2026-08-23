import { describe, expect, it } from 'vitest';
import { formatAge } from '../app/admin/age';

describe('formatting a room age', () => {
  it('reads under a minute as under a minute', () => {
    expect(formatAge(0)).toBe('<1m');
    expect(formatAge(59)).toBe('<1m');
  });

  it('reads whole minutes under an hour', () => {
    expect(formatAge(60)).toBe('1m');
    expect(formatAge(125)).toBe('2m');
    expect(formatAge(3599)).toBe('59m');
  });

  it('reads hours and minutes under a day', () => {
    expect(formatAge(3600)).toBe('1h 0m');
    expect(formatAge(3600 + 12 * 60)).toBe('1h 12m');
    expect(formatAge(86399)).toBe('23h 59m');
  });

  it('reads days and hours from a day up', () => {
    expect(formatAge(86400)).toBe('1d 0h');
    expect(formatAge(86400 + 5 * 3600)).toBe('1d 5h');
  });
});
