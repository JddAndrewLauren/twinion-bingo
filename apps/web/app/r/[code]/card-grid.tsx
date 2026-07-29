import type { CardSquare } from '../../room-api';

/** 5x5, and the middle cell is the free one — so 24 squares are dealt (D4). */
const COLUMNS = 5;
const CENTRE = 12;

/**
 * One player's card. The centre is free and theme-flavoured ("LIGHTS OUT"), and
 * carries no square id because it is not a pool square: nothing has to happen for
 * it to count.
 *
 * Nothing here is marked. Marks come from the call log, never from the card, so
 * this component renders a fixed list and no state at all.
 */
export function CardGrid({
  card,
  freeCentre,
}: {
  card: CardSquare[];
  freeCentre: string;
}) {
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
      {cells.map((square, index) => (
        <li
          key={square?.id ?? 'free'}
          title={square?.description ?? freeCentre}
          className={`flex aspect-square items-center justify-center rounded border p-1 text-center leading-tight ${
            square === undefined || square === null
              ? 'border-neutral-500 bg-neutral-800 font-semibold uppercase'
              : 'border-neutral-700 bg-neutral-900'
          }`}
        >
          {index === CENTRE ? freeCentre : square?.label}
        </li>
      ))}
    </ul>
  );
}
