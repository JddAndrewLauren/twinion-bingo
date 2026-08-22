'use client';

import { useEffect, useRef } from 'react';
import { cardFont } from './card-font';
import type { CardSquare, Mark } from '../../room-api';

/** 5x5, and the middle cell is the free one — so 24 squares are dealt (D4). */
const COLUMNS = 5;
const CENTRE = 12;

/**
 * Cell text as a fraction of the *card's* own width, which is the fix for #47.
 *
 * The card used to size type with `clamp(0.5rem, 1.7vw, 0.8rem)` — a viewport
 * function — while `max-w-md` pinned the cell at ~77px from 448px up. So the font
 * kept growing after the cell had stopped, and an iPad cell fitted *fewer*
 * characters per line than a phone cell did, about 10 against about 13. A `cqw`
 * against the card holds characters-per-line constant at every viewport instead,
 * because a cell is always a fifth of the card.
 *
 * `3cqw` is #12's decision. 2.15 is what the old `1.7vw` came to at `phone`, so the
 * card is about 40% larger on a phone than it was and about 94% larger on a
 * portrait iPad.
 *
 * A class rather than an inline `style`, and not only for tidiness: jsdom cannot
 * resolve a `cqw` font size and throws out of `getComputedStyle` when it meets one,
 * which takes every role query in the suite down with it. As a class it is a thing
 * only a browser ever reads, which is true of the value anyway.
 */
const CARD_TEXT = 'text-[3cqw]';

/**
 * How far one cell's text may shrink before the honest answer is "that label is too
 * long". Without a floor, shrink-to-fit accepts any input and the ~30 character cap
 * stops meaning anything.
 *
 * At the cap, with the longest words #16 will plausibly author, #12 measured the
 * worst cell landing at 96% at `phone-small` — so the floor is headroom rather than
 * something the pool is expected to reach.
 */
const SHRINK_FLOOR = 0.8;

/**
 * How long a thumb has to stay put before it is a long press rather than a call.
 * Long enough that the reflex tap D1 is built around never trips it, short enough
 * that a deliberate hold does not feel broken.
 */
const LONG_PRESS_MS = 400;

/**
 * `overflow-hidden` is a backstop under the shrinking below, not the way a long
 * label is handled: a word that bleeds across the gap into the neighbouring cell is
 * worse than one that is cut off, because it reads as that cell's label. It does
 * mean a residual failure is invisible on screen, which is why the gate measures
 * the painted text rather than trusting the picture.
 *
 * `select-none` and `touch-action: manipulation` are for the long press: without
 * them iOS answers a hold on a button with the text-selection callout, which both
 * hides the cell and cancels the gesture.
 */
const CELL =
  'flex h-full w-full touch-manipulation select-none items-center justify-center overflow-hidden rounded-skin border p-1 text-center leading-tight';

/**
 * Does the label's *rendered* text leave the cell's content box?
 *
 * Measured with a `Range` over the text's own line boxes rather than with
 * `scrollWidth`, because `scrollWidth` under-reports here: the cell is a
 * `justify-center` flex container and content overflowing a centred line is not
 * counted in it. That is the measurement `docs/SURFACES.md` records as having
 * hidden #47 three separate times, and it is why the shrinking below could not be
 * driven off it.
 */
function overflows(label: HTMLElement, cell: HTMLElement): boolean {
  const style = getComputedStyle(cell);
  const box = cell.getBoundingClientRect();

  const top =
    box.top + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
  const bottom =
    box.bottom -
    parseFloat(style.paddingBottom) -
    parseFloat(style.borderBottomWidth);
  const left =
    box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
  const right =
    box.right -
    parseFloat(style.paddingRight) -
    parseFloat(style.borderRightWidth);

  const range = document.createRange();
  range.selectNodeContents(label);

  // Half a pixel of slack: the boxes are fractional and an exact comparison
  // reports a rounding difference as a clipped label.
  return [...range.getClientRects()].some(
    (line) =>
      line.top < top - 0.5 ||
      line.bottom > bottom + 0.5 ||
      line.left < left - 0.5 ||
      line.right > right + 0.5,
  );
}

/**
 * Drop one cell's font size until its label fits, floored.
 *
 * Steps rather than solving for it: a smaller size re-wraps the label, which
 * changes its height as well as its width, so the only honest way to account for
 * that is to re-measure after each step. 2% a step is at most ten passes.
 *
 * A label that still does not fit at the floor is left at the floor, which is the
 * best rendering available for it — and the gate is what says so out loud.
 *
 * **Fitted for the marked weight, whether or not this cell is marked yet.** A mark
 * renders the label `font-semibold`, which makes it wider — so a cell fitted at the
 * regular weight clipped the moment it was called, and nothing re-fitted it: the
 * effect below re-runs on the label *text*, and a call changes only the weight.
 * Measured at 0.8px on four cells at `phone`.
 *
 * Fitting for the bolder face instead of re-fitting on every call is the cheaper of
 * the two corrections and the more stable one. Re-fitting would force a reflow per
 * cell per step — up to 240 forced layouts per incoming call, with a thumb on the
 * card — and would make a cell visibly change size the moment somebody called it.
 * This way each cell has one type size for the whole game.
 *
 * The cost is that the few cells needing a shrink render very slightly smaller while
 * still unmarked than they strictly need to. That is invisible next to a cell that
 * resizes mid-race.
 */
function fitLabel(label: HTMLElement, cell: HTMLElement): void {
  label.style.fontSize = '';
  // Tailwind's `font-semibold`, which is what `markedStyle` puts on a marked cell.
  label.style.fontWeight = '600';

  try {
    if (!overflows(label, cell)) return;

    const base = parseFloat(getComputedStyle(label).fontSize);

    for (let factor = 0.98; factor >= SHRINK_FLOOR - 0.001; factor -= 0.02) {
      label.style.fontSize = `${base * factor}px`;
      if (!overflows(label, cell)) return;
    }
  } finally {
    // Hand the weight back to the class that owns it, so an unmarked cell still
    // renders at the regular weight — only the *size* is decided here.
    label.style.fontWeight = '';
  }
}

/**
 * Fit every cell, and again whenever anything that could change the answer does.
 *
 * The size is applied by mutating each span directly rather than through state:
 * React does not own these spans' `style`, and a render per cell per step would be
 * a performance question of its own on top of the one being solved.
 *
 * Two re-measures that are not optional:
 *
 * - **On resize.** The font is in `cqw`, so rotating a device changes every cell's
 *   type size — the case most worth catching, and the one a mount-only measurement
 *   misses entirely.
 * - **On `document.fonts.ready`.** `display: 'swap'` means the first pass can land
 *   on the fallback face, whose metrics are not the ones being fitted. Without this
 *   the whole card is fitted to the system font and then repainted in another.
 */
function useShrinkToFit(
  grid: React.RefObject<HTMLUListElement | null>,
  /** The labels as one string — what the measurement actually depends on. */
  labels: string,
): void {
  useEffect(() => {
    const node = grid.current;
    if (node === null) return;

    const measure = () => {
      for (const label of node.querySelectorAll<HTMLElement>('[data-label]')) {
        const cell = label.parentElement;
        if (cell !== null) fitLabel(label, cell);
      }
    };

    measure();

    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) measure();
    });

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
      live = false;
      observer.disconnect();
    };
  }, [grid, labels]);
}

/**
 * One player's card. The centre is free and theme-flavoured ("LIGHTS OUT"), and
 * carries no square id because it is not a pool square: nothing has to happen for
 * it to count.
 *
 * `marks` is not this component's state and never becomes it. Marks are derived
 * server-side from the call log and arrive with every read of the game, so the
 * grid renders whatever it was last handed — which is why a phone that dropped
 * and came back needs no catch-up logic here at all.
 *
 * An unmarked square is a button, because tapping it calls that event for every
 * player holding it (D1). A marked one stays a button rather than reverting to
 * text, so the grid does not reflow under a thumb the moment a call lands.
 *
 * Whether that marked button does anything is D8's second and third paths: a call
 * you made, or any call if you are the host, can be taken back by tapping it —
 * which is the slow, confirmed route, the toast having been the fast one. A mark
 * this player may not correct stays disabled, because a second tap on someone
 * else's call has nothing to add.
 *
 * **A hold is not a tap.** A cell has room for `label` and not for `description`
 * (D4), so the prose is on a long press — and because the same cell's short press
 * calls the square for the whole room, a hold that has fired has to swallow the
 * click behind it. It does. `title` stays for the pointer and the screen reader,
 * which is the half of this that a phone cannot use.
 *
 * `inheritedMarks` are the marks a late joiner walked in on — called before they
 * arrived, so they count towards no win of theirs. They render grey rather than
 * green, which is what makes a line that was already complete at join read as
 * something to look at rather than something to claim. Everyone who was here at
 * lights out has none of them and sees an all-green card. Greying is about who
 * may *win* with a mark, not about who may take it back: a host retracting an
 * inherited call is still D8's business, so the two states compose rather than
 * override each other.
 *
 * `finished` is D5's one-way door. Once the full house has closed the game the
 * API refuses every call and retraction with 409, so the whole card goes quiet:
 * offering a tap that is certain to come back as "Could not call that square."
 * would read as a broken card rather than as a game that is over. The card stays
 * on screen, marks and all, because it is what the room looks at afterwards.
 */
export function CardGrid({
  card,
  freeCentre,
  marks,
  inheritedMarks,
  onCall,
  canRetract,
  onRetract,
  onPeek,
  finished,
}: {
  card: CardSquare[];
  freeCentre: string;
  marks: Mark[];
  /** The square ids in `marks` that were called before this player joined. */
  inheritedMarks: string[];
  onCall: (squareId: string) => void;
  /** Whether D8 lets this viewer take this call back — the caller, or the host. */
  canRetract: (mark: Mark) => boolean;
  onRetract: (mark: Mark) => void;
  /** The square being held down, for whoever renders D4's prose. Null on release. */
  onPeek: (square: CardSquare | null) => void;
  /** Whether the game has reached `done`, after which nothing may be called. */
  finished: boolean;
}) {
  const marked = new Map(marks.map((mark) => [mark.squareId, mark]));
  const inherited = new Set(inheritedMarks);
  const dealt = [...card];
  const cells = Array.from({ length: COLUMNS * COLUMNS }, (_, index) =>
    index === CENTRE ? null : dealt.shift(),
  );

  const grid = useRef<HTMLUListElement>(null);
  useShrinkToFit(grid, card.map((square) => square.label).join(' '));

  /**
   * The gesture in flight, and it belongs to *one* square.
   *
   * All three of these were a single shared flag once, and that was a real bug: a
   * second pointer landing anywhere on the card reset it, so a supporting thumb on
   * a one-handed card turned a hold into a call for the whole room. On a full-bleed
   * card that is a resting thumb, not an exotic input.
   *
   * Refs rather than state, because the click a release produces can arrive in the
   * same task as the release — before any re-render could have told it anything.
   */
  const pending = useRef<{ squareId: string; timer: ReturnType<typeof setTimeout> }>(undefined);
  /** The square whose hold has fired, i.e. the one whose prose is on screen. */
  const peeking = useRef<string | null>(null);
  /** The square whose next click is the hold's own, and so is not a call. */
  const swallow = useRef<string | null>(null);

  function hold(square: CardSquare) {
    // The first press owns the gesture. Anything landing while a hold is pending or
    // open is ignored rather than allowed to restart it.
    if (pending.current !== undefined || peeking.current !== null) return;

    pending.current = {
      squareId: square.id,
      timer: setTimeout(() => {
        pending.current = undefined;
        peeking.current = square.id;
        onPeek(square);
      }, LONG_PRESS_MS),
    };
  }

  /**
   * The gesture ending, and only for the square that owns it.
   *
   * `produced` says whether a click is coming: a `pointerup` on the cell makes one
   * and a hold has to swallow it, but a `pointercancel` or a thumb sliding off makes
   * none — so arming the swallow there would leave it set for a cell nobody held and
   * eat the next real tap on it.
   *
   * `pointercancel` is the one that matters most: it is what a scroll gesture
   * starting on a cell arrives as, and without it a flick down the card would leave
   * the prose on screen.
   */
  function release(squareId: string, produced: 'a click' | 'nothing') {
    if (pending.current?.squareId === squareId) {
      clearTimeout(pending.current.timer);
      pending.current = undefined;
    }

    if (peeking.current === squareId) {
      peeking.current = null;
      if (produced === 'a click') swallow.current = squareId;
      onPeek(null);
    }
  }

  /**
   * A hold that can no longer be released by the cell that started it.
   *
   * Two ways that happens, and both leave the prose docked with nothing to dismiss
   * it: the game reaching `done`, and a remote call marking the held square for
   * someone this viewer cannot correct. Either re-renders the button `disabled`, and
   * a disabled button delivers no `pointerup`.
   *
   * The unmount case is the third — the host toggling to the deck sheet mid-hold —
   * and the cleanup covers it, which is also what stops a fired timer calling
   * `onPeek` with the grid already gone.
   */
  /**
   * The grid going away mid-hold — the host toggling to the deck sheet with a second
   * finger, or the card being replaced. Without this the pending timer still fires
   * and docks prose for a square whose grid has gone, with no `pointerup` left to
   * come and take it away again.
   *
   * This is the only way a hold can outlive its cell. A cell re-rendering `disabled`
   * is *not* one, though it looks like it should be: WebKit delivers `pointerdown`
   * and `pointerup` to a disabled button and suppresses only the `click`, so the
   * release still arrives and still ends the gesture. Measured, because the opposite
   * is the more natural assumption.
   */
  useEffect(
    () => () => {
      if (pending.current !== undefined) clearTimeout(pending.current.timer);
      if (pending.current !== undefined || peeking.current !== null) onPeek(null);
      pending.current = undefined;
      peeking.current = null;
    },
    [onPeek],
  );

  return (
    /*
      The container has to be an *ancestor* of the thing sizing itself against it.
      `cqw` inside the element that is itself the container resolves against the
      next container up, and with none it silently falls back to the viewport —
      i.e. straight back to #47.
    */
    <div className="@container">
      <ul
        ref={grid}
        aria-label="Your card"
        className={`grid grid-cols-5 gap-1 ${CARD_TEXT} ${cardFont.className}`}
      >
        {cells.map((square, index) => {
          const free = square === undefined || square === null;
          const mark = free ? undefined : marked.get(square.id);
          const isMarked = mark !== undefined;
          // `inheritedMarks` is a subset of `marks`, so this implies isMarked.
          const isInherited = !free && inherited.has(square.id);
          const inert = finished || cannotBeTappedAgain(mark, canRetract);

          return (
            <li key={square?.id ?? 'free'} className="aspect-square">
              {free ? (
                // The free centre is its own element in the handoff (§ *Square
                // cell per theme*, "Center (free)") rather than a plain surface
                // plus a plain rule, so it gets its own token pair rather than
                // borrowing `raised`/`rule` — in Slipstream and Confetti that
                // fill is a solid accent, which no surface tier could carry.
                // Pit Wall's pair is today's exact neutrals, so this is inert.
                <span
                  title={freeCentre}
                  className={`${CELL} skin-cell border-free-rule bg-free-surface font-semibold uppercase`}
                >
                  {index === CENTRE ? freeCentre : null}
                </span>
              ) : (
                <button
                  type="button"
                  title={
                    isInherited
                      ? `${square.description} — called before you joined`
                      : square.description
                  }
                  data-inherited={isInherited ? 'true' : undefined}
                  data-mark={isMarked ? (isInherited ? 'inherited' : 'earned') : 'none'}
                  aria-pressed={isMarked}
                  disabled={inert}
                  onPointerDown={() => hold(square)}
                  // An inert cell takes the release but produces no `click`, so
                  // arming the swallow there would leave it armed for good.
                  onPointerUp={() => release(square.id, inert ? 'nothing' : 'a click')}
                  onPointerCancel={() => release(square.id, 'nothing')}
                  onPointerLeave={() => release(square.id, 'nothing')}
                  // A hold on a touch device otherwise raises the callout menu,
                  // which covers the cell and cancels the gesture that asked for
                  // the prose in the first place.
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => {
                    // The hold already answered this press. Calling the square as
                    // well would mark it for the whole room on a gesture that
                    // asked what it meant. Matched by square id, so a press
                    // elsewhere can neither clear it nor arm it for a cell that
                    // was never held.
                    if (swallow.current === square.id) {
                      swallow.current = null;
                      return;
                    }
                    if (mark === undefined) onCall(square.id);
                    else onRetract(mark);
                  }}
                  className={`${CELL} skin-cell ${markedStyle(isMarked, isInherited)}`}
                >
                  {/*
                    The label in a span of its own so the shrinking above has
                    something to measure and something to size. `w-full` keeps the
                    span the cell's width, so a word wider than the cell overflows
                    the span rather than stretching it.
                  */}
                  <span data-label className="block w-full">
                    {square.label}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Whether a cell in this state is inert — a mark this viewer may not correct, so a
 * second tap has nothing to add (D8).
 *
 * Shared by the cell's own `disabled` and by the stuck-hold check, so the two cannot
 * disagree about which cells stop delivering pointer events.
 */
function cannotBeTappedAgain(
  mark: Mark | undefined,
  canRetract: (mark: Mark) => boolean,
): boolean {
  return mark !== undefined && !canRetract(mark);
}

function markedStyle(isMarked: boolean, isInherited: boolean): string {
  // The unmarked cell is a plain surface: `raised`/`rule` are the roles this
  // issue's acceptance criteria cover.
  if (!isMarked) return 'border-rule bg-raised';

  // The inherited (grey) and earned (green) states are D8's three-way mark
  // distinction, kept literal on purpose (#102's carve-out for "semantic
  // host/mark colours"): each of the four skins gives marked and inherited
  // their own real colours (README's *Square cell per theme* table — e.g.
  // Slipstream's marked fill is solid yellow, Scorecard's is an ink ring), and
  // none of that structural, per-skin styling lands until its own slice. Left
  // as Tailwind literals rather than routed through `--color-marked` because a
  // single token cannot also carry the *inherited* half of the distinction —
  // inventing one is exactly the "structure lands per skin" work this slice's
  // Traps section says not to do here.
  //
  // **#104 overrides both, but only under `[data-skin='pitwall']`.** These
  // classes stay the fallback every other skin still renders — the `data-mark`
  // attribute next to this class string is what `globals.css`'s
  // `[data-skin='pitwall'] .skin-cell[data-mark=…]` rules key off instead, at
  // higher specificity, so Pit Wall alone gets its real cyan-overlay earned
  // state and its own invented inherited treatment.
  return isInherited
    ? 'border-neutral-600 bg-neutral-700 font-semibold text-neutral-400'
    : 'border-emerald-400 bg-emerald-800 font-semibold text-emerald-50';
}
