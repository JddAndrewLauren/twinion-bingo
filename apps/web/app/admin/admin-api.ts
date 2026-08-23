export type OpenRoom = {
  code: string;
  themeId: string;
  playerCount: number;
  gameState: 'lobby' | 'live' | 'done';
  ageSeconds: number;
  /** Named and identified (#126) so the kick action has a player to name. */
  players: { id: string; name: string }[];
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

/**
 * Thrown for every non-2xx reply from a mutating admin action (#126) that is
 * not the secret being rejected — the room or player named no longer exists,
 * most often because two operators (or two tabs) acted on the same stale list
 * at once. Carries the status so `room-list.tsx` can tell that apart from a
 * network failure without a body to read either.
 */
export class AdminActionFailed extends Error {
  constructor(readonly status: number) {
    super(`admin action failed with status ${status}`);
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

/** Force-ends the room's live game (#126) — ADR-0003's one-way `done`, taken through its second door. */
export async function endGame(
  apiUrl: string,
  secret: string,
  code: string,
): Promise<void> {
  const res = await fetch(`${apiUrl}/admin/rooms/${code}/game/end`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });

  if (!res.ok) throw new AdminActionFailed(res.status);
}

/** Hard-deletes a room and everything under it (#126). */
export async function deleteRoom(
  apiUrl: string,
  secret: string,
  code: string,
): Promise<void> {
  const res = await fetch(`${apiUrl}/admin/rooms/${code}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${secret}` },
  });

  if (!res.ok) throw new AdminActionFailed(res.status);
}

/** Revokes one player's token, without touching their calls (#126). */
export async function kickPlayer(
  apiUrl: string,
  secret: string,
  code: string,
  playerId: string,
): Promise<void> {
  const res = await fetch(`${apiUrl}/admin/rooms/${code}/players/${playerId}/kick`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });

  if (!res.ok) throw new AdminActionFailed(res.status);
}
