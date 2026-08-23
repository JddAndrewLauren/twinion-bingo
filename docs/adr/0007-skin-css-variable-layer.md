# ADR-0007: Skins are a CSS-variable layer, not a component per look

- **Status:** accepted
- **Date:** 2026-08-22
- **Implemented by:** issues #102–#108, #109

## Context

The design handoff (`docs/design/README.md`, `docs/design/Bingo Screens.dc.html`) specifies four
purely-visual treatments for the same room — Pit Wall, Slipstream, Confetti, Scorecard — reachable
from any surface by a single "Theme" button. Nothing about a square, a call, a deck, or which
content pack a room is playing changes when a skin changes; two players in the same room on
different skins must see identical game state.

Before this issue there was no ADR governing any visual decision in this repo, though four slices
(#104–#107) had already landed one skin each. `docs/agents/domain.md` makes a decision like this one
— it fixes vocabulary that would otherwise drift, and it rules out an architecture two more slices
would have made expensive to unwind — exactly the kind that earns a written record rather than living
only in a commit history spread across five issues.

Two names were already in tension. `theme` had meant "the visual look" in early design conversation
and also names this project's content packs (`themes/f1`, a `themeId` like `f1.v2`, `themeName()`,
D9/D10) — two different concepts sharing one noun, with the code already committed to `theme` for
content. And the app's own visual gate (`docs/SURFACES.md`) had, until this issue, only ever run
against one skin (`pitwall`, the cookie's default): a change to any shared component was checked
against one of the four looks a player can actually be on.

Three implementation shapes were on the table for "four looks, one app":

1. **A CSS-variable layer, keyed on `data-skin`**, with Tailwind's `@theme inline` bridging the
   custom properties into utility classes (`bg-raised`, `text-ink`, and so on) that already existed
   from #102's token layer. One React tree; a skin recolours and retypes it.
2. **A component per skin** — four parallel implementations of the room screen, header, and card,
   switched by a top-level conditional.
3. **`localStorage`**, read client-side after mount, with either shape above.

## Decision

**Skins are a CSS-variable layer keyed on `[data-skin]`, with `@theme inline` bridging those
variables into the Tailwind utilities every component already uses.** No component branches on which
skin is active; `[data-skin='confetti'] .skin-cell { ... }`-shaped rules in `globals.css` are the only
place a skin's own values live, scoped by attribute selector rather than by a conditional in JSX.

**The skin is client state persisted in a cookie** (`twinion_bingo_skin`, `apps/web/app/skin.ts`),
never sent to the server as part of room state and never read as an input to game logic. The cookie
is read server-side, once, to decide `<html data-skin>` and `themeColor` before the very first byte
of HTML is sent (`apps/web/app/current-skin.ts`, `apps/web/app/layout.tsx`).

**"Skin" is visual; "theme" stays content.** `themes/` folders, a `themeId` like `f1.v2`,
`themeName()` and the pool are all content packs and keep the word `theme`. Every identifier, file,
selector and test name for the visual layer says `skin`. The user-facing control is still labelled
"Theme" — the handoff's own choice, and what a player already calls the F1/IndyCar content pack — but
that is copy, not vocabulary.

**Rejected: `localStorage`.** It is read after mount, so the very first paint would use whatever the
server's own default renders — `pitwall`'s dark ground — before a `useEffect` could correct it. On a
light skin (Confetti, Scorecard) that is a flash of the wrong background colour on every load, and
`themeColor` (the phone's own chrome tint) cannot be corrected retroactively at all: it is read from
the HTML response's `<meta>` tag before any client script runs.

**Rejected: a component per skin.** Four parallel implementations of the room screen multiply the
gate's own cost by the number of skins for behaviour that is not skin-dependent — tabs, dialogs,
state, the stream — and, more importantly, a top-level conditional on which component is mounted
means switching skins **remounts** the tree. A live game's SSE connection is opened by an effect on
mount; a remount tears it down and reopens it, which is exactly the defect class #14 already found
and fixed once for the phone/iPad layout switch (`RoomScreen` staying one mounted element is what
lets a rotation survive). An identical React tree across skins is what makes "the surface does not
remount when the skin changes" true by construction rather than by discipline, and it is also what
makes one gate test body reusable at all four skins (`apps/web/gate/room-fixture.ts`'s `forEachSkin`,
`apps/web/gate/skin-matrix.gate.ts`).

## Consequences

**The gate is split by what a skin can actually break**, rather than run in full at every skin. The
default-skin suite (`room.gate.ts`, `lobby.gate.ts`, and the rest) stays a single run — 36+ tests at
four viewports each — because tabs opening, a call landing, a dialog's focus trap, and the stream
surviving a rotation cannot be moved by a CSS attribute selector. A narrower **skin matrix**
(`skin-matrix.gate.ts`) runs only the assertions a skin's own CSS can break — cell clipping, scroll,
thumb sizing, header line count, pane position, and `/legibility`'s worst-24 — at all four skins and
all four viewports. Running the *whole* suite at four skins was estimated at ~576 WebKit tests per
run; the assertions actually gated skin-per-skin are a fraction of that.

**A colour instrument exists once per skin file, not once for the app.** `paintedFill()`/`deltaE()`
(and Scorecard's own `ringColour()`, since its mark is a border rather than a fill) are copied across
`skin-pitwall.gate.ts`, `skin-slipstream.gate.ts`, `skin-confetti.gate.ts` and
`skin-scorecard.gate.ts` rather than shared, a decision each of those issues made deliberately to
avoid touching a shared instrument from inside a single slice under concurrent review. Consolidating
them is out of scope for every issue that has touched this area so far, including this one; it is
recorded as an open FINAL-GATE item.

**Two open FINAL-GATE questions inherited from #106/#107, restated rather than settled here:**
whether every skin's primary-action (and, per #107, two further controls') visible copy should become
per-skin with the accessible name decoupled from it, or whether the handoff's per-theme copy is
formally superseded by the cross-skin accessible-name contract the last two slices built against;
and the four near-duplicate colour instruments named above. Neither is this ADR's decision to make.

Two players in one room can be on different skins simultaneously and see the same board, the same
marks, and the same prizes — the cookie's own scope (a browser, not a room) is what makes that true
without any server-side coordination.
