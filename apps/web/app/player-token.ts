/**
 * Identity is a display name plus the server-issued token, held per browser
 * with no account behind it (D11). Keyed by room code, so the same phone can be
 * a different player in two rooms — and so a reload comes back as the player it
 * already was rather than joining twice.
 */
const key = (code: string) => `twinion-bingo:token:${code}`;

export function readToken(code: string): string | undefined {
  return window.localStorage.getItem(key(code)) ?? undefined;
}

export function storeToken(code: string, token: string): void {
  window.localStorage.setItem(key(code), token);
}
