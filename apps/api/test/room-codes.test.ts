import { describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '../src/rooms/codes.js';

describe('the room code alphabet', () => {
  it('is 24 characters', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(24);
  });

  it('leaves out the four characters that get misread aloud', () => {
    for (const character of ['O', '0', 'I', '1']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(character);
    }
  });

  it('holds no digits at all, and no duplicates', () => {
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z]+$/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });
});

describe('generating a room code', () => {
  const codes = Array.from({ length: 500 }, generateRoomCode);

  it('is four characters long', () => {
    for (const code of codes) expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('draws every character from the reduced alphabet', () => {
    for (const code of codes) {
      for (const character of code) {
        expect(ROOM_CODE_ALPHABET).toContain(character);
      }
    }
  });

  it('does not keep handing out the same code', () => {
    expect(new Set(codes).size).toBeGreaterThan(codes.length / 2);
  });
});

describe('normalizing a code someone typed', () => {
  it('accepts a code as issued', () => {
    expect(normalizeRoomCode('ABCD')).toBe('ABCD');
  });

  it('accepts lower case and stray spaces from a phone keyboard', () => {
    expect(normalizeRoomCode('  abcd ')).toBe('ABCD');
  });

  it('rejects a code of the wrong length', () => {
    expect(normalizeRoomCode('ABC')).toBeUndefined();
    expect(normalizeRoomCode('ABCDE')).toBeUndefined();
  });

  it('rejects the characters the alphabet omits', () => {
    for (const code of ['ABCO', 'ABC0', 'ABCI', 'ABC1']) {
      expect(normalizeRoomCode(code)).toBeUndefined();
    }
  });

  it('rejects an empty string', () => {
    expect(normalizeRoomCode('')).toBeUndefined();
  });
});
