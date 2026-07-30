'use client';

import { useEffect } from 'react';

/**
 * Keep the screen on while a game is live.
 *
 * A phone that sleeps every thirty seconds during a two-hour race is unusable,
 * and this is the whole fix — so it is held for exactly as long as there is a
 * race to watch, and given straight back the moment there is not. A dimmed
 * screen is a worse race; it is never a broken room, so every rejection here is
 * swallowed rather than surfaced.
 *
 * Four things the API makes the caller's problem, each of which is a phone left
 * awake for the evening or a console full of red if it is skipped:
 *
 * - **It is genuinely absent.** `lib.dom` types `navigator.wakeLock` as always
 *   there; older iOS Safari does not have it, and that is half the target
 *   hardware. Hence the widening cast and the feature test behind it.
 * - **A hidden document refuses.** The request rejects `NotAllowedError` unless
 *   the page is visible, so it is not even asked for until it is — and the
 *   `visibilitychange` listener is what asks again on the way back, which is
 *   the criterion about a tab returning to the foreground.
 * - **The OS takes it back.** A call, a low battery, and the sentinel fires
 *   `release` without the page having asked. The reference is dead from then
 *   on, so it is dropped rather than released twice on the way out.
 * - **The request is in flight when the effect ends.** Unmount, the full house
 *   landing, StrictMode's second pass — the sentinel arrives after there is
 *   anyone left to hold it, and nothing would ever release it. That is the one
 *   failure mode that leaves a phone awake for the rest of the evening, so
 *   `gone` releases it on arrival.
 */
export function useWakeLock(live: boolean): void {
  useEffect(() => {
    if (!live) return;

    const api = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (api === undefined) return;

    let gone = false;
    let held: WakeLockSentinel | null = null;

    const dropped = () => {
      held = null;
    };

    const acquire = async () => {
      if (held !== null || document.visibilityState !== 'visible') return;

      try {
        const sentinel = await api.request('screen');
        if (gone) {
          void sentinel.release().catch(() => {});
          return;
        }
        held = sentinel;
        sentinel.addEventListener('release', dropped);
      } catch {
        // A refused lock is a screen that dims, which is not worth a word.
      }
    };

    const release = () => {
      const sentinel = held;
      held = null;
      sentinel?.removeEventListener('release', dropped);
      void sentinel?.release().catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
      else release();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [live]);
}
