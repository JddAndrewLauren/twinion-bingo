'use client';

import { forwardRef, useState } from 'react';
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
 *
 * **Hit target vs. visual box (#103).** The button's own padding/border/line-box
 * decides its *visible* size — nothing here hardcodes a height, so it grows on
 * its own once a later slice's skin-specific type and border land. A separate
 * `span`, absolutely positioned and sized to `max(100%, 44px)` on each axis,
 * expands the *tappable* area to the 44×44 minimum without adding a pixel of
 * layout width: it paints outside the button's own box but is still hit-tested
 * there because it is a positioned descendant of the (also positioned) button,
 * and a tap on it still fires the button's own `onClick` by ordinary bubbling.
 * The gate asserts *this* element, not the glyph or the label.
 *
 * **`ref` (#108).** Forwarded so `die-button.tsx` can measure this button's own
 * rendered height and match it — the design handoff's "size the die from the
 * theme button beside it", read literally rather than approximated through a
 * CSS technique. Nothing here reads or writes the ref itself.
 *
 * **`.skin-theme-fill` (#105).** Slipstream's own button is sheared
 * (`transform: skewX(-10deg)`), and a transform on the *button itself* would
 * skew `[data-hit-expand]` right along with it — it is a positioned descendant,
 * so it renders inside the same transformed space, and `expectThumbSized`
 * reads a `getBoundingClientRect()` that would come back deformed. So the
 * border/padding/type that used to sit directly on the `<button>` now sit on
 * this one inner span instead: the button stays a plain, unsheared rectangle
 * (what `ref` and `[data-hit-expand]` both measure against), and only the fill
 * — the thing a skin actually paints — carries a skin's own transform. A no-op
 * restructuring for the three skins with no shear: `.skin-theme-fill` inherits
 * exactly the classes the button used to carry, so Pit Wall, Confetti and
 * Scorecard render byte-identical.
 */
export const SkinButton = forwardRef<HTMLButtonElement, { initialSkin: Skin }>(
  function SkinButton({ initialSkin }, ref) {
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
      <button
        ref={ref}
        type="button"
        onClick={press}
        aria-label="Theme"
        className="skin-theme relative inline-flex items-center"
      >
        <span className="skin-theme-fill inline-flex items-center gap-1 rounded-skin border border-rule px-2 py-1 text-xs text-ink">
          {/*
            The glyph and the word share one `skin-theme-label` wrapper so a
            skin that counter-skews the fill (Slipstream) counter-skews both
            together, matching the handoff's own single sheared pill rather than
            two independently-skewed pieces.
          */}
          <span className="skin-theme-label inline-flex items-center gap-1">
            {/*
              Remounted every press (`key={spins}`) so the 360° spin — declared
              once, skin-agnostically, in `globals.css` — restarts rather than
              being a no-op the second time the class is already present.
            */}
            <span
              key={spins}
              aria-hidden
              className={`inline-block${spins > 0 ? ' skin-glyph-spin' : ''}`}
            >
              ↻
            </span>
            <span> Theme</span>
          </span>
        </span>
        {/* The hit-target expander — see the note above the component. */}
        <span
          aria-hidden
          data-hit-expand
          className="absolute inset-0 m-auto h-[max(100%,44px)] w-[max(100%,44px)]"
        />
      </button>
    );
  },
);
