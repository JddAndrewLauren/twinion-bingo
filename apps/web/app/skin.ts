/**
 * The whole vocabulary for a *skin* — the four purely-visual treatments the
 * design handoff (`docs/design/README.md`) calls Pit Wall, Slipstream, Confetti
 * and Scorecard.
 *
 * **Not a `theme`.** `theme` already names a content pack in this repo —
 * `themes/f1`, a `themeId` like `f1.v2`, `themeName()` — and D10 fixes what a
 * theme is. A skin changes nothing about squares, calls, or which theme a room
 * is playing; two players in the same room on different skins see identical
 * game state. The user-facing button is still labelled "Theme" (the handoff's
 * own choice, matching what a player already calls the F1/IndyCar pack), but
 * every identifier, file, selector and test name in code says `skin`.
 *
 * Tiny, and deliberately in one place, the way `theme-name.ts` is: this is what
 * every skin-aware surface — the root layout, the button, the tests — is taught
 * the cycle and the default from, so there is exactly one place that can get the
 * order wrong.
 */
export const SKINS = ['pitwall', 'slipstream', 'confetti', 'scorecard'] as const;

export type Skin = (typeof SKINS)[number];

/** `pitwall` is the default for new players, per the handoff's *Themes* table. */
export const DEFAULT_SKIN: Skin = 'pitwall';

/**
 * The fixed cycle the theme button advances through, one press at a time:
 * `pitwall → slipstream → confetti → scorecard → pitwall`. Fixed rather than
 * data-driven off `SKINS`' order so the two can never silently diverge — the
 * handoff calls out that the cycle has to stay stable across presses, since the
 * button is blind (a player cannot jump straight to a skin).
 */
const CYCLE: Record<Skin, Skin> = {
  pitwall: 'slipstream',
  slipstream: 'confetti',
  confetti: 'scorecard',
  scorecard: 'pitwall',
};

export function nextSkin(skin: Skin): Skin {
  return CYCLE[skin];
}

/**
 * The one place a stored or requested value becomes a `Skin`. Garbage — an old
 * cookie from a skin this app no longer has, a value a player's browser mangled,
 * or no cookie at all — is not an error here; it is simply not one of the four,
 * and `pitwall` is what every unrecognised value becomes.
 */
export function parseSkin(value: string | undefined): Skin {
  return (SKINS as readonly string[]).includes(value ?? '')
    ? (value as Skin)
    : DEFAULT_SKIN;
}

/**
 * No `:` — unlike the `twinion-bingo:token:` namespace `player-token.ts` uses
 * for `localStorage`, a `:` is not a legal cookie-name token (RFC 6265's
 * `token` production excludes it), so the cookie gets an underscore instead.
 */
export const SKIN_COOKIE = 'twinion_bingo_skin';
