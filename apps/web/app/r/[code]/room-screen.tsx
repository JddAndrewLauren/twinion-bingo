'use client';

import { useEffect, useRef, useState } from 'react';
import { readToken, storeToken } from '../../player-token';
import {
  callSquare,
  fetchGame,
  fetchRoster,
  joinRoom,
  retractCall,
  startGame,
  subscribeToRoomEvents,
  type Game,
  type Mark,
  type RoomEvent,
  type Roster,
} from '../../room-api';
import { CardGrid } from './card-grid';
import { DeckSheet } from './deck-sheet';
import { Results } from './results';

type Load = 'loading' | 'ready' | 'missing' | 'unreachable';

/** Long enough to read who spotted it, short enough not to sit over the card. */
const TOAST_MS = 4000;

/**
 * D8's graduated friction, and the whole reason it is graduated. The common case
 * for a wrong call is a misread during a restart — half the field is moving, the
 * tap was a reflex, and the correction is a reflex too. A modal in that moment is
 * exactly the wrong thing, so for ten seconds the caller's own call is one tap
 * away from gone. After that a mistake is no longer a reflex, and the same
 * correction costs a confirmation.
 *
 * The window is driven by the call's own HTTP response and never by the stream.
 * It has to be: `room_events.seq` is handed out on insert rather than on commit,
 * so a frame can be stepped over and arrive late by an unbounded amount — a
 * ten-second budget spent waiting for the stream to confirm your own tap would be
 * a window that sometimes never opened at all.
 */
const UNDO_WINDOW_MS = 10_000;

/**
 * The credit half of D1. Spotting is what the game rewards, so a call says who
 * spotted it on every device — the spotter's own included, where it doubles as
 * the confirmation that their tap reached the room.
 *
 * The square is named only when this device knows its prose — its own 24 squares
 * for a player, and the whole deck for the host, who is handed it for the sheet.
 * Nobody else is given the rest of the deck so a toast could name it, because
 * that would leak the sheet that is the host's alone.
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

  const square = [...(game?.card ?? []), ...(game?.deck?.squares ?? [])].find(
    (candidate) => candidate.id === event.squareId,
  );

  return square === undefined
    ? `${who.name} spotted a square`
    : `${who.name} spotted ${square.label}`;
}

/**
 * A square's prose, for the toast and the dialog that talk about it. Same limit as
 * the credit toast: a device knows the prose for its own 24 squares and no others,
 * so anything else is named only as "that square".
 */
function labelFor(game: Game, squareId: string): string {
  return (
    game.card?.find((square) => square.id === squareId)?.label ?? 'that square'
  );
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
  /**
   * Whether the host is looking at the deck sheet instead of their card. One at a
   * time on purpose: the two are different jobs, and a host who can see both at
   * once is a host who has to work out which one they just tapped.
   */
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * The call this phone just made, offered back for one tap until the window
   * closes. Only ever a row this request appended: losing a tied race hands back
   * the winner's call, which is not this player's to take away.
   */
  const [undo, setUndo] = useState<Mark | null>(null);
  /** The mark a tap on the card is asking to take back, once the window has shut. */
  const [confirming, setConfirming] = useState<Mark | null>(null);
  const [retractFailed, setRetractFailed] = useState(false);
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

  /**
   * The window shutting. After this the call is still correctable — by tapping the
   * square, which asks first — so nothing is lost here except the reflex.
   */
  useEffect(() => {
    if (undo === null) return;

    const timer = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);

    return () => clearTimeout(timer);
  }, [undo]);

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
   * Tapping a square calls it for everyone holding it — the same function for a
   * cell on your card and a row on the host's deck sheet, so a call from the
   * sheet is the same request, the same row and the same credit. Re-reading the
   * game rather than marking the cell locally keeps one description of what is
   * marked — the derived one — so the spotter's own phone converges by exactly
   * the path every other phone does, just a poll sooner.
   *
   * The row that comes back opens D8's undo window, but only when this request is
   * what appended it. Losing a tied race hands back the call that won, which
   * belongs to whoever made it.
   */
  async function call(squareId: string) {
    const token = readToken(code);
    if (token === undefined || game === null) return;

    setCallFailed(false);

    try {
      const called = await callSquare(apiUrl, game.id, squareId, token);
      if (called.appended) {
        setUndo({
          squareId: called.squareId,
          seq: called.seq,
          actorPlayerId: called.actorPlayerId,
        });
      }
      setReload((count) => count + 1);
    } catch {
      setCallFailed(true);
    }
  }

  /**
   * All three of D8's paths end here, differing only in what it cost to get here.
   * The square unmarks because the re-read says so, which is the same path it
   * unmarks by on every other device — there is no local undo of a local mark,
   * because there was never a local mark.
   */
  async function retract(mark: Mark) {
    const token = readToken(code);
    if (token === undefined || game === null) return;

    setConfirming(null);
    setUndo(null);
    setRetractFailed(false);

    try {
      await retractCall(apiUrl, game.id, mark.seq, token);
      setReload((count) => count + 1);
    } catch {
      setRetractFailed(true);
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

  const youAreHost = roster.you !== null && roster.you.id === roster.hostPlayerId;

  if (game?.card != null) {
    /**
     * Only the host is handed a deck, so holding one is the whole entitlement
     * check — there is no separate "am I the host" test here that could disagree
     * with the server's.
     */
    const deck = game.deck;

    /**
     * D8's rule, and the only thing the screen decides for itself: a player may
     * take back their own call, and the host may take back anyone's. The server
     * checks the same thing, so this is about not offering what would be refused
     * rather than about enforcement.
     *
     * The sheet does not offer it, only the card. A retraction names a CALL by
     * `seq`, and `deck.called` carries square ids alone — so the host's reach
     * through the UI stops at deck squares that are also on their own card. See
     * the note on #9.
     */
    const canRetract = (mark: Mark) =>
      youAreHost || mark.actorPlayerId === roster.you?.id;

    /**
     * D5's one-way door, read the same way `Results` reads it. Past this point
     * the API answers 409 to every call and retraction, so the card and the
     * sheet stop offering them rather than letting a tap fail.
     */
    const finished = game.state === 'done';

    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Room {code}</h1>
        {deck !== null && sheetOpen ? (
          <DeckSheet deck={deck} onCall={call} finished={finished} />
        ) : (
          <CardGrid
            card={game.card}
            freeCentre={game.freeCentre}
            marks={game.marks}
            inheritedMarks={game.inheritedMarks}
            onCall={call}
            canRetract={canRetract}
            onRetract={setConfirming}
            finished={finished}
          />
        )}
        {deck !== null && (
          <button type="button" onClick={() => setSheetOpen(!sheetOpen)}>
            {sheetOpen ? 'Back to your card' : 'Host deck sheet'}
          </button>
        )}
        {callFailed && <p role="alert">Could not call that square.</p>}
        {retractFailed && <p role="alert">Could not take that call back.</p>}
        <Results game={game} />
        {/**
         * The bottom slot, which two different pieces of news share: #8's credit
         * for whoever spotted a call, and D8's undo for the call this phone just
         * made. They stack rather than take turns, because they are not about the
         * same event — hiding one behind the other would drop a remote spotter's
         * credit entirely, since its four seconds run whether or not it is on
         * screen.
         *
         * The single exception is the credit for the very call the undo row is
         * already naming: your own tap, announced twice, one line apart. That one
         * is a duplicate rather than news, so it is the only thing suppressed —
         * matched by `seq`, so it is exactly that row and nothing near it.
         *
         * The undo row is withdrawn once the game is `done`, because the call
         * that closed it can open a window that outlives the game it belongs to:
         * the full house lands on the very tap the window is offering to undo.
         * The credit toast stays — it is news, not an offer.
         */}
        {(undo !== null || toast !== null) && (
          <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md flex-col gap-1">
            {toast !== null && toast.id !== undo?.seq && (
              /**
               * `status` rather than `alert`: a call is news, not a problem, and
               * an assertive live region would interrupt a screen reader
               * mid-square. Pinned to the bottom so it never covers the card.
               */
              <p
                role="status"
                className="rounded-t bg-emerald-800 p-3 text-center text-emerald-50"
              >
                {toast.text}
              </p>
            )}
            {undo !== null && !finished && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-t bg-emerald-800 p-3 text-emerald-50"
              >
                <span>Called {labelFor(game, undo.squareId)}</span>
                <button
                  type="button"
                  onClick={() => void retract(undo)}
                  className="shrink-0 rounded border border-emerald-200 px-3 py-1 font-semibold"
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        )}
        {confirming !== null && (
          /**
           * D8's slow path. Past the reflex window a correction is deliberate, so
           * it is asked about — and it says the call unmarks for everyone, because
           * that is the part a player taking back their own tap may not expect.
           */
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Take back this call"
            className="fixed inset-0 flex items-center justify-center bg-black/70 p-4"
          >
            <div className="flex w-full max-w-xs flex-col gap-3 rounded border border-neutral-700 bg-neutral-900 p-4">
              <p>
                Take back {labelFor(game, confirming.squareId)}? It unmarks for
                everyone holding it.
              </p>
              <button type="button" onClick={() => void retract(confirming)}>
                Take it back
              </button>
              <button type="button" onClick={() => setConfirming(null)}>
                Keep it
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

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
