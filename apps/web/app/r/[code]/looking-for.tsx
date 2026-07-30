'use client';

import { useState } from 'react';
import type { CardSquare, Game } from '../../room-api';

/**
 * "What am I looking for": the squares still open on your card, with the prose that
 * says exactly what counts.
 *
 * This is the whole difference between the prototype's C and its C1, and C1 is what
 * #12 settled on — because a card of 24 five-character phrases is a set of reminders
 * rather than a set of rules, and the argument a room actually has is whether the
 * thing on screen counted. `description` is where that is answered.
 *
 * **Open squares only.** A marked square is answered, and carrying it would make the
 * list longest at the moment it is least useful. So it shrinks from 24 rows at lights
 * out to nothing at a full house, which is a progress read for free. An inherited
 * mark is *marked*, so it is not open and stays out.
 *
 * `description` therefore stops being a long-press nicety and becomes load-bearing,
 * which is a real addition to #16's authoring brief and recorded on it: every square
 * needs prose that *disambiguates*, not prose that reminds. #12's licence puts the
 * working ceiling at ~130 characters rather than the committed pool's 64.
 *
 * **Two shapes, because the two layouts have different room.** `LookingFor` below is
 * the phone-layout accordion; `LookingForPanel` is the same rows in the two-pane
 * layout's right pane, where the list has a tab of its own and needs no disclosure.
 * Both are in the document at every width — see the note on the panel.
 */

/**
 * **Shut by default, and one block rather than per-row disclosure.** The card keeps
 * the screen until asked for this; the count in the heading is the only part of it
 * that reads while it is shut, which is why the count is there at all. #12 measured
 * the worst case — every one of 24 rows up at lights out, descriptions to 127
 * characters — as a long scroll and nothing overflowing.
 */
export function LookingFor({ game }: { game: Game }) {
  const [expanded, setExpanded] = useState(false);
  const open = openSquares(game);

  return (
    <section className="rounded border border-neutral-800">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold"
      >
        <span>
          What am I looking for{' '}
          <span className="font-normal text-neutral-400">({open.length})</span>
        </span>
        <span aria-hidden className="shrink-0 text-neutral-400">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <ul
          aria-label="Squares still open"
          className="flex flex-col divide-y divide-neutral-800 border-t border-neutral-800"
        >
          {open.map((square) => (
            <Row key={square.id} square={square} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The same list with no disclosure at all, for the two-pane layout's right pane: a
 * tab caption already names it and a heading under the tab saying the same thing
 * would be noise, so there is neither a heading nor a toggle here.
 *
 * **Its list is deliberately not `aria-label="Squares still open"`.** The layout
 * switch is pure CSS, so below `lg` this panel is in the document as well as the
 * accordion — hidden, never shown, but present. A second list under the same
 * accessible name would make that name ambiguous everywhere, and in jsdom (which
 * applies no Tailwind, so *both* are "visible") it breaks the query outright. The
 * container carries a name of its own instead, so the two are addressable and
 * neither is mistaken for the other.
 */
export function LookingForPanel({ game }: { game: Game }) {
  const open = openSquares(game);

  return (
    <section aria-label="Looking for">
      {open.length === 0 ? (
        /*
          A pane needs an empty state where the accordion does not: the accordion is
          shut and reads `(0)` in its own heading, but this one is a whole column and
          opens by default, so at a full house it was a blank half of the screen with
          the final standings behind an unhinted tab.
        */
        <p className="px-3 py-2 text-sm text-neutral-400">
          Nothing left to look for — every square on your card is marked.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-800">
          {open.map((square) => (
            <Row key={square.id} square={square} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One open square: the label as it reads on the card, then the prose that settles it. */
function Row({ square }: { square: CardSquare }) {
  return (
    <li className="px-3 py-2">
      <p className="text-sm font-semibold">{square.label}</p>
      <p className="text-sm text-neutral-400">{square.description}</p>
    </li>
  );
}

/**
 * The card's squares that are not yet marked, in the order they sit on the card —
 * so a row can be found on the card by where it is in the list, rather than by
 * reading all 24.
 *
 * Exported because the right pane's tab caption carries the count, and the count has
 * to be the same number the list is long.
 */
export function openSquares(game: Game): CardSquare[] {
  const marked = new Set(game.marks.map((mark) => mark.squareId));

  return (game.card ?? []).filter((square) => !marked.has(square.id));
}
