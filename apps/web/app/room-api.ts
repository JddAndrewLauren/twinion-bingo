export type Player = { id: string; name: string; joinSeq: number };

export type Roster = {
  code: string;
  themeId: string;
  hostPlayerId: string | null;
  players: Player[];
  /** The player this browser's token names, or null if it holds no valid one. */
  you: Player | null;
};

export type Joined = { code: string; token: string; player: Player };

/** Undefined rather than a throw: an unknown code is a normal thing to type. */
export async function fetchRoster(
  apiUrl: string,
  code: string,
  token: string | undefined,
): Promise<Roster | undefined> {
  const res = await fetch(`${apiUrl}/rooms/${code}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`reading room ${code} failed: ${res.status}`);

  return (await res.json()) as Roster;
}

export async function createRoom(
  apiUrl: string,
  name: string,
): Promise<Joined> {
  return postJoin(`${apiUrl}/rooms`, { name });
}

export async function joinRoom(
  apiUrl: string,
  code: string,
  name: string,
): Promise<Joined> {
  return postJoin(`${apiUrl}/rooms/${code}/join`, { name });
}

async function postJoin(
  url: string,
  body: { name: string },
): Promise<Joined> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);

  return (await res.json()) as Joined;
}
