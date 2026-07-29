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
import { asLabelSet, LABEL_SETS, LABEL_SET_NAMES } from './room/mock-state';
import { asFit, asTextSize, FITS, TEXT_SIZES } from './room/proto-card';
import { asFont, FONTS, fontFor } from './room/proto-fonts';

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

  const labels = asLabelSet(params.get('labels'));
  const text = asTextSize(params.get('text'));
  const font = asFont(params.get('font'));
  const fit = asFit(params.get('fit'));
  const stage = params.get('stage') === 'start' ? 'start' : 'mid';
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

  function set(key: string, value: string) {
    const query = new URLSearchParams(params.toString());
    query.set(key, value);
    router.replace(`?${query.toString()}`);
  }

  /**
   * The two axes of "how much can a cell say" — label length and text size — as
   * cycles rather than toggles, because each has four steps and a bar built for a
   * thumb has no room for eight more buttons. Cycling also matches how they get
   * judged: hold one still, step the other until the cell breaks.
   */
  function cycleLabels() {
    const at = LABEL_SETS.indexOf(labels);
    set('labels', LABEL_SETS[(at + 1) % LABEL_SETS.length] ?? 'cap');
  }

  function cycleText(by = 1) {
    const at = TEXT_SIZES.findIndex((size) => size.key === text);
    const next = (at + by + TEXT_SIZES.length) % TEXT_SIZES.length;
    set('text', TEXT_SIZES[next]?.key ?? 'XL');
  }

  /**
   * The other two ways of buying characters per line, which is what the size and
   * length axes kept running out of: a narrower or taller-x-height face, and a
   * strategy for the one word that still does not fit.
   */
  function cycleFont() {
    const at = FONTS.findIndex((choice) => choice.key === font);
    set('font', FONTS[(at + 1) % FONTS.length]?.key ?? 'roboto-condensed');
  }

  function cycleFit() {
    const at = FITS.findIndex((choice) => choice.key === fit);
    set('fit', FITS[(at + 1) % FITS.length]?.key ?? 'shrink');
  }

  /**
   * Lights out against mid-race. It belongs on the bar rather than in the URL alone
   * because the list's worst case is 24 rows, and 24 rows only exist before anything
   * has been called.
   */
  function toggleStage() {
    set('stage', stage === 'mid' ? 'start' : 'mid');
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
      // Up/down for text size, so the desktop pass can walk the size axis without
      // reaching for the bar. Up is bigger, and both wrap.
      if (event.key === 'ArrowUp') cycleText(1);
      if (event.key === 'ArrowDown') cycleText(-1);
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
          {/*
            The two axes spelled out, because these get judged by photographing an
            iPad and a photo of a card is no use if it does not say which pair of
            settings produced it.
          */}
          <p className="truncate px-1 text-[11px] tabular-nums">
            {LABEL_SET_NAMES[labels]} · text {text} at{' '}
            {TEXT_SIZES.find((size) => size.key === text)?.scale}cqw (
            {TEXT_SIZES.find((size) => size.key === text)?.phonePx})
          </p>
          <p className="truncate px-1 text-[11px]">
            {fontFor(font).name} ·{' '}
            {FITS.find((choice) => choice.key === fit)?.name}
            {/*
              `condense` needs a width axis to do anything at all, and an inert
              control that looks live is how you conclude a strategy failed when it
              never ran.
            */}
            {fit === 'condense' && !fontFor(font).widthAxis
              ? ' — inert, needs Archivo'
              : ''}
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
              Four steps now rather than two: a cap is a number, and picking a number
              means seeing both sides of the one you have.
            */}
            <button
              type="button"
              onClick={cycleLabels}
              className={`${TARGET} rounded-xl bg-black/25 px-3 text-xs font-semibold`}
            >
              {LABEL_SET_NAMES[labels]}
            </button>
            {/*
              The other half of the same question. Length and size trade against each
              other in one 68pt box, so they sit side by side: step one, then the
              other, and the cell tells you where the pair stops working.
            */}
            <button
              type="button"
              onClick={() => cycleText(1)}
              className={`${TARGET} rounded-xl bg-black/25 px-3 text-xs font-semibold`}
            >
              text {text}
            </button>
            {/*
              Length and size both ran out before the cap did — every failure was one
              word too wide for the cell. These two are the other levers on that same
              word: a narrower face, and what to do when it still does not fit.
            */}
            <button
              type="button"
              onClick={cycleFont}
              className={`${TARGET} rounded-xl bg-black/25 px-3 text-xs font-semibold`}
            >
              {fontFor(font).name}
            </button>
            <button
              type="button"
              onClick={cycleFit}
              className={`${TARGET} rounded-xl bg-black/25 px-3 text-xs font-semibold`}
            >
              fit: {FITS.find((choice) => choice.key === fit)?.name}
            </button>
            <button
              type="button"
              onClick={toggleStage}
              className={`${TARGET} rounded-xl bg-black/25 px-3 text-xs font-semibold`}
            >
              {stage === 'mid' ? 'mid-race' : 'lights out'}
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
