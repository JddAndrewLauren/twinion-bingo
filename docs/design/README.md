# Handoff: Four bingo themes with a rotating theme button

## Overview

TwinIon Bingo currently ships one visual treatment. This handoff covers implementing **four selectable visual themes** across the two player-facing screens (join / room-entry, and the in-play card), plus a **single theme button in the top bar** that rotates through them, and a **dice icon** alongside it.

The four themes are purely presentational. They do not change game rules, square pools, call logic, or the `themes/f1` vs `themes/indycar` content packs. A player on "Confetti" and a player on "Pit Wall" in the same room see identical game state.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly.

The task is to **recreate these designs inside the existing app** (`apps/web`, Next.js + React) using its established patterns, component structure, and styling approach. Do not port the HTML markup or the inline styles verbatim. Read them as a specification of layout, color, type, and state.

`Bingo Screens.dc.html` is the single design file. It is organised into three groups, newest at the top:

- **Turn 3** — the dice icon and the rotating theme button, drawn once in each of the four themes.
- **Turn 2** — desktop (1280×800) join and card screens, all four themes.
- **Turn 1** — mobile (390×812) join and card screens, all four themes.

## Fidelity

**High-fidelity.** Colors, type, spacing, and states are final and should be matched closely. Exact values are tabulated under *Design tokens* below. Two caveats:

- Copy in the mocks is real content pulled from `themes/f1/handcrafted.json`, but the specific squares shown are illustrative, not a fixed layout.
- Motion is specified in this README only; the static mocks do not animate.

## Themes

| Key | Name | Character |
| --- | --- | --- |
| `pitwall` | Pit Wall | Telemetry density. Near-black, hairline rules, monospace data type, one red accent, cyan for marked state. |
| `slipstream` | Slipstream | Speed and scale. Sheared italic display type, diagonal line field, marked squares as solid yellow blocks. |
| `confetti` | Confetti | Playful and flat. Warm off-white ground, saturated color blocks, heavy rounding, green marked state. |
| `scorecard` | Scorecard | Printed paper. Ruled cream stock, 2px ink borders, dashed folds, marked squares circled in orange ink. |

`pitwall` is the default for new players.

## Screens

### 1. Join screen

**Purpose.** Confirm the room being entered, set a display name, see who is already in, and enter.

**Content, all themes.** Room code (4 chars, e.g. `K4V2`); name field, pre-filled from last session; primary enter action; roster of players already in the room, with host marked and the current player marked as "you"; theme pack label ("Formula 1"); the dice and theme button at the right end of the brand bar (see *Header controls* below).

**Mobile layout (390×812).** Single column, vertically centered, 20–22px side padding. Order top to bottom: brand/status bar → room code display → name field → primary action → roster.

**Desktop layout (1280×800).** Two columns. Left column (≈55–60%) holds room code, name field, and primary action, vertically centered with 36–56px padding; right column holds the full roster as a list. A divider separates them — hairline in `pitwall`, dashed rule in `scorecard`, none in `slipstream` and `confetti`.

**Room code treatment per theme.**

- `pitwall` — four separate boxed characters. Mobile: flex row, `gap: 8px`, each cell `aspect-ratio: 1/1.15`, 38px/700. Desktop: fixed 96×110px cells, `gap: 10px`, 52px/700. Cell background `#121214`, 1px border `rgba(255,255,255,.14)`.
- `slipstream` — one word, italic 900, `letter-spacing: -.06em`, gradient fill `linear-gradient(92deg, #f2ff00, #ff1f4b)` clipped to text. Mobile 96px / `line-height: .86`; desktop 188px / `line-height: .82`. Below it a sheared bar: `height: 5px` (mobile) / `7px` (desktop), background `#f2ff00`, `transform: skewX(-24deg)`, width 62–74%.
- `confetti` — inside a blue card, `background: #2f6bff`, `border-radius: 26px` (mobile) / `32px` (desktop), padding 20/30px. Code 48px (mobile) / 88px (desktop), 700, `letter-spacing: .1em`, white; label above at 12–13px/500, 75% opacity.
- `scorecard` — centered, inside a rotated ticket box: `border: 3px` (mobile) / `4px` (desktop) solid `#e5502a`, `border-radius: 14/18px`, `transform: rotate(-2.5deg)`, padding 8px 22px / 10px 34px. Code 56px (mobile) / 96px (desktop), 800, `letter-spacing: .06em`, color `#e5502a`. Label above reads "ADMIT ONE TO ROOM", 12–13px/600, `letter-spacing: .22em`, uppercase.

**Name field per theme.**

- `pitwall` — `#121214` fill, 1px border `rgba(255,255,255,.14)`, bottom border `2px solid #ff2e2e`, no radius, 14–15px padding, 17–18px text. A 1px × 20px red bar sits at the right edge as a caret.
- `slipstream` — `rgba(255,255,255,.07)` fill, `border-left: 4px solid #f2ff00`, no radius, 22–24px italic 900 uppercase.
- `confetti` — white fill, `2px solid #20180f`, `border-radius: 22–24px`, 16–17px padding, 20–21px/600. Right-aligned "edit" affordance at 13–14px/500, 40% opacity.
- `scorecard` — no box. A 2px solid `#2b2118` bottom rule with the name sitting on it at 26–30px/700, label "SIGN HERE" above.

**Primary action per theme.** All are full-width in the mobile column and `min-height: 52–58px`.

- `pitwall` — "ENTER ROOM", `#ff2e2e` fill, `#0a0a0b` text, 13–14px/700, `letter-spacing: .16–.18em`, square corners.
- `slipstream` — "LIGHTS OUT →", `#f2ff00` fill, `#0e0e12` text, 16–17px italic 900, `transform: skewX(-8deg)` on the button with `skewX(8deg)` on the label to keep type upright.
- `confetti` — "Let's play", `#ff5c39` fill, white text, 19–20px/700, `border-radius: 22–24px`, `box-shadow: 0 4px 0 #c93c1e` (mobile) / `0 5px 0` (desktop) as a hard offset ledge.
- `scorecard` — "Take a card", `#1f7a6b` fill, `#f7f1e4` text, 18–19px/800, `border-radius: 12–14px`.

**Roster per theme.**

- `pitwall` — table rows: 2-digit index at 35% opacity, name, right-aligned tag (`HOST` / `YOU`) in `#00e0c8` at 9–10px with `letter-spacing: .1em`. 1px top border per row at `rgba(255,255,255,.06)`, 9–11px vertical padding. Header row "ON THE GRID" with a count.
- `slipstream`, `confetti`, `scorecard` — wrapping pill row, `gap: 7–9px`. Slipstream: 1px `rgba(255,255,255,.18)` outline pills, `border-radius: 999px`. Confetti: `#ffd23f` filled pills. Scorecard: `2px solid #2b2118` outline pills. On mobile these truncate to four names plus a `+N` chip (accent-filled); on desktop show all nine.

### 2. Card screen (in play)

**Purpose.** Read your 5×5 card, tap squares to mark them, and see what has been called.

**Marking.** Tap-to-mark, player-driven. Tapping an unmarked square marks it; tapping a marked square unmarks it. The center square is pre-marked and not interactive.

**Regions, all themes.** Header (room code + run status) · progress readout (`8 of 24`) · 5×5 grid · "looking for" list · called-square banner pinned to the bottom.

**Mobile layout (390×812).** Vertical stack in the order above. Grid at 14–18px side padding, `grid-template-columns: repeat(5, 1fr)`, square cells (`aspect-ratio: 1`), gap 2px (`pitwall`) / 3px (`slipstream`) / 5px (`confetti`) / 4px (`scorecard`). Square labels 9.5px. The "looking for" list shows three entries; the call banner is `margin-top: auto`.

**Desktop layout (1280×800).** Three columns: left rail, grid, right rail.

- Left rail: 236px (`pitwall`) / 260px (`slipstream`) / 250px (`confetti`) / 246px (`scorecard`). Holds progress and the standings table.
- Center: the grid, filling available height, 22–24px padding, gaps 3/4/7/5px per the theme order above. Square labels 13px.
- Right rail: 300–316px. Holds the "looking for" list (six entries visible) and the call banner pinned to the bottom with `margin-top: auto`.

**Progress readout per theme.** `pitwall` — a 12-segment bar (`gap: 1px`, filled segments `#00e0c8`, empty `rgba(255,255,255,.12)`, 3px tall mobile / 4px desktop) with a large numeral below. `slipstream` — numeral only, 52px (mobile) / 82px (desktop) italic 900 in `#f2ff00`, with `/ 24 MARKED` beneath. `confetti` — numeral in `#ff5c39` beside a 9–11px rounded track, fill `#16a34a`, `border-radius: 999px`. `scorecard` — plain text, "8 / 24 stamped", 44px/800 numeral.

**Square cell per theme.**

| | Base | Marked | Center (free) |
| --- | --- | --- | --- |
| `pitwall` | `#121214`, 1px `rgba(255,255,255,.1)`, square | `rgba(0,224,200,.16)` overlay + 1px `#00e0c8` border, label stays light | `rgba(255,46,46,.18)` + 1px `#ff2e2e` |
| `slipstream` | `rgba(255,255,255,.06)`, square | solid `#f2ff00`, label re-drawn in `#0e0e12` over the fill | solid `#ff1f4b`, label white |
| `confetti` | white, 2px `rgba(32,24,15,.14)`, radius 14px (mobile) / 20px (desktop) | solid `#16a34a` bleeding 2px past the border, label white | solid `#ffd23f`, label dark |
| `scorecard` | `#fffdf7`, 2px `#2b2118`, square | label untouched; a hand-drawn ink ring on top — 4px (mobile) / 5px (desktop) border `rgba(229,80,42,.72)`, `border-radius: 999px`, inset 6% | `rgba(31,122,107,.16)` wash |

Label type: `pitwall` uses Roboto Condensed 700 uppercase; `slipstream` Archivo 900 uppercase with `letter-spacing: -.01em`; `confetti` Fredoka 600 mixed case; `scorecard` Baloo 2 700 mixed case. Labels center both axes with 4–9px padding and `line-height: 1.08–1.15`.

**Standings (desktop left rail).** Rank, name, count. The current player's row is accented — `#ff2e2e` count in `pitwall`, and in `confetti` each rank sits in a 20px filled circle. Five rows.

**"Looking for" list.** Each entry is a square label plus its one-line description, both verbatim from the theme pack (`themes/f1/handcrafted.json`). Label 11–14px bold, description 10.5–12px at 45–55% opacity, `line-height: 1.35–1.4`. Separators follow the theme: 1px hairlines (`pitwall`), sheared 4px accent bars (`slipstream`), individual rounded cards (`confetti`), 1px rules under a dashed section head (`scorecard`).

**Call banner.** Always at the bottom edge, full width, showing the most recently called square and its age.

- `pitwall` — `#141416` fill with a `1px solid #ff2e2e` top border, "CALLED · 2s AGO" in red at 9px `letter-spacing: .16em`, square name in Roboto Condensed 700 uppercase.
- `slipstream` — full `#f2ff00` fill, dark text, name at 16–18px italic 900 uppercase, with a `→` glyph on mobile.
- `confetti` — `#ffd23f` fill, a 34–38px dark circle badge holding `!`, caller attribution ("Marina called it") above the name.
- `scorecard` — `#1f7a6b` fill, `#f7f1e4` text, 2px dark top border, "CALLED · 2s" label at `letter-spacing: .18em`.

### 3. Header controls: dice + theme button

Both controls live in the top bar, right-aligned, on **every screen** — join and card alike — at both breakpoints. On the join screen they sit at the right end of the brand bar, replacing nothing; the theme pack label ("Formula 1") shortens as needed to make room, and drops to "F1" in the Slipstream mobile header. Left to right: dice, then the theme button. `gap: 9–10px` between them, `20–22px` between the pair and the status text to its left.

**Dice.** An icon-only button showing a single isometric die in outline style, sized to **match the theme button beside it exactly**. The die is square and its side equals the theme button's box height in that theme — 27px in Pit Wall and Slipstream, 29px in Confetti, 34px in Scorecard (the Baloo 2 line box plus its 2px border makes that button taller). Derive it from the button rather than copying these numbers, since they move with the type scale; a stretch-based flex row also works, but size the SVG explicitly rather than with `height: 100%`, which collapses the row.

Geometry, on a 24×24 viewBox: one rounded-hexagon cube (half-width 4.3, half-height 4.7, corner radius ≈0.9, quadratic corners) authored around the origin and placed with `transform: translate(12 12) scale(2.32)`, so the cube nearly fills the box with only stroke clearance to spare. Two paths — the silhouette and the three inner edges meeting at the center (two diagonals up to the top-left and top-right corners, one vertical down to the bottom corner) — both `stroke: currentColor`, `stroke-width: .62` (the transform scales it up to ≈1.7px rendered), `stroke-linejoin: round`, `stroke-linecap: round`, `fill: none`. Upright, no rotation.

Pips are the only filled elements, in `currentColor`, and must sit **clear of the cube's outline** — inset each one at least its own radius again from every edge of its face. One on the top face at (0, -2.275), 0.7r. Two on the right face at (1.29, 0.815) and (3.01, 1.513), 0.52r, on that face's anti-diagonal at 30% and 70% across both of its axes. Four on the left face at (-1.29, 0.723), (-3.01, -0.193), (-1.29, 2.567) and (-3.01, 1.603), 0.48r — a 2×2 block set at 30% and 70% across both of that face's axes, so it stays square in projection and every pip keeps clearance from the silhouette. Reading 1-2-4 across the three visible faces. No label, no border, no shading; the perspective is carried entirely by the inner edges. Color is chosen per **surface**, not per theme — match the muted label text sitting beside it in that same bar. Pit Wall `rgba(232,232,234,.6)` and Slipstream `rgba(255,255,255,.55)` (both bars are dark on both screens) and Scorecard `#2b2118` (cream on both). Confetti changes surface between its screens: `rgba(255,255,255,.85)` on the blue `#2f6bff` card header, but `rgba(32,24,15,.55)` on the cream `#fffbf2` join bar — a white die there is invisible. Give it a 44×44 hit target on mobile even though the glyph is 21px, and an accessible label.

**Theme button.** One button, no menu and no names of other themes. Label is a rotate glyph (`↻`, U+21BB) plus the word "Theme". Each press advances to the next theme in a fixed cycle:

`pitwall → slipstream → confetti → scorecard → pitwall`

The button re-skins itself the moment it is pressed, so the player sees the new theme's treatment of the same button. Styling per theme:

- `pitwall` — 1px `rgba(255,255,255,.14)` border, no radius, padding 6px 10px, label 10px `letter-spacing: .14em` uppercase in `#e8e8ea`; the `↻` glyph in `#ff2e2e`.
- `slipstream` — `#f2ff00` fill, `#0e0e12` text, no radius, padding 7px 13px, 11px italic 900 `letter-spacing: .08em`, `transform: skewX(-10deg)` with the label counter-skewed `skewX(10deg)`.
- `confetti` — `#ffd23f` fill, `#20180f` text, `border-radius: 999px`, padding 7px 15px, 12px/600 mixed case.
- `scorecard` — `2px solid #2b2118`, `border-radius: 10px`, padding 5px 12px, 12px/700 mixed case, no fill.

**Behavior.** No dropdown, no sheet, no confirmation, and no theme names other than the current one. Identical on mobile and desktop — nothing collapses. Because the control is blind (a player cannot jump straight to a theme), keep the cycle order stable so repeated presses are predictable, and consider a brief toast naming the theme that was just applied if discoverability turns out to be a problem in testing.

## Interactions and behavior

**Marking a square.** Tap or click toggles. Target the whole cell. Minimum hit target 44×44px on mobile — at 390px wide with 5 columns and 14–18px padding this holds, but do not let it fall below 44px on smaller viewports. On mark: 140ms ease-out. `pitwall` fades the overlay in and draws the border. `slipstream` wipes the yellow fill in from the left. `confetti` scales the fill from 0.85 to 1 with a slight overshoot (`cubic-bezier(.34,1.56,.64,1)`, 220ms). `scorecard` draws the ink ring with a fast scale-down from 1.15 to 1, 160ms, as if stamped. Unmarking reverses without the overshoot.

**Theme change.** Cross-fade the surface 180ms ease. Do not animate individual squares or re-run mark animations. Rotate the `↻` glyph 360° over the same 180ms on press, so the button confirms the action itself. Fonts for all four themes should be loaded up front (see *Assets*) so switching does not flash unstyled text.

**Progress and call banner.** Both update from existing game state. When a new square is called, the banner replaces its content with a 200ms fade; the "looking for" list removes the called entry in the same beat.

**Hover (desktop).** Unmarked squares lift on hover per theme: `pitwall` brightens the border to `rgba(255,255,255,.28)`; `slipstream` raises the fill to `rgba(255,255,255,.1)`; `confetti` scales to 1.03; `scorecard` shifts the fill to `#fff`. The dice and theme buttons need a hover state in each theme — darken fills 8%, raise icon-only opacity to 100%.

**Focus.** Every interactive element needs a visible focus ring in the theme's accent color, 2px, offset 2px. Squares are keyboard-reachable in reading order.

**Responsive.** Below 900px use the mobile layout; at 900px and above use the three-column desktop layout. Between 640px and 900px the grid may grow but the rails stay stacked. The dice and theme button do not change across breakpoints.

## State management

New state:

- `theme` — one of `pitwall | slipstream | confetti | scorecard`. Client-only, persisted to `localStorage` under a namespaced key (e.g. `twinion:theme`), read on mount with `pitwall` as the fallback. Server-render with the default and apply the stored value on hydration, or set it from a cookie if a flash is unacceptable.
The theme button is a pure function of this one value — pressing it advances the index in the fixed cycle and writes it back. No open/closed menu state is needed.

Existing state is untouched: card squares, marks, call log, roster, and standings all continue to come from wherever they come from today. The theme value must not be sent to the server as part of room state.

## Design tokens

Shared: grid is always `repeat(5, 1fr)`; square cells always 1:1; call banner always bottom-pinned; desktop frame 1280×800; mobile frame 390×812.

**Pit Wall**
- Surface `#0a0a0b` · raised `#121214` · banner `#141416`
- Text `#e8e8ea`; muted `rgba(232,232,234,.4–.55)`; faint `rgba(232,232,234,.35)`
- Accent `#ff2e2e` · marked `#00e0c8`
- Rules `rgba(255,255,255,.09)`; cell borders `rgba(255,255,255,.1)`; field borders `rgba(255,255,255,.14)`; row separators `rgba(255,255,255,.06)`
- Type: JetBrains Mono 400/700 for UI and data; Roboto Condensed 700 for square labels
- Radius 0 everywhere. Letter-spacing `.1–.22em` on all uppercase labels.

**Slipstream**
- Surface `#0e0e12` · raised `rgba(255,255,255,.06–.07)`
- Text `#fff`; muted `rgba(255,255,255,.4–.45)`
- Accent `#f2ff00` · secondary `#ff1f4b` · code gradient `linear-gradient(92deg,#f2ff00,#ff1f4b)`
- Rules `rgba(255,255,255,.1)`; pill outline `rgba(255,255,255,.18)`
- Type: Archivo 600/900, heavy use of italic 900 with `letter-spacing: -.02 to -.06em`
- Radius 0; `border-radius: 999px` on roster pills only. Shear `skewX(-8deg)` buttons, `-10deg` switcher, `-18/-24deg` accent bars.
- Background field: `repeating-linear-gradient(72deg, rgba(255,255,255,.045) 0 2px, transparent 2px 26px)` mobile, `2px 34px` desktop

**Confetti**
- Surface `#fffbf2` · card `#fff` · blue `#2f6bff` · orange `#ff5c39` (shadow `#c93c1e`) · yellow `#ffd23f` · green `#16a34a`
- Text `#20180f`; muted `rgba(32,24,15,.4–.55)`; borders `rgba(32,24,15,.08–.14)`
- Type: Fredoka 500/600/700; display sizes `letter-spacing: -.03 to -.035em`
- Radius: 14px small cells, 16–20px list cards and grid cells, 22–24px fields and buttons, 26–32px hero blocks, 999px pills
- Shadow: `0 4px 0 #c93c1e` / `0 5px 0 #c93c1e` on the primary button only. No blur shadows.

**Scorecard**
- Paper `#f7f1e4` · cell `#fffdf7` · ink `#2b2118` · orange `#e5502a` · teal `#1f7a6b`
- Muted ink `rgba(43,33,24,.45–.6)`; rules `rgba(43,33,24,.15)`; dashed `rgba(43,33,24,.3)`
- Type: Baloo 2 600/700/800; uppercase labels at `letter-spacing: .14–.24em`
- Borders 2px solid ink as the default; dashed 2px for section and column folds
- Radius 10–18px on boxes, 999px on pills and the ink ring
- Ruled paper: `repeating-linear-gradient(0deg, rgba(43,33,24,.045) 0 1px, transparent 1px 22px)` mobile, `1px 26px` desktop

**Spacing.** Mobile side padding 14–22px; desktop 20–56px. Vertical rhythm in the join column 24–32px between blocks. Grid gaps as tabulated per theme.

## Assets

One icon: the isometric die, inline SVG, specified above. It must be SVG — the opacity-ramped faces are what make it read as a cube. Everything else is type, borders, and flat fills. The `↻` rotate glyph, the `!` badge in the Confetti call banner, and the `→` glyphs are text characters.

Fonts, all Google Fonts:

- JetBrains Mono 400, 700 — Pit Wall
- Roboto Condensed 400, 700, 700 italic — Pit Wall square labels
- Archivo 600, 900, 900 italic — Slipstream
- Fredoka 500, 600, 700 — Confetti
- Baloo 2 600, 700, 800 — Scorecard

Load all five up front so theme switching does not cause a font flash. If bundle size matters, subset to Latin and preload only the active theme's family, deferring the rest.

## Repo integration notes

Source repo is `JddAndrewLauren/twinion-bingo`, branch `main`. Relevant existing files, per `github.md`:

- `apps/web/app/layout.tsx` — where a theme class or data attribute on the root element would go, and where the font links belong
- `apps/web/app/create-or-join.tsx` — join screen
- `apps/web/app/r/[code]/room-screen.tsx` — room shell and top bar; the dice and theme button mount here
- `apps/web/app/r/[code]/card-grid.tsx` — 5×5 grid and cell states
- `apps/web/app/r/[code]/card-font.ts` — square-label sizing; will need per-theme values
- `apps/web/app/r/[code]/looking-for.tsx` — "looking for" list
- `apps/web/app/action-button.ts` — primary action styling; will need per-theme variants
- `themes/f1/handcrafted.json` — square labels and descriptions shown in the mocks

Note that `themes/` in the repo means *content* packs (F1, IndyCar square pools). These four are *visual* themes. Pick a different name in code — `skins/`, or a `skin` prop — to avoid collision.

## Screenshots

`screenshots/` holds a rendered capture of every screen, grouped the same way as the design file. Each mobile capture is the join screen above the card screen; each desktop capture likewise.

| File | Contents |
| --- | --- |
| `screenshots/mobile-1a-pit-wall.png` | Pit Wall — mobile join + card |
| `screenshots/mobile-1b-slipstream.png` | Slipstream — mobile join + card |
| `screenshots/mobile-1c-confetti.png` | Confetti — mobile join + card |
| `screenshots/mobile-1d-scorecard.png` | Scorecard — mobile join + card |
| `screenshots/desktop-2a-pit-wall.png` | Pit Wall — desktop join + card |
| `screenshots/desktop-2b-slipstream.png` | Slipstream — desktop join + card |
| `screenshots/desktop-2c-confetti.png` | Confetti — desktop join + card |
| `screenshots/desktop-2d-scorecard.png` | Scorecard — desktop join + card |
| `screenshots/header-controls-3a.png` | The dice + theme button in all four themes |

The screenshots are a convenience for review. Where they and this README disagree, the README is correct; where the README and the HTML disagree, the HTML is correct.

## Files

- `Bingo Screens.dc.html` — the design reference. Turn 3 = header controls, turn 2 = desktop screens, turn 1 = mobile screens. Open it in a browser.
- `support.js` — runtime needed for the design file to render. Not part of the implementation.
- `screenshots/` — rendered captures of all sixteen screens plus the header controls.
