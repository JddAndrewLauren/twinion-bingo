/**
 * Postgres reports a uniqueness conflict as SQLSTATE 23505. Drizzle wraps driver
 * errors, so the code can sit a few links down the `cause` chain.
 *
 * One caller needs it: room creation retries a colliding code. It lives here
 * rather than in `rooms/` because "somebody else got there first" is a database
 * fact rather than a rooms one — and it had a second caller until ADR-0004 moved
 * duplicate calls off a unique index and onto the game-row lock, which leaves no
 * 23505 to catch.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      current.code === '23505'
    ) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
