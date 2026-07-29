'use client';

/**
 * PROTOTYPE — the card, sized to the card rather than to the viewport.
 *
 * Not a copy of `card-grid.tsx` for its own sake. The real grid sets
 * `clamp(0.5rem, 1.7vw, 0.8rem)`, a *viewport* function, while `max-w-md` on the
 * room page holds the cell at ~77px from 448px up. So the font keeps growing after
 * the cell has stopped, and an iPad cell fits fewer characters per line than a
 * phone cell does — about 10 against about 13 (docs/SURFACES.md, #47).
 *
 * That is the bug the 68pt legibility question is really about, and a prototype
 * that inherited it would be judging the bug rather than the layouts. So here the
 * grid is a container-query container and the font is in `cqw` — a fraction of the
 * card's own width. Text then tracks cell size at every viewport by construction,
 * and each variant is free to give the card as much width as its layout wants
 * without the type going out of proportion.
 *
 * `scale` is the knob: cqw per cell-line. Higher is bigger text. It is driven from
 * `?text=S|M|L|XL` on the switcher rather than per variant, because the question
 * "how big should cell text be" is not a question about layout — every variant wants
 * the same answer, and stepping it live next to the length axis (`?labels=`) is the
 * only way to see where the two collide.
 *
 * Measured with hyphenation on and off, and it made no difference to overflow at
 * any of the four viewports — so there is no `hyphens-auto` here. It was only ever
 * going to buy legibility back by spending it, and "Red Bull fum-bles a stop" is
 * not a thing to read at a glance with a race on.
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { asFont, fontFor } from './proto-fonts';
import type { CardSquare, Mark } from '../../room-api';

const COLUMNS = 5;
const CENTRE = 12;

/**
 * The text-size axis, in cqw per cell line. `M` is 2.15, which reproduces the real
 * card's 8px at `phone` — so M is "what is on screen today" and the others are the
 * proposals either side of it. The px column is that step at `phone` (390pt, a card
 * about 382px wide, so a cqw is 3.82px); on the iPad every one of them is bigger by
 * construction, which is the whole point of sizing in cqw.
 */
export const TEXT_SIZES = [
  { key: 'S', scale: 1.85, phonePx: '~7px' },
  { key: 'M', scale: 2.15, phonePx: '~8px, today' },
  { key: 'L', scale: 2.55, phonePx: '~10px' },
  { key: 'XL', scale: 3.0, phonePx: '~11px' },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]['key'];

/** Defaults to the decision, `XL`, not to the status quo. `M` is the status quo. */
export function asTextSize(asked: string | null): TextSize {
  return TEXT_SIZES.find((size) => size.key === asked)?.key ?? 'XL';
}

export function scaleFor(size: TextSize): number {
  return TEXT_SIZES.find((step) => step.key === size)?.scale ?? 2.15;
}

const CELL =
  'flex h-full w-full items-center justify-center overflow-hidden rounded border p-1 text-center leading-tight';

/**
 * A cell that does not fit, ringed. `overflow-hidden` plus centred text clips a
 * label at both ends and says nothing about it, so a label too long for the box can
 * read as a short one — which is exactly the "the number measured the wrong thing"
 * trap this prototype has already fallen into twice.
 *
 * Inset, so it costs no layout: an outline that pushed anything would change the
 * cell it is reporting on, and a `ResizeObserver` watching that cell would then have
 * something new to say about it.
 */
const RING = { outline: '2px solid #ef4444', outlineOffset: '-2px' } as const;

/**
 * How hard a cell may be squeezed before the answer is "the label is too long",
 * rather than squeezing to fit whatever it is given. Without a floor every strategy
 * below "works" on any input, which would make all four look equally good and settle
 * nothing.
 */
const FLOOR = 0.8;

/**
 * What to do with a label that does not fit. The interesting question is not whether
 * these work — all of them can be made to work — but which of them a room full of
 * people watching a race does not notice.
 *
 * - `off` — clip it, and ring it. The control, and what the card does today.
 * - `shrink` — drop that one cell's font size until the label fits. Cheap, works with
 *   any face, and the cost is that neighbouring cells no longer share a type size,
 *   which on a 5x5 grid is the kind of thing you see without being able to name.
 * - `condense` — hold the size and pull the face's `wdth` axis in instead. The letters
 *   stay the right height and the right weight, so a condensed cell reads as the same
 *   type rather than as smaller type. **Needs a variable font with a width axis** —
 *   `?font=archivo`. With any other face `font-stretch` is inert and this does nothing,
 *   which is worth seeing rather than hiding.
 * - `scale-x` — squeeze the label horizontally with a transform. Works with every
 *   face, including the system one, and that is its whole appeal. It also distorts the
 *   strokes — verticals thin while horizontals do not — which is the thing a designer
 *   spots instantly and a player may never notice. Judge it, do not assume it.
 */
export type Fit = 'off' | 'shrink' | 'condense' | 'scale-x';

export const FITS: readonly { key: Fit; name: string }[] = [
  { key: 'off', name: 'clip' },
  { key: 'shrink', name: 'shrink' },
  { key: 'condense', name: 'condense' },
  { key: 'scale-x', name: 'scale-x' },
] as const;

export function asFit(asked: string | null): Fit {
  return FITS.find((fit) => fit.key === asked)?.key ?? 'shrink';
}

/**
 * Does the label's *rendered* text leave the cell's content box?
 *
 * Measured with a `Range` over the text's own line boxes rather than with
 * `scrollWidth`, for two independent reasons, and the second one cost a wrong result
 * before it was found:
 *
 * 1. `scrollWidth` under-reports here at all. The cell is a `justify-center` flex
 *    container and content overflowing a centred line is not counted — the failure
 *    #47 records having hidden this defect three times.
 * 2. **`scrollWidth` is a layout measurement, so it does not see a transform.** With
 *    `scale-x`, a label squeezed until it genuinely fits still measured as
 *    overflowing, so the strategy ran to its floor, reported failure and ringed a
 *    cell it had already fixed. `getClientRects` reports the box as painted, which is
 *    the only thing that matches what anyone is judging.
 *
 * One instrument for all four strategies, and it is the method #47's acceptance
 * criteria ask for.
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

  return [...range.getClientRects()].some(
    (line) =>
      line.top < top - 0.5 ||
      line.bottom > bottom + 0.5 ||
      line.left < left - 0.5 ||
      line.right > right + 0.5,
  );
}

/**
 * Squeeze one label as far as the strategy and the floor allow. Returns whether it
 * fits afterwards, so the ring can mean "still does not fit" rather than "did not fit
 * to begin with" — the distinction the whole fit axis exists to draw.
 *
 * Steps rather than solving: 2% at a time is at most ten passes over 24 cells, the
 * strategies are not all invertible (a narrower face re-wraps, which changes the
 * height), and re-measuring after each step is the only honest way to account for
 * that.
 */
function squeeze(label: HTMLElement, cell: HTMLElement, fit: Fit): boolean {
  reset(label);

  if (!overflows(label, cell)) return true;
  if (fit === 'off') return false;

  const base = parseFloat(getComputedStyle(label).fontSize);

  for (let factor = 0.98; factor >= FLOOR - 0.001; factor -= 0.02) {
    if (fit === 'shrink') label.style.fontSize = `${base * factor}px`;
    // 100% down to 80% of normal width, which for Archivo bottoms out well inside
    // its 62 lower bound — the floor is the judgement, not the font's limit.
    if (fit === 'condense') label.style.fontStretch = `${factor * 100}%`;
    if (fit === 'scale-x') label.style.transform = `scaleX(${factor})`;

    if (!overflows(label, cell)) return true;
  }

  /*
    Give the squeeze back when it did not work. Otherwise a ringed cell sits at the
    floor — 80% — while `fit=clip` rings the same label at 100%, and the two states
    the axis exists to compare are no longer the same size. A ring should mean "this
    label is too long", full stop, and it should look the same whichever strategy
    failed to save it.
  */
  reset(label);

  return false;
}

function reset(label: HTMLElement) {
  label.style.fontSize = '';
  label.style.fontStretch = '';
  label.style.transform = '';
}

/**
 * Fit every cell, then report which ones still clip.
 *
 * Re-measures on resize because the font is in `cqw` — rotating the iPad changes
 * every cell's type size, which is the case most worth catching. Note the fit is
 * applied by mutating the span directly rather than through state: React does not
 * manage the span's `style`, and a render per cell per step would be its own
 * performance question on top of the one being judged.
 */
function useFitted(
  grid: React.RefObject<HTMLUListElement | null>,
  fit: Fit,
  deps: unknown[],
) {
  const [clipped, setClipped] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const node = grid.current;
    if (!node) return;

    function measure() {
      const found = new Set<string>();

      for (const label of node?.querySelectorAll<HTMLElement>('[data-square]') ??
        []) {
        const cell = label.parentElement;
        if (!cell) continue;
        if (!squeeze(label, cell, fit)) found.add(label.dataset.square ?? '');
      }

      setClipped((previous) =>
        previous.size === found.size &&
        [...found].every((id) => previous.has(id))
          ? previous
          : found,
      );
    }

    measure();

    /*
      And again once the webfont has actually arrived. `display: 'swap'` means the
      first measurement above can land on the fallback face, whose metrics are not
      the ones being judged — so without this, every font other than `system` gets
      graded on the system font for the first paint and the numbers quietly lie.
    */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ...deps]);

  return clipped;
}

export function ProtoCard({
  card,
  freeCentre,
  marks,
  inheritedMarks,
  /**
   * Font size as a fraction of the card's own width. A cell is a fifth of the
   * card, so this tracks cell size too. 2.15cqw reproduces the real card's 8px at
   * `phone` — about 13 characters to a cell line — and then *holds* that ratio as
   * the card grows, instead of letting the font outrun the cell the way
   * `1.7vw` against `max-w-md` does today.
   *
   * Left out by every variant, and deliberately: it falls back to `?text=`, so one
   * control on the switcher moves the card in whichever variant is on screen.
   */
  scale,
  onCall,
}: {
  card: CardSquare[];
  freeCentre: string;
  marks: Mark[];
  inheritedMarks: string[];
  scale?: number;
  onCall?: (squareId: string) => void;
}) {
  /*
    Reading a URL param this far down the tree is not how the real card will work —
    but the alternative here is threading one prop through six variants and a shell
    that are all being deleted with #14, to move a knob that belongs to none of them.
  */
  const params = useSearchParams();
  const cqw = scale ?? scaleFor(asTextSize(params.get('text')));
  const font = fontFor(asFont(params.get('font')));
  const fit = asFit(params.get('fit'));

  const marked = new Map(marks.map((mark) => [mark.squareId, mark]));
  const inherited = new Set(inheritedMarks);
  const dealt = [...card];
  const cells = Array.from({ length: COLUMNS * COLUMNS }, (_, index) =>
    index === CENTRE ? null : dealt.shift(),
  );

  const grid = useRef<HTMLUListElement>(null);
  /*
    The labels as one string, not the `card` array: a variant builds its game fresh on
    every render, so `card` is a new array each time and depending on it re-ran the fit
    — tearing down and rebuilding the `ResizeObserver` — on every unrelated state
    change, a tab switch included. What the measurement actually depends on is the text.

    `font.className` is in there because a webfont that has not arrived yet measures as
    the fallback face, and the fallback is not the thing being judged.
  */
  const labels = card.map((square) => square.label).join(' ');
  const clipped = useFitted(grid, fit, [labels, cqw, font.className]);

  return (
    /*
      The container has to be an *ancestor* of the thing sizing itself against it:
      `cqw` inside an element that is itself the container resolves against the
      next container up, and with none it silently falls back to the viewport —
      which is the exact behaviour this file exists to get away from, so a wrapper
      it is.
    */
    <div style={{ containerType: 'inline-size' }}>
      <ul
        ref={grid}
        aria-label="Your card"
        className={`grid grid-cols-5 gap-1 ${font.className}`}
        style={{ fontSize: `${cqw}cqw` }}
      >
        {cells.map((square, index) => {
          const free = square === undefined || square === null;
          const isMarked = free ? false : marked.has(square.id);
          const isInherited = !free && inherited.has(square.id);

          return (
            <li key={square?.id ?? 'free'} className="aspect-square">
              {free ? (
                <span
                  className={`${CELL} border-neutral-500 bg-neutral-800 font-semibold uppercase`}
                >
                  {index === CENTRE ? freeCentre : null}
                </span>
              ) : (
                <button
                  type="button"
                  title={square.description}
                  aria-pressed={isMarked}
                  onClick={() => onCall?.(square.id)}
                  className={`${CELL} ${style(isMarked, isInherited)}`}
                  style={clipped.has(square.id) ? RING : undefined}
                >
                  {/*
                    The label in a span of its own purely so it can be measured —
                    `w-full` keeps it the cell's width, so a word wider than the cell
                    overflows the span and shows up as `scrollWidth`.
                  */}
                  <span data-square={square.id} className="block w-full">
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

function style(isMarked: boolean, isInherited: boolean): string {
  if (!isMarked) return 'border-neutral-700 bg-neutral-900';

  return isInherited
    ? 'border-neutral-600 bg-neutral-700 font-semibold text-neutral-400'
    : 'border-emerald-400 bg-emerald-800 font-semibold text-emerald-50';
}
