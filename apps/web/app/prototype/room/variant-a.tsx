'use client';

/**
 * PROTOTYPE — Variant A: "D14 as written".
 *
 * The issue's own starting point, built literally so there is something to beat:
 * slim top bar (your marks, next unclaimed prize, presence dot), full-bleed card,
 * a swipe-up sheet for standings and timeline, calls as transient toasts.
 *
 * On `ipad-11-landscape` the sheet gives way to the two-pane layout the issue
 * describes: card left, standings and timeline permanently visible right. The
 * sheet is a phone compromise, so it is gone rather than adapted — which is the
 * first thing this variant is here to test, because a `lg:` breakpoint that swaps
 * one navigation model for another is two screens wearing one component's name.
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

export const NAME = 'D14 as written — slim bar + swipe-up sheet';

export function VariantA({
  labels,
  stage,
}: {
  labels: LabelSet;
  stage: Stage;
}) {
  const game = mockGame(labels, stage);
  const slot = mockBottomSlot(labels);
  const [sheet, setSheet] = useState(false);

  const you = game.standings.find(
    (standing) => standing.playerId === MOCK_ROSTER.you?.id,
  );
  const nextPrize = game.prizes.some((prize) => prize.prizeKind === 'TWO_LINES')
    ? 'full house'
    : 'two lines';
  const present = MOCK_ROSTER.players.length;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Card side. Full-bleed on the phone; the left pane on a landscape iPad. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The slim top bar: three facts, one line, no room for a fourth. */}
        <header className="flex shrink-0 items-baseline justify-between gap-2 border-b border-neutral-800 px-3 py-2 text-xs">
          <span className="font-semibold tabular-nums text-emerald-300">
            {you?.marks ?? 0} marks
          </span>
          <span className="truncate text-neutral-400">next: {nextPrize}</span>
          <span className="shrink-0 tabular-nums text-neutral-400">
            {present}/6 ●
          </span>
        </header>

        <div className="min-w-0 flex-1 p-1 lg:flex lg:items-center lg:p-3">
          <div className="w-full lg:mx-auto lg:max-w-[70vh]">
            <ProtoCard
              card={game.card ?? []}
              freeCentre={game.freeCentre}
              marks={game.marks}
              inheritedMarks={game.inheritedMarks}
            />
          </div>

          {/*
            The sheet's handle, directly under the card rather than pinned to the
            bottom of the column — the bottom of a phone belongs to D8's undo row,
            and a handle down there is a handle underneath a toast. Phone only; the
            right pane replaces it above lg.

            Leaving the dead space below it on purpose. The card is square and a
            phone is not, so "full-bleed card" buys ~390px of the 844 and the rest
            is empty however it is dressed. That gap is the honest cost of D14 as
            written, and something for the decision to react to rather than for the
            prototype to hide.
          */}
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="mt-3 w-full rounded border border-neutral-800 px-3 py-3 text-xs text-neutral-400 lg:hidden"
          >
            ▲ Standings &amp; timeline
          </button>
        </div>
      </div>

      {/* The permanent right pane, landscape iPad only. */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-neutral-800 p-3 lg:block">
        <Results game={game} />
      </aside>

      {/*
        The sheet as a full-height overlay rather than a real draggable one — the
        question is whether standings behind a gesture is acceptable at all, and a
        tap answers that as well as a drag would.
      */}
      {sheet && (
        <div className="fixed inset-0 z-10 flex flex-col justify-end bg-black/60 lg:hidden">
          <div className="max-h-[80dvh] overflow-y-auto rounded-t-xl border-t border-neutral-700 bg-neutral-950 p-4">
            <button
              type="button"
              onClick={() => setSheet(false)}
              className="mb-3 text-xs text-neutral-400"
            >
              ▼ Close
            </button>
            <Results game={game} />
          </div>
        </div>
      )}

      {/* The bottom slot, both rows up: #8's credit over D8's undo. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md flex-col gap-1 lg:left-auto lg:right-4 lg:mx-0 lg:max-w-sm">
        <p className="rounded-t bg-emerald-800 p-3 text-center text-sm text-emerald-50">
          {slot.credit}
        </p>
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-t bg-emerald-800 p-3 text-sm text-emerald-50">
          <span className="min-w-0">Called {slot.undoLabel}</span>
          <button
            type="button"
            className="shrink-0 rounded border border-emerald-200 px-3 py-1 font-semibold"
          >
            Undo
          </button>
        </div>
      </div>
    </div>
  );
}
