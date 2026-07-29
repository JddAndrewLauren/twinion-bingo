import type { CardSquare, Mark } from '../../room-api';

/** 5x5, and the middle cell is the free one — so 24 squares are dealt (D4). */
const COLUMNS = 5;
const CENTRE = 12;

const CELL = 'flex h-full w-full items-center justify-center rounded border p-1 text-center leading-tight';

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
 */
export function CardGrid({
  card,
  freeCentre,
  marks,
  onCall,
  canRetract,
  onRetract,
}: {
  card: CardSquare[];
  freeCentre: string;
  marks: Mark[];
  onCall: (squareId: string) => void;
  /** Whether D8 lets this viewer take this call back — the caller, or the host. */
  canRetract: (mark: Mark) => boolean;
  onRetract: (mark: Mark) => void;
}) {
  const marked = new Map(marks.map((mark) => [mark.squareId, mark]));
  const dealt = [...card];
  const cells = Array.from({ length: COLUMNS * COLUMNS }, (_, index) =>
    index === CENTRE ? null : dealt.shift(),
  );

  return (
    <ul
      aria-label="Your card"
      className="grid grid-cols-5 gap-1"
      // Cells are square and the text scales with the cell, so the same grid is
      // a phone card and an iPad card without a breakpoint.
      style={{ fontSize: 'clamp(0.5rem, 1.7vw, 0.8rem)' }}
    >
      {cells.map((square, index) => {
        const free = square === undefined || square === null;
        const mark = free ? undefined : marked.get(square.id);
        const isMarked = mark !== undefined;
        const retractable = mark !== undefined && canRetract(mark);

        return (
          <li key={square?.id ?? 'free'} className="aspect-square">
            {free ? (
              <span
                title={freeCentre}
                className={`${CELL} border-neutral-500 bg-neutral-800 font-semibold uppercase`}
              >
                {index === CENTRE ? freeCentre : null}
              </span>
            ) : (
              <button
                type="button"
                title={square.description}
                aria-pressed={isMarked}
                disabled={isMarked && !retractable}
                onClick={() =>
                  mark === undefined ? onCall(square.id) : onRetract(mark)
                }
                className={`${CELL} ${
                  isMarked
                    ? 'border-emerald-400 bg-emerald-800 font-semibold text-emerald-50'
                    : 'border-neutral-700 bg-neutral-900'
                }`}
              >
                {square.label}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
