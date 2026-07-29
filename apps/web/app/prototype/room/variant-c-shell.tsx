'use client';

/**
 * PROTOTYPE — C's skeleton, shared by the two variants that keep C's structure.
 *
 * Normally sharing a layout between variants defeats the point of having variants.
 * Here it is the point: C has already been chosen, and what is being compared is
 * one element inside it. Holding everything else identical is what makes the
 * comparison about the list rather than about incidental drift.
 *
 * C3 does *not* use this, because it changes the navigation itself — a third tab
 * is a different skeleton, not a different slot.
 */

import { useState } from 'react';
import { Results } from '../../r/[code]/results';
import { ProtoCard } from './proto-card';
import {
  MOCK_ROSTER,
  mockBottomSlot,
  mockGame,
  type LabelSet,
  type Stage,
} from './mock-state';

export function CShell({
  labels,
  stage,
  /** The "what am I looking for" element, directly under the card. */
  belowCard,
}: {
  labels: LabelSet;
  stage: Stage;
  belowCard: (game: ReturnType<typeof mockGame>) => React.ReactNode;
}) {
  const game = mockGame(labels, stage);
  const slot = mockBottomSlot(labels);
  const [tab, setTab] = useState<'card' | 'race'>('card');

  const you = game.standings.find(
    (standing) => standing.playerId === MOCK_ROSTER.you?.id,
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-neutral-800 px-3 py-2">
        <span className="text-sm font-semibold">Room {MOCK_ROSTER.code}</span>
        <span className="text-xs tabular-nums text-neutral-400">
          {you?.marks ?? 0} marks · {MOCK_ROSTER.players.length} here
        </span>
      </header>

      <div className="flex shrink-0 gap-1 p-2 lg:hidden">
        {(['card', 'race'] as const).map((which) => (
          <button
            key={which}
            type="button"
            onClick={() => setTab(which)}
            className={`min-h-11 flex-1 rounded px-3 text-sm font-semibold ${
              tab === which
                ? 'bg-neutral-800 text-neutral-50'
                : 'text-neutral-500'
            }`}
          >
            {which === 'card' ? 'Card' : 'Race'}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 lg:gap-4 lg:p-4">
        {/*
          The card column scrolls now, where plain C's did not: the list under the
          card is the first thing here tall enough to need it.
        */}
        <section
          className={`min-w-0 flex-1 overflow-y-auto p-1 lg:block lg:p-0 ${
            tab === 'card' ? 'block' : 'hidden'
          }`}
        >
          <div
            className="mx-auto flex w-full flex-col gap-3"
            style={{ maxWidth: 'min(100%, 100dvh - 8rem)' }}
          >
            <ProtoCard
              card={game.card ?? []}
              freeCentre={game.freeCentre}
              marks={game.marks}
              inheritedMarks={game.inheritedMarks}
            />
            {belowCard(game)}
          </div>
        </section>

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
