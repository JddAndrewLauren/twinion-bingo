'use client';

/**
 * PROTOTYPE — "what am I looking for": the open squares on your card, with the
 * prose that says exactly what counts.
 *
 * **Open squares only.** A marked square is answered, and leaving it in the list
 * would make the list longest at the moment it is least useful. So it shrinks as
 * the race goes, from 24 rows at lights out to nothing at a full house, which is
 * also a progress read you get for free.
 *
 * Both fields already exist on `CardSquare` (D4: `label` <=30 chars for the cell,
 * `description` for the long press), so nothing here needs a model change. What it
 * does change is the *weight* on `description`: today it is a long-press nicety,
 * and in this list it becomes the thing that settles arguments about whether an
 * event counted. That is a real addition to #16's brief for ~180 squares, and it
 * is a decision to record rather than one for this file to make.
 *
 * Three shapes, because how the list is disclosed is the whole question:
 * `LookingForAccordion` (one block, all or nothing), `LookingForRows` (always
 * listed, one description at a time), `LookingForPanel` (no disclosure at all).
 * The inherited-mark rule matters here too — an inherited mark is *marked*, so it
 * is not open, and it stays out of all three.
 */

import { useState } from 'react';
import type { CardSquare, Game } from '../../room-api';

/** The card's squares that are not yet marked, in the order they sit on the card. */
export function openSquares(game: Game): CardSquare[] {
  const marked = new Set(game.marks.map((mark) => mark.squareId));

  return (game.card ?? []).filter((square) => !marked.has(square.id));
}

const HEADING = 'What am I looking for';

/**
 * Shape 1 — one collapsible block. Collapsed by default, so the card keeps the
 * screen until you ask; open, it is every remaining square and a long scroll.
 * The bet: you consult this between events, not during one.
 */
export function LookingForAccordion({ game }: { game: Game }) {
  const open = openSquares(game);
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="rounded border border-neutral-800">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold"
      >
        <span>
          {HEADING}{' '}
          <span className="font-normal text-neutral-400">({open.length})</span>
        </span>
        <span className="shrink-0 text-neutral-400">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <ul className="flex flex-col divide-y divide-neutral-800 border-t border-neutral-800">
          {open.map((square) => (
            <li key={square.id} className="px-3 py-2">
              <p className="text-sm font-semibold">{square.label}</p>
              <p className="text-sm text-neutral-400">{square.description}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Shape 2 — the labels are always listed; the prose is per-row. Two levels of
 * disclosure instead of one, on the theory that the list you want at a glance is
 * "what is still out there" and the prose is only wanted for the one square you
 * are arguing about. Costs a second tap to reach any description.
 */
export function LookingForRows({ game }: { game: Game }) {
  const open = openSquares(game);
  const [shown, setShown] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-1 text-sm font-semibold">
        {HEADING}{' '}
        <span className="font-normal text-neutral-400">({open.length})</span>
      </h2>
      <ul className="flex flex-col gap-px">
        {open.map((square) => {
          const isShown = shown === square.id;

          return (
            <li key={square.id}>
              <button
                type="button"
                onClick={() => setShown(isShown ? null : square.id)}
                aria-expanded={isShown}
                className={`flex min-h-11 w-full items-center justify-between gap-2 rounded px-3 text-left text-sm ${
                  isShown ? 'bg-neutral-800' : 'bg-neutral-900'
                }`}
              >
                <span className="min-w-0">{square.label}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {isShown ? '▾' : '?'}
                </span>
              </button>
              {isShown && (
                <p className="px-3 py-2 text-sm text-neutral-400">
                  {square.description}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Shape 3 — no disclosure. Every open square and its prose, always, for a surface
 * that has the room: a phone tab of its own, or the space under the card on a
 * landscape iPad. Nothing to learn and nothing to tap, at the price of needing a
 * surface that can afford it.
 */
export function LookingForPanel({ game }: { game: Game }) {
  const open = openSquares(game);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">
        {HEADING}{' '}
        <span className="font-normal text-neutral-400">({open.length})</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {open.map((square) => (
          <li key={square.id}>
            <p className="text-sm font-semibold">{square.label}</p>
            <p className="text-sm text-neutral-400">{square.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
