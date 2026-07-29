/**
 * The one place `Authorization: Bearer <token>` is parsed. A player's token is
 * how a device says which player it is on every route that has a "you" in its
 * answer, so both the roster read and the game routes need this.
 */
export function bearerToken(header: string | undefined): string | undefined {
  const token = /^Bearer (.+)$/i.exec(header ?? '')?.[1];

  return token === undefined || token === '' ? undefined : token;
}
