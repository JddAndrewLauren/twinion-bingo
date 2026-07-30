import { describe, expect, it } from 'vitest';
import { callsBySquare, type LiveCall } from '../src/games/calls.js';

const at = new Date('2026-08-23T13:00:00Z');

const call = (seq: number, squareId: string, actorPlayerId: string): LiveCall => ({
  seq,
  squareId,
  actorPlayerId,
  at,
});

/**
 * The pure half of the derivation, and the half where a tie-break can hide. One
 * square has at most one live call under the game-row lock (ADR-0004) — but that
 * is an application invariant now rather than a database constraint, so how the
 * readers behave if it is ever broken is worth pinning rather than discovering.
 */
describe('callsBySquare', () => {
  it('keys each live call by its square', () => {
    const map = callsBySquare([call(10, 'a', 'p1'), call(11, 'b', 'p2')]);

    expect([...map.keys()]).toEqual(['a', 'b']);
    expect(map.get('a')).toEqual({ squareId: 'a', seq: 10, actorPlayerId: 'p1' });
  });

  /**
   * First-to-spot is who D1 credits, so the earliest live call wins — and
   * `liveCallFor` takes the earliest too, which is the point: the row the call
   * path hands back on a re-tap is the row the card is rendering. Opposite
   * tie-breaks would have the client's undo name a call the square is not marked
   * by.
   */
  it('credits the earliest live call when a square somehow has two', () => {
    const map = callsBySquare([
      call(10, 'a', 'first'),
      call(12, 'a', 'second'),
    ]);

    expect(map.size).toBe(1);
    expect(map.get('a')).toEqual({
      squareId: 'a',
      seq: 10,
      actorPlayerId: 'first',
    });
  });
});
