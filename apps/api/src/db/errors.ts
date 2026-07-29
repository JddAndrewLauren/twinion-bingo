/**
 * Postgres reports a uniqueness conflict as SQLSTATE 23505. Drizzle wraps driver
 * errors, so the code can sit a few links down the `cause` chain.
 *
 * Two callers need this and they are in different modules: room creation retries
 * a colliding code, and a call that loses the race to the partial unique index on
 * `room_events` resolves to the winning row. Both are "somebody else got there
 * first", which is a database fact rather than a rooms one.
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
