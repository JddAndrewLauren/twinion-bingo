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

export type CardSquare = {
  id: string;
  label: string;
  description: string;
  tier: string;
};

/**
 * The host's deck sheet: the whole ~40-square room deck and which of it has been
 * called. The API sends it to the host and to nobody else, so a browser holding
 * one is a browser entitled to the sheet — the screen does not need a second
 * permission check that could fall out of step with the server's.
 */
export type Deck = {
  squares: CardSquare[];
  called: string[];
};

/**
 * A marked square and the CALL row that marked it. The seq is what a retraction
 * names, and the actor is what decides which of D8's corrections this browser may
 * offer for it — your own call, or anyone's if you are the host.
 */
export type Mark = {
  squareId: string;
  seq: number;
  actorPlayerId: string;
};

/** The row a call resolved to, whether this tap wrote it or lost the race. */
export type CallResult = {
  seq: number;
  squareId: string;
  actorPlayerId: string;
  /** False when another device's identical call was already in the log. */
  appended: boolean;
};

export type Game = {
  id: string;
  state: string;
  /** The theme-flavoured free centre, e.g. "LIGHTS OUT" for F1. */
  freeCentre: string;
  /** This player's 24 earnable squares; null for a browser holding no token. */
  card: CardSquare[] | null;
  /** The deck sheet if this browser's player hosts the room, null otherwise. */
  deck: Deck | null;
  /**
   * Which of `card`'s square ids are marked. Derived server-side from the call
   * log on every read and stored nowhere — so this is always the whole truth,
   * never a patch to apply on top of one, which is what makes a phone that slept
   * through a stint come back to exactly the card everyone else is looking at.
   */
  marks: Mark[];
  /**
   * How far down the room's log `marks` accounts for, in stream event ids. Held
   * next to the stream this browser opens: a frame above it is news, a frame at
   * or below it is replay the snapshot already includes.
   */
  streamedThroughSeq: number;
};

/** The fields of a `room_events` row the web app reads; a frame carries more. */
export type RoomEvent = {
  seq: number;
  kind: string;
  /** Who did it, named against the roster to credit a call's spotter. */
  actorPlayerId?: string;
  /** The square a CALL is about; null on the kinds that are not about one. */
  squareId?: string | null;
};

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
 * The room's game, or undefined before the host has started one — which is the
 * normal state of a room sitting in its lobby, not an error.
 */
export async function fetchGame(
  apiUrl: string,
  code: string,
  token: string | undefined,
): Promise<Game | undefined> {
  const res = await fetch(`${apiUrl}/rooms/${encodeURIComponent(code)}/game`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

  if (res.status === 404 || res.status === 400) return undefined;
  if (!res.ok) throw new Error(`reading room ${code}'s game failed: ${res.status}`);

  return (await res.json()) as Game;
}

/** Host only; the server enforces it, and the button is only shown to the host. */
export async function startGame(
  apiUrl: string,
  code: string,
  token: string,
): Promise<Game> {
  const res = await fetch(`${apiUrl}/rooms/${encodeURIComponent(code)}/games`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`starting a game in ${code} failed: ${res.status}`);

  return (await res.json()) as Game;
}

/**
 * Tap a square you hold and it marks for everyone holding it (D1). The mark still
 * arrives by the next read of the game, the same path every other phone takes —
 * what comes back here is the row itself, because D8's ten-second undo has to
 * know which CALL to offer taking back and cannot wait for the stream to tell it.
 *
 * A 409-shaped race is not a failure here — the API answers a losing tap with the
 * call that won (`appended: false`), so the only errors left are a square that is
 * not on this card and an API that could not be reached.
 */
export async function callSquare(
  apiUrl: string,
  gameId: string,
  squareId: string,
  token: string,
): Promise<CallResult> {
  const res = await fetch(
    `${apiUrl}/games/${encodeURIComponent(gameId)}/call`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ square_id: squareId }),
    },
  );

  if (!res.ok) {
    throw new Error(`calling ${squareId} failed: ${res.status}`);
  }

  return (await res.json()) as CallResult;
}

/**
 * Take back a call (D8), by the `seq` of the CALL row it names. All three of D8's
 * paths — the undo toast, the confirmation dialog and the host's retract — arrive
 * here; the friction that told them apart was the screen's business, and the
 * server only checks the rule that the call is yours or that you are the host.
 *
 * Nothing comes back that the screen renders. The square unmarks because the next
 * read of the game says so, which is also how it unmarks on every other device.
 */
export async function retractCall(
  apiUrl: string,
  gameId: string,
  seq: number,
  token: string,
): Promise<void> {
  const res = await fetch(
    `${apiUrl}/games/${encodeURIComponent(gameId)}/retract`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ seq }),
    },
  );

  if (!res.ok) {
    throw new Error(`retracting call ${seq} failed: ${res.status}`);
  }
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
