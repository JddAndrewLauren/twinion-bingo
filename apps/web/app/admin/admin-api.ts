export type OpenRoom = {
  code: string;
  themeId: string;
  playerCount: number;
  gameState: 'lobby' | 'live' | 'done';
  ageSeconds: number;
};

/**
 * Thrown for every non-2xx reply — a missing secret, a wrong one, or an
 * unconfigured server all answer 401 alike (`admin/routes.ts`), and the one
 * thing this surface must never do is tell the two apart, so there is no body
 * here to read either.
 */
export class AdminUnauthorized extends Error {
  constructor() {
    super('the admin secret was rejected');
  }
}

export async function fetchOpenRooms(
  apiUrl: string,
  secret: string,
): Promise<OpenRoom[]> {
  const res = await fetch(`${apiUrl}/admin/rooms`, {
    headers: { authorization: `Bearer ${secret}` },
  });

  if (!res.ok) throw new AdminUnauthorized();

  const body = (await res.json()) as { rooms: OpenRoom[] };
  return body.rooms;
}
