'use client';

/**
 * PROTOTYPE — Variant C3: the list is a surface, not a drawer.
 *
 * C1 and C2 both put the list under the card and then argue about how much of it to
 * hide. C3 says that argument only exists because the list is in the wrong place: it
 * is not a footnote to the card, it is a third thing you read, so it gets a third
 * segment on the phone and no disclosure at all.
 *
 * Two consequences worth judging:
 *
 * - **The phone card never moves.** Nothing is appended under it, so the card sits
 *   exactly where it does in plain C. C1 and C2 both push it up or make it scroll.
 * - **The landscape iPad gets the list for free.** C's own dead space is under the
 *   card in the left column — plain C leaves ~250px empty there — and the list fills
 *   it with no disclosure and no tab, permanently visible beside both the card and
 *   the race. That is the strongest case for this shape, and it only shows up on the
 *   device the issue says is plausibly primary.
 *
 * The cost, stated so it can be judged: three tabs is one more thing to learn than
 * two, and the "looking for" tab is the one nobody taps once they know the deck.
 */

import { useState } from 'react';
import { Results } from '../../r/[code]/results';
import { ProtoCard } from './proto-card';
import { LookingForPanel, openSquares } from './looking-for';
import {
  MOCK_ROSTER,
  mockBottomSlot,
  mockGame,
  type LabelSet,
} from './mock-state';

export const NAME = 'C + a third surface (list gets its own tab / iPad column)';

type Tab = 'card' | 'looking' | 'race';

export function VariantC3({ labels }: { labels: LabelSet }) {
  const game = mockGame(labels);
  const slot = mockBottomSlot(labels);
  const [tab, setTab] = useState<Tab>('card');

  const you = game.standings.find(
    (standing) => standing.playerId === MOCK_ROSTER.you?.id,
  );
  const openCount = openSquares(game).length;

  const TABS: [Tab, string][] = [
    ['card', 'Card'],
    ['looking', `Looking for ${openCount}`],
    ['race', 'Race'],
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-neutral-800 px-3 py-2">
        <span className="text-sm font-semibold">Room {MOCK_ROSTER.code}</span>
        <span className="text-xs tabular-nums text-neutral-400">
          {you?.marks ?? 0} marks · {MOCK_ROSTER.players.length} here
        </span>
      </header>

      {/* Three segments now. Phone only: at lg all three surfaces are on screen. */}
      <div className="flex shrink-0 gap-1 p-2 lg:hidden">
        {TABS.map(([which, caption]) => (
          <button
            key={which}
            type="button"
            onClick={() => setTab(which)}
            className={`min-h-11 flex-1 rounded px-2 text-xs font-semibold ${
              tab === which
                ? 'bg-neutral-800 text-neutral-50'
                : 'text-neutral-500'
            }`}
          >
            {caption}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 lg:gap-4 lg:p-4">
        {/*
          Left column at lg: the card, and under it the list in the space plain C
          wastes. On the phone these are two separate tabs, so the card is never
          pushed by the list.
        */}
        <div className="flex min-w-0 flex-1 flex-col lg:gap-3 lg:overflow-y-auto">
          <section
            className={`min-w-0 p-1 lg:block lg:p-0 ${
              tab === 'card' ? 'block' : 'hidden'
            }`}
          >
            <div
              className="mx-auto w-full"
              style={{ maxWidth: 'min(100%, 100dvh - 8rem)' }}
            >
              <ProtoCard
                card={game.card ?? []}
                freeCentre={game.freeCentre}
                marks={game.marks}
                inheritedMarks={game.inheritedMarks}
              />
            </div>
          </section>

          <section
            className={`min-w-0 overflow-y-auto p-3 lg:block lg:p-0 ${
              tab === 'looking' ? 'block' : 'hidden'
            }`}
          >
            <LookingForPanel game={game} />
          </section>
        </div>

        <section
          className={`min-w-0 flex-1 overflow-y-auto p-3 lg:block lg:border-l lg:border-neutral-800 ${
            tab === 'race' ? 'block' : 'hidden'
          }`}
        >
          <div className="lg:text-base">
            <Results game={game} />
          </div>
        </section>
      </div>

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
