'use client';

/**
 * PROTOTYPE — Variant C: "two surfaces, no overlays".
 *
 * A and B disagree about how much chrome the card can afford. C disagrees with
 * both about something earlier: that the card is the primary surface at all.
 *
 * The premise is that this game has two things you look at — your card, and what
 * the room is doing — and that stacking one over the other is what forces the sheet
 * and the overlay in the first place. So neither ever covers the other:
 *
 * - **Phone**: a segmented control, Card | Race. Each is a whole screen with no
 *   overlay, no sheet, no gesture. A call while you are on Race puts a count on the
 *   Card tab rather than a toast over anything.
 * - **`ipad-11-landscape`**: not a card with a sidebar bolted on, but a genuine
 *   50/50 split — the card as large as the left half allows, the race reading out
 *   at full size on the right. The iPad propped by the TV is the device this is
 *   for, and on it the timeline is not a detail panel.
 *
 * The cost, stated up front so it can be judged rather than discovered: on the
 * phone your card is behind a tab half the time, and D1 rewards spotting *fast*.
 * If tabbing away from the card ever costs someone a call, C is wrong.
 */

import { useState } from 'react';
import { Results } from '../../r/[code]/results';
import { ProtoCard } from './proto-card';
import {
  MOCK_ROSTER,
  mockBottomSlot,
  mockGame,
  type LabelSet,
} from './mock-state';

export const NAME = 'Two surfaces, no overlays — tabs / true 50-50 split';

export function VariantC({ labels }: { labels: LabelSet }) {
  const game = mockGame(labels);
  const slot = mockBottomSlot(labels);
  const [tab, setTab] = useState<'card' | 'race'>('card');

  const you = game.standings.find(
    (standing) => standing.playerId === MOCK_ROSTER.you?.id,
  );

  const card = (
    <ProtoCard
      card={game.card ?? []}
      freeCentre={game.freeCentre}
      marks={game.marks}
      inheritedMarks={game.inheritedMarks}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {/* One header for both surfaces, and the room code stays visible in it. */}
      <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-neutral-800 px-3 py-2">
        <span className="text-sm font-semibold">Room {MOCK_ROSTER.code}</span>
        <span className="text-xs tabular-nums text-neutral-400">
          {you?.marks ?? 0} marks · {MOCK_ROSTER.players.length} here
        </span>
      </header>

      {/* The segmented control. Phone only — the split makes it redundant. */}
      <div className="flex shrink-0 gap-1 p-2 lg:hidden">
        {(['card', 'race'] as const).map((which) => (
          <button
            key={which}
            type="button"
            onClick={() => setTab(which)}
            className={`flex-1 rounded px-3 py-2 text-sm font-semibold capitalize ${
              tab === which
                ? 'bg-neutral-800 text-neutral-50'
                : 'text-neutral-500'
            }`}
          >
            {which === 'card' ? 'Card' : 'Race'}
          </button>
        ))}
      </div>

      {/* Below lg one of these is on screen; at lg both are, side by side. */}
      <div className="flex min-h-0 flex-1 lg:gap-4 lg:p-4">
        <section
          className={`min-w-0 flex-1 p-1 lg:block lg:p-0 ${
            tab === 'card' ? 'block' : 'hidden'
          }`}
        >
          {/* Square and centred inside whatever half it has been given. */}
          <div
            className="mx-auto w-full"
            style={{ maxWidth: 'min(100%, 100dvh - 8rem)' }}
          >
            {card}
          </div>
        </section>

        <section
          className={`min-w-0 flex-1 overflow-y-auto p-3 lg:block lg:border-l lg:border-neutral-800 ${
            tab === 'race' ? 'block' : 'hidden'
          }`}
        >
          {/* Bigger than `Results`' own `text-sm`, because on the right half of an
              iPad this is a thing being read from a sofa, not a footnote. */}
          <div className="lg:text-base">
            <Results game={game} />
          </div>
        </section>
      </div>

      {/*
        The undo row, and only the undo row — a remote credit is a row of the
        timeline in this variant, which is already on screen on the iPad and one
        tap away on the phone. Docked in flow rather than fixed, so it cannot
        cover either surface at any viewport.
      */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-emerald-700 bg-emerald-800 p-3 text-sm text-emerald-50">
        <span className="min-w-0">Called {slot.undoLabel}</span>
        <button
          type="button"
          className="shrink-0 rounded border border-emerald-200 px-3 py-1 font-semibold"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
