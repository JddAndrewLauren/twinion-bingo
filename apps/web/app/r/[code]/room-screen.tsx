'use client';

import { useEffect, useState } from 'react';
import { readToken, storeToken } from '../../player-token';
import {
  fetchGame,
  fetchRoster,
  joinRoom,
  startGame,
  subscribeToRoomEvents,
  type Game,
  type Roster,
} from '../../room-api';
import { CardGrid } from './card-grid';

type Load = 'loading' | 'ready' | 'missing' | 'unreachable';

export function RoomScreen({
  apiUrl,
  code,
  shareLink,
}: {
  apiUrl: string;
  code: string;
  shareLink: string;
}) {
  const [load, setLoad] = useState<Load>('loading');
  const [roster, setRoster] = useState<Roster | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  /** Bumped to re-read the roster: after joining, and on every streamed event. */
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchRoster(apiUrl, code, readToken(code))
      .then((found) => {
        if (cancelled) return;
        if (found === undefined) {
          setLoad('missing');
          return;
        }
        setRoster(found);
        setLoad('ready');
      })
      .catch(() => {
        if (!cancelled) setLoad('unreachable');
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl, code, reload]);

  /**
   * The game read, on the same `reload` counter as the roster — so the
   * `GAME_STARTED` row that the stream delivers is what puts every player's card
   * on screen, host and guests alike, with no second mechanism for the host.
   *
   * A room with no game yet is the normal lobby state, not a failure, so an
   * unreachable API here leaves the roster on screen rather than replacing it.
   */
  useEffect(() => {
    let cancelled = false;

    fetchGame(apiUrl, code, readToken(code))
      .then((found) => {
        if (!cancelled) setGame(found ?? null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [apiUrl, code, reload]);

  /**
   * Live fanout. An append to the room's log re-reads the roster, so a second
   * phone joining shows up on the first without a refresh. Reading the roster
   * back rather than patching it from the event keeps one description of what a
   * roster is; the delay is because a connection replays the log it missed in
   * one burst, and the roster only needs reading once at the end of one.
   */
  const streaming = load === 'ready';
  useEffect(() => {
    if (!streaming) return;

    let settle: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = subscribeToRoomEvents(apiUrl, code, () => {
      clearTimeout(settle);
      settle = setTimeout(() => setReload((count) => count + 1), 50);
    });

    return () => {
      clearTimeout(settle);
      unsubscribe();
    };
  }, [apiUrl, code, streaming]);

  async function submitName(event: React.FormEvent) {
    event.preventDefault();
    setJoining(true);
    setJoinFailed(false);

    try {
      const joined = await joinRoom(apiUrl, code, name.trim());
      storeToken(code, joined.token);
      setReload((count) => count + 1);
    } catch {
      setJoinFailed(true);
    } finally {
      setJoining(false);
    }
  }

  async function start() {
    const token = readToken(code);
    if (token === undefined) return;

    setStarting(true);
    setStartFailed(false);

    try {
      setGame(await startGame(apiUrl, code, token));
    } catch {
      setStartFailed(true);
    } finally {
      setStarting(false);
    }
  }

  if (load === 'loading') return <p>Loading room {code}…</p>;
  if (load === 'missing') return <p>No room has the code {code}.</p>;
  if (load === 'unreachable' || roster === null) {
    return <p>Could not reach the room.</p>;
  }

  if (roster.you === null) {
    return (
      <form onSubmit={submitName} className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Join room {code}</h1>
        <label className="flex flex-col gap-1">
          Your name
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            required
            className="rounded border border-neutral-700 bg-neutral-900 p-2"
          />
        </label>
        <button type="submit" disabled={joining || name.trim() === ''}>
          {joining ? 'Joining…' : 'Join'}
        </button>
        {joinFailed && <p role="alert">Could not join that room.</p>}
      </form>
    );
  }

  if (game?.card != null) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Room {code}</h1>
        <CardGrid card={game.card} freeCentre={game.freeCentre} />
      </div>
    );
  }

  const youAreHost = roster.you !== null && roster.you.id === roster.hostPlayerId;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Room {code}</h1>
      <p>Share this link: {shareLink}</p>
      <h2 className="font-semibold">Players</h2>
      <ul>
        {roster.players.map((player) => (
          <li key={player.id}>
            {player.name}
            {player.id === roster.hostPlayerId && ' (host)'}
            {player.id === roster.you?.id && ' — you'}
          </li>
        ))}
      </ul>
      {youAreHost && (
        <button type="button" onClick={start} disabled={starting}>
          {starting ? 'Dealing…' : 'Start game'}
        </button>
      )}
      {startFailed && <p role="alert">Could not start the game.</p>}
    </div>
  );
}
