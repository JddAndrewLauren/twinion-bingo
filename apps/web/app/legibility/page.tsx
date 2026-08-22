'use client';

import { CardGrid } from '../r/[code]/card-grid';
import { FREE_CENTRE, WORST_24 } from './worst-labels';

/**
 * The pool's worst 24 labels on a real card, for judging legibility on real hardware.
 *
 * #19's hardware pass asks a question no gate can answer — "is this readable without
 * zooming, on a phone, across a room, mid-race" — and the only honest way to ask it is
 * on the device, on the labels most likely to fail. `worst-labels.ts` picks those
 * without anyone choosing them, so this page keeps screening the right squares as the
 * pool changes.
 *
 * The card is inert: `finished` is what the room uses once a full house has closed the
 * game, and it disables every cell. Nothing here talks to the API, so a tap that
 * called something would have nowhere to send it — and a card being read on a phone
 * gets thumbs on it.
 */

/** No card state to hold, so every callback is a no-op — defined once, outside the
 * component, because `CardGrid`'s cleanup effect keys on `onPeek`'s identity. */
const noop = () => {};
const noRetraction = () => false;

export default function Legibility() {
  return (
    /*
      The room's own geometry, not an approximation of it — `room-screen.tsx`'s
      outer shell, its card column and the wrapper inside it, class for class. The
      cell size is what is being judged, so a page that sized its card differently
      would be judging a card that does not exist.

      That includes the empty column at `lg`: at `ipad-11-landscape` the room puts
      the card in one half of a two-pane row, so a full-width card here would render
      about a quarter larger than the real one and read as a pass the device would
      not give.
    */
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-rule-soft px-3 py-2">
        <h1 className="text-sm font-semibold">Legibility</h1>
        <p className="text-xs tabular-nums text-muted">
          the F1 pool&rsquo;s worst 24 labels
        </p>
      </header>

      <div className="flex min-h-0 flex-1 lg:gap-4 lg:p-4">
        <section className="min-w-0 flex-1 overflow-y-auto p-1">
          <div className="mx-auto flex w-full max-w-[min(100%,100dvh_-_8rem)] flex-col gap-3">
            <CardGrid
              card={WORST_24}
              freeCentre={FREE_CENTRE}
              marks={[]}
              inheritedMarks={[]}
              onCall={noop}
              canRetract={noRetraction}
              onRetract={noop}
              onPeek={noop}
              finished
            />

            {/*
              What each cell is, in the order the card deals them: the two numbers
              that decide whether it fits, and the id — so a label that fails on
              hardware maps straight to an `overrides.json` entry without anyone
              grepping the pool for its prose.

              `break-words` because a square id is one long unbreakable token and a
              row that pushed the page sideways would be a defect of this page
              rather than of the card it exists to show.
            */}
            <ol className="flex flex-col gap-1 text-xs text-muted">
              {WORST_24.map((square) => (
                <li key={square.id} className="break-words">
                  <span className="text-ink">{square.label}</span> —{' '}
                  <span className="tabular-nums">{square.chars}</span> chars, run{' '}
                  <span className="tabular-nums">{square.run}</span> (&ldquo;
                  {square.runWord}&rdquo;) — {square.id}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The room's right pane, present only for its width. */}
        <div
          aria-hidden
          className="hidden min-w-0 flex-1 lg:block lg:border-l lg:border-rule-soft"
        />
      </div>
    </div>
  );
}
