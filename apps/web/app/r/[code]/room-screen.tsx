'use client';

import { useEffect, useRef, useState } from 'react';
import { readToken, storeToken } from '../../player-token';
import {
  callSquare,
  fetchGame,
  fetchRoster,
  joinRoom,
  startGame,
  subscribeToRoomEvents,
  type Game,
  type RoomEvent,
  type Roster,
} from '../../room-api';
import { CardGrid } from './card-grid';

type Load = 'loading' | 'ready' | 'missing' | 'unreachable';

/** Long enough to read who spotted it, short enough not to sit over the card. */
const TOAST_MS = 4000;

/**
 * The credit half of D1. Spotting is what the game rewards, so a call says who
 * spotted it on every device — the spotter's own included, where it doubles as
 * the confirmation that their tap reached the room.
 *
 * The square is named only when it is one this player holds. A device knows the
 * prose for its own 24 squares and no others, and handing it the rest of the deck
 * so a toast could name them would leak the sheet that is the host's alone.
 *
 * Undefined for anything that is not a call, and for an actor the roster has not
 * caught up with yet — an anonymous toast credits nobody, which is the one thing
 * this is for.
 */
function spotterCredit(
  event: RoomEvent,
  roster: Roster | null,
  game: Game | null,
): string | undefined {
  if (event.kind !== 'CALL') return undefined;

  const who = roster?.players.find(
    (player) => player.id === event.actorPlayerId,
  );
  if (who === undefined) return undefined;

  const square = game?.card?.find(
    (candidate) => candidate.id === event.squareId,
  );

  return square === undefined
    ? `${who.name} spotted a square`
    : `${who.name} spotted ${square.label}`;
}

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
  const [callFailed, setCallFailed] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  /** Bumped to re-read the roster: after joining, and on every streamed event. */
  const [reload, setReload] = useState(0);
  /**
   * The game read has to have landed once before the stream opens, because the
   * snapshot is what tells the toast which frames are news — see the stream
   * effect. A room with no game yet counts as landed; that is the lobby, not a
   * pending read.
   */
  const [gameLoaded, setGameLoaded] = useState(false);

  /**
   * The stream callback is registered once and would otherwise close over the
   * first render's roster and game forever, so the two things it has to look
   * things up in are held in refs rather than read from state.
   */
  const rosterRef = useRef<Roster | null>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchRoster(apiUrl, code, readToken(code))
      .then((found) => {
        if (cancelled) return;
        if (found === undefined) {
          setLoad('missing');
          return;
        }
        rosterRef.current = found;
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
        if (cancelled) return;
        gameRef.current = found ?? null;
        setGame(found ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setGameLoaded(true);
      });

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
  const streaming = load === 'ready' && gameLoaded;
  useEffect(() => {
    if (!streaming) return;

    let settle: ReturnType<typeof setTimeout> | undefined;

    /**
     * The snapshot the toast is judged against, frozen when the stream opens. A
     * first connection sends no `Last-Event-ID`, so the room's entire log arrives
     * at once — every call ever made would announce itself as if it had just
     * happened. Anything at or below this horizon is already in the marks that
     * are on screen, so it is replay, not news.
     *
     * It stays put across `EventSource`'s own reconnects on purpose: calls made
     * while a phone was asleep really are news to that phone.
     */
    const horizon = gameRef.current?.streamedThroughSeq ?? 0;

    const unsubscribe = subscribeToRoomEvents(apiUrl, code, (event) => {
      const credit =
        event.seq > horizon
          ? spotterCredit(event, rosterRef.current, gameRef.current)
          : undefined;

      if (credit !== undefined) setToast({ id: event.seq, text: credit });

      clearTimeout(settle);
      settle = setTimeout(() => setReload((count) => count + 1), 50);
    });

    return () => {
      clearTimeout(settle);
      unsubscribe();
    };
  }, [apiUrl, code, streaming]);

  /** One toast at a time, replaced by the next call and gone on its own after. */
  useEffect(() => {
    if (toast === null) return;

    const timer = setTimeout(() => setToast(null), TOAST_MS);

    return () => clearTimeout(timer);
  }, [toast]);

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
      const started = await startGame(apiUrl, code, token);
      gameRef.current = started;
      setGame(started);
    } catch {
      setStartFailed(true);
    } finally {
      setStarting(false);
    }
  }

  /**
   * Tapping a square you hold calls it for everyone holding it. Re-reading the
   * game rather than marking the cell locally keeps one description of what is
   * marked — the derived one — so the spotter's own phone converges by exactly
   * the path every other phone does, just a poll sooner.
   */
  async function call(squareId: string) {
    const token = readToken(code);
    if (token === undefined || game === null) return;

    setCallFailed(false);

    try {
      await callSquare(apiUrl, game.id, squareId, token);
      setReload((count) => count + 1);
    } catch {
      setCallFailed(true);
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
        <CardGrid
          card={game.card}
          freeCentre={game.freeCentre}
          marks={game.marks}
          onCall={call}
        />
        {callFailed && <p role="alert">Could not call that square.</p>}
        {toast !== null && (
          /**
           * `status` rather than `alert`: a call is news, not a problem, and an
           * assertive live region would interrupt a screen reader mid-square.
           * Pinned to the bottom so it never covers the card being read.
           */
          <p
            role="status"
            className="fixed inset-x-0 bottom-0 mx-auto max-w-md rounded-t bg-emerald-800 p-3 text-center text-emerald-50"
          >
            {toast.text}
          </p>
        )}
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
