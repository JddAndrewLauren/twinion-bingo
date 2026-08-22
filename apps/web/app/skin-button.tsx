'use client';

import { useState } from 'react';
import { nextSkin, SKIN_COOKIE, type Skin } from './skin';

/** A year, which is long enough that the cookie outlives any one session. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The one control that changes the skin. No menu, no confirmation, and no
 * other skin's name shown anywhere — a press just advances the fixed cycle
 * `skin.ts` owns and re-skins the button itself, so the player sees the new
 * skin's treatment of the very control they pressed.
 *
 * A cookie rather than `localStorage` (README's *A cookie, not localStorage*):
 * `layout.tsx` reads it server-side so `<html data-skin>` and `themeColor` are
 * right on the very first paint, which is the whole reason Confetti and
 * Scorecard — both light — do not flash near-black on a phone before a
 * `useEffect` could catch up.
 *
 * Client component because writing that cookie and putting `data-skin` on
 * `<html>` are both things only a browser does. `document.documentElement`
 * is touched directly, in the same tap, rather than through some app-wide
 * skin context: the layout already reads the cookie once at the top for the
 * first paint, and every *later* paint the CSS custom-property cascade keys
 * off `data-skin` alone, so nothing downstream needs telling twice.
 *
 * State is exactly the current skin, plus a press counter that exists only to
 * force the glyph's spin animation to restart every press (`key={spins}`) —
 * "no state beyond the current skin" the handoff asks for, read literally as
 * no *skin* state beyond it. `spins` never decides what renders.
 */
export function SkinButton({ initialSkin }: { initialSkin: Skin }) {
  const [skin, setSkin] = useState<Skin>(initialSkin);
  const [spins, setSpins] = useState(0);

  function press() {
    const next = nextSkin(skin);

    document.cookie = `${SKIN_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    document.documentElement.dataset.skin = next;
    setSkin(next);
    setSpins((count) => count + 1);
  }

  return (
    <button type="button" onClick={press} aria-label="Theme">
      {/*
        Remounted every press (`key={spins}`) so the 360° spin — declared once,
        skin-agnostically, in `globals.css` — restarts rather than being a no-op
        the second time the class is already present.
      */}
      <span
        key={spins}
        aria-hidden
        className={`inline-block${spins > 0 ? ' skin-glyph-spin' : ''}`}
      >
        ↻
      </span>
      <span> Theme</span>
    </button>
  );
}
