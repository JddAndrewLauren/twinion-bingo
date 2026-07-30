'use client';

import confetti from 'canvas-confetti';
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
  type CardSquare,
  type Game,
  type Mark,
  type RoomEvent,
  type Roster,
} from '../../room-api';
import { CardGrid } from './card-grid';
import { DeckSheet } from './deck-sheet';
import { LookingFor, LookingForPanel, openSquares } from './looking-for';
import { Results, nextPrizeName } from './results';
import { useWakeLock } from './use-wake-lock';

type Load = 'loading' | 'ready' | 'missing' | 'unreachable';

/**
 * Everything before the deal: joining, the lobby, and the three ways a room can
 * fail to resolve. A centred narrow column, because all of it is prose and a form.
 * The game screen is not this shape — see the note on the shell below.
 */
const COLUMN = 'mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6';

/**
 * **Join** and **Start game**, which were bare `<button>` elements and therefore 24px
 * tall — a target no thumb reliably hits, on the two taps that stand between six
 * friends and a game. Found by #13's gate rather than by review, which is the same way
 * #12 found its own 22x24px switcher; `min-h-11` is 44px, Apple's documented minimum.
 */
const ACTION =
  'min-h-11 rounded border border-neutral-700 px-3 font-semibold disabled:text-neutral-500';

/**
 * The card's two surfaces in the phone layout, per #12's C1. Not a sheet and not a
 * gesture: two whole screens, one segmented control, and neither ever covering the
 * other. Means nothing in the two-pane layout, where both are up at once.
 */
type Tab = 'card' | 'race';

/**
 * The two-pane layout's right pane, which is tabbed rather than split — and a
 * different pair of tabs rather than `Tab` renamed, so it is separate state.
 *
 * It opens on the list: propped next to the TV with the race still young, what you
 * want is what to watch for, not a timeline of things that already happened. The
 * cost, since #14's own acceptance criterion asked for the other thing: the
 * standings and the timeline are a tap away rather than permanently on screen. #12
 * traded that deliberately and named it, and #14's body says to follow the
 * prototype.
 */
type Pane = 'looking' | 'race';

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
 * the credit toast, and the same two sources: a device knows its own 24 squares,
 * and the host also holds the deck it was handed for the sheet. Anything else is
 * named only as "that square".
 *
 * The deck half is load-bearing rather than tidy. The dialog is what the host
 * confirms a retraction in, and the calls only reachable from the sheet are
 * precisely the deck squares that are on no card of theirs — so without it the one
 * correction #46 added would ask "take back that square?".
 */
function labelFor(game: Game, squareId: string): string {
  return (
    [...(game.card ?? []), ...(game.deck?.squares ?? [])].find(
      (square) => square.id === squareId,
    )?.label ?? 'that square'
  );
}

/**
 * A rung landing, felt across the room. The point of D12's race-day feel is that
 * a line is an event in the room rather than a row appearing in a list, so this
 * is deliberately louder than anything else the screen does.
 *
 * The global `confetti()` rather than `confetti.create(ourCanvas)`, on purpose.
 * The library appends its own canvas to `body` at `position: fixed;
 * pointer-events: none` and takes it away when the animation ends — which is how
 * SURFACES.md's repeated *"covering no part of the card"* is satisfied here by
 * construction rather than by measurement, and a cell stays tappable mid-burst.
 * Owning the canvas would make both of those ours to get wrong.
 *
 * Two things it declines to fire for:
 *
 * - **A background tab.** `requestAnimationFrame` is throttled there, so the
 *   burst would not play now; it would play oddly on the way back, minutes late
 *   and attached to nothing.
 * - **Reduced motion.** Checked here rather than left to the library's own
 *   `disableForReducedMotion`, so the criterion is this app's and can be
 *   asserted rather than delegated.
 */
function celebrate(prizeKind: string): void {
  if (document.visibilityState !== 'visible') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // A full house is D5's one-way door and the end of the session, not a cheer.
  const finale = prizeKind === 'FULL_HOUSE';

  void confetti({
    particleCount: finale ? 220 : 80,
    spread: finale ? 140 : 70,
    startVelocity: finale ? 55 : 40,
    // Fired from below the card so the burst travels up past it.
    origin: { y: 0.9 },
  });
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
   * Which of C1's two surfaces is up. Both stay mounted and the inactive one is
   * hidden in CSS, so switching back to the card does not re-render it, lose its
   * scroll position, or reflow the grid — the criterion #13 writes as "no layout
   * shift or scroll trap".
   */
  const [tab, setTab] = useState<Tab>('card');
  /**
   * Which half of the two-pane layout's right pane is up. Untouched below `lg`,
   * where the right pane is only ever the race — and untouched by a rotation, which
   * is how "rotating mid-game preserves state" holds for it: the layout switch is
   * CSS, so nothing here unmounts or resets when the device turns.
   */
  const [pane, setPane] = useState<Pane>('looking');
  /**
   * The square a thumb is holding down, and the whole of D4's second field on a
   * phone: a ~68pt cell has room for `label` and not for `description`. Held state
   * rather than opened state — it goes on release, so there is nothing to dismiss
   * and nothing that can be left covering the card.
   */
  const [peek, setPeek] = useState<CardSquare | null>(null);
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
  /**
   * The rungs this browser has already celebrated. The stream's replay horizon
   * is necessary but not sufficient: D5 writes one PRIZE row per winner, so two
   * players completing a line on the same call are two frames above the horizon
   * and both are genuine news. This is the exact statement of "one burst per
   * rung" — and it is a ref rather than effect-local state so it survives
   * StrictMode's second pass and any re-open of the stream. A GAME_STARTED row
   * above the snapshot horizon clears it, because a rung is won once per game
   * and D13 keeps this same room and stream for the next one.
   */
  const celebrated = useRef(new Set<string>());

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
      /**
       * One room hosts many games (D13), but the co-winner guard above is only
       * meant to span one game's ladder. Clear on the log's transition rather
       * than waiting for the debounced game re-read, because the next game's
       * first prize can already be behind that read.
       *
       * Replayed GAME_STARTED rows stay below the snapshot horizon and must not
       * disturb a guard that survived StrictMode or a stream re-open.
       */
      if (event.kind === 'GAME_STARTED' && event.seq > horizon) {
        celebrated.current.clear();
      }

      /**
       * Off the same stream every other phone reads, the tapper's included.
       * PRIZE rows are appended inside the call's own transaction, and the
       * stream is room-scoped and unfiltered — so a winner's own burst arrives
       * by the same path everyone else's does, a second or so behind their
       * Results panel. That is the price of one mechanism instead of two.
       */
      if (
        event.kind === 'PRIZE' &&
        event.seq > horizon &&
        event.prizeKind != null &&
        !celebrated.current.has(event.prizeKind)
      ) {
        celebrated.current.add(event.prizeKind);
        celebrate(event.prizeKind);
      }

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

  /**
   * `state === 'live'` and not anything looser. Not `!finished`, which is true
   * in the lobby and true before the game read has landed; not `game !== null`,
   * because a `done` game is a scoreboard and a scoreboard is something you put
   * down. The `lobby → live` transition re-runs this for free — the
   * `GAME_STARTED` frame's re-read is what flips `state`.
   */
  useWakeLock(game?.state === 'live');

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

  if (load === 'loading') {
    return (
      <div className={COLUMN}>
        <p>Loading room {code}…</p>
      </div>
    );
  }
  if (load === 'missing') {
    return (
      <div className={COLUMN}>
        <p>No room has the code {code}.</p>
      </div>
    );
  }
  if (load === 'unreachable' || roster === null) {
    return (
      <div className={COLUMN}>
        <p>Could not reach the room.</p>
      </div>
    );
  }

  if (roster.you === null) {
    return (
      <form onSubmit={submitName} className={COLUMN}>
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
        <button
          type="submit"
          disabled={joining || name.trim() === ''}
          className={ACTION}
        >
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
     * It is the card's predicate and the card's alone. The sheet is handed only to
     * the host and the host may take back anything, so it offers every called row
     * unconditionally — which is how the host's reach through the UI came to match
     * the rule for the ~16 deck squares no card of theirs holds (#46).
     */
    const canRetract = (mark: Mark) =>
      youAreHost || mark.actorPlayerId === roster.you?.id;

    /**
     * D5's one-way door, read the same way `Results` reads it. Past this point
     * the API answers 409 to every call and retraction, so the card and the
     * sheet stop offering them rather than letting a tap fail.
     */
    const finished = game.state === 'done';

    const nextPrize = nextPrizeName(game);

    /**
     * #12's C1, and it is not D14 as that decision was first written. Three
     * departures, each of them a thing the prototype measured rather than a
     * preference:
     *
     * - **No swipe-up sheet.** Two whole surfaces and a segmented control. A sheet
     *   is a thing that covers the card, and a card is what a thumb is on.
     * - **The bottom slot is docked in flow, not pinned over the card.** The undo
     *   row and the spotter credit sit below everything, so "covering no part of
     *   the card" is a property of the layout rather than a measurement that has to
     *   be re-taken every time something lands in that slot. Variant B could not
     *   hold that contract at all, which is what ruled it out.
     * - **The card is full-bleed**, so it is not held to `max-w-md`. That is the
     *   other half of #47: the cap on the page is what pinned an iPad cell to a
     *   phone cell's width while the type went on growing.
     *
     * **Two layouts, switched in pure CSS at Tailwind's stock `lg` (1024px)** — the
     * phone layout below it, which `ipad-11-portrait` (834) also gets and which is
     * what #14 asks for there, and the two-pane layout above it, which is
     * `ipad-11-landscape` (1194). No `matchMedia`, and that is load-bearing rather
     * than tidy: a JS switch costs a flash of the phone layout on the device being
     * judged (#12 rejected it for exactly that), and "rotating mid-game preserves
     * state and does not drop the SSE connection" is true *by construction* only
     * while this stays one mounted element. A remount would re-freeze the stream's
     * `horizon` and replay the whole log as fresh toasts.
     *
     * What it costs, said out loud: at phone widths the right pane's markup is in
     * the document as well as the phone's — hidden, never painted. Worth knowing if
     * you ever count rows in a gate.
     */
    return (
      /*
        `min-h-dvh` in the phone layout, where the page is meant to scroll, and
        exactly `h-dvh` in the two-pane layout, where it is not.

        That second half is load-bearing and was found by measuring rather than by
        reading. A *minimum* height leaves the row below with no definite height, so
        `flex-1` panes grow to their content and their own `overflow-y-auto` never
        engages: at lights out the right pane stood 1427px tall and the document
        scrolled 742px, which drags the card off screen — the one thing this layout
        exists to prevent. With a definite height the row is bounded, so each pane
        scrolls itself and both columns stay put.
      */
      <div className="flex min-h-dvh flex-col lg:h-dvh">
        {/*
          The slim bar. Everything on it is something you want without leaving the
          card: how you are doing, what the room is playing for next, and who is
          here. `tabular-nums` because the mark count changes under your eyes and a
          number that shifts width as it does reads as the layout twitching.
        */}
        <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-neutral-800 px-3 py-2">
          <h1 className="text-sm font-semibold">Room {code}</h1>
          <p className="text-xs tabular-nums text-neutral-400">
            {game.marks.length} mark{game.marks.length === 1 ? '' : 's'}
            {nextPrize !== undefined && ` · ${nextPrize} next`} ·{' '}
            {roster.players.length} here
          </p>
        </header>

        {/*
          The phone layout's segmented control, and gone at `lg` — where both panes
          are up, so there is nothing to switch between. `tab` stops meaning anything
          there and is left alone rather than reset: rotating back has to find the
          surface you left up.
        */}
        <div
          role="tablist"
          aria-label="Room"
          className="flex shrink-0 gap-1 p-2 lg:hidden"
        >
          {(
            [
              ['card', 'Card'],
              ['race', 'Race'],
            ] as const
          ).map(([which, caption]) => (
            <button
              key={which}
              type="button"
              role="tab"
              id={`tab-${which}`}
              aria-selected={tab === which}
              aria-controls={`panel-${which}`}
              onClick={() => setTab(which)}
              // `min-h-11` is 44px, Apple's documented minimum. #12 shipped a
              // prototype whose own switcher was 24px tall and unreachable by
              // thumb, which is the kind of thing only a device finds.
              className={`min-h-11 flex-1 rounded px-3 text-sm font-semibold ${
                tab === which
                  ? 'bg-neutral-800 text-neutral-50'
                  : 'text-neutral-500'
              }`}
            >
              {caption}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 lg:gap-4 lg:p-4">
          {/*
            Both panels stay mounted and the inactive one is hidden in CSS rather
            than unmounted. That is what makes coming back to the card free: the
            grid is not re-measured, the fit is not re-run, and neither column
            loses where it was scrolled to.

            **No `inert` and no `aria-hidden`, and that is a change from #13.**
            Neither can be media-queried, so left on `tab` they would make the right
            pane permanently un-hittable at `lg` — #12's "invisible band that
            swallows taps", inverted. They are safe to drop because Tailwind's
            `hidden` is `display: none`, which is already both non-hit-testable and
            out of the accessibility tree; #12's case was an *off-screen* panel that
            was still being painted.
          */}
          <section
            role="tabpanel"
            id="panel-card"
            aria-labelledby="tab-card"
            // It keeps its own scroller at every width, unlike the prototype, which
            // could drop it at `lg` because the card was all this column ever held.
            // The host's 40-row deck sheet lives in here too, and a column that does
            // not scroll would put those rows on the page instead.
            className={`min-w-0 flex-1 overflow-y-auto p-1 lg:block ${
              tab === 'card' ? 'block' : 'hidden'
            }`}
          >
            {/*
              The card is square and a phone is not, so on a short viewport — a
              phone on its side — the height is what binds rather than the width.
              Capping on `dvh` keeps the whole card on screen instead of letting it
              run off the bottom of its own column.
            */}
            <div className="mx-auto flex w-full max-w-[min(100%,100dvh_-_8rem)] flex-col gap-3">
              {deck !== null && sheetOpen ? (
                <DeckSheet
                  deck={deck}
                  onCall={call}
                  onRetract={setConfirming}
                  finished={finished}
                />
              ) : (
                <>
                  <CardGrid
                    card={game.card}
                    freeCentre={game.freeCentre}
                    marks={game.marks}
                    inheritedMarks={game.inheritedMarks}
                    onCall={call}
                    canRetract={canRetract}
                    onRetract={setConfirming}
                    onPeek={setPeek}
                    finished={finished}
                  />
                  {/*
                    Phone layout only. At `lg` the list has a tab of its own in the
                    right pane, and carrying it in both places would be two ways to
                    read one thing.
                  */}
                  <div className="lg:hidden">
                    <LookingFor game={game} />
                  </div>
                </>
              )}
              {deck !== null && (
                <button
                  type="button"
                  onClick={() => setSheetOpen(!sheetOpen)}
                  className="min-h-11 rounded border border-amber-700 px-3 text-sm font-semibold text-amber-200"
                >
                  {sheetOpen ? 'Back to your card' : 'Host deck sheet'}
                </button>
              )}
              {callFailed && <p role="alert">Could not call that square.</p>}
              {retractFailed && <p role="alert">Could not take that call back.</p>}
            </div>
          </section>

          {/*
            The right pane. In the phone layout it is the Race surface and nothing
            else; at `lg` it is tabbed and opens on the list.
          */}
          <section
            role="tabpanel"
            id="panel-race"
            aria-labelledby="tab-race"
            className={`min-w-0 flex-1 overflow-y-auto p-3 lg:flex lg:flex-col lg:gap-3 lg:border-l lg:border-neutral-800 ${
              tab === 'race' ? 'block' : 'hidden'
            }`}
          >
            <div
              role="tablist"
              aria-label="Right pane"
              className="hidden shrink-0 gap-1 lg:flex"
            >
              {/*
                **Race pane**, not **Race**, and the reason is the same one that
                keeps the right pane's list off the accordion's accessible name:
                both layouts' markup is in the document at every width, so a second
                tab called `Race` would make that name ambiguous everywhere. The
                caption a thumb reads is still `Race`, which the fuller name
                contains.
              */}
              {(
                [
                  ['looking', `Looking for ${openSquares(game).length}`, undefined],
                  ['race', 'Race', 'Race pane'],
                ] as const
              ).map(([which, caption, label]) => (
                <button
                  key={which}
                  type="button"
                  role="tab"
                  aria-label={label}
                  id={`pane-tab-${which}`}
                  aria-selected={pane === which}
                  aria-controls={`pane-${which}`}
                  onClick={() => setPane(which)}
                  className={`min-h-11 flex-1 rounded px-3 text-sm font-semibold ${
                    pane === which
                      ? 'bg-neutral-800 text-neutral-50'
                      : 'text-neutral-500'
                  }`}
                >
                  {caption}
                </button>
              ))}
            </div>

            {/*
              At `lg` these two tabs decide; below it this pane is only ever the
              race, so `Results` is simply always shown and the list panel is never
              shown at all.
            */}
            <div
              role="tabpanel"
              id="pane-looking"
              aria-labelledby="pane-tab-looking"
              className={`hidden min-h-0 flex-1 overflow-y-auto ${
                pane === 'looking' ? 'lg:block' : ''
              }`}
            >
              <LookingForPanel game={game} />
            </div>
            <div
              role="tabpanel"
              id="pane-race"
              aria-labelledby="pane-tab-race"
              className={`min-h-0 flex-1 overflow-y-auto ${
                pane === 'race' ? 'lg:block' : 'lg:hidden'
              }`}
            >
              <Results game={game} />
            </div>
          </section>
        </div>

        {/**
         * The bottom slot, docked. Three things share it, and all three are about
         * something that just happened rather than something to go and read:
         *
         * - D4's prose for the square under a thumb, for as long as it is held.
         * - #8's credit for whoever spotted a call.
         * - D8's undo for the call this phone just made.
         *
         * The credit and the undo stack rather than take turns, because they are
         * not about the same event — hiding one behind the other would drop a
         * remote spotter's credit entirely, since its four seconds run whether or
         * not it is on screen.
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
        <div className="shrink-0">
          {peek !== null && (
            /*
              Not a live region. The prose is already on the cell's `title`, which
              is how a screen reader reaches it, and announcing it here as well
              would say the same square twice.
            */
            <div
              // The gate's hook for this panel. It needs one: asserting the prose is
              // absent by searching for its *text* passes just as happily when the
              // panel never renders at all, which would make "a tap is not a peek"
              // true for the wrong reason.
              data-prose
              className="border-t border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            >
              <p className="font-semibold">{peek.label}</p>
              <p className="text-neutral-300">{peek.description}</p>
            </div>
          )}
          {toast !== null && toast.id !== undo?.seq && (
            /**
             * `status` rather than `alert`: a call is news, not a problem, and an
             * assertive live region would interrupt a screen reader mid-square.
             */
            <p
              role="status"
              className="bg-emerald-800 p-3 text-center text-sm text-emerald-50"
            >
              {toast.text}
            </p>
          )}
          {undo !== null && !finished && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 border-t border-emerald-700 bg-emerald-800 p-3 text-sm text-emerald-50"
            >
              <span className="min-w-0">
                Called {labelFor(game, undo.squareId)}
              </span>
              <button
                type="button"
                onClick={() => void retract(undo)}
                className="min-h-11 shrink-0 rounded border border-emerald-200 px-3 font-semibold"
              >
                Undo
              </button>
            </div>
          )}
        </div>
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
              {/*
                Thumb-sized, which they were not: #46's gate measured both of these
                at 24px — a browser-default button — against the 44px minimum every
                other tappable thing in this app is held to. Nothing in #9's run
                caught it, because "both buttons on screen" was the claim being
                measured and a 24px button is on screen.
              */}
              <button
                type="button"
                onClick={() => void retract(confirming)}
                className="min-h-11 rounded border border-neutral-600 font-semibold"
              >
                Take it back
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="min-h-11 rounded border border-neutral-600 font-semibold"
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={COLUMN}>
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
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className={ACTION}
        >
          {starting ? 'Dealing…' : 'Start game'}
        </button>
      )}
      {startFailed && <p role="alert">Could not start the game.</p>}
    </div>
  );
}
