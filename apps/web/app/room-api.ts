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

/** The fields of a `room_events` row the web app reads; a frame carries more. */
export type RoomEvent = { seq: number; kind: string };

/** Undefined rather than a throw: an unknown code is a normal thing to type. */
export async function fetchRoster(
  apiUrl: string,
  code: string,
  token: string | undefined,
): Promise<Roster | undefined> {
  const res = await fetch(`${apiUrl}/rooms/${encodeURIComponent(code)}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

  // 400 alongside 404: the API rejects a code that isn't shaped like one — a typo
  // landing on O or I, which the alphabet omits — and to the player that is the same
  // fact as no such room, not a broken API.
  if (res.status === 404 || res.status === 400) return undefined;
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
  return postJoin(`${apiUrl}/rooms/${encodeURIComponent(code)}/join`, { name });
}

/**
 * The realtime spine: one SSE stream per room, whose event ids are the log's
 * sequence numbers. `EventSource` resends the last id it saw as
 * `Last-Event-ID` when it reconnects, so a phone that slept through a stint
 * gets back exactly the rows it missed and nothing else — that reconnect story
 * is why the browser's own client is used rather than a hand-rolled fetch loop.
 *
 * Events are unnamed, so one listener catches every kind; `kind` is in the
 * payload for callers that need to tell them apart. Returns the unsubscribe.
 */
export function subscribeToRoomEvents(
  apiUrl: string,
  code: string,
  onEvent: (event: RoomEvent) => void,
): () => void {
  const source = new EventSource(
    `${apiUrl}/rooms/${encodeURIComponent(code)}/stream`,
  );

  source.addEventListener('message', (message) => {
    onEvent(JSON.parse(message.data as string) as RoomEvent);
  });

  return () => source.close();
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
