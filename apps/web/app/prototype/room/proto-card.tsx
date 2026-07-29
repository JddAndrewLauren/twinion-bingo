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
 * `scale` is the knob a variant turns: cqw per cell-line. Higher is bigger text.
 *
 * Measured with hyphenation on and off, and it made no difference to overflow at
 * any of the four viewports — so there is no `hyphens-auto` here. It was only ever
 * going to buy legibility back by spending it, and "Red Bull fum-bles a stop" is
 * not a thing to read at a glance with a race on.
 */

import type { CardSquare, Mark } from '../../room-api';

const COLUMNS = 5;
const CENTRE = 12;

const CELL =
  'flex h-full w-full items-center justify-center overflow-hidden rounded border p-1 text-center leading-tight';

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
   */
  scale = 2.15,
  onCall,
}: {
  card: CardSquare[];
  freeCentre: string;
  marks: Mark[];
  inheritedMarks: string[];
  scale?: number;
  onCall?: (squareId: string) => void;
}) {
  const marked = new Map(marks.map((mark) => [mark.squareId, mark]));
  const inherited = new Set(inheritedMarks);
  const dealt = [...card];
  const cells = Array.from({ length: COLUMNS * COLUMNS }, (_, index) =>
    index === CENTRE ? null : dealt.shift(),
  );

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
        aria-label="Your card"
        className="grid grid-cols-5 gap-1"
        style={{ fontSize: `${scale}cqw` }}
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
                >
                  {square.label}
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
