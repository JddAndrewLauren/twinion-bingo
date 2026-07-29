'use client';

/**
 * PROTOTYPE — Variant B: "the card is the screen".
 *
 * The opposite bet from A. The 68pt cell is the whole problem, so this variant
 * spends every available pixel on it and refuses to keep any chrome permanently:
 *
 * - No top bar. The three facts A puts in one live on a single pill that floats
 *   over a corner of the card, and the pill *is* the button to everything else.
 * - The card fills the viewport — square, centred, as large as the shorter axis
 *   allows, at every viewport including landscape iPad. Measured: a cell is 73px at
 *   `phone` against A's 73 and, decisively, **162px at `ipad-11-landscape`** where
 *   A manages 114 and C 109. That 40% is the whole case for this variant.
 * - Standings and timeline are a full-screen overlay, not a pane and not a sheet.
 *   You are either reading the card or reading the race, never half of each.
 * - No toast stack over the card. A call flashes the pill and lands in the
 *   overlay; the undo is the one thing allowed to interrupt, because it expires.
 *
 * What this is here to lose on: the issue says an iPad propped by the TV is
 * plausibly the primary device, and this variant gives that device no permanent
 * standings at all. If the giant card does not clearly win on legibility, it has
 * paid for nothing.
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

export const NAME = 'The card is the screen — pill + full-screen overlay';

export function VariantB({ labels }: { labels: LabelSet }) {
  const game = mockGame(labels);
  const slot = mockBottomSlot(labels);
  const [open, setOpen] = useState(false);

  const you = game.standings.find(
    (standing) => standing.playerId === MOCK_ROSTER.you?.id,
  );
  const position =
    game.standings.findIndex(
      (standing) => standing.playerId === MOCK_ROSTER.you?.id,
    ) + 1;

  return (
    <div className="relative flex min-h-dvh items-center justify-center p-1">
      {/*
        The card, square and as large as the shorter axis permits. `min(100vw,
        100dvh)` is what makes this the same layout in portrait and landscape
        rather than two — an 11" iPad on its side gets a 830px card, a phone gets
        a 388px one, and neither has a breakpoint written for it.
      */}
      <div
        className="w-full"
        style={{ maxWidth: 'min(100vw - 0.5rem, 100dvh - 0.5rem)' }}
      >
        <ProtoCard
          card={game.card ?? []}
          freeCentre={game.freeCentre}
          marks={game.marks}
          inheritedMarks={game.inheritedMarks}
        />
      </div>

      {/*
        The pill: your marks, your position, presence — and the way in. Over the
        card rather than above it, because a bar above it costs the card a row's
        worth of height at `phone-small` and this variant refuses to pay that.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-1/2 top-2 z-20 flex -translate-x-1/2 items-baseline gap-2 rounded-full border border-neutral-700 bg-neutral-900/90 px-3 py-1.5 text-xs backdrop-blur"
      >
        <span className="font-semibold tabular-nums text-emerald-300">
          {you?.marks ?? 0}
        </span>
        <span className="text-neutral-400">
          P{position} of {MOCK_ROSTER.players.length}
        </span>
        <span className="text-neutral-500">·</span>
        <span className="text-neutral-400">race ▸</span>
      </button>

      {/* The overlay. Full screen at every viewport — no pane, no sheet. */}
      {open && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-neutral-950 p-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mb-4 rounded border border-neutral-700 px-3 py-1.5 text-sm"
          >
            ◂ Back to your card
          </button>
          {/* Two columns where there is width for them; one where there is not. */}
          <div className="mx-auto max-w-3xl lg:columns-2 lg:gap-8">
            <Results game={game} />
          </div>
        </div>
      )}

      {/*
        The only interruption this variant allows, because it is the only one with
        a deadline. A remote spotter's credit flashes the pill instead.
      */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-t bg-emerald-800 p-3 text-sm text-emerald-50">
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
