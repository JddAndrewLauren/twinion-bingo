'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The isometric die that replaces #112's labelled "Re-roll card" text button, per
 * `docs/design/README.md` § "Header controls: dice + theme button" — this issue's
 * (#108's) placement change. Icon-only, so unlike `SkinButton` it carries no visible
 * label: the accessible name (and its change to "Re-rolling…" while a request is
 * out) is the only way its state reaches a screen reader.
 *
 * **Geometry** is copied from the README's own numbers rather than eyeballed from
 * the screenshot — the pip placement is the part the brief calls out as easy to get
 * wrong. 24×24 viewBox; a rounded hexagon (half-width 4.3, half-height 4.7, corner
 * radius 0.9) authored around the origin and placed with
 * `translate(12 12) scale(2.32)`; the silhouette and the three inner edges as two
 * separate `stroke`-only paths; seven filled pips reading 1-2-4 across the three
 * visible faces, at the README's own coordinates and radii.
 *
 * **Sizing is measured, not CSS.** The README's own fallback — a `flex
 * items-stretch` row plus `aspect-square` on this button, so its side tracks
 * whatever height the row's stretch hands it — is what #103's placeholder used,
 * and is what this button tried first. Measured against the real WebKit build
 * this project gates against, it does not hold: `align-items: stretch` gives a
 * flex item with no other sizing a real *height*, but `aspect-ratio` does not
 * reliably turn that stretched height into a matching *width` in this engine —
 * an otherwise-empty flex item with `aspect-ratio: 1/1` and a stretched height
 * measured at a **0px width** in isolation, confirmed with `page.setContent`
 * against a bare `<div>` before this file's own markup was even in the loop.
 * So this button's box is set explicitly, in pixels, from a `ResizeObserver` on
 * the Theme button beside it (via the `matchHeightOf` ref `skin-button.tsx`
 * forwards) — the same information the CSS technique was trying to read, taken
 * directly instead of through a layout mechanism that does not carry it here.
 * `useLayoutEffect` rather than `useEffect` so the size is set before the
 * browser's first paint, and the observer re-fires on every skin press, since a
 * skin's own type scale is exactly what changes the Theme button's height.
 *
 * Measured, `matchHeightOf.current` can still be `null` on this button's own
 * first layout effect even though both buttons mount in the same commit — a
 * `requestAnimationFrame` retry loop is what makes that not matter, rather
 * than depending on an ordering guarantee that did not hold here.
 *
 * **The `<svg>`** is positioned `absolute inset-0` rather than sized in flow —
 * once the button itself has an explicit pixel size, this is only cosmetic
 * (unlike the CSS-only attempt, where an unstyled SVG's default 300×150
 * replaced size was part of what made the button balloon), but it is kept
 * because it lets the pip geometry below assume a square box without also
 * juggling `justify-content`/`align-items` on the button.
 *
 * **Colour is per surface, not per skin** (README, same section) — the value has to
 * match the muted label text beside the die *in the bar it is actually sitting on*.
 * `surface` is what carries that distinction, as `data-die-surface` on the `<svg>`,
 * with the literal values in `globals.css` rather than in the skin-token layer the
 * rest of the app reads. Today all four skins resolve both surfaces to the same
 * value: Confetti's second value belongs to the blue card header the handoff draws,
 * which no component paints yet, and a white die on the cream header that *does*
 * exist is the invisible die that rule exists to prevent. See the note under the
 * Confetti rule in `globals.css` for which slice flips it.
 */
export function DieButton({
  onClick,
  disabled,
  pending,
  surface,
  describedById,
  matchHeightOf,
}: {
  onClick?: () => void;
  disabled: boolean;
  pending: boolean;
  surface: 'join' | 'card';
  describedById?: string;
  /** The Theme button beside this one, whose rendered height this button matches. */
  matchHeightOf: RefObject<HTMLButtonElement | null>;
}) {
  const [size, setSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    let observer: ResizeObserver | undefined;
    let frame: number | undefined;

    const attach = () => {
      const target = matchHeightOf.current;
      if (target === null) {
        // Not there yet on this commit — try again next frame rather than
        // giving up. See the note above: this is reachable in practice.
        frame = requestAnimationFrame(attach);

        return;
      }

      const measure = () => setSize(target.getBoundingClientRect().height);

      measure();
      observer = new ResizeObserver(measure);
      observer.observe(target);
    };

    attach();

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [matchHeightOf]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={pending ? 'Re-rolling…' : 'Re-roll card'}
      aria-describedby={describedById}
      // No size until the first measurement lands — same box on the server and
      // on the client's first render, so there is nothing for React to warn
      // about mismatching at hydration.
      style={size === null ? undefined : { width: size, height: size }}
      className="relative shrink-0"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        data-die-surface={surface}
        className="absolute inset-0"
      >
        <g transform="translate(12 12) scale(2.32)">
          {/* The silhouette: one rounded hexagon, quadratic corners. */}
          <path
            d="M0.7898,-4.2683 L3.5102,-2.7817 Q4.3,-2.35 4.3,-1.45 L4.3,1.45 Q4.3,2.35 3.5102,2.7817 L0.7898,4.2683 Q0,4.7 -0.7898,4.2683 L-3.5102,2.7817 Q-4.3,2.35 -4.3,1.45 L-4.3,-1.45 Q-4.3,-2.35 -3.5102,-2.7817 L-0.7898,-4.2683 Q0,-4.7 0.7898,-4.2683 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth={0.62}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* The three inner edges meeting at the centre: two diagonals up to the
              top-left and top-right corners, one vertical down to the bottom
              corner. This is what carries the perspective — no shading. */}
          <path
            d="M0,0 L-4.3,-2.35 M0,0 L4.3,-2.35 M0,0 L0,4.7"
            fill="none"
            stroke="currentColor"
            strokeWidth={0.62}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Top face: 1 pip. */}
          <circle cx={0} cy={-2.275} r={0.7} fill="currentColor" />
          {/* Right face: 2 pips. */}
          <circle cx={1.29} cy={0.815} r={0.52} fill="currentColor" />
          <circle cx={3.01} cy={1.513} r={0.52} fill="currentColor" />
          {/* Left face: 4 pips. */}
          <circle cx={-1.29} cy={0.723} r={0.48} fill="currentColor" />
          <circle cx={-3.01} cy={-0.193} r={0.48} fill="currentColor" />
          <circle cx={-1.29} cy={2.567} r={0.48} fill="currentColor" />
          <circle cx={-3.01} cy={1.603} r={0.48} fill="currentColor" />
        </g>
      </svg>
      {/*
        Hit-target expander: same *purpose* as `SkinButton`'s (#103) — a
        44×44 absolutely-positioned sibling that grows the tappable area
        without adding a pixel of layout width — but not the same centring
        technique. `SkinButton`'s `inset-0 m-auto` only ever collapses to its
        own (already ≥44px) box, so it has never had to centre a box *larger*
        than its parent. Measured here, where the die's own box genuinely is
        smaller: `inset-0` with `margin: auto` over-constrains WebKit into
        pinning the expander's top-left corner to the button's and growing it
        only right and down, rather than centring it — a bug in the shared
        technique this button is the first to exercise, worked around locally
        with `left-1/2 top-1/2` plus a `-50%` transform, which centres
        correctly regardless of how the two boxes compare in size.
      */}
      <span
        aria-hidden
        data-hit-expand
        className="absolute top-1/2 left-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2"
      />
    </button>
  );
}
