'use client';

/**
 * PROTOTYPE — the floating switcher. Delete when #12's decision is recorded.
 *
 * Deliberately loud and deliberately not part of any design being judged. Hidden
 * outside development, so a stray merge cannot ship it: a prototype route is
 * throwaway, but a bar that escaped into production would be a defect.
 *
 * **Built for a thumb, because this is judged on a phone.** The first cut of this
 * bar was a pair of 22x24px chevrons plus arrow-key shortcuts, which on real
 * hardware is nothing you can hit and no keyboard to hit it with — the switcher
 * was unusable on the only devices that matter. So:
 *
 * - Every target is at least 44x44, which is Apple's documented minimum.
 * - The variants are named buttons rather than a cycle. Direct selection beats
 *   stepping when comparing three things, and it removes the guess about which way
 *   an arrow goes.
 * - Arrow keys still work, for the desktop pass where they are convenient. They are
 *   no longer the only way through.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** Apple's minimum, and the reason the first cut of this bar did not work. */
const TARGET = 'min-h-11 min-w-11';

export function PrototypeSwitcher({
  variants,
  current,
  name,
}: {
  variants: string[];
  current: string;
  /** The current variant's own name, so the bar says what is on screen. */
  name: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const labels = params.get('labels') === 'real' ? 'real' : 'cap';
  /**
   * Open on arrival so the controls are discoverable, shut as soon as a variant is
   * chosen so the pill stops covering the thing it was chosen to show.
   */
  const [expanded, setExpanded] = useState(true);

  function show(variant: string) {
    const query = new URLSearchParams(params.toString());
    query.set('variant', variant);
    router.replace(`?${query.toString()}`);
  }

  function step(by: number) {
    const at = variants.indexOf(current);
    show(variants[(at + by + variants.length) % variants.length] ?? current);
  }

  function toggleLabels() {
    const query = new URLSearchParams(params.toString());
    query.set('labels', labels === 'cap' ? 'real' : 'cap');
    router.replace(`?${query.toString()}`);
  }

  // Still here for the desktop pass, but no longer the only way through.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (typing) return;

      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;

  return (
    /*
      Two things this wrapper has to get right, both learned the hard way:

      - `pointer-events-none` on the strip, `auto` on the pill. Otherwise this
        `inset-x-0` band swallows every tap at its own height across the full width,
        and it was eating C1's "what am I looking for" header — which reads exactly
        like the list being broken rather than like the switcher being in the way.
      - Bottom-left, clear of the ~120px the credit toast and D8's undo row occupy.
        Whether those cover the card is one of the things being judged, so a
        switcher parked on top of them would hide the evidence.
    */
    <div className="pointer-events-none fixed bottom-24 left-2 z-50 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1">
      {expanded ? (
        <div className="pointer-events-auto flex max-w-full flex-col gap-1 rounded-2xl bg-fuchsia-600 p-2 text-white shadow-lg shadow-black/50">
          {/* What is on screen, on its own line so it never squeezes a target. */}
          <p className="truncate px-1 text-[11px] font-semibold">
            {current} — {name}
          </p>

          {/* Wraps, so six keys still fit at `phone-small` without shrinking any. */}
          <div className="flex flex-wrap items-center gap-1">
            {variants.map((variant) => (
              <button
                key={variant}
                type="button"
                onClick={() => {
                  show(variant);
                  // Out of the way the moment it has done its job: the pill
                  // otherwise sits over whatever is at this height, and on a phone
                  // that is the very element being judged.
                  setExpanded(false);
                }}
                aria-pressed={variant === current}
                className={`${TARGET} rounded-xl px-3 text-base font-bold ${
                  variant === current
                    ? 'bg-white text-fuchsia-700'
                    : 'bg-black/25 text-white'
                }`}
              >
                {variant}
              </button>
            ))}

            {/*
              The second control, because #12 has to decide about D4's <=30 char cap
              as well as about layout, and the two are the same judgement made twice.
            */}
            <button
              type="button"
              onClick={toggleLabels}
              className={`${TARGET} rounded-xl bg-black/25 px-3 text-xs font-semibold`}
            >
              {labels === 'cap' ? 'at cap' : 'real pool'}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Hide the variant switcher"
              className={`${TARGET} rounded-xl bg-black/25 px-3 text-xs font-semibold`}
            >
              hide
            </button>
          </div>
        </div>
      ) : (
        /* Collapsed: one 44px handle naming the variant, and nothing else. */
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Show the variant switcher"
          className={`${TARGET} pointer-events-auto rounded-full bg-fuchsia-600 px-3 text-sm font-bold text-white shadow-lg shadow-black/50`}
        >
          {current}
        </button>
      )}
    </div>
  );
}
