import type { CardSquare } from '../../room-api';

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
 * text, so the grid does not reflow under a thumb the moment a call lands, but a
 * disabled one: the call has happened, and a second tap has nothing to add.
 */
export function CardGrid({
  card,
  freeCentre,
  marks,
  onCall,
}: {
  card: CardSquare[];
  freeCentre: string;
  marks: string[];
  onCall: (squareId: string) => void;
}) {
  const marked = new Set(marks);
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
        const isMarked = !free && marked.has(square.id);

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
                disabled={isMarked}
                onClick={() => onCall(square.id)}
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
