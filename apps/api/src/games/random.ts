/**
 * The draw is seeded and the seed is stored, so a deal can be reproduced from
 * the row rather than trusted. That rules out `Math.random()` and rules out
 * anything whose sequence could change with a Node version, so the generator is
 * written out here: a small, fixed, well-known one.
 *
 * It is not cryptographic and does not need to be — nobody is attacking a bingo
 * card, and the property under test is reproducibility, not unpredictability.
 */

/** FNV-1a over the seed's UTF-8 bytes, to get 32 bits of state from a string. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode(seed)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** mulberry32: one 32-bit word of state, uniform in [0, 1). */
export function createRandom(seed: string): () => number {
  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Fisher-Yates, on a copy — callers pass pool arrays they do not own. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }

  return copy;
}
