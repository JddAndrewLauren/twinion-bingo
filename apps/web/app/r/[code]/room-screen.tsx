'use client';

import confetti from 'canvas-confetti';
import { useEffect, useRef, useState } from 'react';
import { ACTION_BUTTON } from '../../action-button';
import { DieButton } from '../../die-button';
import { readToken, storeToken } from '../../player-token';
import { DEFAULT_SKIN, type Skin } from '../../skin';
import { SkinButton } from '../../skin-button';
import {
  ApiError,
  callSquare,
  fetchGame,
  fetchRoster,
  joinRoom,
  rerollCard,
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
import { ProgressReadout } from './progress-readout';
import { Results, nextPrizeName } from './results';
import { RoomCode } from './room-code';
import { RosterPreview } from './roster-preview';
import { ShareRoom } from './share-dialog';
import { useWakeLock } from './use-wake-lock';

type Load = 'loading' | 'ready' | 'missing' | 'unreachable';

/**
 * Everything before the deal: joining, the lobby, and the three ways a room can
 * fail to resolve. A centred narrow column, because all of it is prose and a form.
 * The game screen is not this shape — see the note on the shell below.
 */
const COLUMN = 'mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6';

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

type Action = 'join' | 'start' | 'call' | 'retract' | 'reroll';

/** Every status this screen distinguishes from the generic sentence, by action. */
const KNOWN_STATUS_SENTENCES: Record<Action, Partial<Record<number, string>>> = {
  join: { 404: 'That room is gone.' },
  start: {
    403: 'Only the host can start the game.',
    409: 'This room already has a game.',
    // #76's own example: the theme's pool cannot fill a deck. Nothing the host
    // can do about it, and the diagnosis that says why is in the console.
    503: 'This theme cannot fill a game right now.',
  },
  call: {
    403: 'That square is not yours to call.',
    // ADR-0003: a call racing the full-house transaction is refused with 409,
    // which reads as the game being over rather than as a square that failed.
    409: 'This game has finished.',
  },
  retract: {
    403: 'Only the caller or the host can take that call back.',
    404: 'That call is gone.',
    409: 'This game has finished.',
  },
  // The API answers three different facts with 409 here — a live mark, no
  // different card left to deal, and a finished game — and this is one sentence
  // for all three rather than three read out of `error.body`. `describeFailure`
  // is status-keyed by design (#76) and logs the body verbatim; matching on prose
  // would couple this screen to the server's wording for a branch only a race
  // with an in-flight frame can reach.
  reroll: { 409: 'This card cannot be re-rolled now.' },
};

/** The one fixed sentence each action falls back to for a status it does not name. */
const FALLBACK_SENTENCES: Record<Action, string> = {
  join: 'Could not join that room.',
  start: 'Could not start the game.',
  call: 'Could not call that square.',
  retract: 'Could not take that call back.',
  reroll: 'Could not re-roll your card.',
};

/**
 * Picks the player-facing sentence from the failed response's status (#76) and
 * logs the server's own `error` body to the console, verbatim, so a body is never
 * silently lost even when the sentence it earns is the generic one.
 */
function describeFailure(action: Action, error: unknown): string {
  if (error instanceof ApiError) {
    console.error(`${action} failed: ${error.status} ${error.body}`);

    return KNOWN_STATUS_SENTENCES[action][error.status] ?? FALLBACK_SENTENCES[action];
  }

  console.error(`${action} failed:`, error);

  return FALLBACK_SENTENCES[action];
}

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
 *
 * **#106's addition: an explicit palette on the Confetti skin.** The library's own
 * default mix leans on pale pastels (its own README's example swatches run light),
 * which is precisely what disappears against this skin's `#fffbf2` ground — the
 * one skin this app draws with a light surface at all. Read straight off `<html
 * data-skin>` rather than plumbed through props: `celebrate` is a module-level
 * function with no access to `RoomScreen`'s `initialSkin` (which is only ever the
 * *server-rendered* skin besides), and `SkinButton` already writes the live skin to
 * that same attribute on every press, so this reads the one place a press actually
 * lands. The other three skins are untouched — dark grounds are what the library's
 * default mix was already tuned against.
 */
const CONFETTI_SKIN_PALETTE = ['#ff5c39', '#2f6bff', '#ffd23f', '#16a34a', '#20180f'];

function celebrate(prizeKind: string): void {
  if (document.visibilityState !== 'visible') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // A full house is D5's one-way door and the end of the session, not a cheer.
  const finale = prizeKind === 'FULL_HOUSE';
  const skin = document.documentElement.dataset.skin;

  void confetti({
    particleCount: finale ? 220 : 80,
    spread: finale ? 140 : 70,
    startVelocity: finale ? 55 : 40,
    // Fired from below the card so the burst travels up past it.
    origin: { y: 0.9 },
    ...(skin === 'confetti' ? { colors: CONFETTI_SKIN_PALETTE } : {}),
  });
}

export function RoomScreen({
  apiUrl,
  code,
  shareLink,
  // Defaults to `pitwall` rather than being required, so every existing
  // `<RoomScreen>` call site in `test/` — none of which know about #103 — keeps
  // rendering exactly what it did. The real callers (`r/[code]/page.tsx`) always
  // pass the request's actual skin.
  initialSkin = DEFAULT_SKIN,
}: {
  apiUrl: string;
  code: string;
  shareLink: string;
  initialSkin?: Skin;
}) {
  const [load, setLoad] = useState<Load>('loading');
  const [roster, setRoster] = useState<Roster | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinFailed, setJoinFailed] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState<string | null>(null);
  const [callFailed, setCallFailed] = useState<string | null>(null);
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
  const [retractFailed, setRetractFailed] = useState<string | null>(null);
  /**
   * In flight. It earns its place the way `starting` does rather than the way a
   * spinner would: the request is not idempotent, so a second tap deals a second
   * card and burns the claim boundary twice (ADR-0006).
   */
  const [rerolling, setRerolling] = useState(false);
  /**
   * That a re-roll landed. Announced rather than shown, because the swap itself is
   * silent: 24 cell labels change under a screen reader with nothing to say so.
   */
  const [rerolled, setRerolled] = useState(false);
  const [rerollFailed, setRerollFailed] = useState<string | null>(null);
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

  /**
   * #108: the Theme button of whichever header is on screen, so the die beside
   * it can measure and match its height. One ref rather than one per header —
   * the three headers are mutually exclusive branches of this same render, so
   * only one `SkinButton` is ever mounted against it at a time.
   */
  const themeButtonRef = useRef<HTMLButtonElement>(null);

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
    setJoinFailed(null);

    try {
      const joined = await joinRoom(apiUrl, code, name.trim());
      storeToken(code, joined.token);
      setReload((count) => count + 1);
    } catch (error) {
      setJoinFailed(describeFailure('join', error));
    } finally {
      setJoining(false);
    }
  }

  async function start() {
    const token = readToken(code);
    if (token === undefined) return;

    setStarting(true);
    setStartFailed(null);

    try {
      const started = await startGame(apiUrl, code, token);
      gameRef.current = started;
      setGame(started);
    } catch (error) {
      setStartFailed(describeFailure('start', error));
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

    setCallFailed(null);

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
    } catch (error) {
      setCallFailed(describeFailure('call', error));
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
    setRetractFailed(null);

    try {
      await retractCall(apiUrl, game.id, mark.seq, token);
      setReload((count) => count + 1);
    } catch (error) {
      setRetractFailed(describeFailure('retract', error));
    }
  }

  /**
   * #87's re-roll: immediate on the tap, no confirmation. The response carries the
   * whole replacement view and is applied straight from the 200 the way `start()`
   * is, because the thumb should not wait out a round trip plus the stream's 50ms
   * debounce.
   *
   * That snapshot *can* be stale, though — the API reads the view after its
   * transaction commits, and the `CARD_REROLLED` frame this request appends has
   * already reached this device by then. A call landing on the replacement card in
   * that window can be re-read and then overwritten by this slower response. So the
   * apply is followed by a `reload` bump: the same reconvergence `call()` and
   * `retract()` lean on, one round trip instead of waiting out the next unrelated
   * frame.
   *
   * Three pieces of adjacent state are deliberately left alone. `undo`, because a
   * host can call a deck square that is on no card of theirs — that call is still
   * theirs to take back after a re-roll. `toast`, because it is news about the
   * room rather than about which card you hold. `confirming`, because it is a
   * `fixed inset-0` layer, so the button underneath it is untappable anyway.
   */
  async function reroll() {
    const token = readToken(code);
    if (token === undefined || game === null) return;

    setRerolling(true);
    setRerolled(false);
    setRerollFailed(null);

    try {
      const replacement = await rerollCard(apiUrl, game.id, token);
      // The ref too, or the stream callback goes on naming squares off the old card.
      gameRef.current = replacement;
      setGame(replacement);
      // `CardGrid` does not unmount across the swap, so its own cleanup does not
      // fire and a held square's prose would sit under a card that no longer has it.
      setPeek(null);
      setRerolled(true);
      setReload((count) => count + 1);
    } catch (error) {
      setRerollFailed(describeFailure('reroll', error));
    } finally {
      setRerolling(false);
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
      /*
        #104: the room code, the ruled name field and the roster are structural
        pieces the app did not have before this issue — see `room-code.tsx` and
        `roster-preview.tsx`. `lg:max-w-3xl` and the two-column row below only
        take effect at `lg` (1024px), which is `ipad-11-landscape` in
        `docs/SURFACES.md`'s matrix and nothing narrower — `ipad-11-portrait`
        (834) and both phone widths keep the single `max-w-md` column.
      */
      <form onSubmit={submitName} className={`${COLUMN} lg:max-w-3xl`}>
        {/*
          #103's brand bar: this state had no top bar at all before, just the
          bare `<h1>` — the Theme button needed somewhere to hang, so this row
          is it.
        */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Join room {code}</h1>
          {/*
            #108: the die belongs on every header per the handoff ("join and
            card alike"), but there is no card to re-roll here — disabled with
            no reason text, the same convention a plain `disabled` attribute
            already carries on every other button in this screen.
          */}
          <div className="flex items-stretch gap-[10px]">
            <DieButton
              disabled
              pending={false}
              surface="join"
              matchHeightOf={themeButtonRef}
            />
            <SkinButton initialSkin={initialSkin} ref={themeButtonRef} />
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-10">
          {/*
            The left column at `lg` (README's "Left column (≈55–60%) holds room
            code, name field, and primary action"); the divider is a hairline in
            Pit Wall and nothing in this issue's other three skins — except
            Scorecard (#107), which draws a dashed rule here (README's
            "Desktop divider ... dashed rule in `scorecard`"). `skin-join-divider`
            is the hook rather than a bare `border-rule` override, so only
            Scorecard's own `[data-skin='scorecard'] .skin-join-divider` rule in
            `globals.css` touches it and Pit Wall's hairline is untouched.
          */}
          <div className="skin-join-divider flex flex-1 flex-col gap-4 lg:border-r lg:border-rule lg:pr-10">
            <RoomCode code={code} />
            <div className="flex flex-col gap-1">
              {/*
                `skin-field-label` (#107): Scorecard's own "SIGN HERE" label is a
                visual weight change only — the DOM text stays "Your name", the
                same disclosed precedent this screen's own primary action already
                uses for "Enter room" vs the handoff's literal "Take a card" — so
                `apps/web/test/` and every gate keep querying one accessible name
                across all four skins.
              */}
              <label htmlFor="join-name" className="skin-field-label">
                Your name
              </label>
              {/*
                The bordered box is `.skin-field` rather than the `<label>`
                itself, so "Your name" sits above the box (README's per-theme
                description) rather than inside it.
              */}
              <div className="skin-field rounded-skin border border-rule bg-raised p-2">
                <input
                  id="join-name"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={24}
                  required
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </div>
            {/*
              `skin-action-primary` is the accent-fill hook, and it is *here*
              rather than on `ACTION_BUTTON` deliberately. The handoff gives the
              filled treatment to this screen's single primary action; no mock
              puts an accent-filled button on the card screen (where red is the
              free centre and the call banner's rule) or on the home screen,
              whose two forms are co-equal and would end up with two competing
              full-red primaries. `ACTION_BUTTON` still supplies the 44px
              minimum, the border and the padding every submit button shares.
            */}
            <button
              type="submit"
              disabled={joining || name.trim() === ''}
              className={`${ACTION_BUTTON} skin-action-primary`}
            >
              {/*
                #105 (Slipstream): the button itself stays an unsheared rectangle
                — its own bounding box is what `expectThumbSized` measures — and
                the `skewX(-8deg)` the handoff draws lands on this inner fill
                span instead, with the label counter-skewed inside *that*, the
                same "shear an inner element, not the hit box" pattern
                `skin-button.tsx`'s own `.skin-theme-fill` uses. A no-op wrapper
                for the three skins with no shear: `.skin-action-primary-fill`
                and `.skin-action-primary-label` carry no rules of their own
                outside `[data-skin='slipstream']`.
              */}
              <span className="skin-action-primary-fill flex h-full w-full items-center justify-center">
                <span className="skin-action-primary-label">
                  {/*
                    "Enter room" rather than the handoff's literal "ENTER ROOM":
                    `lobby.gate.ts` and `test/room-screen.test.tsx` name this
                    button by its accessible text, and #104 keeps that text in
                    sentence case and lets `[data-skin='pitwall']
                    .skin-action-primary`'s `text-transform: uppercase` carry
                    the visual, the same pattern the roster's `HOST` tag uses —
                    rather than baking upper case into the DOM text every skin
                    and every screen reader gets.
                  */}
                  {joining ? 'Entering…' : 'Enter room'}
                </span>
              </span>
            </button>
            {joinFailed !== null && <p role="alert">{joinFailed}</p>}
            {/*
              Below the primary action, so the form's own primary action keeps
              its place: somebody who followed a link here is joining, not
              re-sharing.
            */}
            <ShareRoom code={code} shareLink={shareLink} />
          </div>
          <div className="flex-1">
            <RosterPreview roster={roster} />
          </div>
        </div>
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

    /**
     * The server's rule, restated (ADR-0006): a mark of either kind prevents
     * another re-roll. `marks.length` and nothing filtered by the claim boundary —
     * `inheritedMarks` is about *claiming*, not about *clean* — so a card carrying
     * only inherited marks is offered nothing here, exactly as the server would
     * refuse it.
     */
    const canReroll = game.state === 'live' && game.marks.length === 0;

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
        {/*
          #106: `.skin-card-header` is the hook for Confetti's own blue
          `#2f6bff` card-screen header (README's "Card header" background) — the
          surface `globals.css`'s die-surface comment names as not yet painted
          by any component. Unconditional, same as every other `.skin-*` hook
          in this file: the other three skins render no rule against it and
          this header stays exactly as it was for them.
        */}
        <header className="skin-card-header flex shrink-0 items-center justify-between gap-2 border-b border-rule-soft px-2 py-2">
          <h1 className="shrink-0 text-sm font-semibold">Room {code}</h1>
          {/*
            #103 shortened this from "24 marks · full house next · 12 here" (once
            199.7px at 375 CSS px) to your mark count over the card's own 24, plus
            who is here — `· <rung> next` moves into a `hidden lg:inline` span so
            it survives only at `ipad-11-landscape`, which is the one viewport with
            the width to spare for it. Mounting the dice's reserved slot and the
            Theme button beside the room code and Share left no other way to hold
            this on one line at `phone-small` — see the header row's own note below
            for the arithmetic.
          */}
          <p className="min-w-0 flex-1 text-xs tabular-nums text-muted">
            {game.marks.length}/{game.card.length}
            {nextPrize !== undefined && (
              <span className="hidden lg:inline"> · {nextPrize} next</span>
            )}
            {' · '}
            {roster.players.length} here
          </p>
          {/*
            The bar is the one node both layouts and both game states share, so a
            latecomer can be pulled into a race already running from anywhere.

            It is also the tightest row in the app, and this group is what made it
            tight: `px-2` and `gap-2` here rather than `px-3`/`gap-3` are what buy it
            back, same as before #103. What changed is what has to fit beside the
            stats line — the room code (~82px), the die and the Theme button, and
            Share (~55px) — which is why the stats line itself had to come down
            from ~200px to under ~110px rather than the other way around. The two
            controls lay out at their *visible* widths (#108 measures the die at
            ~26px square, the Theme button at ~60px), each with a 44px hit element
            that adds no layout width; the `gap-[10px]` rather than `gap-2` is what
            keeps those two hit boxes from overlapping. `room.gate.ts` still counts
            the lines, and now measures both.

            The row also went `items-baseline` -> `items-center`: the control group
            below is `items-stretch` for the Theme button's own box, and a
            baseline-aligned parent gives a stretched child nothing to align to.
            `legibility/page.tsx`, which stands in for this header, was moved with
            it so the two do not drift.
          */}
          <div className="flex shrink-0 items-stretch gap-[10px]">
            {/*
              #108: the real die, in the slot #103 reserved. It carries no
              hardcoded side, but not by the CSS route #103's placeholder used:
              `aspect-square` against `items-stretch` measures a 0px width in
              the WebKit build this project gates against, so `die-button.tsx`
              sets its box in pixels from a `ResizeObserver` on the Theme button
              beside it instead. See that file's doc block for the measurement.

              Mounted only while `canReroll` holds *and* the deck sheet is down,
              exactly like #112's button it replaces: both of those are #112's
              decisions, kept rather than reopened, per this issue's brief. A
              card with a mark does not get the offer back later, so a
              disabled-forever die would be furniture; and behind the sheet there
              is no card on screen to re-roll — which is also what keeps the
              `aria-describedby` target below in the document whenever the die
              is offered.
            */}
            {canReroll && !sheetOpen && (
              <DieButton
                onClick={() => void reroll()}
                disabled={rerolling}
                pending={rerolling}
                surface="card"
                describedById="reroll-consequence"
                matchHeightOf={themeButtonRef}
              />
            )}
            <SkinButton initialSkin={initialSkin} ref={themeButtonRef} />
          </div>
          <ShareRoom code={code} shareLink={shareLink} />
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
              className={`min-h-11 flex-1 rounded-skin px-3 text-sm font-semibold ${
                tab === which ? 'bg-elevated text-ink-strong' : 'text-muted-soft'
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

              Back to `8rem` since #108: #87/#112's re-roll slot beneath the grid
              was reserved permanently, which is what pushed this to `12rem`, but
              #108 moves the control into the header — there is no longer a
              reserved row in this column for the cap to hold room for. At all
              four matrix viewports this is a no-op — width binds at each of
              them — and it only ever did work on a rotated phone, which is the
              short viewport the cap exists for.
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
                  {/*
                    #104's progress readout: a structural region the app did not
                    have, above the grid rather than replacing the header's own
                    `n/24` line. Pure props, no state of its own — see
                    `progress-readout.tsx`.
                  */}
                  <ProgressReadout marks={game.marks.length} total={game.card.length} />
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
                  {canReroll && (
                    /*
                      #108: the button that used to sit here (and its permanently
                      reserved `min-h-11` slot) moved into the header as the die —
                      the design handoff's placement, and the slot has nothing left
                      to reserve now that the control is gone from this column.

                      The consequence stays here rather than following the button
                      into the header: there is "~6px of slack" up there for a
                      whole sentence, and this column has room. `aria-describedby`
                      on the header's die button still points at this id — that
                      attribute is a document-wide id reference, not a DOM-adjacency
                      one, so it reaches here exactly as it reached the button
                      immediately above it before.

                      Careful not to over-claim in either direction. ADR-0006 rejects
                      only a replacement whose membership set is unchanged, so the
                      promise is "a different 24", not 24 different squares. And it is
                      only the calls that land on the *new* card that arrive grey.
                    */
                    <p
                      id="reroll-consequence"
                      className="skin-note text-sm text-muted"
                    >
                      A different 24 from the same deck. Any square already called
                      that lands on the new card arrives grey: it still counts in the
                      standings, but it can never win you a prize.
                    </p>
                  )}
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
                // The amber chrome is the host-only affordance's own colour
                // (matches `deck-sheet.tsx`'s "amber-chromed" sheet), left
                // literal per #102's carve-out for semantic host colours.
                <button
                  type="button"
                  onClick={() => setSheetOpen(!sheetOpen)}
                  className="min-h-11 rounded-skin border border-amber-700 px-3 text-sm font-semibold text-amber-200"
                >
                  {sheetOpen ? 'Back to your card' : 'Host deck sheet'}
                </button>
              )}
              {callFailed !== null && <p role="alert">{callFailed}</p>}
              {retractFailed !== null && <p role="alert">{retractFailed}</p>}
              {rerollFailed !== null && <p role="alert">{rerollFailed}</p>}
              {/*
                #108: the die is icon-only, so this is now the only way its
                success state reaches a screen reader — `sr-only` rather than
                dropped, since the acceptance criterion is "announced without
                visible text", not "not announced".
              */}
              {rerolled && (
                <p role="status" className="sr-only">
                  New card dealt.
                </p>
              )}
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
            className={`min-w-0 flex-1 overflow-y-auto p-3 lg:flex lg:flex-col lg:gap-3 lg:border-l lg:border-rule-soft ${
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
                  className={`min-h-11 flex-1 rounded-skin px-3 text-sm font-semibold ${
                    pane === which ? 'bg-elevated text-ink-strong' : 'text-muted-soft'
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
              className="border-t border-rule bg-elevated px-3 py-2 text-sm"
            >
              <p className="font-semibold">{peek.label}</p>
              <p className="text-muted-strong">{peek.description}</p>
            </div>
          )}
          {toast !== null && toast.id !== undo?.seq && (
            /**
             * `status` rather than `alert`: a call is news, not a problem, and an
             * assertive live region would interrupt a screen reader mid-square.
             *
             * The emerald chrome here and on the undo row below is left literal
             * (#102's "semantic mark/host colours may stay literal" carve-out):
             * it is the same "a call landed" green as a marked cell, and its
             * real per-skin colour is structure for a later slice, not this
             * one's surface/rule/body-text tokens.
             */
            <p
              role="status"
              className="skin-banner bg-emerald-800 p-3 text-center text-sm text-emerald-50"
            >
              {toast.text}
            </p>
          )}
          {undo !== null && !finished && (
            <div
              role="status"
              className="skin-banner flex items-center justify-between gap-3 border-t border-emerald-700 bg-emerald-800 p-3 text-sm text-emerald-50"
            >
              <span className="min-w-0">
                Called {labelFor(game, undo.squareId)}
              </span>
              <button
                type="button"
                onClick={() => void retract(undo)}
                className="min-h-11 shrink-0 rounded-skin border border-emerald-200 px-3 font-semibold"
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
            <div className="flex w-full max-w-xs flex-col gap-3 rounded-skin border border-rule bg-raised p-4">
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
                className="min-h-11 rounded-skin border border-rule-strong font-semibold"
              >
                Take it back
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="min-h-11 rounded-skin border border-rule-strong font-semibold"
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
      {/* #103's brand bar — same reasoning as the join form's above. */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Room {code}</h1>
        {/* #108: same "disabled, no card yet" reasoning as the join form's die. */}
        <div className="flex items-stretch gap-[10px]">
          <DieButton
            disabled
            pending={false}
            surface="join"
            matchHeightOf={themeButtonRef}
          />
          <SkinButton initialSkin={initialSkin} ref={themeButtonRef} />
        </div>
      </div>
      <ShareRoom code={code} shareLink={shareLink} />
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
          className={ACTION_BUTTON}
        >
          {starting ? 'Dealing…' : 'Start game'}
        </button>
      )}
      {startFailed !== null && <p role="alert">{startFailed}</p>}
    </div>
  );
}
