'use client';

/**
 * PROTOTYPE — Variant C1: C, plus "what am I looking for".
 *
 * Two layouts, and they now disagree about where the list belongs — deliberately,
 * because the two devices have different room and a different posture.
 *
 * **Phone (and portrait iPad, which is below `lg`)** — the list is one collapsible
 * block under the card on the Card tab, shut by default, so the card keeps the
 * screen until you ask. Watch for: opened at lights out it is 24 squares and a long
 * scroll, and the card scrolls away above it. The count in the heading is doing a
 * second job as the only part of the list readable while it is shut.
 *
 * **Landscape iPad** — the list is not under the card at all. The right column is
 * tabbed, **Looking for** and **Race**, and it opens on *Looking for*: propped next
 * to the TV with the race still young, what you want is what to watch for, not a
 * timeline of things that already happened. The left column is the card and only the
 * card, so it never moves and never scrolls.
 *
 * The cost to judge, since it is real: at `ipad-11-landscape` the standings and
 * timeline are now a tap away rather than permanently on screen, and being
 * permanently on screen was the thing plain C was best at.
 */

import { useState } from 'react';
import { Results } from '../../r/[code]/results';
import { ProtoCard } from './proto-card';
import {
  LookingForAccordion,
  LookingForPanel,
  openSquares,
} from './looking-for';
import {
  MOCK_ROSTER,
  mockBottomSlot,
  mockGame,
  type LabelSet,
  type Stage,
} from './mock-state';

export const NAME = 'C + list (iPad: tabbed right column, list first)';

export function VariantC1({
  labels,
  stage,
}: {
  labels: LabelSet;
  stage: Stage;
}) {
  const game = mockGame(labels, stage);
  const slot = mockBottomSlot(labels);

  /** The phone's two whole-screen surfaces. */
  const [tab, setTab] = useState<'card' | 'race'>('card');
  /**
   * The landscape iPad's right column. A different set of tabs rather than the same
   * pair renamed, so it is separate state — and it defaults to the list, because
   * early in a race that is the useful half.
   */
  const [pane, setPane] = useState<'looking' | 'race'>('looking');

  const you = game.standings.find(
    (standing) => standing.playerId === MOCK_ROSTER.you?.id,
  );
  const openCount = openSquares(game).length;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-neutral-800 px-3 py-2">
        <span className="text-sm font-semibold">Room {MOCK_ROSTER.code}</span>
        <span className="text-xs tabular-nums text-neutral-400">
          {you?.marks ?? 0} marks · {MOCK_ROSTER.players.length} here
        </span>
      </header>

      {/* The phone's segmented control. Gone at lg, where both columns are up. */}
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
        {/* Left column: the card, and on the phone the list underneath it. */}
        <section
          className={`min-w-0 flex-1 overflow-y-auto p-1 lg:block lg:overflow-visible lg:p-0 ${
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
            {/*
              Phone only. At lg the list has a tab of its own on the right, and
              carrying it in both places would be two ways to read one thing.
            */}
            <div className="lg:hidden">
              <LookingForAccordion game={game} />
            </div>
          </div>
        </section>

        {/*
          Right column. On the phone it is the Race tab and nothing else; at lg it is
          tabbed and opens on the list.
        */}
        <section
          className={`min-w-0 flex-1 overflow-y-auto p-3 lg:flex lg:flex-col lg:gap-3 lg:border-l lg:border-neutral-800 ${
            tab === 'race' ? 'block' : 'hidden'
          }`}
        >
          <div className="hidden shrink-0 gap-1 lg:flex">
            {(
              [
                ['looking', `Looking for ${openCount}`],
                ['race', 'Race'],
              ] as const
            ).map(([which, caption]) => (
              <button
                key={which}
                type="button"
                onClick={() => setPane(which)}
                className={`min-h-11 flex-1 rounded px-3 text-sm font-semibold ${
                  pane === which
                    ? 'bg-neutral-800 text-neutral-50'
                    : 'text-neutral-500'
                }`}
              >
                {caption}
              </button>
            ))}
          </div>

          {/*
            At lg the tabs decide; below lg this column is only ever the race, so
            `Results` renders once and is simply always visible under lg.

            The list panel is still in the DOM at phone width — hidden, never shown,
            because which layout applies is a CSS question here and not a JS one. The
            alternative is a `matchMedia` hook, which costs a flash of the phone
            layout on the iPad being judged: worse than some inert markup. Worth
            knowing if you ever count rows in a gate, though, because the phone's
            open squares appear twice in the document and only once on the screen.
          */}
          <div
            className={`hidden min-h-0 flex-1 overflow-y-auto lg:text-base ${
              pane === 'looking' ? 'lg:block' : ''
            }`}
          >
            <LookingForPanel game={game} heading={false} />
          </div>
          <div
            className={`min-h-0 flex-1 overflow-y-auto lg:text-base ${
              pane === 'race' ? 'lg:block' : 'lg:hidden'
            }`}
          >
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
